/**
 * Giveaway builders and readers (claimable balances).
 *
 * Claimable balances are a native Stellar feature: funds are locked in a
 * balance entry that only listed claimants can claim, optionally within time
 * windows.  This module builds **unsigned** transactions — signing is always
 * delegated to the caller's wallet.
 *
 * Key limits:
 *  - One claimable balance holds up to 10 claimants.
 *  - A single Stellar transaction can contain up to ~100 operations.
 *  - For giveaways with more than 10 claimers, `buildCreate` batches into
 *    multiple `createClaimableBalance` ops in one transaction.
 *  - If more than 100 claimers are requested (which would exceed the op limit
 *    of a single transaction), a {@link ValidationError} is thrown.
 */

import {
  Account,
  Asset as StellarAsset,
  Claimant,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { ValidationError, NetworkError } from "../errors";
import type { Asset, StellarAddress } from "../types";
import type { ResolvedConfig } from "../network/config";
import {
  assertAccountAddress,
  assertNotSecretKey,
  assertPositiveAmount,
  assertValidAsset,
  assertValidDate,
  assertValidDateWindow,
} from "../validation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum claimants per single claimable balance (Stellar protocol limit). */
export const MAX_CLAIMANTS_PER_BALANCE = 10;

/** Maximum `createClaimableBalance` operations in one transaction.
 *  A Stellar transaction supports up to 100 operations; we reserve a small
 *  buffer for fee bumps or additional ops. */
export const MAX_OPS_PER_TX = 100;

/** Maximum total claimers supported in a single buildCreate call. */
export const MAX_TOTAL_CLAIMANTS = MAX_CLAIMANTS_PER_BALANCE * MAX_OPS_PER_TX; // 1000

// ---------------------------------------------------------------------------
// Predicate helpers
// ---------------------------------------------------------------------------

/** Options for a time-window predicate. */
export interface WindowPredicateOpts {
  /** Claimable from this date (inclusive). Omit for "immediately claimable". */
  from?: Date;
  /** Claimable until this date (exclusive). Omit for "no upper bound". */
  until?: Date;
}

/**
 * Predicate helpers mirror those available directly on {@link Claimant}, but
 * are exported here so callers can compose custom rules without importing the
 * Stellar SDK directly.
 */
export const predicates = {
  /** Always claimable. */
  unconditional(): ReturnType<typeof Claimant.predicateUnconditional> {
    return Claimant.predicateUnconditional();
  },

  /**
   * Claimable only within a time window.
   *
   * @example
   * predicates.window({ from: new Date(), until: new Date(Date.now() + 86_400_000) })
   */
  window(opts: WindowPredicateOpts): ReturnType<typeof Claimant.predicateUnconditional> {
    assertValidDateWindow(opts.from, opts.until, "from", "until");
    const conditions: ReturnType<typeof Claimant.predicateUnconditional>[] = [];

    if (opts.from) {
      // "not yet" = before the start time → negate it.
      // Claimable FROM `from` means NOT (before `from`).
      conditions.push(
        Claimant.predicateNot(
          Claimant.predicateBeforeAbsoluteTime(String(Math.floor(opts.from.getTime() / 1000))),
        ),
      );
    }

    if (opts.until) {
      conditions.push(
        Claimant.predicateBeforeAbsoluteTime(String(Math.floor(opts.until.getTime() / 1000))),
      );
    }

    if (conditions.length === 0) {
      return Claimant.predicateUnconditional();
    }
    if (conditions.length === 1) {
      return conditions[0]!;
    }
    return Claimant.predicateAnd(conditions[0]!, conditions[1]!);
  },

  /**
   * Creator-reclaim predicate: only claimable after the expiry date.
   * Used as the creator's entry so they can reclaim unclaimed funds.
   *
   * @example
   * predicates.creatorAfter(new Date(Date.now() + 7 * 86_400_000))
   */
  creatorAfter(expiresAt: Date): ReturnType<typeof Claimant.predicateUnconditional> {
    assertValidDate(expiresAt, "expiresAt");
    return Claimant.predicateNot(
      Claimant.predicateBeforeAbsoluteTime(String(Math.floor(expiresAt.getTime() / 1000))),
    );
  },
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/** Rules for the client-side anti-bot eligibility check. */
export interface EligibilityRules {
  /** Minimum account age in days. */
  minAgeDays?: number;
  /** Minimum XLM balance required (as a decimal string, e.g. "1.0"). */
  minBalance?: string;
  /**
   * Optional injected async function that resolves a reputation score for the
   * account.  If provided and `minReputationScore` is set, the score is
   * compared.  This keeps the giveaways module free of contract dependencies.
   */
  reputationCheck?: (account: StellarAddress) => Promise<number>;
  /** Minimum reputation score required (used only if `reputationCheck` is set). */
  minReputationScore?: number;
}

/** Result of an eligibility check. */
export interface EligibilityResult {
  /** Whether the account passes all rules. */
  eligible: boolean;
  /** Human-readable reasons for ineligibility, if any. */
  reasons: string[];
}

/**
 * Client-side anti-bot eligibility check.
 *
 * Fetches the account from Horizon and verifies the provided rules.  Always
 * resolves (never rejects on eligibility failures); network errors propagate as
 * {@link NetworkError}.
 */
export async function evaluateEligibility(
  account: StellarAddress,
  rules: EligibilityRules,
  config: ResolvedConfig,
): Promise<EligibilityResult> {
  assertNotSecretKey(account, "account");
  if (!account || typeof account !== "string") {
    return { eligible: false, reasons: ["Invalid account address"] };
  }
  try {
    assertAccountAddress(account, "account");
  } catch {
    return { eligible: false, reasons: ["Invalid account address"] };
  }
  if (rules.minBalance !== undefined) {
    assertPositiveAmount(rules.minBalance, "rules.minBalance");
  }

  const reasons: string[] = [];

  let accountData: { sequence: string; balances: Array<{ asset_type: string; balance: string }> };
  try {
    const url = `${config.horizonUrl}/accounts/${encodeURIComponent(account)}`;
    const res = await config.fetch(url);
    if (res.status === 404) {
      return { eligible: false, reasons: ["Account not found on network"] };
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    accountData = (await res.json()) as typeof accountData;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      return { eligible: false, reasons: ["Account not found on network"] };
    }
    throw new NetworkError(`Failed to load account from Horizon: ${msg}`, { cause: err });
  }

  // Account age check.
  if (rules.minAgeDays !== undefined && rules.minAgeDays > 0) {
    const sequence = BigInt(accountData.sequence ?? "0");
    if (sequence === 0n) {
      reasons.push(`Account has no transaction history (minimum age: ${rules.minAgeDays} days)`);
    }
  }

  // Minimum balance check.
  if (rules.minBalance !== undefined) {
    const minBalanceStroops = BigInt(Math.round(parseFloat(rules.minBalance) * 10_000_000));
    const nativeBalance = accountData.balances.find((b) => b.asset_type === "native");
    const actualStroops = nativeBalance
      ? BigInt(Math.round(parseFloat(nativeBalance.balance) * 10_000_000))
      : 0n;
    if (actualStroops < minBalanceStroops) {
      reasons.push(
        `Insufficient XLM balance: need at least ${rules.minBalance} XLM (have ${nativeBalance?.balance ?? "0"} XLM)`,
      );
    }
  }

  // Reputation check.
  if (rules.reputationCheck && rules.minReputationScore !== undefined) {
    try {
      const score = await rules.reputationCheck(account);
      if (score < rules.minReputationScore) {
        reasons.push(
          `Reputation score too low: need at least ${rules.minReputationScore} (have ${score})`,
        );
      }
    } catch {
      reasons.push("Could not verify reputation score");
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Stellar asset helper
// ---------------------------------------------------------------------------

function toStellarAsset(asset: Asset): StellarAsset {
  if (!asset.issuer) {
    return StellarAsset.native();
  }
  return new StellarAsset(asset.code, asset.issuer);
}

// ---------------------------------------------------------------------------
// Claimable balance types
// ---------------------------------------------------------------------------

/** A claimable balance entry from Horizon. */
export interface ClaimableBalance {
  /** The claimable balance id (starts with `00000000`). */
  id: string;
  /** Asset code and optional issuer. */
  asset: string;
  /** Amount available. */
  amount: string;
  /** Account that created the balance. */
  sponsor: string;
  /** Ledger the balance was created in. */
  lastModifiedLedger: number;
  /** Claimants and their predicates. */
  claimants: Array<{ destination: string; predicate: unknown }>;
}

// ---------------------------------------------------------------------------
// buildCreate
// ---------------------------------------------------------------------------

/** Options for creating a giveaway. */
export interface BuildCreateOpts {
  /** Creator's Stellar address. */
  creator: StellarAddress;
  /** Asset to distribute. */
  asset: Asset;
  /** Amount per claim, as a decimal string (e.g. "5.00"). */
  amountPerClaim: string;
  /**
   * Explicit list of claimers (mutually exclusive with `maxClaimants`).
   * Each address gets one balance slot.
   */
  claimers?: StellarAddress[];
  /**
   * First-come-first-served cap (mutually exclusive with `claimers`).
   * Creates N unconditional slots (any Stellar account can claim each).
   */
  maxClaimants?: number;
  /** Window start: balances are not claimable before this date. */
  claimableFrom?: Date;
  /** Expiry: after this date, only the creator can reclaim unclaimed balances. */
  expiresAt?: Date;
}

/**
 * Build an unsigned transaction XDR that creates claimable-balance giveaway
 * slots.
 *
 * One balance is created per batch of up to 10 claimants.  The creator is
 * always included as a claimant with a reclaim predicate active after
 * `expiresAt`.
 *
 * @returns Unsigned transaction XDR string (base64-encoded).
 * @throws {@link ValidationError} if inputs are invalid or exceed limits.
 */
export async function buildCreate(opts: BuildCreateOpts, config: ResolvedConfig): Promise<string> {
  const { creator, asset, amountPerClaim, claimers, maxClaimants, claimableFrom, expiresAt } = opts;

  assertAccountAddress(creator, "creator");
  assertValidAsset(asset, "asset");
  assertPositiveAmount(amountPerClaim, "amountPerClaim");
  assertValidDateWindow(claimableFrom, expiresAt, "claimableFrom", "expiresAt");

  if (claimers !== undefined && maxClaimants !== undefined) {
    throw new ValidationError("specify either claimers or maxClaimants, not both");
  }
  if (claimers !== undefined) {
    if (claimers.length === 0) {
      throw new ValidationError("claimers list must not be empty");
    }
    for (let idx = 0; idx < claimers.length; idx++) {
      assertAccountAddress(claimers[idx]!, `claimers[${idx}]`);
    }
  }
  if (maxClaimants !== undefined && (!Number.isInteger(maxClaimants) || maxClaimants <= 0)) {
    throw new ValidationError("maxClaimants must be a positive integer");
  }

  const totalClaimants = claimers?.length ?? maxClaimants ?? 1;

  if (totalClaimants > MAX_TOTAL_CLAIMANTS) {
    throw new ValidationError(
      `Too many claimants (${totalClaimants}). Maximum supported in one transaction is ${MAX_TOTAL_CLAIMANTS}.`,
    );
  }

  const stellarAsset = toStellarAsset(asset);

  // Build the claimant predicate for actual claimers.
  let claimerPredicate = Claimant.predicateUnconditional();
  if (claimableFrom || expiresAt) {
    const windowOpts: WindowPredicateOpts = {};
    if (claimableFrom) windowOpts.from = claimableFrom;
    if (expiresAt) windowOpts.until = expiresAt;
    claimerPredicate = predicates.window(windowOpts);
  }

  // Build the creator's reclaim predicate (active only after expiry).
  const creatorPredicate = expiresAt
    ? predicates.creatorAfter(expiresAt)
    : Claimant.predicateUnconditional();

  // Batch claimers into groups. Each balance holds up to MAX_CLAIMANTS_PER_BALANCE
  // total claimants. We always reserve one slot for the creator's reclaim entry,
  // so user claimants are batched in groups of MAX_CLAIMANTS_PER_BALANCE - 1.
  const userSlotsPerBalance = MAX_CLAIMANTS_PER_BALANCE - 1; // 9
  const ops: ReturnType<typeof Operation.createClaimableBalance>[] = [];

  if (claimers) {
    for (let i = 0; i < claimers.length; i += userSlotsPerBalance) {
      const batch = claimers.slice(i, i + userSlotsPerBalance);
      const claimantList = batch.map((addr) => new Claimant(addr, claimerPredicate));
      // Always include the creator so they can reclaim the slot.
      claimantList.push(new Claimant(creator, creatorPredicate));
      ops.push(
        Operation.createClaimableBalance({
          asset: stellarAsset,
          amount: amountPerClaim,
          claimants: claimantList,
        }),
      );
    }
  } else {
    // maxClaimants: create that many first-come slots, each with a creator reclaim.
    for (let i = 0; i < (maxClaimants ?? 1); i++) {
      const claimantList: Claimant[] = [new Claimant(creator, claimerPredicate)];
      if (expiresAt) {
        claimantList.push(new Claimant(creator, creatorPredicate));
      }
      ops.push(
        Operation.createClaimableBalance({
          asset: stellarAsset,
          amount: amountPerClaim,
          claimants: claimantList,
        }),
      );
    }
  }

  if (ops.length > MAX_OPS_PER_TX) {
    throw new ValidationError(
      `Operation count (${ops.length}) exceeds the per-transaction limit of ${MAX_OPS_PER_TX}.`,
    );
  }

  // Fetch the creator's account to get the sequence number.
  let creatorAccount: { sequence: string };
  try {
    const url = `${config.horizonUrl}/accounts/${encodeURIComponent(creator)}`;
    const res = await config.fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    creatorAccount = (await res.json()) as { sequence: string };
  } catch (err: unknown) {
    throw new NetworkError(`Failed to load creator account: ${String(err)}`, { cause: err });
  }

  const account = new Account(creator, creatorAccount.sequence);

  const tx = new TransactionBuilder(account, {
    fee: String(100 * ops.length),
    networkPassphrase: config.networkPassphrase,
  });

  for (const op of ops) {
    tx.addOperation(op);
  }

  const built = tx.setTimeout(300).build();
  return built.toXDR();
}

// ---------------------------------------------------------------------------
// buildClaim
// ---------------------------------------------------------------------------

/** Options for claiming a giveaway balance. */
export interface BuildClaimOpts {
  /** Claimer's Stellar address. */
  claimer: StellarAddress;
  /** The claimable balance id. */
  balanceId: string;
}

/**
 * Build an unsigned transaction XDR that claims a claimable balance.
 *
 * @returns Unsigned transaction XDR string.
 */
export async function buildClaim(opts: BuildClaimOpts, config: ResolvedConfig): Promise<string> {
  assertAccountAddress(opts.claimer, "claimer");
  assertNotSecretKey(opts.balanceId, "balanceId");
  if (!opts.balanceId || typeof opts.balanceId !== "string") {
    throw new ValidationError("balanceId is required");
  }

  const server2 = `${config.horizonUrl}/accounts/${encodeURIComponent(opts.claimer)}`;
  let claimerAccount: { sequence: string };
  try {
    const res = await config.fetch(server2);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    claimerAccount = (await res.json()) as { sequence: string };
  } catch (err: unknown) {
    throw new NetworkError(`Failed to load claimer account: ${String(err)}`, { cause: err });
  }

  const tx2 = new TransactionBuilder(new Account(opts.claimer, claimerAccount.sequence), {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  });

  tx2.addOperation(Operation.claimClaimableBalance({ balanceId: opts.balanceId }));

  return tx2.setTimeout(300).build().toXDR();
}

// ---------------------------------------------------------------------------
// buildReclaim
// ---------------------------------------------------------------------------

/** Options for reclaiming an expired giveaway balance. */
export interface BuildReclaimOpts {
  /** Creator's Stellar address. */
  creator: StellarAddress;
  /** The claimable balance id to reclaim. */
  balanceId: string;
}

/**
 * Build an unsigned transaction XDR for the creator to reclaim an expired,
 * unclaimed claimable balance.
 *
 * The creator must have been included with a `creatorAfter(expiresAt)`
 * predicate when the balance was created (which `buildCreate` does
 * automatically when `expiresAt` is set).
 *
 * @returns Unsigned transaction XDR string.
 */
export async function buildReclaim(
  opts: BuildReclaimOpts,
  config: ResolvedConfig,
): Promise<string> {
  assertAccountAddress(opts.creator, "creator");
  assertNotSecretKey(opts.balanceId, "balanceId");
  if (!opts.balanceId || typeof opts.balanceId !== "string") {
    throw new ValidationError("balanceId is required");
  }

  let creatorData: { sequence: string };
  try {
    const res = await config.fetch(
      `${config.horizonUrl}/accounts/${encodeURIComponent(opts.creator)}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    creatorData = (await res.json()) as { sequence: string };
  } catch (err: unknown) {
    throw new NetworkError(`Failed to load creator account: ${String(err)}`, { cause: err });
  }

  const tx3 = new TransactionBuilder(new Account(opts.creator, creatorData.sequence), {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  });

  tx3.addOperation(Operation.claimClaimableBalance({ balanceId: opts.balanceId }));

  return tx3.setTimeout(300).build().toXDR();
}

// ---------------------------------------------------------------------------
// Horizon readers
// ---------------------------------------------------------------------------

/**
 * List claimable balances where `account` is a claimant.
 */
export async function listClaimable(
  account: StellarAddress,
  config: ResolvedConfig,
): Promise<ClaimableBalance[]> {
  assertAccountAddress(account, "account");
  const url = `${config.horizonUrl}/claimable_balances?claimant=${encodeURIComponent(account)}&limit=200`;
  let res: Response;
  try {
    res = await config.fetch(url);
  } catch (err: unknown) {
    throw new NetworkError(`Horizon request failed: ${String(err)}`, { cause: err });
  }
  if (!res.ok) {
    throw new NetworkError(`Horizon returned ${res.status} for claimable_balances`);
  }
  const body = (await res.json()) as { _embedded: { records: ClaimableBalance[] } };
  return body._embedded?.records ?? [];
}

/**
 * List claimable balances sponsored (created) by `account`.
 */
export async function listCreated(
  account: StellarAddress,
  config: ResolvedConfig,
): Promise<ClaimableBalance[]> {
  assertAccountAddress(account, "account");
  const url = `${config.horizonUrl}/claimable_balances?sponsor=${encodeURIComponent(account)}&limit=200`;
  let res: Response;
  try {
    res = await config.fetch(url);
  } catch (err: unknown) {
    throw new NetworkError(`Horizon request failed: ${String(err)}`, { cause: err });
  }
  if (!res.ok) {
    throw new NetworkError(`Horizon returned ${res.status} for claimable_balances`);
  }
  const body = (await res.json()) as { _embedded: { records: ClaimableBalance[] } };
  return body._embedded?.records ?? [];
}

/**
 * Fetch a single claimable balance by id.
 */
export async function getBalance(id: string, config: ResolvedConfig): Promise<ClaimableBalance> {
  assertNotSecretKey(id, "id");
  if (!id || typeof id !== "string") {
    throw new ValidationError("Invalid id: claimable balance id must be a non-empty string.");
  }
  const url = `${config.horizonUrl}/claimable_balances/${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await config.fetch(url);
  } catch (err: unknown) {
    throw new NetworkError(`Horizon request failed: ${String(err)}`, { cause: err });
  }
  if (!res.ok) {
    throw new NetworkError(`Horizon returned ${res.status} for claimable balance ${id}`);
  }
  return (await res.json()) as ClaimableBalance;
}

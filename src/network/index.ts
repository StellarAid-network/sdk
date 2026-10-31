import { assetsForNetwork, type NetworkAssets } from "../assets";
import { NetworkError, SubmissionError, ValidationError } from "../errors";
import type { NetworkName, SubmitResult, Asset } from "../types";
import {
  NETWORK_DEFAULTS,
  type ContractAddresses,
  type StellarAidConfig,
  type ResolvedConfig,
} from "./config";
import * as giveawaysModule from "../giveaways";
import * as paymentsModule from "../payments";
import { HelpRequestsModule } from "../helpRequests";
import { ReputationModule } from "../reputation";
import { AttestationsModule } from "../attestations";
import { assertAccountOrContractAddress, assertNotSecretKey } from "../validation";

export type {
  ContractAddresses,
  NetworkDefaults,
  StellarAidConfig,
  ResolvedConfig,
} from "./config";
export { NETWORK_DEFAULTS } from "./config";
export { HelpRequestsModule } from "../helpRequests";
export { ReputationModule } from "../reputation";
export { AttestationsModule } from "../attestations";

// ---------------------------------------------------------------------------
// Giveaways facade (methods bound to resolved config)
// ---------------------------------------------------------------------------

/** Giveaway builders and readers bound to a specific SDK instance. */
export interface GiveawaysFacade {
  /** Build an unsigned claimable-balance creation transaction XDR. */
  buildCreate(opts: giveawaysModule.BuildCreateOpts): Promise<string>;
  /** Build an unsigned claim transaction XDR. */
  buildClaim(opts: giveawaysModule.BuildClaimOpts): Promise<string>;
  /** Build an unsigned creator reclaim transaction XDR for an expired balance. */
  buildReclaim(opts: giveawaysModule.BuildReclaimOpts): Promise<string>;
  /** List claimable balances where `account` is a claimant. */
  listClaimable(account: string): Promise<giveawaysModule.ClaimableBalance[]>;
  /** List claimable balances created/sponsored by `account`. */
  listCreated(account: string): Promise<giveawaysModule.ClaimableBalance[]>;
  /** Read a single claimable balance entry by Horizon ID. */
  getBalance(id: string): Promise<giveawaysModule.ClaimableBalance>;
  /** Evaluate client-side anti-bot eligibility rules for `account`. */
  evaluateEligibility(
    account: string,
    rules: giveawaysModule.EligibilityRules,
  ): Promise<giveawaysModule.EligibilityResult>;
  /** Claimable-balance time-window and reclaim predicate helpers. */
  predicates: typeof giveawaysModule.predicates;
}

// ---------------------------------------------------------------------------
// Payments facade
// ---------------------------------------------------------------------------

/** Payment builders bound to a specific SDK instance. */
export interface PaymentsFacade {
  /** Build an unsigned payment transaction XDR with optional memo. */
  buildDonation(opts: paymentsModule.BuildDonationOpts): Promise<string>;
  /** Return an unsigned `change_trust` XDR if `account` lacks a trustline for `asset`, or `null`. */
  ensureTrustline(account: string, asset: Asset): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// StellarAid
// ---------------------------------------------------------------------------

/** The SDK entry object returned by {@link createStellarAid}. */
export interface StellarAid {
  /** Target network. */
  readonly network: NetworkName;
  /** Resolved configuration. */
  readonly config: ResolvedConfig;
  /** Well-known assets for the configured network. */
  readonly assets: NetworkAssets;
  /** Giveaway (claimable balance) builders and readers. */
  readonly giveaways: GiveawaysFacade;
  /** Payment transaction builders. */
  readonly payments: PaymentsFacade;
  /** Help Request contract module. */
  readonly helpRequests: HelpRequestsModule;
  /** Reputation contract module. */
  readonly reputation: ReputationModule;
  /** Attestations contract module. */
  readonly attestations: AttestationsModule;
  /**
   * Submit a signed transaction XDR to Horizon.
   *
   * Maps Horizon error codes to a {@link SubmissionError} with the `resultCodes`
   * array populated so callers can branch on specific failure modes.
   */
  submit(signedXdr: string): Promise<SubmitResult>;
}

// ---------------------------------------------------------------------------
// createStellarAid
// ---------------------------------------------------------------------------

/**
 * Create a configured StellarAid SDK instance.
 *
 * @example
 * const aid = createStellarAid({ network: "testnet" });
 * const xdr = await aid.giveaways.buildCreate({ ... });
 * const result = await aid.submit(await wallet.signTransaction(xdr));
 */
export function createStellarAid(config: StellarAidConfig): StellarAid {
  const defaults = NETWORK_DEFAULTS[config.network];
  if (!defaults) {
    throw new ValidationError(`Unknown network: "${String(config.network)}"`);
  }

  const contracts: ContractAddresses = {
    help_request: config.contracts?.help_request ?? defaults.contracts.help_request,
    reputation: config.contracts?.reputation ?? defaults.contracts.reputation,
    attestation: config.contracts?.attestation ?? defaults.contracts.attestation,
  };

  for (const [key, addr] of Object.entries(contracts)) {
    if (addr) {
      assertAccountOrContractAddress(addr, `contracts.${key}`);
    }
  }

  const fetchImpl = config.fetch ?? globalThis.fetch;

  const resolved: ResolvedConfig = {
    network: config.network,
    networkPassphrase: config.networkPassphrase ?? defaults.networkPassphrase,
    rpcUrl: config.rpcUrl ?? defaults.rpcUrl,
    horizonUrl: config.horizonUrl ?? defaults.horizonUrl,
    contracts,
    fetch: fetchImpl,
  };

  // -------------------------------------------------------------------------
  // submit()
  // -------------------------------------------------------------------------
  async function submit(signedXdr: string): Promise<SubmitResult> {
    assertNotSecretKey(signedXdr, "signedXdr");
    if (!signedXdr || typeof signedXdr !== "string") {
      throw new ValidationError("signedXdr must not be empty");
    }

    const url = `${resolved.horizonUrl}/transactions`;
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ tx: signedXdr }).toString(),
      });
    } catch (err: unknown) {
      throw new NetworkError(`Horizon unreachable: ${String(err)}`, { cause: err });
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      // Extract result codes from Horizon's RFC 7807-style error body.
      const resultCodes: string[] = [];
      const extras = body["extras"] as Record<string, unknown> | undefined;
      const codes = extras?.["result_codes"] as Record<string, unknown> | undefined;
      if (codes) {
        const txCode = codes["transaction"];
        if (typeof txCode === "string") resultCodes.push(txCode);
        const opCodes = codes["operations"];
        if (Array.isArray(opCodes)) {
          for (const c of opCodes) {
            if (typeof c === "string") resultCodes.push(c);
          }
        }
      }
      throw new SubmissionError(
        `Transaction failed (HTTP ${res.status}): ${body["title"] ?? "Unknown error"}`,
        resultCodes.length > 0 ? resultCodes : undefined,
      );
    }

    const result: SubmitResult = { hash: body["hash"] as string };
    if (typeof body["ledger"] === "number") {
      (result as { hash: string; ledger?: number }).ledger = body["ledger"] as number;
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Giveaways facade
  // -------------------------------------------------------------------------
  const giveaways: GiveawaysFacade = {
    buildCreate: (opts) => giveawaysModule.buildCreate(opts, resolved),
    buildClaim: (opts) => giveawaysModule.buildClaim(opts, resolved),
    buildReclaim: (opts) => giveawaysModule.buildReclaim(opts, resolved),
    listClaimable: (account) => giveawaysModule.listClaimable(account, resolved),
    listCreated: (account) => giveawaysModule.listCreated(account, resolved),
    getBalance: (id) => giveawaysModule.getBalance(id, resolved),
    evaluateEligibility: (account, rules) =>
      giveawaysModule.evaluateEligibility(account, rules, resolved),
    predicates: giveawaysModule.predicates,
  };

  // -------------------------------------------------------------------------
  // Payments facade
  // -------------------------------------------------------------------------
  const payments: PaymentsFacade = {
    buildDonation: (opts) => paymentsModule.buildDonation(opts, resolved),
    ensureTrustline: (account, asset) => paymentsModule.ensureTrustline(account, asset, resolved),
  };

  return {
    network: resolved.network,
    config: resolved,
    assets: assetsForNetwork(resolved.network),
    giveaways,
    payments,
    helpRequests: new HelpRequestsModule(resolved),
    reputation: new ReputationModule(resolved),
    attestations: new AttestationsModule(resolved),
    submit,
  };
}

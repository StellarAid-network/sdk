/**
 * Payment transaction builders.
 *
 * All builders return **unsigned** transaction XDR strings.  Signing is
 * always delegated to the caller's wallet or server signer.
 */

import {
  Asset as StellarAsset,
  Memo,
  Operation,
  TransactionBuilder,
  Account,
} from "@stellar/stellar-sdk";

import { NetworkError, ValidationError } from "../errors";
import type { Asset, StellarAddress } from "../types";
import type { ResolvedConfig } from "../network/config";
import { assertAccountAddress, assertPositiveAmount, assertValidAsset } from "../validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStellarAsset(asset: Asset): StellarAsset {
  if (!asset.issuer) {
    return StellarAsset.native();
  }
  return new StellarAsset(asset.code, asset.issuer);
}

/** Load a Stellar account record using the config's fetch. */
async function loadAccount(
  address: StellarAddress,
  config: ResolvedConfig,
): Promise<{
  sequence: string;
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>;
}> {
  const url = `${config.horizonUrl}/accounts/${encodeURIComponent(address)}`;
  let res: Response;
  try {
    res = await config.fetch(url);
  } catch (err: unknown) {
    throw new NetworkError(`Horizon request failed: ${String(err)}`, { cause: err });
  }
  if (res.status === 404) {
    throw new NetworkError(`Account not found on Horizon: ${address}`);
  }
  if (!res.ok) {
    throw new NetworkError(`Horizon returned ${res.status} loading account ${address}`);
  }
  return res.json() as Promise<{
    sequence: string;
    balances: Array<{
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
      balance: string;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// buildDonation
// ---------------------------------------------------------------------------

/** Options for a direct donation/tip payment. */
export interface BuildDonationOpts {
  /** Sender's Stellar address. */
  from: StellarAddress;
  /** Recipient's Stellar address. */
  to: StellarAddress;
  /** Asset to send. */
  asset: Asset;
  /** Amount as a decimal string (e.g. "25.00"). */
  amount: string;
  /** Optional memo text (max 28 bytes). */
  memo?: string;
}

/**
 * Build an unsigned payment transaction for a direct donation or tip.
 *
 * @returns Unsigned transaction XDR string.
 * @throws {@link ValidationError} on invalid inputs.
 * @throws {@link NetworkError} if Horizon is unreachable.
 */
export async function buildDonation(
  opts: BuildDonationOpts,
  config: ResolvedConfig,
): Promise<string> {
  const { from, to, asset, amount, memo } = opts;

  assertAccountAddress(from, "from");
  assertAccountAddress(to, "to");
  assertValidAsset(asset, "asset");
  assertPositiveAmount(amount, "amount");
  if (memo !== undefined && Buffer.byteLength(memo, "utf8") > 28) {
    throw new ValidationError("memo must be at most 28 bytes");
  }

  const accountData = await loadAccount(from, config);
  const senderAccount = new Account(from, accountData.sequence);
  const stellarAsset = toStellarAsset(asset);

  const txBuilder = new TransactionBuilder(senderAccount, {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  });

  txBuilder.addOperation(
    Operation.payment({
      destination: to,
      asset: stellarAsset,
      amount,
    }),
  );

  if (memo !== undefined) {
    txBuilder.addMemo(Memo.text(memo));
  }

  return txBuilder.setTimeout(300).build().toXDR();
}

// ---------------------------------------------------------------------------
// ensureTrustline
// ---------------------------------------------------------------------------

/**
 * Check whether `account` has a trustline for `asset`.
 *
 * - If the asset is the native XLM, always returns `null` (no trustline needed).
 * - If the account already has a trustline, returns `null`.
 * - Otherwise builds and returns an unsigned `change_trust` transaction XDR.
 *
 * @returns Unsigned XDR to sign and submit, or `null` if no action is needed.
 */
export async function ensureTrustline(
  account: StellarAddress,
  asset: Asset,
  config: ResolvedConfig,
): Promise<string | null> {
  assertAccountAddress(account, "account");
  assertValidAsset(asset, "asset");

  // Native XLM needs no trustline.
  if (!asset.issuer) {
    return null;
  }

  const accountData = await loadAccount(account, config);

  const hasTrustline = accountData.balances.some(
    (b) =>
      b.asset_type !== "native" && b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  );

  if (hasTrustline) {
    return null;
  }

  const stellarAccount = new Account(account, accountData.sequence);
  const stellarAsset = toStellarAsset(asset);

  const txBuilder = new TransactionBuilder(stellarAccount, {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  });

  txBuilder.addOperation(Operation.changeTrust({ asset: stellarAsset }));

  return txBuilder.setTimeout(300).build().toXDR();
}

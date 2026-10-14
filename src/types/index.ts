/**
 * Shared domain types used across the SDK, `api`, and `web`.
 *
 * These types describe the StellarAid problem domain only. Contract bindings live in
 * `src/generated/` and are wrapped by the per-module clients.
 */

/** Supported networks. */
export type NetworkName = "testnet" | "mainnet" | "local";

/** A Stellar account address (`G...`). */
export type StellarAddress = string;

/** A transaction hash. */
export type TransactionHash = string;

/** An asset identified by code and, for non-native assets, issuer. */
export interface Asset {
  /** Asset code, for example `XLM` or `USDC`. */
  readonly code: string;
  /** Issuer account for issued assets; omitted for the native asset. */
  readonly issuer?: string;
}

/** The result of submitting a transaction successfully. */
export interface SubmitResult {
  /** Transaction hash. */
  readonly hash: TransactionHash;
  /** Ledger the transaction was included in, when known. */
  readonly ledger?: number;
}

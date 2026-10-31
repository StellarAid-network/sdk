/**
 * Public-boundary input validation helpers.
 *
 * Every public SDK entry point validates addresses, amounts, and dates before touching
 * RPC, Horizon, or contract bindings, throwing a {@link ValidationError} with a clear
 * field-specific message when caller input is malformed.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { parseAmount, STELLAR_DECIMALS } from "./assets";
import { ValidationError } from "./errors";
import type { Asset } from "./types";

/**
 * Rejects any string that looks like a Stellar secret seed (`S...`).
 *
 * The SDK never accepts secret keys; signing is always delegated to a wallet adapter
 * or server-side signer object.
 *
 * @param value - Candidate string value passed across an SDK boundary.
 * @param field - Parameter name used in the error message.
 * @throws {@link ValidationError} if `value` is a Stellar secret key (`S...`).
 */
export function assertNotSecretKey(value: unknown, field: string): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (StrKey.isValidEd25519SecretSeed(trimmed) || /^S[A-Z2-7]{55}$/.test(trimmed)) {
    throw new ValidationError(
      `Invalid ${field}: secret keys (S...) are never accepted by @stellar-aid/sdk. Delegate signing to a wallet adapter or signer object.`,
    );
  }
}

/**
 * Validates that `address` is a well-formed Stellar Ed25519 public key (`G...`).
 *
 * @param address - Candidate Stellar account address.
 * @param field - Parameter name used in the error message.
 * @throws {@link ValidationError} if `address` is empty, a secret key, or fails StrKey checksum validation.
 */
export function assertAccountAddress(address: string, field = "address"): void {
  if (!address || typeof address !== "string") {
    throw new ValidationError(
      `Invalid ${field}: expected a Stellar G... public address, received empty value.`,
    );
  }
  assertNotSecretKey(address, field);
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new ValidationError(
      `Invalid ${field} "${address}": expected a valid 56-character Stellar G... public key.`,
    );
  }
}

/**
 * Validates that `address` is either a valid Stellar public account (`G...`) or Soroban contract (`C...`).
 *
 * @param address - Candidate Stellar account or Soroban contract address.
 * @param field - Parameter name used in the error message.
 * @throws {@link ValidationError} if `address` is neither a valid `G...` nor `C...` StrKey.
 */
export function assertAccountOrContractAddress(address: string, field = "address"): void {
  if (!address || typeof address !== "string") {
    throw new ValidationError(
      `Invalid ${field}: expected a Stellar account (G...) or contract (C...) address, received empty value.`,
    );
  }
  assertNotSecretKey(address, field);
  if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
    throw new ValidationError(
      `Invalid ${field} "${address}": expected a valid Stellar account (G...) or Soroban contract (C...) address.`,
    );
  }
}

/**
 * Validates an {@link Asset} object (`code` length 1..12 alphanumeric, optional valid `G...` `issuer`).
 *
 * @param asset - Asset descriptor to validate.
 * @param field - Parameter name used in the error message.
 * @throws {@link ValidationError} if `asset.code` or `asset.issuer` is invalid.
 */
export function assertValidAsset(asset: Asset, field = "asset"): void {
  if (!asset || typeof asset !== "object" || typeof asset.code !== "string") {
    throw new ValidationError(`Invalid ${field}: asset object with a code string is required.`);
  }
  if (!/^[a-zA-Z0-9]{1,12}$/.test(asset.code)) {
    throw new ValidationError(
      `Invalid ${field}.code "${asset.code}": asset code must be 1 to 12 alphanumeric characters.`,
    );
  }
  if (asset.issuer !== undefined) {
    assertAccountAddress(asset.issuer, `${field}.issuer`);
  }
}

/**
 * Validates a positive human decimal string or on-chain `bigint` amount and returns the scaled `bigint`.
 *
 * @param amount - Human decimal string (up to 7 decimals) or positive `bigint` stroop amount.
 * @param field - Parameter name used in the error message.
 * @param decimals - Decimal precision (defaults to {@link STELLAR_DECIMALS} = 7).
 * @returns Positive `bigint` amount in stroops.
 * @throws {@link ValidationError} if `amount` is malformed, NaN, zero, negative, or exceeds precision.
 */
export function assertPositiveAmount(
  amount: string | bigint,
  field = "amount",
  decimals: number = STELLAR_DECIMALS,
): bigint {
  if (typeof amount === "bigint") {
    if (amount <= 0n) {
      throw new ValidationError(
        `Invalid ${field}: amount must be greater than zero (received ${amount.toString()}).`,
      );
    }
    return amount;
  }

  if (typeof amount !== "string" || amount.trim().length === 0) {
    throw new ValidationError(`Invalid ${field}: expected a positive decimal string or bigint.`);
  }

  let parsed: bigint;
  try {
    parsed = parseAmount(amount, decimals);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Invalid ${field} "${amount}": ${detail}`);
  }

  if (parsed <= 0n) {
    throw new ValidationError(`Invalid ${field} "${amount}": amount must be greater than zero.`);
  }

  return parsed;
}

/**
 * Validates a `Date` object and ensures its timestamp is finite and positive.
 *
 * @param date - Date instance to check.
 * @param field - Parameter name used in the error message.
 * @throws {@link ValidationError} if `date` is not a valid `Date` or represents an invalid timestamp.
 */
export function assertValidDate(date: Date, field = "date"): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${field}: expected a valid Date instance.`);
  }
  if (date.getTime() < 0) {
    throw new ValidationError(
      `Invalid ${field}: date cannot precede Unix epoch (1970-01-01T00:00:00Z).`,
    );
  }
}

/**
 * Validates an optional `[from, until]` time window, ensuring both dates are valid and `until > from`.
 *
 * @param from - Optional window start date.
 * @param until - Optional window end / expiry date.
 * @param fromField - Field label for `from`.
 * @param untilField - Field label for `until`.
 * @throws {@link ValidationError} if either date is invalid or `until <= from`.
 */
export function assertValidDateWindow(
  from?: Date,
  until?: Date,
  fromField = "from",
  untilField = "until",
): void {
  if (from !== undefined) {
    assertValidDate(from, fromField);
  }
  if (until !== undefined) {
    assertValidDate(until, untilField);
  }
  if (from !== undefined && until !== undefined && until.getTime() <= from.getTime()) {
    throw new ValidationError(
      `Invalid time window: ${untilField} (${until.toISOString()}) must be strictly after ${fromField} (${from.toISOString()}).`,
    );
  }
}

/**
 * Validates a `Date`, Unix seconds `number`, or `bigint` ledger timestamp and returns Unix seconds as `bigint`.
 *
 * @param value - Timestamp as `Date`, finite positive `number` (Unix seconds), or positive `bigint`.
 * @param field - Parameter name used in the error message.
 * @returns Unix timestamp in seconds as `bigint`.
 * @throws {@link ValidationError} if the timestamp is invalid, NaN, or non-positive.
 */
export function assertValidTimestamp(value: Date | number | bigint, field = "timestamp"): bigint {
  if (value instanceof Date) {
    assertValidDate(value, field);
    const secs = BigInt(Math.floor(value.getTime() / 1000));
    if (secs <= 0n) {
      throw new ValidationError(`Invalid ${field}: timestamp must be greater than zero.`);
    }
    return secs;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new ValidationError(
        `Invalid ${field}: numeric Unix timestamp must be a positive integer in seconds (received ${String(value)}).`,
      );
    }
    return BigInt(value);
  }

  if (typeof value === "bigint") {
    if (value <= 0n) {
      throw new ValidationError(
        `Invalid ${field}: bigint Unix timestamp must be greater than zero (received ${value.toString()}).`,
      );
    }
    return value;
  }

  throw new ValidationError(
    `Invalid ${field}: expected a Date, positive integer seconds, or bigint.`,
  );
}

/**
 * Validates a non-negative integer identifier (`number` or `bigint`) and returns `bigint`.
 *
 * @param id - Numeric or bigint identifier.
 * @param field - Parameter name used in the error message.
 * @returns Normalized `bigint` identifier.
 * @throws {@link ValidationError} if `id` is negative, non-integer, or NaN.
 */
export function assertNonNegativeId(id: bigint | number, field = "id"): bigint {
  if (typeof id === "bigint") {
    if (id < 0n) {
      throw new ValidationError(
        `Invalid ${field}: identifier must be non-negative (received ${id.toString()}).`,
      );
    }
    return id;
  }
  if (typeof id === "number") {
    if (!Number.isFinite(id) || !Number.isInteger(id) || id < 0) {
      throw new ValidationError(
        `Invalid ${field}: identifier must be a non-negative integer (received ${String(id)}).`,
      );
    }
    return BigInt(id);
  }
  throw new ValidationError(`Invalid ${field}: expected a non-negative integer or bigint.`);
}

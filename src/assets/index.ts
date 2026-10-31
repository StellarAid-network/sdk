/**
 * Asset definitions and amount formatting.
 *
 * Amounts are exchanged as human-readable strings and on-chain integers with 7 decimal
 * places (the Stellar convention). Use {@link formatAmount} and {@link parseAmount} to
 * convert between them.
 */

import { StrKey } from "@stellar/stellar-sdk";
import { ValidationError } from "../errors";
import type { Asset, NetworkName } from "../types";

/** The native Stellar asset. */
export const XLM: Asset = { code: "XLM" };

/**
 * USDC issuers per network.
 *
 * TODO-verify: confirm the canonical USDC issuer for each network before handling real
 * funds. The issuer is also overridable via SDK configuration.
 */
export const USDC_ISSUERS: Record<NetworkName, string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  local: "",
};

/** The default number of decimal places for Stellar amounts. */
export const STELLAR_DECIMALS = 7;

/** Return the USDC asset for a network, if an issuer is configured. */
export function usdc(network: NetworkName, issuer?: string): Asset {
  if (!(network in USDC_ISSUERS)) {
    throw new ValidationError(`Unknown network: "${String(network)}"`);
  }
  if (issuer !== undefined) {
    if (StrKey.isValidEd25519SecretSeed(issuer)) {
      throw new ValidationError(
        "Invalid issuer: secret keys (S...) are never accepted by @stellar-aid/sdk.",
      );
    }
    if (!StrKey.isValidEd25519PublicKey(issuer)) {
      throw new ValidationError(
        `Invalid USDC issuer "${issuer}": expected a Stellar G... address.`,
      );
    }
  }
  const resolved = issuer ?? USDC_ISSUERS[network];
  return resolved ? { code: "USDC", issuer: resolved } : { code: "USDC" };
}

/** Assets available to an application for a given network. */
export interface NetworkAssets {
  readonly XLM: Asset;
  readonly USDC: Asset;
}

/** Resolve the well-known assets for a network. */
export function assetsForNetwork(network: NetworkName): NetworkAssets {
  return { XLM, USDC: usdc(network) };
}

/**
 * Format an on-chain integer amount as a fixed-precision decimal string.
 *
 * @example
 * formatAmount(10_000_000n, 7); // "1.0000000"
 */
export function formatAmount(value: bigint, decimals: number = STELLAR_DECIMALS): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new ValidationError(`Invalid decimals: ${decimals}`);
  }

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const sign = negative ? "-" : "";

  if (decimals === 0) {
    return `${sign}${whole.toString()}`;
  }

  return `${sign}${whole.toString()}.${fraction.toString().padStart(decimals, "0")}`;
}

/**
 * Parse a decimal string into an on-chain integer amount.
 *
 * @example
 * parseAmount("12.5", 7); // 125_000_000n
 */
export function parseAmount(value: string, decimals: number = STELLAR_DECIMALS): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new ValidationError(`Invalid decimals: ${decimals}`);
  }

  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new ValidationError(`Invalid amount: "${value}"`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");

  if (fractionPart.length > decimals) {
    throw new ValidationError(`Amount "${value}" has more than ${decimals} decimal places`);
  }

  const scaled =
    BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fractionPart.padEnd(decimals, "0") || "0");

  return negative ? -scaled : scaled;
}

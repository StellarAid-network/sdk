import { assetsForNetwork, type NetworkAssets } from "../assets";
import { NetworkError, ValidationError } from "../errors";
import type { NetworkName, SubmitResult } from "../types";
import { NETWORK_DEFAULTS, type ContractAddresses, type StellarAidConfig } from "./config";

export type { ContractAddresses, NetworkDefaults, StellarAidConfig } from "./config";
export { NETWORK_DEFAULTS } from "./config";

/** Fully resolved configuration for a SDK instance. */
export interface ResolvedConfig {
  /** Target network. */
  readonly network: NetworkName;
  /** Network passphrase used to sign transactions. */
  readonly networkPassphrase: string;
  /** Soroban RPC endpoint. */
  readonly rpcUrl: string;
  /** Horizon endpoint. */
  readonly horizonUrl: string;
  /** Deployed contract addresses. */
  readonly contracts: ContractAddresses;
  /** Fetch implementation used for network calls. */
  readonly fetch: typeof fetch;
}

/** The SDK entry object returned by {@link createStellarAid}. */
export interface StellarAid {
  /** Target network. */
  readonly network: NetworkName;
  /** Resolved configuration. */
  readonly config: ResolvedConfig;
  /** Well-known assets for the configured network. */
  readonly assets: NetworkAssets;
  /**
   * Submit a signed transaction.
   *
   * Not implemented in this scaffold. Transaction submission lands with the giveaway,
   * payment, and contract modules.
   */
  submit(signedXdr: string): Promise<SubmitResult>;
}

/**
 * Create a configured StellarAid SDK instance.
 *
 * @example
 * const aid = createStellarAid({ network: "testnet" });
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

  const resolved: ResolvedConfig = {
    network: config.network,
    networkPassphrase: config.networkPassphrase ?? defaults.networkPassphrase,
    rpcUrl: config.rpcUrl ?? defaults.rpcUrl,
    horizonUrl: config.horizonUrl ?? defaults.horizonUrl,
    contracts,
    fetch: config.fetch ?? globalThis.fetch,
  };

  return {
    network: resolved.network,
    config: resolved,
    assets: assetsForNetwork(resolved.network),
    async submit(_signedXdr: string): Promise<SubmitResult> {
      throw new NetworkError("submit() is not implemented yet");
    },
  };
}

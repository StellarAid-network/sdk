import type { NetworkName } from "../types";
import mainnetDeployments from "../deployments/mainnet.json";
import testnetDeployments from "../deployments/testnet.json";

/** Deployed StellarAid contract addresses for a network. */
export interface ContractAddresses {
  /** Help Request escrow contract id. */
  help_request: string;
  /** Reputation contract id. */
  reputation: string;
  /** Attestation contract id. */
  attestation: string;
}

/** Resolved defaults for a network. */
export interface NetworkDefaults {
  readonly name: NetworkName;
  readonly networkPassphrase: string;
  readonly rpcUrl: string;
  readonly horizonUrl: string;
  readonly contracts: ContractAddresses;
  readonly friendbotUrl?: string;
}

/** Caller-supplied overrides accepted by {@link createStellarAid}. */
export interface StellarAidConfig {
  /** Network to target. */
  network: NetworkName;
  /** Soroban RPC override. */
  rpcUrl?: string;
  /** Horizon override. */
  horizonUrl?: string;
  /** Network passphrase override. */
  networkPassphrase?: string;
  /** Deployed contract address overrides. */
  contracts?: Partial<ContractAddresses>;
  /** Custom fetch implementation (SSR, tests). */
  fetch?: typeof fetch;
}

/**
 * Fully resolved configuration for an SDK instance.
 * Shared by the giveaways, payments, and contract-wrapper modules.
 */
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

/** Default RPC, Horizon, and passphrase values for each network. */
export const NETWORK_DEFAULTS: Record<NetworkName, NetworkDefaults> = {
  testnet: {
    name: "testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    contracts: testnetDeployments.contracts,
    friendbotUrl: "https://friendbot.stellar.org",
  },
  mainnet: {
    name: "mainnet",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://mainnet.sorobanrpc.com",
    horizonUrl: "https://horizon.stellar.org",
    contracts: mainnetDeployments.contracts,
  },
  local: {
    name: "local",
    networkPassphrase: "Standalone Network ; February 2017",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    horizonUrl: "http://localhost:8000",
    contracts: {
      help_request: "",
      reputation: "",
      attestation: "",
    },
    friendbotUrl: "http://localhost:8000/friendbot",
  },
};

/**
 * Typed wrapper over the generated Reputation contract binding.
 */

import type { ResolvedConfig } from "../network/config";
import { extractContractError, REPUTATION_ERRORS } from "../errors";
import { ReputationBinding } from "../generated";
import { assertAccountAddress } from "../validation";

/** Earned on-chain reputation badge. */
export interface ReputationBadge {
  /** Human-readable badge name (`Helper`, `Advocate`, `Champion`). */
  name: string;
  /** Numeric badge tier (`1`, `2`, `3`). */
  tier: number;
  /** Score threshold required for this tier. */
  threshold: number;
}

/** On-chain badge threshold configuration. */
export interface ReputationConfig {
  /** Minimum score for Tier 1 (`Helper`). */
  tier1Threshold: number;
  /** Minimum score for Tier 2 (`Advocate`). */
  tier2Threshold: number;
  /** Minimum score for Tier 3 (`Champion`). */
  tier3Threshold: number;
}

/** Ergonomic wrapper around the generated Reputation Soroban contract client. */
export class ReputationModule {
  public readonly config: ResolvedConfig;
  private readonly client: ReputationBinding.Client;

  constructor(config: ResolvedConfig) {
    this.config = config;
    const contractId = config.contracts.reputation;
    this.client = new ReputationBinding.Client({
      contractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
    });
  }

  /**
   * Return the underlying generated Client for low-level invocations.
   */
  public get rawClient(): ReputationBinding.Client {
    return this.client;
  }

  /**
   * Read the reputation score for an address. Returns 0 if none recorded.
   */
  public async getScore(subject: string): Promise<number> {
    assertAccountAddress(subject, "subject");
    try {
      const tx = await this.client.get_score({ subject });
      const sim = await tx.simulate();
      const raw = (sim as { result?: { retval?: unknown } })?.result?.retval ?? tx.result;
      return typeof raw === "bigint" ? Number(raw) : Number(raw || 0);
    } catch (err) {
      throw extractContractError(err, REPUTATION_ERRORS);
    }
  }

  /**
   * Read the earned badges for an address.
   */
  public async getBadges(subject: string): Promise<ReputationBadge[]> {
    assertAccountAddress(subject, "subject");
    try {
      const tx = await this.client.get_badges({ subject });
      const sim = await tx.simulate();
      const raw = (sim as { result?: { retval?: unknown } })?.result?.retval ?? tx.result;

      const list = (raw || []) as Array<{
        name: string;
        tier: number;
        threshold: bigint | number;
      }>;

      return list.map((b) => ({
        name: String(b.name),
        tier: Number(b.tier),
        threshold: Number(b.threshold),
      }));
    } catch (err) {
      throw extractContractError(err, REPUTATION_ERRORS);
    }
  }

  /**
   * Read the badge threshold configuration.
   */
  public async getConfig(): Promise<ReputationConfig> {
    try {
      const tx = await this.client.get_config();
      const sim = await tx.simulate();
      let raw: unknown = (sim as { result?: { retval?: unknown } })?.result?.retval ?? tx.result;
      if (raw && typeof raw === "object" && "value" in raw) {
        raw = (raw as { value: unknown }).value;
      }

      const cfg = raw as {
        tier1_threshold: bigint | number;
        tier2_threshold: bigint | number;
        tier3_threshold: bigint | number;
      };

      return {
        tier1Threshold: Number(cfg.tier1_threshold),
        tier2Threshold: Number(cfg.tier2_threshold),
        tier3Threshold: Number(cfg.tier3_threshold),
      };
    } catch (err) {
      throw extractContractError(err, REPUTATION_ERRORS);
    }
  }
}

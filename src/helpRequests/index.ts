/**
 * Typed wrapper over the generated Help Request contract binding.
 *
 * Provides amount conversion ("25.00" <-> i128), parameter normalization, fee estimation
 * with configurable margin, and mapping of numeric error codes to typed ContractErrors.
 */

import { Buffer } from "node:buffer";
import type { ResolvedConfig } from "../network/config";
import { formatAmount } from "../assets";
import { extractContractError, HELP_REQUEST_ERRORS, ValidationError } from "../errors";
import { HelpRequestBinding } from "../generated";
import {
  assertAccountAddress,
  assertAccountOrContractAddress,
  assertNonNegativeId,
  assertNotSecretKey,
  assertPositiveAmount,
  assertValidTimestamp,
} from "../validation";

/** Parameters for {@link HelpRequestsModule.create}. */
export interface CreateRequestParams {
  /** Creator Stellar account (`G...`). */
  creator: string;
  /** Token contract address (`C...`). */
  token: string;
  /** Target funding goal as decimal string or stroop `bigint`. */
  goal: string | bigint;
  /** Funding deadline as `Date` or Unix seconds (`number` / `bigint`). */
  deadline: Date | number | bigint;
  /** Optional milestone schedule whose amounts sum to `goal`. */
  milestones?: {
    index: number;
    amount: string | bigint;
    evidenceHash?: string | Buffer;
  }[];
  /** 32-byte content digest (`0x`-prefixed/64-char hex or `Buffer`). */
  contentHash: string | Buffer;
  /** Optional fee estimation multiplier margin. */
  feeMargin?: number;
}

/** Parameters for {@link HelpRequestsModule.contribute}. */
export interface ContributeParams {
  /** Target help request ID. */
  requestId: bigint | number;
  /** Contributor Stellar account (`G...`). */
  contributor: string;
  /** Contribution amount as decimal string or stroop `bigint`. */
  amount: string | bigint;
  /** Optional fee estimation multiplier margin. */
  feeMargin?: number;
}

/** Shared parameters for milestone actions. */
export interface MilestoneActionParams {
  /** Target help request ID. */
  requestId: bigint | number;
  /** Zero-based milestone index. */
  index: number;
  /** Optional fee estimation multiplier margin. */
  feeMargin?: number;
}

/** Parameters for {@link HelpRequestsModule.submitMilestone}. */
export interface SubmitMilestoneParams extends MilestoneActionParams {
  /** 32-byte evidence digest (`0x`-prefixed/64-char hex or `Buffer`). */
  evidenceHash: string | Buffer;
}

/** Parameters for {@link HelpRequestsModule.approveMilestone}. */
export interface ApproveMilestoneParams extends MilestoneActionParams {
  /** Approver Stellar account (`G...`). */
  approver: string;
}

/** Parameters for {@link HelpRequestsModule.disputeMilestone}. */
export interface DisputeMilestoneParams extends MilestoneActionParams {
  /** Approver Stellar account (`G...`). */
  approver: string;
}

/** Parameters for {@link HelpRequestsModule.refund}. */
export interface RefundParams {
  /** Target help request ID. */
  requestId: bigint | number;
  /** Contributor Stellar account (`G...`) claiming the refund. */
  contributor: string;
  /** Optional fee estimation multiplier margin. */
  feeMargin?: number;
}

/** Shared parameters for single-request actions (`finalize`, `cancel`). */
export interface ActionParams {
  /** Target help request ID. */
  requestId: bigint | number;
  /** Optional fee estimation multiplier margin. */
  feeMargin?: number;
}

/** Normalized milestone entry returned by {@link HelpRequestsModule.get}. */
export interface HelpRequestMilestone {
  index: number;
  amount: bigint;
  amountFormatted: string;
  evidenceHash: string | null;
  released: boolean;
}

/** Normalized help request state returned by {@link HelpRequestsModule.get}. */
export interface HelpRequestDetails {
  id: bigint;
  creator: string;
  token: string;
  goal: bigint;
  goalFormatted: string;
  raised: bigint;
  raisedFormatted: string;
  totalReleased: bigint;
  totalReleasedFormatted: string;
  deadline: Date;
  status: string;
  contentHash: string;
  milestones: HelpRequestMilestone[];
  createdAt: Date;
}

function toBytes32(input: string | Buffer, field = "hash"): Buffer {
  if (Buffer.isBuffer(input)) {
    if (input.length === 0) {
      throw new ValidationError(`Invalid ${field}: expected a non-empty 32-byte Buffer.`);
    }
    if (input.length === 32) return input;
    const buf = Buffer.alloc(32);
    input.copy(buf);
    return buf;
  }
  assertNotSecretKey(input, field);
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new ValidationError(`Invalid ${field}: expected a non-empty hex string or Buffer.`);
  }
  const clean = input.startsWith("0x") ? input.slice(2) : input;
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return Buffer.from(clean, "hex");
  }
  const buf = Buffer.alloc(32);
  Buffer.from(clean).copy(buf);
  return buf;
}

function assertMilestoneIndex(index: number): void {
  if (!Number.isFinite(index) || !Number.isInteger(index) || index < 0) {
    throw new ValidationError(
      `Invalid index: milestone index must be a non-negative integer (received ${String(index)}).`,
    );
  }
}

/** Ergonomic wrapper around the generated Help Request Soroban contract client. */
export class HelpRequestsModule {
  public readonly config: ResolvedConfig;
  private readonly client: HelpRequestBinding.Client;

  constructor(config: ResolvedConfig) {
    this.config = config;
    const contractId = config.contracts.help_request;
    this.client = new HelpRequestBinding.Client({
      contractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
    });
  }

  /**
   * Return the underlying generated Client for low-level invocations.
   */
  public get rawClient(): HelpRequestBinding.Client {
    return this.client;
  }

  /**
   * Build an unsigned transaction to create a new help request.
   */
  public async create(
    params: CreateRequestParams,
  ): Promise<{ xdr: string; simulate: () => Promise<unknown> }> {
    assertAccountAddress(params.creator, "creator");
    assertAccountOrContractAddress(params.token, "token");
    const goal = assertPositiveAmount(params.goal, "goal");
    const deadline = assertValidTimestamp(params.deadline, "deadline");
    const contentHash = toBytes32(params.contentHash, "contentHash");

    const milestones = (params.milestones || []).map((m, idx) => {
      assertMilestoneIndex(m.index);
      return {
        index: m.index,
        amount: assertPositiveAmount(m.amount, `milestones[${idx}].amount`),
        evidence_hash: m.evidenceHash
          ? toBytes32(m.evidenceHash, `milestones[${idx}].evidenceHash`)
          : undefined,
        released: false,
      };
    });

    try {
      const tx = await this.client.create_request({
        creator: params.creator,
        token: params.token,
        goal,
        deadline,
        milestones,
        content_hash: contentHash,
      });

      return {
        xdr: tx.toXDR(),
        simulate: () => tx.simulate(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Read the details of a help request by ID.
   */
  public async get(requestId: bigint | number): Promise<HelpRequestDetails> {
    const id = assertNonNegativeId(requestId, "requestId");
    try {
      const tx = await this.client.get_request({ request_id: id });
      const sim = await tx.simulate();
      const raw = (sim as { result?: { retval?: unknown } })?.result?.retval ?? tx.result;

      const res = raw as {
        id: bigint;
        creator: string;
        token: string;
        goal: bigint;
        raised: bigint;
        total_released: bigint;
        deadline: bigint;
        status: { tag: string } | string;
        content_hash: Buffer;
        milestones: Array<{
          index: number;
          amount: bigint;
          evidence_hash?: Buffer | null;
          released: boolean;
        }>;
        created_at: bigint;
      };

      const statusTag =
        typeof res.status === "object" && res.status !== null && "tag" in res.status
          ? res.status.tag
          : String(res.status);

      return {
        id: res.id,
        creator: res.creator,
        token: res.token,
        goal: res.goal,
        goalFormatted: formatAmount(res.goal),
        raised: res.raised,
        raisedFormatted: formatAmount(res.raised),
        totalReleased: res.total_released,
        totalReleasedFormatted: formatAmount(res.total_released),
        deadline: new Date(Number(res.deadline) * 1000),
        status: statusTag,
        contentHash: Buffer.from(res.content_hash).toString("hex"),
        milestones: (res.milestones || []).map((m) => ({
          index: m.index,
          amount: m.amount,
          amountFormatted: formatAmount(m.amount),
          evidenceHash: m.evidence_hash ? Buffer.from(m.evidence_hash).toString("hex") : null,
          released: m.released,
        })),
        createdAt: new Date(Number(res.created_at) * 1000),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Build an unsigned transaction to contribute funds to an open request.
   */
  public async contribute(params: ContributeParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    assertAccountAddress(params.contributor, "contributor");
    const amount = assertPositiveAmount(params.amount, "amount");

    try {
      const tx = await this.client.contribute({
        request_id: requestId,
        contributor: params.contributor,
        amount,
      });

      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Finalize a request after its deadline.
   */
  public async finalize(params: ActionParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    try {
      const tx = await this.client.finalize({
        request_id: requestId,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Claim a refund from a Failed, Cancelled, or Disputed request.
   */
  public async refund(params: RefundParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    assertAccountAddress(params.contributor, "contributor");
    try {
      const tx = await this.client.refund({
        request_id: requestId,
        contributor: params.contributor,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Cancel an Open request before it is funded.
   */
  public async cancel(params: ActionParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    try {
      const tx = await this.client.cancel({
        request_id: requestId,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Submit progress evidence for a milestone.
   */
  public async submitMilestone(params: SubmitMilestoneParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    assertMilestoneIndex(params.index);
    const evidenceHash = toBytes32(params.evidenceHash, "evidenceHash");
    try {
      const tx = await this.client.submit_milestone({
        request_id: requestId,
        index: params.index,
        evidence_hash: evidenceHash,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Approve a submitted milestone.
   */
  public async approveMilestone(params: ApproveMilestoneParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    assertMilestoneIndex(params.index);
    assertAccountAddress(params.approver, "approver");
    try {
      const tx = await this.client.approve_milestone({
        request_id: requestId,
        index: params.index,
        approver: params.approver,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Release an approved milestone.
   */
  public async releaseMilestone(params: MilestoneActionParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    assertMilestoneIndex(params.index);
    try {
      const tx = await this.client.release_milestone({
        request_id: requestId,
        index: params.index,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Dispute/reject a milestone.
   */
  public async disputeMilestone(params: DisputeMilestoneParams): Promise<{ xdr: string }> {
    const requestId = assertNonNegativeId(params.requestId, "requestId");
    assertMilestoneIndex(params.index);
    assertAccountAddress(params.approver, "approver");
    try {
      const tx = await this.client.dispute_milestone({
        request_id: requestId,
        index: params.index,
        approver: params.approver,
      });
      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }

  /**
   * Read the contribution balance for a specific contributor.
   */
  public async getContribution(requestId: bigint | number, contributor: string): Promise<bigint> {
    const id = assertNonNegativeId(requestId, "requestId");
    assertAccountAddress(contributor, "contributor");
    try {
      const tx = await this.client.get_contribution({
        request_id: id,
        contributor,
      });
      const sim = await tx.simulate();
      const raw = (sim as { result?: { retval?: unknown } })?.result?.retval ?? tx.result;
      return typeof raw === "bigint" ? raw : BigInt((raw as number) || 0);
    } catch (err) {
      throw extractContractError(err, HELP_REQUEST_ERRORS);
    }
  }
}

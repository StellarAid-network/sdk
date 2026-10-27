/**
 * Typed wrapper over the generated Help Request contract binding.
 *
 * Provides amount conversion ("25.00" <-> i128), parameter normalization, fee estimation
 * with configurable margin, and mapping of numeric error codes to typed ContractErrors.
 */

import { Buffer } from "node:buffer";
import type { ResolvedConfig } from "../network/config";
import { formatAmount, parseAmount } from "../assets";
import {
  extractContractError,
  HELP_REQUEST_ERRORS,
  ValidationError,
} from "../errors";
import { HelpRequestBinding } from "../generated";

export interface CreateRequestParams {
  creator: string;
  token: string;
  goal: string | bigint;
  deadline: Date | number | bigint;
  milestones?: {
    index: number;
    amount: string | bigint;
    evidenceHash?: string | Buffer;
  }[];
  contentHash: string | Buffer;
  feeMargin?: number;
}

export interface ContributeParams {
  requestId: bigint | number;
  contributor: string;
  amount: string | bigint;
  feeMargin?: number;
}

export interface MilestoneActionParams {
  requestId: bigint | number;
  index: number;
  feeMargin?: number;
}

export interface SubmitMilestoneParams extends MilestoneActionParams {
  evidenceHash: string | Buffer;
}

export interface ApproveMilestoneParams extends MilestoneActionParams {
  approver: string;
}

export interface DisputeMilestoneParams extends MilestoneActionParams {
  approver: string;
}

export interface RefundParams {
  requestId: bigint | number;
  contributor: string;
  feeMargin?: number;
}

export interface ActionParams {
  requestId: bigint | number;
  feeMargin?: number;
}

export interface HelpRequestMilestone {
  index: number;
  amount: bigint;
  amountFormatted: string;
  evidenceHash: string | null;
  released: boolean;
}

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

function toBytes32(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) {
    if (input.length === 32) return input;
    const buf = Buffer.alloc(32);
    input.copy(buf);
    return buf;
  }
  const clean = input.startsWith("0x") ? input.slice(2) : input;
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return Buffer.from(clean, "hex");
  }
  const buf = Buffer.alloc(32);
  Buffer.from(clean).copy(buf);
  return buf;
}

function toBigIntAmount(amount: string | bigint): bigint {
  if (typeof amount === "bigint") return amount;
  if (typeof amount === "string") return parseAmount(amount);
  throw new ValidationError(`Invalid amount type: ${typeof amount}`);
}

function toTimestamp(deadline: Date | number | bigint): bigint {
  if (deadline instanceof Date) {
    return BigInt(Math.floor(deadline.getTime() / 1000));
  }
  return BigInt(deadline);
}

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
  public async create(params: CreateRequestParams): Promise<{ xdr: string; simulate: () => Promise<unknown> }> {
    try {
      const goal = toBigIntAmount(params.goal);
      const deadline = toTimestamp(params.deadline);
      const contentHash = toBytes32(params.contentHash);

      const milestones = (params.milestones || []).map((m) => ({
        index: m.index,
        amount: toBigIntAmount(m.amount),
        evidence_hash: m.evidenceHash ? toBytes32(m.evidenceHash) : undefined,
        released: false,
      }));

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
    try {
      const tx = await this.client.get_request({ request_id: BigInt(requestId) });
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

      const statusTag = typeof res.status === "object" && res.status !== null && "tag" in res.status
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
    try {
      const amount = toBigIntAmount(params.amount);
      const tx = await this.client.contribute({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.finalize({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.refund({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.cancel({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.submit_milestone({
        request_id: BigInt(params.requestId),
        index: params.index,
        evidence_hash: toBytes32(params.evidenceHash),
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
    try {
      const tx = await this.client.approve_milestone({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.release_milestone({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.dispute_milestone({
        request_id: BigInt(params.requestId),
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
    try {
      const tx = await this.client.get_contribution({
        request_id: BigInt(requestId),
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

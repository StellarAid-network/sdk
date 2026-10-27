// @ts-nocheck
import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBPW3FPPKPT4YWT7NSWM2EZ5AMONGQQQBPAEYZBSBWSOUGY5B26A7RLL",
  }
} as const


/**
 * Contract configuration, set at initialization and updatable by the admin.
 */
export interface Config {
  /**
 * Tokens accepted for contributions.
 */
allowed_tokens: Array<string>;
  /**
 * Number of approvals required to release a milestone.
 */
approval_threshold: u32;
  /**
 * Addresses allowed to approve milestones.
 */
approvers: Array<string>;
  /**
 * Minimum accepted contribution, in the token's smallest unit.
 */
min_contribution: i128;
  /**
 * Optional reputation contract notified on lifecycle events.
 */
reputation_contract: Option<string>;
}

/**
 * Lifecycle status of a help request.
 * 
 * Mirrors the state machine documented in the repository README:
 * `Open -> Funded -> Releasing -> Completed`, with `Failed`, `Cancelled`, and
 * `Disputed` reachable as described there.
 */
export type Status = {tag: "Open", values: void} | {tag: "Funded", values: void} | {tag: "Releasing", values: void} | {tag: "Completed", values: void} | {tag: "Failed", values: void} | {tag: "Cancelled", values: void} | {tag: "Disputed", values: void};


/**
 * A help request and its escrow state.
 */
export interface Request {
  /**
 * IPFS CID or content hash of the off-chain description.
 */
content_hash: Buffer;
  /**
 * Creation timestamp.
 */
created_at: u64;
  /**
 * Address that opened the request.
 */
creator: string;
  /**
 * Funding deadline (ledger timestamp, seconds).
 */
deadline: u64;
  /**
 * Funding goal, in the token's smallest unit.
 */
goal: i128;
  /**
 * Monotonic request id assigned at creation.
 */
id: u64;
  /**
 * Milestone schedule; empty until milestones are configured.
 */
milestones: Array<Milestone>;
  /**
 * Total contributed so far.
 */
raised: i128;
  /**
 * Current lifecycle status.
 */
status: Status;
  /**
 * SAC token held in escrow.
 */
token: string;
  /**
 * Total amount released across milestones.
 */
total_released: i128;
}


/**
 * A single milestone in a request's schedule.
 */
export interface Milestone {
  /**
 * Amount released when this milestone is approved.
 */
amount: i128;
  /**
 * Hash of the evidence submitted by the creator, once submitted.
 */
evidence_hash: Option<Buffer>;
  /**
 * Position in the schedule.
 */
index: u32;
  /**
 * Whether this milestone has already been paid out.
 */
released: boolean;
}

/**
 * Errors returned by the Help Request contract.
 * 
 * Numeric codes are part of the public API and must stay stable. Append new codes;
 * never renumber existing ones.
 */
export const Errors = {
  /**
   * Contract has not been initialized.
   */
  1: {message:"NotInitialized"},
  /**
   * Initialization attempted twice.
   */
  2: {message:"AlreadyInitialized"},
  /**
   * Unknown request id.
   */
  3: {message:"RequestNotFound"},
  /**
   * Amount is zero or negative.
   */
  4: {message:"InvalidAmount"},
  /**
   * Action not allowed after the deadline.
   */
  5: {message:"DeadlinePassed"},
  /**
   * Finalize attempted before the deadline.
   */
  6: {message:"DeadlineNotReached"},
  /**
   * Request is not accepting contributions.
   */
  7: {message:"NotOpen"},
  /**
   * Caller lacks permission.
   */
  8: {message:"Unauthorized"},
  /**
   * Token is not on the allowed list.
   */
  9: {message:"TokenNotAllowed"},
  /**
   * No refundable balance.
   */
  10: {message:"NothingToRefund"},
  /**
   * Milestone index out of bounds.
   */
  11: {message:"MilestoneNotFound"},
  /**
   * Milestone already released.
   */
  12: {message:"MilestoneAlreadyReleased"},
  /**
   * Milestone evidence not yet submitted.
   */
  13: {message:"MilestoneNotSubmitted"},
  /**
   * Milestone evidence already submitted.
   */
  14: {message:"MilestoneAlreadySubmitted"},
  /**
   * Caller has already approved this milestone.
   */
  15: {message:"MilestoneAlreadyApproved"},
  /**
   * Milestone has not reached required approval threshold.
   */
  16: {message:"InsufficientApprovals"},
  /**
   * Milestone schedule amounts do not sum to goal or invalid count.
   */
  17: {message:"InvalidMilestoneSchedule"},
  /**
   * Milestones must be submitted and released in sequential order.
   */
  18: {message:"MilestoneOutOfOrder"},
  /**
   * Request is not in a disputed or refundable state.
   */
  19: {message:"NotDisputedOrCancelled"}
}










export interface Client {
  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel an Open request, enabling refunds.
   * 
   * Only the creator may cancel, and only before the request is Funded.
   */
  cancel: ({request_id}: {request_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw a contribution from a Failed or Cancelled request.
   * 
   * `contributor` must authorize the call. Checks-effects-interactions: the stored
   * balance is zeroed before the token transfer, so double-refund is impossible.
   */
  refund: ({request_id, contributor}: {request_id: u64, contributor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a finalize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * After the deadline, transition an Open request to Funded or Failed.
   * 
   * Anyone may call this. Emits `funded` or `failed`.
   */
  finalize: ({request_id}: {request_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a contribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfer tokens into escrow for an existing request.
   * 
   * `contributor` must authorize the call. The request must be Open and the
   * deadline must not have passed. Amount must meet the minimum contribution.
   * 
   * Uses checks-effects-interactions: state is updated before the token transfer.
   */
  contribute: ({request_id, contributor, amount}: {request_id: u64, contributor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. Stores the admin and configuration in instance storage.
   * 
   * `admin` must authorize the call. Calling twice returns [`Error::AlreadyInitialized`].
   */
  initialize: ({admin, config}: {admin: string, config: Config}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update fee and token settings. Only the admin may call this.
   * 
   * There is intentionally no way for the admin to access escrowed funds via
   * config changes—the only fund-moving functions are `contribute`, `refund`,
   * and `release_milestone`.
   */
  set_config: ({config}: {config: Config}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_request transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a request by id.
   */
  get_request: ({request_id}: {request_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Request>>>

  /**
   * Construct and simulate a create_request transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Open a new help request and return its id.
   * 
   * `creator` must authorize the call. The token must be on the allowed list.
   * `deadline` is a ledger UNIX timestamp in seconds; must be in the future.
   */
  create_request: ({creator, token, goal, deadline, milestones, content_hash}: {creator: string, token: string, goal: i128, deadline: u64, milestones: Array<Milestone>, content_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a get_contribution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a contributor's total contribution to a request.
   */
  get_contribution: ({request_id, contributor}: {request_id: u64, contributor: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a submit_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submit evidence for a milestone.
   * 
   * Only the creator may call this. Request must be Funded or Releasing.
   * Milestones must be submitted sequentially and only once.
   */
  submit_milestone: ({request_id, index, evidence_hash}: {request_id: u64, index: u32, evidence_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve a submitted milestone.
   * 
   * Must be an approver configured in Config. An approver cannot approve twice.
   */
  approve_milestone: ({request_id, index, approver}: {request_id: u64, index: u32, approver: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a dispute_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mark a milestone as disputed/rejected by an authorized approver.
   * 
   * Transitions the request to Disputed status, freezing further milestone
   * releases and allowing contributors to claim proportional refunds of unreleased funds.
   */
  dispute_milestone: ({request_id, index, approver}: {request_id: u64, index: u32, approver: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a release_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pay out an approved milestone to the request creator.
   * 
   * Anyone may call this once sufficient approvals exist.
   * Checks-effects-interactions: updates contract state and milestone status
   * before executing the token transfer.
   */
  release_milestone: ({request_id, index}: {request_id: u64, index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAG5DYW5jZWwgYW4gT3BlbiByZXF1ZXN0LCBlbmFibGluZyByZWZ1bmRzLgoKT25seSB0aGUgY3JlYXRvciBtYXkgY2FuY2VsLCBhbmQgb25seSBiZWZvcmUgdGhlIHJlcXVlc3QgaXMgRnVuZGVkLgAAAAAABmNhbmNlbAAAAAAAAQAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAANhXaXRoZHJhdyBhIGNvbnRyaWJ1dGlvbiBmcm9tIGEgRmFpbGVkIG9yIENhbmNlbGxlZCByZXF1ZXN0LgoKYGNvbnRyaWJ1dG9yYCBtdXN0IGF1dGhvcml6ZSB0aGUgY2FsbC4gQ2hlY2tzLWVmZmVjdHMtaW50ZXJhY3Rpb25zOiB0aGUgc3RvcmVkCmJhbGFuY2UgaXMgemVyb2VkIGJlZm9yZSB0aGUgdG9rZW4gdHJhbnNmZXIsIHNvIGRvdWJsZS1yZWZ1bmQgaXMgaW1wb3NzaWJsZS4AAAAGcmVmdW5kAAAAAAACAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAtjb250cmlidXRvcgAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAHZBZnRlciB0aGUgZGVhZGxpbmUsIHRyYW5zaXRpb24gYW4gT3BlbiByZXF1ZXN0IHRvIEZ1bmRlZCBvciBGYWlsZWQuCgpBbnlvbmUgbWF5IGNhbGwgdGhpcy4gRW1pdHMgYGZ1bmRlZGAgb3IgYGZhaWxlZGAuAAAAAAAIZmluYWxpemUAAAABAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAARZUcmFuc2ZlciB0b2tlbnMgaW50byBlc2Nyb3cgZm9yIGFuIGV4aXN0aW5nIHJlcXVlc3QuCgpgY29udHJpYnV0b3JgIG11c3QgYXV0aG9yaXplIHRoZSBjYWxsLiBUaGUgcmVxdWVzdCBtdXN0IGJlIE9wZW4gYW5kIHRoZQpkZWFkbGluZSBtdXN0IG5vdCBoYXZlIHBhc3NlZC4gQW1vdW50IG11c3QgbWVldCB0aGUgbWluaW11bSBjb250cmlidXRpb24uCgpVc2VzIGNoZWNrcy1lZmZlY3RzLWludGVyYWN0aW9uczogc3RhdGUgaXMgdXBkYXRlZCBiZWZvcmUgdGhlIHRva2VuIHRyYW5zZmVyLgAAAAAACmNvbnRyaWJ1dGUAAAAAAAMAAAAAAAAACnJlcXVlc3RfaWQAAAAAAAYAAAAAAAAAC2NvbnRyaWJ1dG9yAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAJ5PbmUtdGltZSBzZXR1cC4gU3RvcmVzIHRoZSBhZG1pbiBhbmQgY29uZmlndXJhdGlvbiBpbiBpbnN0YW5jZSBzdG9yYWdlLgoKYGFkbWluYCBtdXN0IGF1dGhvcml6ZSB0aGUgY2FsbC4gQ2FsbGluZyB0d2ljZSByZXR1cm5zIFtgRXJyb3I6OkFscmVhZHlJbml0aWFsaXplZGBdLgAAAAAACmluaXRpYWxpemUAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAGY29uZmlnAAAAAAfQAAAABkNvbmZpZwAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAOtVcGRhdGUgZmVlIGFuZCB0b2tlbiBzZXR0aW5ncy4gT25seSB0aGUgYWRtaW4gbWF5IGNhbGwgdGhpcy4KClRoZXJlIGlzIGludGVudGlvbmFsbHkgbm8gd2F5IGZvciB0aGUgYWRtaW4gdG8gYWNjZXNzIGVzY3Jvd2VkIGZ1bmRzIHZpYQpjb25maWcgY2hhbmdlc+KAlHRoZSBvbmx5IGZ1bmQtbW92aW5nIGZ1bmN0aW9ucyBhcmUgYGNvbnRyaWJ1dGVgLCBgcmVmdW5kYCwKYW5kIGByZWxlYXNlX21pbGVzdG9uZWAuAAAAAApzZXRfY29uZmlnAAAAAAABAAAAAAAAAAZjb25maWcAAAAAB9AAAAAGQ29uZmlnAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAABVSZWFkIGEgcmVxdWVzdCBieSBpZC4AAAAAAAALZ2V0X3JlcXVlc3QAAAAAAQAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAEAAAPpAAAH0AAAAAdSZXF1ZXN0AAAAAAM=",
        "AAAAAAAAAL5PcGVuIGEgbmV3IGhlbHAgcmVxdWVzdCBhbmQgcmV0dXJuIGl0cyBpZC4KCmBjcmVhdG9yYCBtdXN0IGF1dGhvcml6ZSB0aGUgY2FsbC4gVGhlIHRva2VuIG11c3QgYmUgb24gdGhlIGFsbG93ZWQgbGlzdC4KYGRlYWRsaW5lYCBpcyBhIGxlZGdlciBVTklYIHRpbWVzdGFtcCBpbiBzZWNvbmRzOyBtdXN0IGJlIGluIHRoZSBmdXR1cmUuAAAAAAAOY3JlYXRlX3JlcXVlc3QAAAAAAAYAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAARnb2FsAAAACwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAptaWxlc3RvbmVzAAAAAAPqAAAH0AAAAAlNaWxlc3RvbmUAAAAAAAAAAAAADGNvbnRlbnRfaGFzaAAAA+4AAAAgAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAADVSZWFkIGEgY29udHJpYnV0b3IncyB0b3RhbCBjb250cmlidXRpb24gdG8gYSByZXF1ZXN0LgAAAAAAABBnZXRfY29udHJpYnV0aW9uAAAAAgAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAAAAAALY29udHJpYnV0b3IAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAJ9TdWJtaXQgZXZpZGVuY2UgZm9yIGEgbWlsZXN0b25lLgoKT25seSB0aGUgY3JlYXRvciBtYXkgY2FsbCB0aGlzLiBSZXF1ZXN0IG11c3QgYmUgRnVuZGVkIG9yIFJlbGVhc2luZy4KTWlsZXN0b25lcyBtdXN0IGJlIHN1Ym1pdHRlZCBzZXF1ZW50aWFsbHkgYW5kIG9ubHkgb25jZS4AAAAAEHN1Ym1pdF9taWxlc3RvbmUAAAADAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAGtBcHByb3ZlIGEgc3VibWl0dGVkIG1pbGVzdG9uZS4KCk11c3QgYmUgYW4gYXBwcm92ZXIgY29uZmlndXJlZCBpbiBDb25maWcuIEFuIGFwcHJvdmVyIGNhbm5vdCBhcHByb3ZlIHR3aWNlLgAAAAARYXBwcm92ZV9taWxlc3RvbmUAAAAAAAADAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAACGFwcHJvdmVyAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAN5NYXJrIGEgbWlsZXN0b25lIGFzIGRpc3B1dGVkL3JlamVjdGVkIGJ5IGFuIGF1dGhvcml6ZWQgYXBwcm92ZXIuCgpUcmFuc2l0aW9ucyB0aGUgcmVxdWVzdCB0byBEaXNwdXRlZCBzdGF0dXMsIGZyZWV6aW5nIGZ1cnRoZXIgbWlsZXN0b25lCnJlbGVhc2VzIGFuZCBhbGxvd2luZyBjb250cmlidXRvcnMgdG8gY2xhaW0gcHJvcG9ydGlvbmFsIHJlZnVuZHMgb2YgdW5yZWxlYXNlZCBmdW5kcy4AAAAAABFkaXNwdXRlX21pbGVzdG9uZQAAAAAAAAMAAAAAAAAACnJlcXVlc3RfaWQAAAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAANpQYXkgb3V0IGFuIGFwcHJvdmVkIG1pbGVzdG9uZSB0byB0aGUgcmVxdWVzdCBjcmVhdG9yLgoKQW55b25lIG1heSBjYWxsIHRoaXMgb25jZSBzdWZmaWNpZW50IGFwcHJvdmFscyBleGlzdC4KQ2hlY2tzLWVmZmVjdHMtaW50ZXJhY3Rpb25zOiB1cGRhdGVzIGNvbnRyYWN0IHN0YXRlIGFuZCBtaWxlc3RvbmUgc3RhdHVzCmJlZm9yZSBleGVjdXRpbmcgdGhlIHRva2VuIHRyYW5zZmVyLgAAAAAAEXJlbGVhc2VfbWlsZXN0b25lAAAAAAAAAgAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAQAAAElDb250cmFjdCBjb25maWd1cmF0aW9uLCBzZXQgYXQgaW5pdGlhbGl6YXRpb24gYW5kIHVwZGF0YWJsZSBieSB0aGUgYWRtaW4uAAAAAAAAAAAAAAZDb25maWcAAAAAAAUAAAAiVG9rZW5zIGFjY2VwdGVkIGZvciBjb250cmlidXRpb25zLgAAAAAADmFsbG93ZWRfdG9rZW5zAAAAAAPqAAAAEwAAADROdW1iZXIgb2YgYXBwcm92YWxzIHJlcXVpcmVkIHRvIHJlbGVhc2UgYSBtaWxlc3RvbmUuAAAAEmFwcHJvdmFsX3RocmVzaG9sZAAAAAAABAAAAChBZGRyZXNzZXMgYWxsb3dlZCB0byBhcHByb3ZlIG1pbGVzdG9uZXMuAAAACWFwcHJvdmVycwAAAAAAA+oAAAATAAAAPE1pbmltdW0gYWNjZXB0ZWQgY29udHJpYnV0aW9uLCBpbiB0aGUgdG9rZW4ncyBzbWFsbGVzdCB1bml0LgAAABBtaW5fY29udHJpYnV0aW9uAAAACwAAADpPcHRpb25hbCByZXB1dGF0aW9uIGNvbnRyYWN0IG5vdGlmaWVkIG9uIGxpZmVjeWNsZSBldmVudHMuAAAAAAATcmVwdXRhdGlvbl9jb250cmFjdAAAAAPoAAAAEw==",
        "AAAAAgAAANhMaWZlY3ljbGUgc3RhdHVzIG9mIGEgaGVscCByZXF1ZXN0LgoKTWlycm9ycyB0aGUgc3RhdGUgbWFjaGluZSBkb2N1bWVudGVkIGluIHRoZSByZXBvc2l0b3J5IFJFQURNRToKYE9wZW4gLT4gRnVuZGVkIC0+IFJlbGVhc2luZyAtPiBDb21wbGV0ZWRgLCB3aXRoIGBGYWlsZWRgLCBgQ2FuY2VsbGVkYCwgYW5kCmBEaXNwdXRlZGAgcmVhY2hhYmxlIGFzIGRlc2NyaWJlZCB0aGVyZS4AAAAAAAAABlN0YXR1cwAAAAAABwAAAAAAAAAYQWNjZXB0aW5nIGNvbnRyaWJ1dGlvbnMuAAAABE9wZW4AAAAAAAAAKUdvYWwgcmVhY2hlZDsgbWlsZXN0b25lcyBtYXkgYmUgcmVsZWFzZWQuAAAAAAAABkZ1bmRlZAAAAAAAAAAAADFBdCBsZWFzdCBvbmUgbWlsZXN0b25lIHJlbGVhc2VkOyBtb3JlIG1heSBmb2xsb3cuAAAAAAAACVJlbGVhc2luZwAAAAAAAAAAAAAYQWxsIG1pbGVzdG9uZXMgcmVsZWFzZWQuAAAACUNvbXBsZXRlZAAAAAAAAAAAAAA/RGVhZGxpbmUgcGFzc2VkIHdpdGhvdXQgcmVhY2hpbmcgdGhlIGdvYWw7IHJlZnVuZHMgYXJlIGVuYWJsZWQuAAAAAAZGYWlsZWQAAAAAAAAAAABAQ3JlYXRvciBvciBhcHByb3ZlcnMgY2FuY2VsbGVkOyB1bnJlbGVhc2VkIGZ1bmRzIGFyZSByZWZ1bmRhYmxlLgAAAAlDYW5jZWxsZWQAAAAAAAAAAAAAOEEgbWlsZXN0b25lIHdhcyByZWplY3RlZDsgc3ViamVjdCB0byBkaXNwdXRlIHJlc29sdXRpb24uAAAACERpc3B1dGVk",
        "AAAAAQAAACRBIGhlbHAgcmVxdWVzdCBhbmQgaXRzIGVzY3JvdyBzdGF0ZS4AAAAAAAAAB1JlcXVlc3QAAAAACwAAADZJUEZTIENJRCBvciBjb250ZW50IGhhc2ggb2YgdGhlIG9mZi1jaGFpbiBkZXNjcmlwdGlvbi4AAAAAAAxjb250ZW50X2hhc2gAAAPuAAAAIAAAABNDcmVhdGlvbiB0aW1lc3RhbXAuAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAIEFkZHJlc3MgdGhhdCBvcGVuZWQgdGhlIHJlcXVlc3QuAAAAB2NyZWF0b3IAAAAAEwAAAC1GdW5kaW5nIGRlYWRsaW5lIChsZWRnZXIgdGltZXN0YW1wLCBzZWNvbmRzKS4AAAAAAAAIZGVhZGxpbmUAAAAGAAAAK0Z1bmRpbmcgZ29hbCwgaW4gdGhlIHRva2VuJ3Mgc21hbGxlc3QgdW5pdC4AAAAABGdvYWwAAAALAAAAKk1vbm90b25pYyByZXF1ZXN0IGlkIGFzc2lnbmVkIGF0IGNyZWF0aW9uLgAAAAAAAmlkAAAAAAAGAAAAOk1pbGVzdG9uZSBzY2hlZHVsZTsgZW1wdHkgdW50aWwgbWlsZXN0b25lcyBhcmUgY29uZmlndXJlZC4AAAAAAAptaWxlc3RvbmVzAAAAAAPqAAAH0AAAAAlNaWxlc3RvbmUAAAAAAAAZVG90YWwgY29udHJpYnV0ZWQgc28gZmFyLgAAAAAAAAZyYWlzZWQAAAAAAAsAAAAZQ3VycmVudCBsaWZlY3ljbGUgc3RhdHVzLgAAAAAAAAZzdGF0dXMAAAAAB9AAAAAGU3RhdHVzAAAAAAAZU0FDIHRva2VuIGhlbGQgaW4gZXNjcm93LgAAAAAAAAV0b2tlbgAAAAAAABMAAAAoVG90YWwgYW1vdW50IHJlbGVhc2VkIGFjcm9zcyBtaWxlc3RvbmVzLgAAAA50b3RhbF9yZWxlYXNlZAAAAAAACw==",
        "AAAAAQAAACtBIHNpbmdsZSBtaWxlc3RvbmUgaW4gYSByZXF1ZXN0J3Mgc2NoZWR1bGUuAAAAAAAAAAAJTWlsZXN0b25lAAAAAAAABAAAADBBbW91bnQgcmVsZWFzZWQgd2hlbiB0aGlzIG1pbGVzdG9uZSBpcyBhcHByb3ZlZC4AAAAGYW1vdW50AAAAAAALAAAAPkhhc2ggb2YgdGhlIGV2aWRlbmNlIHN1Ym1pdHRlZCBieSB0aGUgY3JlYXRvciwgb25jZSBzdWJtaXR0ZWQuAAAAAAANZXZpZGVuY2VfaGFzaAAAAAAAA+gAAAPuAAAAIAAAABlQb3NpdGlvbiBpbiB0aGUgc2NoZWR1bGUuAAAAAAAABWluZGV4AAAAAAAABAAAADFXaGV0aGVyIHRoaXMgbWlsZXN0b25lIGhhcyBhbHJlYWR5IGJlZW4gcGFpZCBvdXQuAAAAAAAACHJlbGVhc2VkAAAAAQ==",
        "AAAABAAAAJ1FcnJvcnMgcmV0dXJuZWQgYnkgdGhlIEhlbHAgUmVxdWVzdCBjb250cmFjdC4KCk51bWVyaWMgY29kZXMgYXJlIHBhcnQgb2YgdGhlIHB1YmxpYyBBUEkgYW5kIG11c3Qgc3RheSBzdGFibGUuIEFwcGVuZCBuZXcgY29kZXM7Cm5ldmVyIHJlbnVtYmVyIGV4aXN0aW5nIG9uZXMuAAAAAAAAAAAAAAVFcnJvcgAAAAAAABMAAAAiQ29udHJhY3QgaGFzIG5vdCBiZWVuIGluaXRpYWxpemVkLgAAAAAADk5vdEluaXRpYWxpemVkAAAAAAABAAAAH0luaXRpYWxpemF0aW9uIGF0dGVtcHRlZCB0d2ljZS4AAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAABNVbmtub3duIHJlcXVlc3QgaWQuAAAAAA9SZXF1ZXN0Tm90Rm91bmQAAAAAAwAAABtBbW91bnQgaXMgemVybyBvciBuZWdhdGl2ZS4AAAAADUludmFsaWRBbW91bnQAAAAAAAAEAAAAJkFjdGlvbiBub3QgYWxsb3dlZCBhZnRlciB0aGUgZGVhZGxpbmUuAAAAAAAORGVhZGxpbmVQYXNzZWQAAAAAAAUAAAAnRmluYWxpemUgYXR0ZW1wdGVkIGJlZm9yZSB0aGUgZGVhZGxpbmUuAAAAABJEZWFkbGluZU5vdFJlYWNoZWQAAAAAAAYAAAAnUmVxdWVzdCBpcyBub3QgYWNjZXB0aW5nIGNvbnRyaWJ1dGlvbnMuAAAAAAdOb3RPcGVuAAAAAAcAAAAYQ2FsbGVyIGxhY2tzIHBlcm1pc3Npb24uAAAADFVuYXV0aG9yaXplZAAAAAgAAAAhVG9rZW4gaXMgbm90IG9uIHRoZSBhbGxvd2VkIGxpc3QuAAAAAAAAD1Rva2VuTm90QWxsb3dlZAAAAAAJAAAAFk5vIHJlZnVuZGFibGUgYmFsYW5jZS4AAAAAAA9Ob3RoaW5nVG9SZWZ1bmQAAAAACgAAAB5NaWxlc3RvbmUgaW5kZXggb3V0IG9mIGJvdW5kcy4AAAAAABFNaWxlc3RvbmVOb3RGb3VuZAAAAAAAAAsAAAAbTWlsZXN0b25lIGFscmVhZHkgcmVsZWFzZWQuAAAAABhNaWxlc3RvbmVBbHJlYWR5UmVsZWFzZWQAAAAMAAAAJU1pbGVzdG9uZSBldmlkZW5jZSBub3QgeWV0IHN1Ym1pdHRlZC4AAAAAAAAVTWlsZXN0b25lTm90U3VibWl0dGVkAAAAAAAADQAAACVNaWxlc3RvbmUgZXZpZGVuY2UgYWxyZWFkeSBzdWJtaXR0ZWQuAAAAAAAAGU1pbGVzdG9uZUFscmVhZHlTdWJtaXR0ZWQAAAAAAAAOAAAAK0NhbGxlciBoYXMgYWxyZWFkeSBhcHByb3ZlZCB0aGlzIG1pbGVzdG9uZS4AAAAAGE1pbGVzdG9uZUFscmVhZHlBcHByb3ZlZAAAAA8AAAA2TWlsZXN0b25lIGhhcyBub3QgcmVhY2hlZCByZXF1aXJlZCBhcHByb3ZhbCB0aHJlc2hvbGQuAAAAAAAVSW5zdWZmaWNpZW50QXBwcm92YWxzAAAAAAAAEAAAAD9NaWxlc3RvbmUgc2NoZWR1bGUgYW1vdW50cyBkbyBub3Qgc3VtIHRvIGdvYWwgb3IgaW52YWxpZCBjb3VudC4AAAAAGEludmFsaWRNaWxlc3RvbmVTY2hlZHVsZQAAABEAAAA+TWlsZXN0b25lcyBtdXN0IGJlIHN1Ym1pdHRlZCBhbmQgcmVsZWFzZWQgaW4gc2VxdWVudGlhbCBvcmRlci4AAAAAABNNaWxlc3RvbmVPdXRPZk9yZGVyAAAAABIAAAAxUmVxdWVzdCBpcyBub3QgaW4gYSBkaXNwdXRlZCBvciByZWZ1bmRhYmxlIHN0YXRlLgAAAAAAABZOb3REaXNwdXRlZE9yQ2FuY2VsbGVkAAAAAAAT",
        "AAAABQAAAE5FbWl0dGVkIHdoZW4gdGhlIGRlYWRsaW5lIHBhc3NlcyB3aXRob3V0IHRoZSBnb2FsOiBgcmVxdWVzdF9pZCwgdG90YWxfcmFpc2VkYC4AAAAAAAAAAAAGRmFpbGVkAAAAAAABAAAABmZhaWxlZAAAAAAAAgAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAAAAAAAAAAADHRvdGFsX3JhaXNlZAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAD1FbWl0dGVkIHdoZW4gdGhlIGdvYWwgaXMgcmVhY2hlZDogYHJlcXVlc3RfaWQsIHRvdGFsX3JhaXNlZGAuAAAAAAAAAAAAAAZGdW5kZWQAAAAAAAEAAAAGZnVuZGVkAAAAAAACAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAAAAAAMdG90YWxfcmFpc2VkAAAACwAAAAAAAAAC",
        "AAAABQAAAFBFbWl0dGVkIHdoZW4gYSByZXF1ZXN0IGlzIGNyZWF0ZWQ6IGByZXF1ZXN0X2lkLCBjcmVhdG9yLCB0b2tlbiwgZ29hbCwgZGVhZGxpbmVgLgAAAAAAAAAHQ3JlYXRlZAAAAAABAAAAB2NyZWF0ZWQAAAAABQAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAAAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAAAAAABGdvYWwAAAALAAAAAAAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAI=",
        "AAAABQAAAEpFbWl0dGVkIHdoZW4gYSBjb250cmlidXRvciBpcyByZWZ1bmRlZDogYHJlcXVlc3RfaWQsIGNvbnRyaWJ1dG9yLCBhbW91bnRgLgAAAAAAAAAAAAhSZWZ1bmRlZAAAAAEAAAAIcmVmdW5kZWQAAAADAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAAAAAALY29udHJpYnV0b3IAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADJFbWl0dGVkIHdoZW4gYSByZXF1ZXN0IGlzIGNhbmNlbGxlZDogYHJlcXVlc3RfaWRgLgAAAAAAAAAAAAlDYW5jZWxsZWQAAAAAAAABAAAACWNhbmNlbGxlZAAAAAAAAAEAAAAAAAAACnJlcXVlc3RfaWQAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAE5FbWl0dGVkIG9uIGVhY2ggY29udHJpYnV0aW9uOiBgcmVxdWVzdF9pZCwgY29udHJpYnV0b3IsIGFtb3VudCwgdG90YWxfcmFpc2VkYC4AAAAAAAAAAAALQ29udHJpYnV0ZWQAAAAAAQAAAAtjb250cmlidXRlZAAAAAAEAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAAAAAALY29udHJpYnV0b3IAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAADHRvdGFsX3JhaXNlZAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAE1FbWl0dGVkIHdoZW4gYW4gYXBwcm92ZXIgYXBwcm92ZXMgYSBtaWxlc3RvbmU6IGByZXF1ZXN0X2lkLCBpbmRleCwgYXBwcm92ZXJgLgAAAAAAAAAAAAARTWlsZXN0b25lQXBwcm92ZWQAAAAAAAABAAAAEm1pbGVzdG9uZV9hcHByb3ZlZAAAAAAAAwAAAAAAAAAKcmVxdWVzdF9pZAAAAAAABgAAAAAAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAAAAAACGFwcHJvdmVyAAAAEwAAAAAAAAAC",
        "AAAABQAAAElFbWl0dGVkIHdoZW4gYSBtaWxlc3RvbmUgYW1vdW50IGlzIHBhaWQgb3V0OiBgcmVxdWVzdF9pZCwgaW5kZXgsIGFtb3VudGAuAAAAAAAAAAAAABFNaWxlc3RvbmVSZWxlYXNlZAAAAAAAAAEAAAASbWlsZXN0b25lX3JlbGVhc2VkAAAAAAADAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAFZFbWl0dGVkIHdoZW4gYSBjcmVhdG9yIHN1Ym1pdHMgbWlsZXN0b25lIGV2aWRlbmNlOiBgcmVxdWVzdF9pZCwgaW5kZXgsIGV2aWRlbmNlX2hhc2hgLgAAAAAAAAAAABJNaWxlc3RvbmVTdWJtaXR0ZWQAAAAAAAEAAAATbWlsZXN0b25lX3N1Ym1pdHRlZAAAAAADAAAAAAAAAApyZXF1ZXN0X2lkAAAAAAAGAAAAAAAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAAAAAANZXZpZGVuY2VfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAI=" ]),
      options
    )
  }
  public readonly fromJSON = {
    cancel: this.txFromJSON<Result<void>>,
        refund: this.txFromJSON<Result<void>>,
        finalize: this.txFromJSON<Result<void>>,
        contribute: this.txFromJSON<Result<void>>,
        initialize: this.txFromJSON<Result<void>>,
        set_config: this.txFromJSON<Result<void>>,
        get_request: this.txFromJSON<Result<Request>>,
        create_request: this.txFromJSON<Result<u64>>,
        get_contribution: this.txFromJSON<i128>,
        submit_milestone: this.txFromJSON<Result<void>>,
        approve_milestone: this.txFromJSON<Result<void>>,
        dispute_milestone: this.txFromJSON<Result<void>>,
        release_milestone: this.txFromJSON<Result<void>>
  }
}
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
    contractId: "CC46Y6JBSNNTHPZZCLLUILMWMSNLRC3MV46UQ2REQX3N4WI6PTDPOZ2C",
  }
} as const


/**
 * A reputation badge awarded when score reaches a threshold.
 */
export interface Badge {
  /**
 * Badge identifier / name (e.g. "Helper", "Advocate", "Champion").
 */
name: string;
  /**
 * Minimum score required to earn this badge.
 */
threshold: i64;
  /**
 * Tier level (1, 2, 3...).
 */
tier: u32;
}


/**
 * Configuration for badge thresholds.
 */
export interface Config {
  tier1_threshold: i64;
  tier2_threshold: i64;
  tier3_threshold: i64;
}

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
   * Caller is not authorized.
   */
  3: {message:"Unauthorized"},
  /**
   * Invalid delta parameter.
   */
  4: {message:"InvalidDelta"}
}


export interface Client {
  /**
   * Construct and simulate a get_score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read current reputation score for a subject. Defaults to 0 if none recorded.
   */
  get_score: ({subject}: {subject: string}, options?: MethodOptions) => Promise<AssembledTransaction<i64>>

  /**
   * Construct and simulate a get_badges transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read earned badges for a subject based on current score and configured thresholds.
   */
  get_badges: ({subject}: {subject: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Badge>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read badge threshold config.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Config>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. Stores the admin and default badge threshold configuration.
   * Calling twice returns `AlreadyInitialized`.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update badge threshold config. Admin-only.
   */
  set_config: ({config}: {config: Config}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_reporter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add an authorized reporter contract. Admin-only.
   */
  add_reporter: ({reporter}: {reporter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a record_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Apply a score change tied to a reference ID.
   * Only authorized reporters can call this. Emits `score_changed`.
   */
  record_event: ({reporter, subject, kind, delta, ref_id}: {reporter: string, subject: string, kind: string, delta: i32, ref_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remove_reporter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove an authorized reporter contract. Admin-only.
   */
  remove_reporter: ({reporter}: {reporter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([
        "AAAAAAAAAExSZWFkIGN1cnJlbnQgcmVwdXRhdGlvbiBzY29yZSBmb3IgYSBzdWJqZWN0LiBEZWZhdWx0cyB0byAwIGlmIG5vbmUgcmVjb3JkZWQuAAAACWdldF9zY29yZQAAAAAAAAEAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAEAAAAH",
        "AAAAAAAAAFJSZWFkIGVhcm5lZCBiYWRnZXMgZm9yIGEgc3ViamVjdCBiYXNlZCBvbiBjdXJyZW50IHNjb3JlIGFuZCBjb25maWd1cmVkIHRocmVzaG9sZHMuAAAAAAAKZ2V0X2JhZGdlcwAAAAAAAQAAAAAAAAAHc3ViamVjdAAAAAATAAAAAQAAA+oAAAfQAAAABUJhZGdlAAAA",
        "AAAAAAAAABxSZWFkIGJhZGdlIHRocmVzaG9sZCBjb25maWcuAAAACmdldF9jb25maWcAAAAAAAAAAAABAAAD6QAAB9AAAAAGQ29uZmlnAAAAAAAD",
        "AAAAAAAAAHdPbmUtdGltZSBzZXR1cC4gU3RvcmVzIHRoZSBhZG1pbiBhbmQgZGVmYXVsdCBiYWRnZSB0aHJlc2hvbGQgY29uZmlndXJhdGlvbi4KQ2FsbGluZyB0d2ljZSByZXR1cm5zIGBBbHJlYWR5SW5pdGlhbGl6ZWRgLgAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACpVcGRhdGUgYmFkZ2UgdGhyZXNob2xkIGNvbmZpZy4gQWRtaW4tb25seS4AAAAAAApzZXRfY29uZmlnAAAAAAABAAAAAAAAAAZjb25maWcAAAAAB9AAAAAGQ29uZmlnAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADBBZGQgYW4gYXV0aG9yaXplZCByZXBvcnRlciBjb250cmFjdC4gQWRtaW4tb25seS4AAAAMYWRkX3JlcG9ydGVyAAAAAQAAAAAAAAAIcmVwb3J0ZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAGxBcHBseSBhIHNjb3JlIGNoYW5nZSB0aWVkIHRvIGEgcmVmZXJlbmNlIElELgpPbmx5IGF1dGhvcml6ZWQgcmVwb3J0ZXJzIGNhbiBjYWxsIHRoaXMuIEVtaXRzIGBzY29yZV9jaGFuZ2VkYC4AAAAMcmVjb3JkX2V2ZW50AAAABQAAAAAAAAAIcmVwb3J0ZXIAAAATAAAAAAAAAAdzdWJqZWN0AAAAABMAAAAAAAAABGtpbmQAAAARAAAAAAAAAAVkZWx0YQAAAAAAAAUAAAAAAAAABnJlZl9pZAAAAAAAEAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADNSZW1vdmUgYW4gYXV0aG9yaXplZCByZXBvcnRlciBjb250cmFjdC4gQWRtaW4tb25seS4AAAAAD3JlbW92ZV9yZXBvcnRlcgAAAAABAAAAAAAAAAhyZXBvcnRlcgAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAQAAADpBIHJlcHV0YXRpb24gYmFkZ2UgYXdhcmRlZCB3aGVuIHNjb3JlIHJlYWNoZXMgYSB0aHJlc2hvbGQuAAAAAAAAAAAABUJhZGdlAAAAAAAAAwAAAEBCYWRnZSBpZGVudGlmaWVyIC8gbmFtZSAoZS5nLiAiSGVscGVyIiwgIkFkdm9jYXRlIiwgIkNoYW1waW9uIikuAAAABG5hbWUAAAARAAAAKk1pbmltdW0gc2NvcmUgcmVxdWlyZWQgdG8gZWFybiB0aGlzIGJhZGdlLgAAAAAACXRocmVzaG9sZAAAAAAAAAcAAAAYVGllciBsZXZlbCAoMSwgMiwgMy4uLikuAAAABHRpZXIAAAAE",
        "AAAAAQAAACNDb25maWd1cmF0aW9uIGZvciBiYWRnZSB0aHJlc2hvbGRzLgAAAAAAAAAABkNvbmZpZwAAAAAAAwAAAAAAAAAPdGllcjFfdGhyZXNob2xkAAAAAAcAAAAAAAAAD3RpZXIyX3RocmVzaG9sZAAAAAAHAAAAAAAAAA90aWVyM190aHJlc2hvbGQAAAAABw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAACJDb250cmFjdCBoYXMgbm90IGJlZW4gaW5pdGlhbGl6ZWQuAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAfSW5pdGlhbGl6YXRpb24gYXR0ZW1wdGVkIHR3aWNlLgAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAACAAAAGUNhbGxlciBpcyBub3QgYXV0aG9yaXplZC4AAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAABhJbnZhbGlkIGRlbHRhIHBhcmFtZXRlci4AAAAMSW52YWxpZERlbHRhAAAABA=="
      ]),
      options
    )
  }
  public readonly fromJSON = {
    get_score: this.txFromJSON<i64>,
        get_badges: this.txFromJSON<Array<Badge>>,
        get_config: this.txFromJSON<Result<Config>>,
        initialize: this.txFromJSON<Result<void>>,
        set_config: this.txFromJSON<Result<void>>,
        add_reporter: this.txFromJSON<Result<void>>,
        record_event: this.txFromJSON<Result<void>>,
        remove_reporter: this.txFromJSON<Result<void>>
  }
}
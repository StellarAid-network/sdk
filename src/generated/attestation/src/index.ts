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
    contractId: "CBGSEMRF6DKWPGYGFJBQG5UEUBGFDHEJQUB5EOYTS4C746J54AYAS7GN",
  }
} as const


/**
 * An on-chain attestation record vouching for a subject.
 */
export interface Attestation {
  /**
 * Authorized attestor address that issued this statement.
 */
attestor: string;
  /**
 * Content hash of the off-chain evidence or statement.
 */
content_hash: Buffer;
  /**
 * Creation timestamp (ledger seconds).
 */
created_at: u64;
  /**
 * Optional expiration timestamp (ledger seconds).
 */
expires_at: Option<u64>;
  /**
 * Unique monotonic attestation id.
 */
id: u64;
  /**
 * Attestation category or kind (e.g. "verified_need", "identity").
 */
kind: string;
  /**
 * Revocation flag.
 */
revoked: boolean;
  /**
 * Subject address (user or help request).
 */
subject: string;
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
   * Attestation does not exist.
   */
  4: {message:"AttestationNotFound"},
  /**
   * Attestation was already revoked.
   */
  5: {message:"AlreadyRevoked"},
  /**
   * Expiration timestamp must be in the future.
   */
  6: {message:"InvalidExpiry"}
}



export interface Client {
  /**
   * Construct and simulate a attest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create an attestation vouching for a subject. Attestor-only.
   */
  attest: ({attestor, subject, kind, content_hash, expires_at}: {attestor: string, subject: string, kind: string, content_hash: Buffer, expires_at: Option<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke an active attestation. Only the issuing attestor may revoke it.
   */
  revoke: ({attestor, attestation_id}: {attestor: string, attestation_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. Stores the admin. Calling twice returns `AlreadyInitialized`.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_attestor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add an approved attestor with metadata hash. Admin-only.
   */
  add_attestor: ({attestor, meta_hash}: {attestor: string, meta_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remove_attestor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove an attestor from the registry. Admin-only.
   */
  remove_attestor: ({attestor}: {attestor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_attestations transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read active, non-expired, non-revoked attestations for a subject.
   */
  get_attestations: ({subject}: {subject: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Attestation>>>

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
        "AAAAAAAAADxDcmVhdGUgYW4gYXR0ZXN0YXRpb24gdm91Y2hpbmcgZm9yIGEgc3ViamVjdC4gQXR0ZXN0b3Itb25seS4AAAAGYXR0ZXN0AAAAAAAFAAAAAAAAAAhhdHRlc3RvcgAAABMAAAAAAAAAB3N1YmplY3QAAAAAEwAAAAAAAAAEa2luZAAAABEAAAAAAAAADGNvbnRlbnRfaGFzaAAAA+4AAAAgAAAAAAAAAApleHBpcmVzX2F0AAAAAAPoAAAABgAAAAEAAAPpAAAABgAAAAM=",
        "AAAAAAAAAEZSZXZva2UgYW4gYWN0aXZlIGF0dGVzdGF0aW9uLiBPbmx5IHRoZSBpc3N1aW5nIGF0dGVzdG9yIG1heSByZXZva2UgaXQuAAAAAAAGcmV2b2tlAAAAAAACAAAAAAAAAAhhdHRlc3RvcgAAABMAAAAAAAAADmF0dGVzdGF0aW9uX2lkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAE1PbmUtdGltZSBzZXR1cC4gU3RvcmVzIHRoZSBhZG1pbi4gQ2FsbGluZyB0d2ljZSByZXR1cm5zIGBBbHJlYWR5SW5pdGlhbGl6ZWRgLgAAAAAAAAppbml0aWFsaXplAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADhBZGQgYW4gYXBwcm92ZWQgYXR0ZXN0b3Igd2l0aCBtZXRhZGF0YSBoYXNoLiBBZG1pbi1vbmx5LgAAAAxhZGRfYXR0ZXN0b3IAAAACAAAAAAAAAAhhdHRlc3RvcgAAABMAAAAAAAAACW1ldGFfaGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADFSZW1vdmUgYW4gYXR0ZXN0b3IgZnJvbSB0aGUgcmVnaXN0cnkuIEFkbWluLW9ubHkuAAAAAAAAD3JlbW92ZV9hdHRlc3RvcgAAAAABAAAAAAAAAAhhdHRlc3RvcgAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAEFSZWFkIGFjdGl2ZSwgbm9uLWV4cGlyZWQsIG5vbi1yZXZva2VkIGF0dGVzdGF0aW9ucyBmb3IgYSBzdWJqZWN0LgAAAAAAABBnZXRfYXR0ZXN0YXRpb25zAAAAAQAAAAAAAAAHc3ViamVjdAAAAAATAAAAAQAAA+oAAAfQAAAAC0F0dGVzdGF0aW9uAA==",
        "AAAAAQAAADZBbiBvbi1jaGFpbiBhdHRlc3RhdGlvbiByZWNvcmQgdm91Y2hpbmcgZm9yIGEgc3ViamVjdC4AAAAAAAAAAAALQXR0ZXN0YXRpb24AAAAACAAAADdBdXRob3JpemVkIGF0dGVzdG9yIGFkZHJlc3MgdGhhdCBpc3N1ZWQgdGhpcyBzdGF0ZW1lbnQuAAAAAAhhdHRlc3RvcgAAABMAAAA0Q29udGVudCBoYXNoIG9mIHRoZSBvZmYtY2hhaW4gZXZpZGVuY2Ugb3Igc3RhdGVtZW50LgAAAAxjb250ZW50X2hhc2gAAAPuAAAAIAAAACRDcmVhdGlvbiB0aW1lc3RhbXAgKGxlZGdlciBzZWNvbmRzKS4AAAAKY3JlYXRlZF9hdAAAAAAABgAAAC9PcHRpb25hbCBleHBpcmF0aW9uIHRpbWVzdGFtcCAobGVkZ2VyIHNlY29uZHMpLgAAAAAKZXhwaXJlc19hdAAAAAAD6AAAAAYAAAAgVW5pcXVlIG1vbm90b25pYyBhdHRlc3RhdGlvbiBpZC4AAAACaWQAAAAAAAYAAABAQXR0ZXN0YXRpb24gY2F0ZWdvcnkgb3Iga2luZCAoZS5nLiAidmVyaWZpZWRfbmVlZCIsICJpZGVudGl0eSIpLgAAAARraW5kAAAAEQAAABBSZXZvY2F0aW9uIGZsYWcuAAAAB3Jldm9rZWQAAAAAAQAAACdTdWJqZWN0IGFkZHJlc3MgKHVzZXIgb3IgaGVscCByZXF1ZXN0KS4AAAAAB3N1YmplY3QAAAAAEw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABgAAACJDb250cmFjdCBoYXMgbm90IGJlZW4gaW5pdGlhbGl6ZWQuAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAfSW5pdGlhbGl6YXRpb24gYXR0ZW1wdGVkIHR3aWNlLgAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAACAAAAGUNhbGxlciBpcyBub3QgYXV0aG9yaXplZC4AAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAABtBdHRlc3RhdGlvbiBkb2VzIG5vdCBleGlzdC4AAAAAE0F0dGVzdGF0aW9uTm90Rm91bmQAAAAABAAAACBBdHRlc3RhdGlvbiB3YXMgYWxyZWFkeSByZXZva2VkLgAAAA5BbHJlYWR5UmV2b2tlZAAAAAAABQAAACtFeHBpcmF0aW9uIHRpbWVzdGFtcCBtdXN0IGJlIGluIHRoZSBmdXR1cmUuAAAAAA1JbnZhbGlkRXhwaXJ5AAAAAAAABg=="
      ]),
      options
    )
  }
  public readonly fromJSON = {
    attest: this.txFromJSON<Result<u64>>,
        revoke: this.txFromJSON<Result<void>>,
        initialize: this.txFromJSON<Result<void>>,
        add_attestor: this.txFromJSON<Result<void>>,
        remove_attestor: this.txFromJSON<Result<void>>,
        get_attestations: this.txFromJSON<Array<Attestation>>
  }
}
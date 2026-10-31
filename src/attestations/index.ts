/**
 * Typed wrapper over the generated Attestation contract binding.
 */

import { Buffer } from "node:buffer";
import type { ResolvedConfig } from "../network/config";
import { ATTESTATION_ERRORS, extractContractError, ValidationError } from "../errors";
import { AttestationBinding } from "../generated";
import {
  assertAccountAddress,
  assertNonNegativeId,
  assertNotSecretKey,
  assertValidTimestamp,
} from "../validation";

/** Normalized on-chain attestation record. */
export interface AttestationItem {
  id: bigint;
  attestor: string;
  subject: string;
  kind: string;
  contentHash: string;
  expiresAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

/** Parameters for {@link AttestationsModule.attest}. */
export interface AttestParams {
  /** Whitelisted attestor account (`G...`). */
  attestor: string;
  /** Subject account (`G...`) receiving the attestation. */
  subject: string;
  /** Attestation category symbol (e.g. `verified_org`, `community_voucher`). */
  kind: string;
  /** 32-byte off-chain attestation document digest. */
  contentHash: string | Buffer;
  /** Optional expiration timestamp. */
  expiresAt?: Date | number | bigint;
}

/** Parameters for {@link AttestationsModule.revoke}. */
export interface RevokeParams {
  /** Original attestor account (`G...`). */
  attestor: string;
  /** Attestation identifier to revoke. */
  attestationId: bigint | number;
}

function toBytes32(input: string | Buffer, field = "contentHash"): Buffer {
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

/** Ergonomic wrapper around the generated Attestation Soroban contract client. */
export class AttestationsModule {
  public readonly config: ResolvedConfig;
  private readonly client: AttestationBinding.Client;

  constructor(config: ResolvedConfig) {
    this.config = config;
    const contractId = config.contracts.attestation;
    this.client = new AttestationBinding.Client({
      contractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
    });
  }

  /**
   * Return the underlying generated Client for low-level invocations.
   */
  public get rawClient(): AttestationBinding.Client {
    return this.client;
  }

  /**
   * Read all active, non-expired, non-revoked attestations for a subject.
   */
  public async get(subject: string): Promise<AttestationItem[]> {
    assertAccountAddress(subject, "subject");
    try {
      const tx = await this.client.get_attestations({ subject });
      const sim = await tx.simulate();
      const raw = (sim as { result?: { retval?: unknown } })?.result?.retval ?? tx.result;

      const list = (raw || []) as Array<{
        id: bigint;
        attestor: string;
        subject: string;
        kind: string;
        content_hash: Buffer;
        expires_at?: bigint | null;
        revoked: boolean;
        created_at: bigint;
      }>;

      return list.map((a) => ({
        id: a.id,
        attestor: a.attestor,
        subject: a.subject,
        kind: String(a.kind),
        contentHash: Buffer.from(a.content_hash).toString("hex"),
        expiresAt: a.expires_at ? new Date(Number(a.expires_at) * 1000) : null,
        revoked: Boolean(a.revoked),
        createdAt: new Date(Number(a.created_at) * 1000),
      }));
    } catch (err) {
      throw extractContractError(err, ATTESTATION_ERRORS);
    }
  }

  /**
   * Build an unsigned transaction to create an attestation.
   */
  public async attest(params: AttestParams): Promise<{ xdr: string }> {
    assertAccountAddress(params.attestor, "attestor");
    assertAccountAddress(params.subject, "subject");
    assertNotSecretKey(params.kind, "kind");
    if (
      !params.kind ||
      typeof params.kind !== "string" ||
      !/^[a-zA-Z0-9_]{1,32}$/.test(params.kind)
    ) {
      throw new ValidationError(
        `Invalid kind "${String(params.kind)}": expected a 1..32 character Soroban symbol ([a-zA-Z0-9_]).`,
      );
    }
    const contentHash = toBytes32(params.contentHash, "contentHash");
    const expiresAt =
      params.expiresAt !== undefined
        ? assertValidTimestamp(params.expiresAt, "expiresAt")
        : undefined;

    try {
      const tx = await this.client.attest({
        attestor: params.attestor,
        subject: params.subject,
        kind: params.kind,
        content_hash: contentHash,
        expires_at: expiresAt,
      });

      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, ATTESTATION_ERRORS);
    }
  }

  /**
   * Build an unsigned transaction to revoke an attestation.
   */
  public async revoke(params: RevokeParams): Promise<{ xdr: string }> {
    assertAccountAddress(params.attestor, "attestor");
    const attestationId = assertNonNegativeId(params.attestationId, "attestationId");
    try {
      const tx = await this.client.revoke({
        attestor: params.attestor,
        attestation_id: attestationId,
      });

      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, ATTESTATION_ERRORS);
    }
  }
}

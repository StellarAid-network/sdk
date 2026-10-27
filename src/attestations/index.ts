/**
 * Typed wrapper over the generated Attestation contract binding.
 */

import { Buffer } from "node:buffer";
import type { ResolvedConfig } from "../network/config";
import {
  ATTESTATION_ERRORS,
  extractContractError,
} from "../errors";
import { AttestationBinding } from "../generated";

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

export interface AttestParams {
  attestor: string;
  subject: string;
  kind: string;
  contentHash: string | Buffer;
  expiresAt?: Date | number | bigint;
}

export interface RevokeParams {
  attestor: string;
  attestationId: bigint | number;
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
    try {
      const expiresAt = params.expiresAt
        ? params.expiresAt instanceof Date
          ? BigInt(Math.floor(params.expiresAt.getTime() / 1000))
          : BigInt(params.expiresAt)
        : undefined;

      const tx = await this.client.attest({
        attestor: params.attestor,
        subject: params.subject,
        kind: params.kind,
        content_hash: toBytes32(params.contentHash),
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
    try {
      const tx = await this.client.revoke({
        attestor: params.attestor,
        attestation_id: BigInt(params.attestationId),
      });

      return {
        xdr: tx.toXDR(),
      };
    } catch (err) {
      throw extractContractError(err, ATTESTATION_ERRORS);
    }
  }
}

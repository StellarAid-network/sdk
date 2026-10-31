/**
 * Decoders that turn raw Soroban events into typed domain events.
 *
 * Used by the `api` indexer so it never hand-parses raw XDR.
 */

import { xdr, scValToNative } from "@stellar/stellar-sdk";
import type { StellarAidEvent } from "../types";
import { EventDecodingError } from "../errors";

/** Raw Soroban RPC event payload accepted by {@link decodeEvent}. */
export interface RawEventInput {
  /** Event topic ScVals (base64 XDR strings or decoded values). */
  topic: (string | unknown)[];
  /** Event body ScVal (base64 XDR string, `{ xdr }`, or decoded object/Map). */
  value: string | { xdr?: string } | unknown;
  /** Optional emitting Soroban contract address (`C...`). */
  contractId?: string;
  /** Optional ledger sequence number in which the event was emitted. */
  ledger?: number;
}

function parseScVal(val: unknown): unknown {
  if (typeof val === "string") {
    try {
      const parsed = xdr.ScVal.fromXDR(val, "base64");
      return scValToNative(parsed);
    } catch {
      return val;
    }
  }
  if (
    val !== null &&
    typeof val === "object" &&
    "xdr" in val &&
    typeof (val as { xdr: unknown }).xdr === "string"
  ) {
    try {
      const parsed = xdr.ScVal.fromXDR((val as { xdr: string }).xdr, "base64");
      return scValToNative(parsed);
    } catch {
      return val;
    }
  }
  return val;
}

function getField(data: unknown, ...keys: string[]): unknown {
  if (data instanceof Map) {
    for (const key of keys) {
      if (data.has(key)) return data.get(key);
    }
  }
  if (data !== null && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of keys) {
      if (key in record) return record[key];
    }
  }
  return undefined;
}

function toBigInt(val: unknown): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number" || typeof val === "string") return BigInt(val);
  return 0n;
}

function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") return parseInt(val, 10);
  return 0;
}

function toHex(val: unknown): string {
  if (typeof val === "string") return val;
  if (Buffer.isBuffer(val)) return val.toString("hex");
  if (val instanceof Uint8Array) return Buffer.from(val).toString("hex");
  return String(val ?? "");
}

/**
 * Decodes a raw Soroban contract event into a typed domain event discriminated union.
 */
export function decodeEvent(raw: RawEventInput): StellarAidEvent {
  if (!raw.topic || raw.topic.length === 0) {
    throw new EventDecodingError("Event missing topics");
  }

  const topic0 = String(parseScVal(raw.topic[0]));
  const data = parseScVal(raw.value);

  switch (topic0) {
    case "created":
    case "help_request.created":
      return {
        type: "help_request.created",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        creator: String(getField(data, "creator") ?? ""),
        token: String(getField(data, "token") ?? ""),
        goal: toBigInt(getField(data, "goal")),
        deadline: toBigInt(getField(data, "deadline")),
      };

    case "contributed":
    case "help_request.contributed":
      return {
        type: "help_request.contributed",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        contributor: String(getField(data, "contributor") ?? ""),
        amount: toBigInt(getField(data, "amount")),
        totalRaised: toBigInt(getField(data, "total_raised", "totalRaised")),
      };

    case "funded":
    case "help_request.funded":
      return {
        type: "help_request.funded",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        totalRaised: toBigInt(getField(data, "total_raised", "totalRaised")),
      };

    case "failed":
    case "help_request.failed":
      return {
        type: "help_request.failed",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        totalRaised: toBigInt(getField(data, "total_raised", "totalRaised")),
      };

    case "milestone_submitted":
    case "help_request.milestone_submitted":
      return {
        type: "help_request.milestone_submitted",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        index: toNumber(getField(data, "index")),
        evidenceHash: toHex(getField(data, "evidence_hash", "evidenceHash")),
      };

    case "milestone_approved":
    case "help_request.milestone_approved":
      return {
        type: "help_request.milestone_approved",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        index: toNumber(getField(data, "index")),
        approver: String(getField(data, "approver") ?? ""),
      };

    case "milestone_released":
    case "help_request.milestone_released":
      return {
        type: "help_request.milestone_released",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        index: toNumber(getField(data, "index")),
        amount: toBigInt(getField(data, "amount")),
      };

    case "refunded":
    case "help_request.refunded":
      return {
        type: "help_request.refunded",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
        contributor: String(getField(data, "contributor") ?? ""),
        amount: toBigInt(getField(data, "amount")),
      };

    case "cancelled":
    case "help_request.cancelled":
      return {
        type: "help_request.cancelled",
        requestId: toBigInt(getField(data, "request_id", "requestId")),
      };

    case "score_changed":
    case "reputation.score_changed":
      return {
        type: "reputation.score_changed",
        subject: String(getField(data, "subject") ?? ""),
        delta: toNumber(getField(data, "delta")),
        newScore: toNumber(getField(data, "new_score", "newScore")),
        refId: String(getField(data, "ref_id", "refId") ?? ""),
      };

    case "attested":
    case "attestation.attested":
      return {
        type: "attestation.attested",
        attestationId: toBigInt(getField(data, "attestation_id", "attestationId")),
        attestor: String(getField(data, "attestor") ?? ""),
        subject: String(getField(data, "subject") ?? ""),
      };

    case "revoked":
    case "attestation.revoked":
      return {
        type: "attestation.revoked",
        attestationId: toBigInt(getField(data, "attestation_id", "attestationId")),
        attestor: String(getField(data, "attestor") ?? ""),
        subject: String(getField(data, "subject") ?? ""),
      };

    default:
      throw new EventDecodingError(`Unknown event type or topic: ${topic0}`);
  }
}

export const events = {
  decodeEvent,
};

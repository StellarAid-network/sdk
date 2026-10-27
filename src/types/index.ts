import { z } from "zod";

/**
 * Shared domain types used across the SDK, `api`, and `web`.
 *
 * These types describe the StellarAid problem domain only. Contract bindings live in
 * `src/generated/` and are wrapped by the per-module clients.
 */

/** Supported networks. */
export type NetworkName = "testnet" | "mainnet" | "local";

/** A Stellar account address (`G...`). */
export type StellarAddress = string;

/** A transaction hash. */
export type TransactionHash = string;

/** An asset identified by code and, for non-native assets, issuer. */
export interface Asset {
  /** Asset code, for example `XLM` or `USDC`. */
  readonly code: string;
  /** Issuer account for issued assets; omitted for the native asset. */
  readonly issuer?: string;
}

/** The result of submitting a transaction successfully. */
export interface SubmitResult {
  /** Transaction hash. */
  readonly hash: TransactionHash;
  /** Ledger the transaction was included in, when known. */
  readonly ledger?: number;
}

// -----------------------------------------------------------------------------
// SEP-10 Auth Types
// -----------------------------------------------------------------------------

export interface ChallengeOptions {
  /** Stellar public key of the client requesting authentication. */
  account: string;
  /** Server secret key (S...) or keypair used to sign the challenge. */
  serverKey: string;
  /** Home domain of the server (e.g., 'stellaraid.org'). */
  homeDomain: string;
  /** Optional web auth domain if different from homeDomain. */
  webAuthDomain?: string;
  /** Network passphrase (defaults to configured network). */
  networkPassphrase?: string;
  /** Challenge validity duration in seconds (default 900 = 15m). */
  validFor?: number;
}

export interface VerifyChallengeOptions {
  /** Base64 transaction envelope signed by the client. */
  signedXdr: string;
  /** Server secret key (S...) or public key (G...) to verify challenge source. */
  serverKey: string;
  /** Expected home domain in the challenge transaction. */
  homeDomain: string;
  /** Optional expected web auth domain. */
  webAuthDomain?: string;
  /** Network passphrase. */
  networkPassphrase?: string;
  /** Optional JWT secret to generate a signed JWT upon verification. */
  jwtSecret?: string;
  /** JWT expiration in seconds (default: 86400 = 24h). */
  jwtExpiresIn?: number;
}

export interface VerifyChallengeResult {
  /** Verified Stellar address of the user. */
  address: string;
  /** Issued JWT session token if jwtSecret was provided. */
  token?: string;
}

export interface VerifyTokenOptions {
  /** JWT token string to verify. */
  token: string;
  /** Secret key used to sign the JWT. */
  jwtSecret: string;
}

export interface AuthTokenPayload {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
}

export interface SignChallengeOptions {
  /** Unsigned or partially-signed challenge XDR. */
  unsignedXdr: string;
  /** Client secret key (S...) used to sign the challenge. */
  signerKey: string;
  /** Network passphrase. */
  networkPassphrase?: string;
}

// -----------------------------------------------------------------------------
// Contract Events Discriminated Union
// -----------------------------------------------------------------------------

export interface HelpRequestCreatedEvent {
  type: "help_request.created";
  requestId: bigint;
  creator: string;
  token: string;
  goal: bigint;
  deadline: bigint;
}

export interface HelpRequestContributedEvent {
  type: "help_request.contributed";
  requestId: bigint;
  contributor: string;
  amount: bigint;
  totalRaised: bigint;
}

export interface HelpRequestFundedEvent {
  type: "help_request.funded";
  requestId: bigint;
  totalRaised: bigint;
}

export interface HelpRequestFailedEvent {
  type: "help_request.failed";
  requestId: bigint;
  totalRaised: bigint;
}

export interface MilestoneSubmittedEvent {
  type: "help_request.milestone_submitted";
  requestId: bigint;
  index: number;
  evidenceHash: string;
}

export interface MilestoneApprovedEvent {
  type: "help_request.milestone_approved";
  requestId: bigint;
  index: number;
  approver: string;
}

export interface MilestoneReleasedEvent {
  type: "help_request.milestone_released";
  requestId: bigint;
  index: number;
  amount: bigint;
}

export interface HelpRequestRefundedEvent {
  type: "help_request.refunded";
  requestId: bigint;
  contributor: string;
  amount: bigint;
}

export interface HelpRequestCancelledEvent {
  type: "help_request.cancelled";
  requestId: bigint;
}

export interface ReputationScoreChangedEvent {
  type: "reputation.score_changed";
  subject: string;
  delta: number;
  newScore: number;
  refId: string;
}

export interface AttestationAttestedEvent {
  type: "attestation.attested";
  attestationId: bigint;
  attestor: string;
  subject: string;
}

export interface AttestationRevokedEvent {
  type: "attestation.revoked";
  attestationId: bigint;
  attestor: string;
  subject: string;
}

export type StellarAidEvent =
  | HelpRequestCreatedEvent
  | HelpRequestContributedEvent
  | HelpRequestFundedEvent
  | HelpRequestFailedEvent
  | MilestoneSubmittedEvent
  | MilestoneApprovedEvent
  | MilestoneReleasedEvent
  | HelpRequestRefundedEvent
  | HelpRequestCancelledEvent
  | ReputationScoreChangedEvent
  | AttestationAttestedEvent
  | AttestationRevokedEvent;

// -----------------------------------------------------------------------------
// Zod Schemas for Domain Models
// -----------------------------------------------------------------------------

export const StellarAddressSchema = z
  .string()
  .regex(/^G[A-Z0-9]{55}$/, "Invalid Stellar address");

export const AmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, "Invalid amount string");

export const CreateGiveawaySchema = z.object({
  creator: StellarAddressSchema,
  asset: z.object({
    code: z.string().min(1).max(12),
    issuer: StellarAddressSchema.optional(),
  }),
  amountPerClaim: AmountSchema,
  claimers: z.array(StellarAddressSchema).min(1).max(100),
  claimableFrom: z.date().optional(),
  expiresAt: z.date().optional(),
});

export const UserProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(280).optional(),
  avatarHash: z.string().max(100).optional(),
});

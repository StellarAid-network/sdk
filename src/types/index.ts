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

/**
 * Server-side transaction signer (for example, a Stellar `Keypair` or KMS/HSM signer).
 *
 * The SDK never accepts raw `S...` secret key strings. Callers construct a signer
 * outside the SDK and pass only this signer interface.
 */
export interface ServerSigner {
  /** Returns the server's Stellar `G...` public key. */
  publicKey(): string;
  /** Signs a transaction hash digest and returns the 64-byte Ed25519 signature. */
  sign(data: Buffer): Buffer;
}

/**
 * Public-key provider accepted by {@link VerifyChallengeOptions}.
 * Accepts either a `G...` public key string or a signer/keypair exposing `publicKey()`.
 */
export type ServerPublicKeySource = string | { publicKey(): string };

/**
 * Wallet adapter interface compatible with Stellar Wallets Kit, Freighter, and custom signers.
 */
export interface WalletChallengeSigner {
  /** Signs an XDR transaction envelope and returns the signed XDR string (or `{ signedTxXdr }`). */
  signTransaction(
    unsignedXdr: string,
    opts?: { networkPassphrase?: string; address?: string },
  ): Promise<string | { signedTxXdr: string }> | string | { signedTxXdr: string };
}

/** Callback signature alternative for delegating SEP-10 challenge signing to a wallet. */
export type WalletChallengeSignFn = (
  unsignedXdr: string,
  opts?: { networkPassphrase?: string; address?: string },
) => Promise<string> | string;

/** Options for {@link createChallenge}. */
export interface ChallengeOptions {
  /** Stellar public key (`G...`) of the client requesting authentication. */
  account: string;
  /** Server signer (`Keypair` or KMS signer) used to sign the challenge transaction. */
  serverKey: ServerSigner;
  /** Home domain of the server (e.g., `'stellaraid.org'`). */
  homeDomain: string;
  /** Optional web auth domain if different from `homeDomain`. */
  webAuthDomain?: string;
  /** Network passphrase (defaults to Testnet). */
  networkPassphrase?: string;
  /** Challenge validity duration in seconds (default `900` = 15 minutes). */
  validFor?: number;
}

/** Options for {@link verifyChallenge}. */
export interface VerifyChallengeOptions {
  /** Base64 transaction envelope signed by both server and client. */
  signedXdr: string;
  /** Server public key (`G...`) or signer exposing `publicKey()` to verify the challenge source. */
  serverKey: ServerPublicKeySource;
  /** Expected home domain in the challenge transaction. */
  homeDomain: string;
  /** Optional expected web auth domain. */
  webAuthDomain?: string;
  /** Network passphrase (defaults to Testnet). */
  networkPassphrase?: string;
  /** Optional HMAC secret to issue a signed session JWT upon verification. */
  jwtSecret?: string;
  /** JWT expiration in seconds (default: `86400` = 24 hours). */
  jwtExpiresIn?: number;
}

/** Result returned by {@link verifyChallenge}. */
export interface VerifyChallengeResult {
  /** Verified Stellar address (`G...`) of the authenticated user. */
  address: string;
  /** Issued JWT session token when `jwtSecret` was provided. */
  token?: string;
}

/** Options for {@link verifyToken}. */
export interface VerifyTokenOptions {
  /** Signed JWT session token string to verify. */
  token: string;
  /** Server HMAC secret used to verify the JWT signature. */
  jwtSecret: string;
}

/** Decoded claims inside a StellarAid SEP-10 JWT session token. */
export interface AuthTokenPayload {
  /** Subject: authenticated Stellar account (`G...`). */
  sub: string;
  /** Issuer home domain. */
  iss: string;
  /** Issued-at Unix timestamp (seconds). */
  iat: number;
  /** Expiration Unix timestamp (seconds). */
  exp: number;
}

/** Options for {@link signChallenge}. */
export interface SignChallengeOptions {
  /** Server-signed SEP-10 challenge transaction XDR. */
  unsignedXdr: string;
  /** Wallet adapter or signing callback — never a raw secret key. */
  wallet: WalletChallengeSigner | WalletChallengeSignFn;
  /** Network passphrase (defaults to Testnet). */
  networkPassphrase?: string;
  /** Optional expected client account (`G...`) passed as hint to the wallet adapter. */
  account?: string;
}

// -----------------------------------------------------------------------------
// Contract Events Discriminated Union
// -----------------------------------------------------------------------------

/** Emitted when a new help request is created on-chain. */
export interface HelpRequestCreatedEvent {
  type: "help_request.created";
  requestId: bigint;
  creator: string;
  token: string;
  goal: bigint;
  deadline: bigint;
}

/** Emitted when a contributor deposits funds into an open help request. */
export interface HelpRequestContributedEvent {
  type: "help_request.contributed";
  requestId: bigint;
  contributor: string;
  amount: bigint;
  totalRaised: bigint;
}

/** Emitted when a help request reaches or exceeds its funding goal. */
export interface HelpRequestFundedEvent {
  type: "help_request.funded";
  requestId: bigint;
  totalRaised: bigint;
}

/** Emitted when a help request is finalized past its deadline below goal. */
export interface HelpRequestFailedEvent {
  type: "help_request.failed";
  requestId: bigint;
  totalRaised: bigint;
}

/** Emitted when the creator submits evidence for a milestone. */
export interface MilestoneSubmittedEvent {
  type: "help_request.milestone_submitted";
  requestId: bigint;
  index: number;
  evidenceHash: string;
}

/** Emitted when an approver approves a submitted milestone. */
export interface MilestoneApprovedEvent {
  type: "help_request.milestone_approved";
  requestId: bigint;
  index: number;
  approver: string;
}

/** Emitted when escrowed milestone funds are released to the creator. */
export interface MilestoneReleasedEvent {
  type: "help_request.milestone_released";
  requestId: bigint;
  index: number;
  amount: bigint;
}

/** Emitted when a contributor claims a refund on a failed, cancelled, or disputed request. */
export interface HelpRequestRefundedEvent {
  type: "help_request.refunded";
  requestId: bigint;
  contributor: string;
  amount: bigint;
}

/** Emitted when an open help request is cancelled by its creator. */
export interface HelpRequestCancelledEvent {
  type: "help_request.cancelled";
  requestId: bigint;
}

/** Emitted when an account's on-chain reputation score changes. */
export interface ReputationScoreChangedEvent {
  type: "reputation.score_changed";
  subject: string;
  delta: number;
  newScore: number;
  refId: string;
}

/** Emitted when a verified attestor records an attestation on-chain. */
export interface AttestationAttestedEvent {
  type: "attestation.attested";
  attestationId: bigint;
  attestor: string;
  subject: string;
}

/** Emitted when an attestor revokes a previously recorded attestation. */
export interface AttestationRevokedEvent {
  type: "attestation.revoked";
  attestationId: bigint;
  attestor: string;
  subject: string;
}

/** Discriminated union of all decoded Soroban events emitted by StellarAid contracts. */
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

/** Zod schema validating a 56-character Stellar `G...` public address. */
export const StellarAddressSchema = z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address");

/** Zod schema validating a non-negative Stellar decimal string (up to 7 decimal places). */
export const AmountSchema = z.string().regex(/^\d+(\.\d{1,7})?$/, "Invalid amount string");

/** Zod schema validating giveaway creation input payloads. */
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

/** Zod schema validating user profile update payloads shared by `api` and `web`. */
export const UserProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(280).optional(),
  avatarHash: z.string().max(100).optional(),
});

/**
 * SEP-10 Web Authentication helpers for StellarAid (`@stellar-aid/sdk/auth`).
 *
 * Provides server-side challenge generation, wallet-delegated client signing,
 * challenge verification, nonce extraction, and HMAC-SHA256 JWT helpers.
 *
 * Security invariant: no function in this module accepts a Stellar secret key (`S...`).
 * Server signing is delegated to a {@link ServerSigner} instance (`Keypair` or KMS signer)
 * and client signing is delegated to a wallet adapter.
 */

import {
  Keypair,
  Transaction,
  TransactionBuilder,
  Operation,
  Account,
  Networks,
} from "@stellar/stellar-sdk";
import * as crypto from "node:crypto";
import type {
  ChallengeOptions,
  VerifyChallengeOptions,
  VerifyChallengeResult,
  VerifyTokenOptions,
  AuthTokenPayload,
  SignChallengeOptions,
  ServerSigner,
  ServerPublicKeySource,
} from "../types";
import { AuthError, ValidationError } from "../errors";
import { assertAccountAddress, assertNotSecretKey } from "../validation";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function parseBase64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function resolveServerSigner(signer: unknown): ServerSigner {
  assertNotSecretKey(signer, "serverKey");
  if (
    !signer ||
    typeof signer !== "object" ||
    typeof (signer as ServerSigner).publicKey !== "function" ||
    typeof (signer as ServerSigner).sign !== "function"
  ) {
    throw new ValidationError(
      "Invalid serverKey: expected a ServerSigner object (such as a Stellar Keypair or KMS signer) with publicKey() and sign() methods.",
    );
  }
  const candidate = signer as ServerSigner;
  assertAccountAddress(candidate.publicKey(), "serverKey.publicKey()");
  return candidate;
}

function resolveServerPublicKey(source: ServerPublicKeySource): string {
  assertNotSecretKey(source, "serverKey");
  if (typeof source === "string") {
    assertAccountAddress(source, "serverKey");
    return source;
  }
  if (source && typeof source === "object" && typeof source.publicKey === "function") {
    const pub = source.publicKey();
    assertAccountAddress(pub, "serverKey.publicKey()");
    return pub;
  }
  throw new ValidationError(
    "Invalid serverKey: expected a Stellar G... public address or an object exposing publicKey().",
  );
}

/**
 * Create a signed HS256 JWT session token.
 *
 * @param payload - Custom claims (`sub`, `iss`, etc.) to embed in the token body.
 * @param secret - Server HMAC signing secret (non-empty string, never a Stellar `S...` seed).
 * @param expiresInSeconds - Token lifetime in seconds (defaults to `86400` = 24 hours).
 * @returns Compact `header.payload.signature` JWT string.
 * @throws {@link ValidationError} if `secret` is empty or is a Stellar secret seed.
 */
export function createJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 86400,
): string {
  assertNotSecretKey(secret, "jwtSecret");
  if (!secret || typeof secret !== "string") {
    throw new ValidationError("Invalid jwtSecret: expected a non-empty HMAC secret string.");
  }
  if (!Number.isFinite(expiresInSeconds)) {
    throw new ValidationError("Invalid expiresInSeconds: expected a finite number of seconds.");
  }

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(fullPayload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  return `${data}.${sig}`;
}

/**
 * Verify a signed HS256 JWT session token and return its decoded claims.
 *
 * @param token - Compact JWT string (`header.payload.signature`).
 * @param secret - Server HMAC signing secret used when issuing the token.
 * @returns Verified {@link AuthTokenPayload}.
 * @throws {@link ValidationError} if `secret` is empty or a Stellar secret seed.
 * @throws {@link AuthError} if the token is malformed, tampered with, or expired.
 */
export function verifyJwt(token: string, secret: string): AuthTokenPayload {
  assertNotSecretKey(secret, "jwtSecret");
  if (!secret || typeof secret !== "string") {
    throw new ValidationError("Invalid jwtSecret: expected a non-empty HMAC secret string.");
  }
  if (!token || typeof token !== "string") {
    throw new AuthError("Malformed JWT token");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Malformed JWT token");
  }

  const [header, body, signature] = parts;
  if (!header || !body || !signature) {
    throw new AuthError("Malformed JWT token");
  }

  const data = `${header}.${body}`;
  const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AuthError("Invalid JWT signature");
  }

  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(parseBase64url(body).toString("utf8")) as AuthTokenPayload;
  } catch {
    throw new AuthError("Failed to parse JWT payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new AuthError("JWT token has expired");
  }

  return payload;
}

/**
 * Build a server-signed SEP-10 challenge transaction XDR for `opts.account`.
 *
 * Sequence `-1` ensures the challenge transaction can never be submitted on-chain.
 *
 * @param opts - Challenge parameters including `account`, `serverKey` signer, and `homeDomain`.
 * @returns Base64-encoded SEP-10 challenge transaction XDR signed by `opts.serverKey`.
 * @throws {@link ValidationError} if inputs are invalid or a raw secret key string is passed.
 */
export function createChallenge(opts: ChallengeOptions): string {
  assertAccountAddress(opts.account, "account");
  const serverSigner = resolveServerSigner(opts.serverKey);

  if (
    !opts.homeDomain ||
    typeof opts.homeDomain !== "string" ||
    opts.homeDomain.trim().length === 0
  ) {
    throw new ValidationError("Invalid homeDomain: expected a non-empty domain string.");
  }
  if (
    opts.validFor !== undefined &&
    (!Number.isFinite(opts.validFor) || !Number.isInteger(opts.validFor))
  ) {
    throw new ValidationError("Invalid validFor: expected an integer duration in seconds.");
  }

  const passphrase = opts.networkPassphrase ?? Networks.TESTNET;
  const validFor = opts.validFor ?? 900;
  const now = Math.floor(Date.now() / 1000);

  const serverPubKey = serverSigner.publicKey();
  const serverAccount = new Account(serverPubKey, "-1");
  const nonce = crypto.randomBytes(48).toString("base64");

  const authDomain = opts.webAuthDomain ?? opts.homeDomain;
  const manageDataName = `${authDomain} auth`;
  if (Buffer.byteLength(manageDataName, "utf8") > 64) {
    throw new ValidationError(
      `Invalid domain "${authDomain}": SEP-10 manage_data key "${manageDataName}" exceeds 64 bytes.`,
    );
  }

  const maxTime = Math.max(0, now + validFor);
  const minTime = Math.min(maxTime, Math.max(0, now - 60));

  const tx = new TransactionBuilder(serverAccount, {
    fee: "100",
    networkPassphrase: passphrase,
    timebounds: { minTime, maxTime },
  })
    .addOperation(
      Operation.manageData({
        name: manageDataName,
        value: nonce,
        source: opts.account,
      }),
    )
    .build();

  const signature = serverSigner.sign(tx.hash());
  tx.addSignature(serverPubKey, signature.toString("base64"));

  return tx.toXDR();
}

/**
 * Extract the 48-byte random SEP-10 challenge nonce (base64) for single-use replay protection.
 *
 * @param challengeXdr - Base64 SEP-10 challenge transaction envelope.
 * @param networkPassphrase - Network passphrase (defaults to Testnet).
 * @returns Base64-encoded nonce from the first `manage_data` operation.
 * @throws {@link AuthError} if `challengeXdr` cannot be parsed or lacks a `manage_data` nonce.
 */
export function extractNonce(
  challengeXdr: string,
  networkPassphrase: string = Networks.TESTNET,
): string {
  if (!challengeXdr || typeof challengeXdr !== "string") {
    throw new ValidationError("Invalid challengeXdr: expected a non-empty base64 XDR string.");
  }
  let tx: Transaction;
  try {
    tx = new Transaction(challengeXdr, networkPassphrase);
  } catch (err) {
    throw new AuthError(`Failed to parse challenge XDR: ${String(err)}`);
  }
  const op = tx.operations[0] as { type?: string; value?: Buffer } | undefined;
  if (op?.type !== "manageData" || !op.value) {
    throw new AuthError("Challenge transaction is missing its manage_data nonce operation");
  }
  return op.value.toString("base64");
}

/**
 * Delegate signing of a SEP-10 challenge transaction to a client wallet adapter.
 *
 * Pre-validates that `unsignedXdr` is a non-executable SEP-10 challenge (`sequence === "0"`,
 * first operation `manageData`) before invoking the wallet adapter so malicious payment
 * transactions cannot be disguised as sign-in challenges.
 *
 * @param opts - Challenge XDR and wallet adapter/callback.
 * @returns Signed SEP-10 challenge XDR string returned by the wallet.
 * @throws {@link ValidationError} if `unsignedXdr`, `account`, or `wallet` is invalid.
 * @throws {@link AuthError} if `unsignedXdr` is not a valid SEP-10 challenge envelope.
 */
export async function signChallenge(opts: SignChallengeOptions): Promise<string> {
  if (!opts.unsignedXdr || typeof opts.unsignedXdr !== "string") {
    throw new ValidationError("Invalid unsignedXdr: expected a non-empty base64 XDR string.");
  }
  assertNotSecretKey(opts.wallet, "wallet");
  if (opts.account !== undefined) {
    assertAccountAddress(opts.account, "account");
  }

  const passphrase = opts.networkPassphrase ?? Networks.TESTNET;
  let tx: Transaction;
  try {
    tx = new Transaction(opts.unsignedXdr, passphrase);
  } catch (err) {
    throw new AuthError(`Invalid SEP-10 challenge XDR: ${String(err)}`);
  }

  if (tx.sequence !== "0") {
    throw new AuthError("Refusing to sign SEP-10 challenge with non-zero sequence number");
  }
  const firstOp = tx.operations[0] as { type?: string; source?: string } | undefined;
  if (firstOp?.type !== "manageData") {
    throw new AuthError("SEP-10 challenge must start with a manage_data operation");
  }
  if (opts.account && firstOp.source && firstOp.source !== opts.account) {
    throw new AuthError(
      `SEP-10 challenge account mismatch: expected ${opts.account}, got ${firstOp.source}`,
    );
  }

  const walletOpts: { networkPassphrase: string; address?: string } = {
    networkPassphrase: passphrase,
  };
  const targetAccount = opts.account ?? firstOp.source;
  if (targetAccount) {
    walletOpts.address = targetAccount;
  }

  if (typeof opts.wallet === "function") {
    const signed = await opts.wallet(opts.unsignedXdr, walletOpts);
    if (!signed || typeof signed !== "string") {
      throw new AuthError("Wallet callback did not return a signed XDR string");
    }
    return signed;
  }

  if (
    opts.wallet &&
    typeof opts.wallet === "object" &&
    typeof opts.wallet.signTransaction === "function"
  ) {
    const result = await opts.wallet.signTransaction(opts.unsignedXdr, walletOpts);
    const signedXdr = typeof result === "string" ? result : result?.signedTxXdr;
    if (!signedXdr || typeof signedXdr !== "string") {
      throw new AuthError("Wallet adapter did not return a signed XDR string");
    }
    return signedXdr;
  }

  throw new ValidationError(
    "Invalid wallet: expected a wallet adapter with signTransaction() or a signing callback.",
  );
}

/**
 * Verify a client-signed SEP-10 challenge XDR and optionally issue a JWT session token.
 *
 * @param opts - Signed challenge XDR, server public key / signer, expected domain, and optional `jwtSecret`.
 * @returns Verified client `address` and optional signed `token`.
 * @throws {@link ValidationError} if `serverKey` is a secret seed (`S...`) or parameters are malformed.
 * @throws {@link AuthError} if timebounds, domain, server signature, or client signature fail verification.
 */
export function verifyChallenge(opts: VerifyChallengeOptions): VerifyChallengeResult {
  if (!opts.signedXdr || typeof opts.signedXdr !== "string") {
    throw new ValidationError("Invalid signedXdr: expected a non-empty base64 XDR string.");
  }
  if (
    !opts.homeDomain ||
    typeof opts.homeDomain !== "string" ||
    opts.homeDomain.trim().length === 0
  ) {
    throw new ValidationError("Invalid homeDomain: expected a non-empty domain string.");
  }
  const serverPublicAddress = resolveServerPublicKey(opts.serverKey);
  const passphrase = opts.networkPassphrase ?? Networks.TESTNET;

  let tx: Transaction;
  try {
    tx = new Transaction(opts.signedXdr, passphrase);
  } catch (err) {
    throw new AuthError(`Failed to parse challenge XDR: ${String(err)}`);
  }

  if (tx.sequence !== "0") {
    throw new AuthError("Invalid SEP-10 challenge sequence number: expected 0");
  }

  const now = Math.floor(Date.now() / 1000);
  const { minTime, maxTime } = tx.timeBounds ?? {};
  if (!maxTime || Number(maxTime) === 0 || now > Number(maxTime)) {
    throw new AuthError("Challenge has expired");
  }
  if (minTime && now < Number(minTime)) {
    throw new AuthError("Challenge is not yet valid");
  }

  const op = tx.operations[0] as { type: string; source?: string; name?: string } | undefined;
  if (op?.type !== "manageData") {
    throw new AuthError("Challenge must begin with manage_data operation");
  }

  const expectedDomain = opts.webAuthDomain ?? opts.homeDomain;
  if (op.name !== `${expectedDomain} auth`) {
    throw new AuthError(`Invalid auth domain in challenge: expected ${expectedDomain} auth`);
  }

  const clientAddress = op.source;
  if (!clientAddress) {
    throw new AuthError("Challenge manage_data op must have client account as source");
  }
  assertAccountAddress(clientAddress, "challenge.clientAddress");

  const txHash = tx.hash();
  const serverPubKey = Keypair.fromPublicKey(serverPublicAddress);
  const clientPubKey = Keypair.fromPublicKey(clientAddress);

  let serverSigned = false;
  let clientSigned = false;

  for (const sig of tx.signatures) {
    try {
      if (serverPubKey.verify(txHash, sig.signature())) {
        serverSigned = true;
      }
    } catch {
      // ignore non-matching signature
    }

    try {
      if (clientPubKey.verify(txHash, sig.signature())) {
        clientSigned = true;
      }
    } catch {
      // ignore non-matching signature
    }
  }

  if (!serverSigned) {
    throw new AuthError("Server signature missing or invalid");
  }
  if (!clientSigned) {
    throw new AuthError("Client signature missing or invalid");
  }

  let token: string | undefined;
  if (opts.jwtSecret) {
    token = createJwt(
      {
        sub: clientAddress,
        iss: opts.homeDomain,
      },
      opts.jwtSecret,
      opts.jwtExpiresIn ?? 86400,
    );
  }

  return token !== undefined ? { address: clientAddress, token } : { address: clientAddress };
}

/**
 * Verify a previously issued SEP-10 session JWT token.
 *
 * @param opts - Token string and server `jwtSecret`.
 * @returns Verified {@link AuthTokenPayload} claims.
 */
export function verifyToken(opts: VerifyTokenOptions): AuthTokenPayload {
  return verifyJwt(opts.token, opts.jwtSecret);
}

/** Namespace export of all SEP-10 authentication helpers. */
export const auth = {
  createChallenge,
  extractNonce,
  signChallenge,
  verifyChallenge,
  verifyToken,
  createJwt,
  verifyJwt,
};

/**
 * SEP-10 Web Authentication implementation for StellarAid.
 *
 * Provides challenge creation, client challenge signing, challenge verification,
 * and JWT token issuing/verifying.
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
} from "../types";
import { AuthError } from "../errors";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function parseBase64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function createJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 86400,
): string {
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

export function verifyJwt(token: string, secret: string): AuthTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Malformed JWT token");
  }

  const [header, body, signature] = parts;
  if (!header || !body || !signature) {
    throw new AuthError("Malformed JWT token");
  }

  const data = `${header}.${body}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

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
 * Creates an unsigned (server-signed) SEP-10 challenge transaction.
 */
export function createChallenge(opts: ChallengeOptions): string {
  const serverKp = opts.serverKey.startsWith("S")
    ? Keypair.fromSecret(opts.serverKey)
    : Keypair.fromPublicKey(opts.serverKey);

  const passphrase = opts.networkPassphrase ?? Networks.TESTNET;
  const validFor = opts.validFor ?? 900;
  const now = Math.floor(Date.now() / 1000);

  const serverAccount = new Account(serverKp.publicKey(), "-1");
  const nonce = crypto.randomBytes(48).toString("base64");

  const authDomain = opts.webAuthDomain ?? opts.homeDomain;
  const manageDataName = `${authDomain} auth`;

  const tx = new TransactionBuilder(serverAccount, {
    fee: "100",
    networkPassphrase: passphrase,
    timebounds: { minTime: now - 60, maxTime: now + validFor },
  })
    .addOperation(
      Operation.manageData({
        name: manageDataName,
        value: nonce,
        source: opts.account,
      }),
    )
    .build();

  tx.sign(serverKp);

  return tx.toXDR();
}

/**
 * Sign a challenge transaction with the client's secret key.
 */
export function signChallenge(opts: SignChallengeOptions): string {
  const clientKp = Keypair.fromSecret(opts.signerKey);
  const passphrase = opts.networkPassphrase ?? Networks.TESTNET;
  const tx = new Transaction(opts.unsignedXdr, passphrase);
  tx.sign(clientKp);
  return tx.toXDR();
}

/**
 * Verify a signed SEP-10 challenge and issue a session token.
 */
export function verifyChallenge(opts: VerifyChallengeOptions): VerifyChallengeResult {
  const passphrase = opts.networkPassphrase ?? Networks.TESTNET;

  const serverKp = opts.serverKey.startsWith("S")
    ? Keypair.fromSecret(opts.serverKey)
    : Keypair.fromPublicKey(opts.serverKey);

  let tx: Transaction;
  try {
    tx = new Transaction(opts.signedXdr, passphrase);
  } catch (err) {
    throw new AuthError(`Failed to parse challenge XDR: ${String(err)}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const { minTime, maxTime } = tx.timeBounds ?? {};
  if (!maxTime || now > Number(maxTime)) {
    throw new AuthError("Challenge has expired");
  }
  if (minTime && now < Number(minTime)) {
    throw new AuthError("Challenge is not yet valid");
  }

  const op = tx.operations[0] as { type: string; source?: string; name?: string };
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

  const txHash = tx.hash();
  const serverPubKey = Keypair.fromPublicKey(serverKp.publicKey());

  let serverSigned = false;
  let clientSigned = false;

  for (const sig of tx.signatures) {
    try {
      if (serverPubKey.verify(txHash, sig.signature())) {
        serverSigned = true;
      }
    } catch {
      // ignore
    }

    try {
      const clientKp = Keypair.fromPublicKey(clientAddress);
      if (clientKp.verify(txHash, sig.signature())) {
        clientSigned = true;
      }
    } catch {
      // ignore
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

  return token !== undefined
    ? { address: clientAddress, token }
    : { address: clientAddress };
}

/**
 * Verify an issued JWT session token.
 */
export function verifyToken(opts: VerifyTokenOptions): AuthTokenPayload {
  return verifyJwt(opts.token, opts.jwtSecret);
}

export const auth = {
  createChallenge,
  signChallenge,
  verifyChallenge,
  verifyToken,
  createJwt,
  verifyJwt,
};

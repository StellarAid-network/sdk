import { describe, it, expect } from "vitest";
import { Keypair, Transaction, Networks } from "@stellar/stellar-sdk";
import {
  createChallenge,
  extractNonce,
  signChallenge,
  verifyChallenge,
  verifyToken,
  createJwt,
  verifyJwt,
} from "../src/auth";
import { AuthError, ValidationError } from "../src/errors";

function makeWalletAdapter(kp: Keypair) {
  return {
    async signTransaction(unsignedXdr: string, opts?: { networkPassphrase?: string }) {
      const tx = new Transaction(unsignedXdr, opts?.networkPassphrase ?? Networks.TESTNET);
      tx.sign(kp);
      return tx.toXDR();
    },
  };
}

describe("SEP-10 auth module", () => {
  const serverKeypair = Keypair.random();
  const clientKeypair = Keypair.random();
  const clientWallet = makeWalletAdapter(clientKeypair);
  const homeDomain = "stellaraid.org";
  const jwtSecret = "super-secret-test-jwt-key-1234567890";

  it("creates, signs via wallet adapter, and verifies a valid SEP-10 challenge", async () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
    });

    expect(typeof unsignedXdr).toBe("string");
    expect(unsignedXdr.length).toBeGreaterThan(0);
    expect(extractNonce(unsignedXdr).length).toBeGreaterThan(20);

    const signedXdr = await signChallenge({
      unsignedXdr,
      wallet: clientWallet,
      account: clientKeypair.publicKey(),
    });

    const result = verifyChallenge({
      signedXdr,
      serverKey: serverKeypair.publicKey(),
      homeDomain,
      jwtSecret,
    });

    expect(result.address).toBe(clientKeypair.publicKey());
    expect(result.token).toBeDefined();

    if (result.token) {
      const payload = verifyToken({
        token: result.token,
        jwtSecret,
      });
      expect(payload.sub).toBe(clientKeypair.publicKey());
      expect(payload.iss).toBe(homeDomain);
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it("verifies challenge without generating a JWT when jwtSecret is omitted", async () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
    });

    const signedXdr = await signChallenge({
      unsignedXdr,
      wallet: (xdr, opts) => makeWalletAdapter(clientKeypair).signTransaction(xdr, opts),
    });

    const result = verifyChallenge({
      signedXdr,
      serverKey: serverKeypair,
      homeDomain,
    });

    expect(result.address).toBe(clientKeypair.publicKey());
    expect(result.token).toBeUndefined();
  });

  it("rejects an expired challenge", async () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
      validFor: -10, // already expired
    });

    const signedXdr = await signChallenge({
      unsignedXdr,
      wallet: clientWallet,
    });

    expect(() =>
      verifyChallenge({
        signedXdr,
        serverKey: serverKeypair.publicKey(),
        homeDomain,
      }),
    ).toThrowError(AuthError);
  });

  it("rejects challenge with mismatched home domain", async () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain: "otherdomain.com",
    });

    const signedXdr = await signChallenge({
      unsignedXdr,
      wallet: clientWallet,
    });

    expect(() =>
      verifyChallenge({
        signedXdr,
        serverKey: serverKeypair.publicKey(),
        homeDomain,
      }),
    ).toThrowError(AuthError);
  });

  it("rejects challenge without client signature", () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
    });

    expect(() =>
      verifyChallenge({
        signedXdr: unsignedXdr, // missing client signature
        serverKey: serverKeypair.publicKey(),
        homeDomain,
      }),
    ).toThrowError(AuthError);
  });

  it("rejects challenge signed by wrong client", async () => {
    const wrongClient = Keypair.random();
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
    });

    const signedXdr = await signChallenge({
      unsignedXdr,
      wallet: makeWalletAdapter(wrongClient),
    });

    expect(() =>
      verifyChallenge({
        signedXdr,
        serverKey: serverKeypair.publicKey(),
        homeDomain,
      }),
    ).toThrowError(AuthError);
  });

  it("handles custom webAuthDomain", async () => {
    const webAuthDomain = "auth.stellaraid.org";
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
      webAuthDomain,
    });

    const signedXdr = await signChallenge({
      unsignedXdr,
      wallet: clientWallet,
    });

    const result = verifyChallenge({
      signedXdr,
      serverKey: serverKeypair.publicKey(),
      homeDomain,
      webAuthDomain,
    });

    expect(result.address).toBe(clientKeypair.publicKey());
  });

  it("rejects raw S... secret key strings in auth functions", async () => {
    expect(() =>
      createChallenge({
        account: clientKeypair.publicKey(),
        serverKey: serverKeypair.secret() as unknown as never,
        homeDomain,
      }),
    ).toThrowError(ValidationError);

    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair,
      homeDomain,
    });

    await expect(
      signChallenge({
        unsignedXdr,
        wallet: clientKeypair.secret() as unknown as never,
      }),
    ).rejects.toThrowError(ValidationError);

    expect(() =>
      verifyChallenge({
        signedXdr: unsignedXdr,
        serverKey: serverKeypair.secret(),
        homeDomain,
      }),
    ).toThrowError(ValidationError);
  });

  it("verifies and rejects tampered or expired JWT tokens", () => {
    const validToken = createJwt({ sub: clientKeypair.publicKey() }, jwtSecret, 3600);
    const payload = verifyJwt(validToken, jwtSecret);
    expect(payload.sub).toBe(clientKeypair.publicKey());

    // Tampered token
    const tampered = validToken.slice(0, -4) + "AAAA";
    expect(() => verifyJwt(tampered, jwtSecret)).toThrowError(AuthError);

    // Wrong secret
    expect(() => verifyJwt(validToken, "wrong-secret-key")).toThrowError(AuthError);

    // Expired token
    const expiredToken = createJwt({ sub: clientKeypair.publicKey() }, jwtSecret, -10);
    expect(() => verifyJwt(expiredToken, jwtSecret)).toThrowError(AuthError);
  });
});

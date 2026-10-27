import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  createChallenge,
  signChallenge,
  verifyChallenge,
  verifyToken,
  createJwt,
  verifyJwt,
} from "../src/auth";
import { AuthError } from "../src/errors";

describe("SEP-10 auth module", () => {
  const serverKeypair = Keypair.random();
  const clientKeypair = Keypair.random();
  const homeDomain = "stellaraid.org";
  const jwtSecret = "super-secret-test-jwt-key-1234567890";

  it("creates, signs, and verifies a valid SEP-10 challenge", () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair.secret(),
      homeDomain,
    });

    expect(typeof unsignedXdr).toBe("string");
    expect(unsignedXdr.length).toBeGreaterThan(0);

    const signedXdr = signChallenge({
      unsignedXdr,
      signerKey: clientKeypair.secret(),
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

  it("verifies challenge without generating a JWT when jwtSecret is omitted", () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair.secret(),
      homeDomain,
    });

    const signedXdr = signChallenge({
      unsignedXdr,
      signerKey: clientKeypair.secret(),
    });

    const result = verifyChallenge({
      signedXdr,
      serverKey: serverKeypair.publicKey(),
      homeDomain,
    });

    expect(result.address).toBe(clientKeypair.publicKey());
    expect(result.token).toBeUndefined();
  });

  it("rejects an expired challenge", () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair.secret(),
      homeDomain,
      validFor: -10, // already expired
    });

    const signedXdr = signChallenge({
      unsignedXdr,
      signerKey: clientKeypair.secret(),
    });

    expect(() =>
      verifyChallenge({
        signedXdr,
        serverKey: serverKeypair.publicKey(),
        homeDomain,
      }),
    ).toThrowError(AuthError);
  });

  it("rejects challenge with mismatched home domain", () => {
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair.secret(),
      homeDomain: "otherdomain.com",
    });

    const signedXdr = signChallenge({
      unsignedXdr,
      signerKey: clientKeypair.secret(),
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
      serverKey: serverKeypair.secret(),
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

  it("rejects challenge signed by wrong client", () => {
    const wrongClient = Keypair.random();
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair.secret(),
      homeDomain,
    });

    const signedXdr = signChallenge({
      unsignedXdr,
      signerKey: wrongClient.secret(),
    });

    expect(() =>
      verifyChallenge({
        signedXdr,
        serverKey: serverKeypair.publicKey(),
        homeDomain,
      }),
    ).toThrowError(AuthError);
  });

  it("handles custom webAuthDomain", () => {
    const webAuthDomain = "auth.stellaraid.org";
    const unsignedXdr = createChallenge({
      account: clientKeypair.publicKey(),
      serverKey: serverKeypair.secret(),
      homeDomain,
      webAuthDomain,
    });

    const signedXdr = signChallenge({
      unsignedXdr,
      signerKey: clientKeypair.secret(),
    });

    const result = verifyChallenge({
      signedXdr,
      serverKey: serverKeypair.publicKey(),
      homeDomain,
      webAuthDomain,
    });

    expect(result.address).toBe(clientKeypair.publicKey());
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

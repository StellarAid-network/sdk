/**
 * Node.js (server-side) Quick Start Example for @stellar-aid/sdk.
 *
 * Demonstrates:
 * 1. Configuring the SDK (`createStellarAid`)
 * 2. Server-side SEP-10 challenge generation & verification (`@stellar-aid/sdk/auth`)
 * 3. Asset formatting and parsing (`formatAmount`, `parseAmount`)
 */
import { Keypair } from "@stellar/stellar-sdk";
import { createStellarAid, formatAmount, parseAmount } from "../dist/index.js";
import { auth } from "../dist/auth.js";

async function main() {
  // 1. Configure the SDK
  const aid = createStellarAid({ network: "testnet" });
  console.log("Configured StellarAid SDK for network:", aid.config.network);

  // 2. Amount helpers (7 decimals)
  const stroops = parseAmount("25.00");
  console.log("Parsed '25.00' to stroops:", stroops.toString());
  console.log("Formatted back:", formatAmount(stroops));

  // 3. Wallet sign-in with SEP-10 (server side)
  // Ephemeral throwaway keypairs for local demonstration (never use real secrets in code)
  const serverKeypair = Keypair.random();
  const userKeypair = Keypair.random();
  const homeDomain = "stellaraid.example";
  const jwtSecret = "demo-ephemeral-jwt-secret-placeholder-32bytes";

  const challengeXdr = auth.createChallenge({
    account: userKeypair.publicKey(),
    serverKey: serverKeypair.secret(),
    homeDomain,
    networkPassphrase: aid.config.networkPassphrase,
  });

  const signedXdr = auth.signChallenge({
    unsignedXdr: challengeXdr,
    signerKey: userKeypair.secret(),
    networkPassphrase: aid.config.networkPassphrase,
  });

  const { token, address } = auth.verifyChallenge({
    signedXdr,
    serverKey: serverKeypair.secret(),
    homeDomain,
    jwtSecret,
    networkPassphrase: aid.config.networkPassphrase,
  });

  if (!token) {
    throw new Error("Expected JWT token from verifyChallenge");
  }

  const claims = auth.verifyToken({ token, jwtSecret });
  console.log("Verified SEP-10 session for address:", address, "sub:", claims.sub);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

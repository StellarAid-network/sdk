import { execSync } from "node:child_process";
import { Keypair, Transaction, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  ContractError,
  createStellarAid,
  formatAmount,
  parseAmount,
  StellarAidError,
} from "../src";
import { auth } from "../src/auth";
import { decodeEvent } from "../src/events";
import { predicates } from "../src/giveaways";

describe("Day 7 SDK: README Snippets & Clean Package Verification", () => {
  it("executes Quick Start #1, #2, #3, predicates, and assets snippets", async () => {
    const creator = Keypair.random().publicKey();
    const claimerA = Keypair.random().publicKey();
    const claimerB = Keypair.random().publicKey();
    const balanceId = "00000000" + "ab".repeat(32);

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/accounts/${creator}`) || url.includes(`/accounts/${claimerA}`)) {
        const acctId = url.includes(creator) ? creator : claimerA;
        return new Response(
          JSON.stringify({
            id: acctId,
            account_id: acctId,
            sequence: "100",
            balances: [{ asset_type: "native", balance: "500.0000000" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/claimable_balances")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              records: [
                {
                  id: balanceId,
                  asset: "native",
                  amount: "5.0000000",
                  sponsor: creator,
                  last_modified_ledger: 1234,
                  last_modified_time: "2025-02-20T00:00:00Z",
                  claimants: [
                    {
                      destination: claimerA,
                      predicate: { unconditional: true },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    // Quick start 1: Configure the SDK
    const aid = createStellarAid({
      network: "testnet",
      fetch: mockFetch as unknown as typeof fetch,
    });
    expect(aid.assets.XLM.code).toBe("XLM");
    expect(aid.assets.USDC.code).toBe("USDC");

    // Quick start 2: Create a giveaway (claimable balance)
    const unsignedCreateXdr = await aid.giveaways.buildCreate({
      creator,
      asset: aid.assets.XLM,
      amountPerClaim: "5.00",
      claimers: [claimerA, claimerB],
      claimableFrom: new Date(),
      expiresAt: new Date(Date.now() + 7 * 864e5),
    });
    expect(typeof unsignedCreateXdr).toBe("string");
    expect(unsignedCreateXdr.length).toBeGreaterThan(20);

    // Quick start 3: Claim a giveaway
    const available = await aid.giveaways.listClaimable(claimerA);
    expect(available).toHaveLength(1);
    const unsignedClaimXdr = await aid.giveaways.buildClaim({
      claimer: claimerA,
      balanceId: available[0]!.id,
    });
    expect(typeof unsignedClaimXdr).toBe("string");

    // Predicates snippet
    expect(predicates.unconditional()).toBeDefined();
    expect(
      predicates.window({
        from: new Date(),
        until: new Date(Date.now() + 86_400_000),
      }),
    ).toBeDefined();
    expect(predicates.creatorAfter(new Date(Date.now() + 86_400_000))).toBeDefined();

    // Assets snippet
    expect(formatAmount(10000000n, 7)).toBe("1.0000000");
    expect(parseAmount("12.5", 7)).toBe(125000000n);
  });

  it("executes Quick Start #5 (SEP-10 server challenge + client wallet sign + verify)", async () => {
    const serverKey = Keypair.random();
    const clientKey = Keypair.random();
    const homeDomain = "stellaraid.example";
    const jwtSecret = "readme-snippet-jwt-secret-32-chars-minimum";

    const challengeXdr = auth.createChallenge({
      account: clientKey.publicKey(),
      serverKey,
      homeDomain,
    });

    const wallet = {
      async signTransaction(unsignedXdr: string, opts?: { networkPassphrase?: string }) {
        const tx = new Transaction(
          unsignedXdr,
          opts?.networkPassphrase ?? "Test SDF Network ; September 2015",
        );
        tx.sign(clientKey);
        return tx.toXDR();
      },
    };

    const signedXdr = await auth.signChallenge({ unsignedXdr: challengeXdr, wallet });
    const { token, address } = auth.verifyChallenge({
      signedXdr,
      serverKey,
      homeDomain,
      jwtSecret,
    });

    expect(address).toBe(clientKey.publicKey());
    expect(token).toBeDefined();
    const verified = auth.verifyToken({ token: token!, jwtSecret });
    expect(verified.sub).toBe(clientKey.publicKey());
  });

  it("executes Events & Error handling snippets", () => {
    const err = new ContractError(5, "DeadlinePassed", "Action not allowed after the deadline");
    expect(err).toBeInstanceOf(StellarAidError);
    expect(err.name).toBe("DeadlinePassed");

    const topic0 = xdr.ScVal.scvSymbol("cancelled").toXDR("base64");
    const topic1 = xdr.ScVal.scvU64(xdr.Uint64.fromString("42")).toXDR("base64");
    const val = xdr.ScVal.scvVoid().toXDR("base64");
    const decoded = decodeEvent({
      topic: [topic0, topic1],
      value: val,
    });
    expect(decoded.type).toBe("help_request.cancelled");
  });

  it("verifies 0.1.0-testnet tarball is cleanly packable for external installation", () => {
    const raw = execSync("npm pack --dry-run --json", {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const parsed = JSON.parse(raw) as Array<{
      name: string;
      version: string;
      files: Array<{ path: string }>;
    }>;
    expect(parsed[0]?.name).toBe("@stellar-aid/sdk");
    expect(parsed[0]?.version).toBe("0.1.0-testnet");
    const filePaths = parsed[0]?.files.map((f) => f.path) ?? [];
    expect(filePaths).toContain("dist/index.js");
    expect(filePaths).toContain("dist/index.cjs");
    expect(filePaths).toContain("dist/index.d.ts");
    expect(filePaths).toContain("dist/auth.js");
    expect(filePaths).toContain("dist/giveaways.js");
    expect(filePaths).toContain("dist/events.js");
    expect(filePaths).toContain("README.md");
    expect(filePaths).toContain("LICENSE");
  });
});

import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createStellarAid, formatAmount, parseAmount, usdc, ValidationError } from "../src";
import { predicates } from "../src/giveaways";
import { auth } from "../src/auth";

describe("Boundary validation across all public SDK modules", () => {
  const aid = createStellarAid({ network: "testnet" });
  const validPub = Keypair.random().publicKey();
  const validPub2 = Keypair.random().publicKey();
  const validContract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  it("validates network and asset configuration boundaries", () => {
    expect(() => createStellarAid({ network: "devnet" as never })).toThrow(ValidationError);
    expect(() =>
      createStellarAid({
        network: "testnet",
        contracts: { help_request: "not-a-contract-id" },
      }),
    ).toThrow(ValidationError);
    expect(() => usdc("testnet", "G_INVALID_CHECKSUM")).toThrow(ValidationError);
    expect(() => formatAmount(100n, -1)).toThrow(ValidationError);
    expect(() => parseAmount("1.12345678")).toThrow(ValidationError);
    expect(() => parseAmount("abc")).toThrow(ValidationError);
  });

  it("validates giveaway addresses, amounts, and time windows with clear messages", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const badDate = new Date("not-a-date");

    expect(() => predicates.creatorAfter(badDate)).toThrow(ValidationError);
    expect(() => predicates.window({ from: now, until: past })).toThrow(/must be strictly after/i);

    await expect(
      aid.giveaways.buildCreate({
        creator: "G_BAD",
        asset: aid.assets.XLM,
        amountPerClaim: "5.00",
        maxClaimants: 1,
      }),
    ).rejects.toThrow(/creator/i);

    await expect(
      aid.giveaways.buildCreate({
        creator: validPub,
        asset: aid.assets.XLM,
        amountPerClaim: "-5.00",
        maxClaimants: 1,
      }),
    ).rejects.toThrow(/amountPerClaim/i);

    await expect(
      aid.giveaways.buildCreate({
        creator: validPub,
        asset: aid.assets.XLM,
        amountPerClaim: "5.00",
        maxClaimants: 1,
        claimableFrom: now,
        expiresAt: past,
      }),
    ).rejects.toThrow(/expiresAt/i);

    await expect(aid.giveaways.buildClaim({ claimer: "bad", balanceId: "0000" })).rejects.toThrow(
      ValidationError,
    );

    await expect(aid.giveaways.getBalance("")).rejects.toThrow(ValidationError);
  });

  it("validates payment boundaries", async () => {
    await expect(
      aid.payments.buildDonation({
        from: validPub,
        to: validPub2,
        asset: { code: "BAD_ASSET_CODE_TOO_LONG" },
        amount: "1.00",
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      aid.payments.ensureTrustline(validPub, { code: "USDC", issuer: "not-a-g-key" }),
    ).rejects.toThrow(/asset\.issuer/i);
  });

  it("validates helpRequests, reputation, and attestations boundaries", async () => {
    await expect(
      aid.helpRequests.create({
        creator: validPub,
        token: validContract,
        goal: "0",
        deadline: new Date(Date.now() + 3600_000),
        contentHash: "a".repeat(64),
      }),
    ).rejects.toThrow(/goal/i);

    await expect(
      aid.helpRequests.create({
        creator: validPub,
        token: validContract,
        goal: "10.00",
        deadline: new Date("invalid"),
        contentHash: "a".repeat(64),
      }),
    ).rejects.toThrow(/deadline/i);

    await expect(aid.helpRequests.get(-1)).rejects.toThrow(/requestId/i);
    await expect(
      aid.helpRequests.contribute({ requestId: 1n, contributor: "bad", amount: "10.00" }),
    ).rejects.toThrow(/contributor/i);

    await expect(aid.reputation.getScore("bad")).rejects.toThrow(/subject/i);
    await expect(aid.reputation.getBadges("")).rejects.toThrow(ValidationError);

    await expect(
      aid.attestations.attest({
        attestor: validPub,
        subject: validPub2,
        kind: "invalid spaces!",
        contentHash: "b".repeat(64),
      }),
    ).rejects.toThrow(/kind/i);

    await expect(
      aid.attestations.revoke({ attestor: validPub, attestationId: -5 }),
    ).rejects.toThrow(/attestationId/i);
  });

  it("validates SEP-10 auth boundaries", () => {
    const serverSigner = Keypair.random();
    expect(() =>
      auth.createChallenge({
        account: "not-valid",
        serverKey: serverSigner,
        homeDomain: "stellaraid.org",
      }),
    ).toThrow(/account/i);

    expect(() =>
      auth.createChallenge({
        account: validPub,
        serverKey: serverSigner,
        homeDomain: "",
      }),
    ).toThrow(/homeDomain/i);
  });
});

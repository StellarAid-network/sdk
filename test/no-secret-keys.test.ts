import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { createStellarAid, usdc, ValidationError } from "../src";
import { auth } from "../src/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "../src");

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") continue;
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Security invariant: no SDK function accepts or derives Stellar secret keys", () => {
  it("greps src/ (excluding generated/) for banned secret-key APIs and parameter names", () => {
    const files = collectTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const bannedPatterns = [
      /\.\s*fromSecret\s*\(/,
      /\b(?:secretKey|signerKey|privateKey|secretSeed)\s*[?:]/,
    ];

    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      const rel = path.relative(srcDir, file);
      for (const pattern of bannedPatterns) {
        expect(
          pattern.test(code),
          `Found banned secret-key pattern ${String(pattern)} in src/${rel}`,
        ).toBe(false);
      }
    }
  });

  it("throws ValidationError whenever a Stellar S... secret seed is passed across public boundaries", async () => {
    const aid = createStellarAid({ network: "testnet" });
    const kp = Keypair.random();
    const secret = kp.secret();
    const validPub = kp.publicKey();
    const validToken = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

    expect(() => usdc("testnet", secret)).toThrow(ValidationError);
    await expect(aid.submit(secret)).rejects.toThrow(ValidationError);

    await expect(
      aid.giveaways.buildCreate({
        creator: secret,
        asset: aid.assets.XLM,
        amountPerClaim: "5.00",
        maxClaimants: 1,
      }),
    ).rejects.toThrow(ValidationError);

    await expect(aid.giveaways.listClaimable(secret)).rejects.toThrow(ValidationError);
    await expect(aid.giveaways.evaluateEligibility(secret, {})).rejects.toThrow(ValidationError);

    await expect(
      aid.payments.buildDonation({
        from: secret,
        to: validPub,
        asset: aid.assets.XLM,
        amount: "10.00",
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      aid.helpRequests.create({
        creator: secret,
        token: validToken,
        goal: "50.00",
        deadline: new Date(Date.now() + 86_400_000),
        contentHash: "a".repeat(64),
      }),
    ).rejects.toThrow(ValidationError);

    await expect(aid.reputation.getScore(secret)).rejects.toThrow(ValidationError);
    await expect(aid.attestations.get(secret)).rejects.toThrow(ValidationError);

    expect(() =>
      auth.createChallenge({
        account: validPub,
        serverKey: secret as unknown as never,
        homeDomain: "stellaraid.org",
      }),
    ).toThrow(ValidationError);

    expect(() => auth.createJwt({ sub: validPub }, secret)).toThrow(ValidationError);
  });
});

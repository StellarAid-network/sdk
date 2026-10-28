import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import * as mainEntry from "../src";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

describe("Subpath exports and server-only auth bundle isolation", () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(distDir, "index.js"))) {
      execSync("pnpm build", { cwd: rootDir, stdio: "inherit" });
    }
  });

  it("does not export server-only SEP-10 auth functions from the main entry", () => {
    const exportedKeys = Object.keys(mainEntry);
    expect(exportedKeys).not.toContain("auth");
    expect(exportedKeys).not.toContain("createChallenge");
    expect(exportedKeys).not.toContain("verifyChallenge");
    expect(exportedKeys).not.toContain("verifyToken");
    expect(exportedKeys).not.toContain("createJwt");
    expect(exportedKeys).not.toContain("verifyJwt");
  });

  it("verifies browser bundle of main entry and client subpaths contain zero server-only auth code", () => {
    const clientBundles = ["index.js", "index.cjs", "giveaways.js", "events.js"];
    const forbiddenIdentifiers = [
      "createChallenge",
      "verifyChallenge",
      "verifyToken",
      "createJwt",
      "verifyJwt",
      "timingSafeEqual",
      "createHmac",
      "Server signature missing or invalid",
    ];

    for (const bundleFile of clientBundles) {
      const fullPath = path.join(distDir, bundleFile);
      expect(fs.existsSync(fullPath)).toBe(true);
      const code = fs.readFileSync(fullPath, "utf8");

      for (const forbidden of forbiddenIdentifiers) {
        expect(
          code.includes(forbidden),
          `Client bundle ${bundleFile} leaked server-only identifier "${forbidden}"`,
        ).toBe(false);
      }
    }
  });

  it("exports server-only SEP-10 functions exclusively in the ./auth subpath bundle", () => {
    const authEsm = fs.readFileSync(path.join(distDir, "auth.js"), "utf8");
    expect(authEsm).toContain("createChallenge");
    expect(authEsm).toContain("verifyChallenge");
    expect(authEsm).toContain("verifyToken");
  });
});

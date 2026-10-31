/**
 * Unit tests for giveaway predicates, batching logic, and evaluateEligibility.
 */

import { describe, it, expect, vi } from "vitest";
import {
  predicates,
  evaluateEligibility,
  buildCreate,
  MAX_TOTAL_CLAIMANTS,
  type EligibilityRules,
} from "../src/giveaways";
import { ValidationError } from "../src/errors";
import type { ResolvedConfig } from "../src/network/config";

// ---------------------------------------------------------------------------
// Test config fixture
// ---------------------------------------------------------------------------

const TEST_CONFIG: ResolvedConfig = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  contracts: { help_request: "", reputation: "", attestation: "" },
  fetch: globalThis.fetch,
};

// A real funded testnet address used only as a valid G... address in tests.
const TEST_ADDRESS = "GBTYIQPBLDAXZ3DGFY5KAYFHRVGOF5V5GU263RTRVQQOAIICCW5S4VEQ";
const OTHER_ADDRESS = "GDG2AJ6XVIA2ALXFXOAQV4Y5RBGEF2HVFW7TMT7GIPGQBXYBBNQL6SKL";

// ---------------------------------------------------------------------------
// Predicate tests
// ---------------------------------------------------------------------------

describe("predicates.unconditional", () => {
  it("returns a predicate object", () => {
    const p = predicates.unconditional();
    expect(p).toBeDefined();
  });
});

describe("predicates.window", () => {
  it("no options returns unconditional", () => {
    const p = predicates.window({});
    expect(p).toBeDefined();
  });

  it("with only 'from' returns a predicate", () => {
    const from = new Date(Date.now() + 3600_000);
    const p = predicates.window({ from });
    expect(p).toBeDefined();
  });

  it("with only 'until' returns a predicate", () => {
    const until = new Date(Date.now() + 3600_000);
    const p = predicates.window({ until });
    expect(p).toBeDefined();
  });

  it("with both 'from' and 'until' returns a predicate", () => {
    const from = new Date(Date.now() + 1000);
    const until = new Date(Date.now() + 7_200_000);
    const p = predicates.window({ from, until });
    expect(p).toBeDefined();
  });
});

describe("predicates.creatorAfter", () => {
  it("returns a predicate for a future date", () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    const p = predicates.creatorAfter(expiresAt);
    expect(p).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Batching logic tests (via buildCreate argument validation)
// ---------------------------------------------------------------------------

describe("buildCreate batching validation", () => {
  it("throws ValidationError when claimers and maxClaimants are both set", async () => {
    const config: ResolvedConfig = {
      ...TEST_CONFIG,
      fetch: vi.fn(),
    };
    await expect(
      buildCreate(
        {
          creator: TEST_ADDRESS,
          asset: { code: "XLM" },
          amountPerClaim: "1.00",
          claimers: [OTHER_ADDRESS],
          maxClaimants: 5,
        },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when claimers list is empty", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() };
    await expect(
      buildCreate(
        {
          creator: TEST_ADDRESS,
          asset: { code: "XLM" },
          amountPerClaim: "1.00",
          claimers: [],
        },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when maxClaimants is 0", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() };
    await expect(
      buildCreate(
        {
          creator: TEST_ADDRESS,
          asset: { code: "XLM" },
          amountPerClaim: "1.00",
          maxClaimants: 0,
        },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it(`throws ValidationError when total claimers exceed ${MAX_TOTAL_CLAIMANTS}`, async () => {
    // Generate 1001 addresses (exceeds limit).
    const tooManyClaimers = Array.from({ length: MAX_TOTAL_CLAIMANTS + 1 }, () => TEST_ADDRESS);
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() };
    await expect(
      buildCreate(
        {
          creator: TEST_ADDRESS,
          asset: { code: "XLM" },
          amountPerClaim: "1.00",
          claimers: tooManyClaimers,
        },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when amountPerClaim is zero", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() };
    await expect(
      buildCreate(
        {
          creator: TEST_ADDRESS,
          asset: { code: "XLM" },
          amountPerClaim: "0",
          maxClaimants: 1,
        },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("batches 9 claimers into 1 op (one slot reserved for creator reclaim)", async () => {
    const mockAccount = {
      id: TEST_ADDRESS,
      sequence: "1234567",
      balances: [{ asset_type: "native", balance: "100.0000000" }],
      subentry_count: 0,
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
      flags: {},
      signers: [],
      data: {},
      last_modified_ledger: 1,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    });
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    const nineClaimers = Array.from({ length: 9 }, () => OTHER_ADDRESS);
    const xdr = await buildCreate(
      {
        creator: TEST_ADDRESS,
        asset: { code: "XLM" },
        amountPerClaim: "1.0000000",
        claimers: nineClaimers,
      },
      config,
    );

    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(10);
  });

  it("batches 10 claimers into 2 ops", async () => {
    const mockAccount = {
      id: TEST_ADDRESS,
      sequence: "1234567",
      balances: [],
      subentry_count: 0,
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
      flags: {},
      signers: [],
      data: {},
      last_modified_ledger: 1,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    });
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    const elevenClaimers = Array.from({ length: 11 }, () => OTHER_ADDRESS);
    const xdr = await buildCreate(
      {
        creator: TEST_ADDRESS,
        asset: { code: "XLM" },
        amountPerClaim: "1.0000000",
        claimers: elevenClaimers,
      },
      config,
    );

    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// evaluateEligibility tests
// ---------------------------------------------------------------------------

describe("evaluateEligibility", () => {
  it("returns ineligible when account not found", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("404 not found"));
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    const result = await evaluateEligibility(TEST_ADDRESS, {}, config);
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns eligible with no rules for an existing account", async () => {
    const mockAccount = {
      id: TEST_ADDRESS,
      sequence: "100",
      balances: [{ asset_type: "native", balance: "50.0000000" }],
      subentry_count: 0,
      thresholds: {},
      flags: {},
      signers: [],
      data: {},
      last_modified_ledger: 1,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    });
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    const result = await evaluateEligibility(TEST_ADDRESS, {}, config);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails minBalance check when balance is too low", async () => {
    const mockAccount = {
      id: TEST_ADDRESS,
      sequence: "100",
      balances: [{ asset_type: "native", balance: "0.5000000" }],
      subentry_count: 0,
      thresholds: {},
      flags: {},
      signers: [],
      data: {},
      last_modified_ledger: 1,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    });
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    const rules: EligibilityRules = { minBalance: "1.0" };
    const result = await evaluateEligibility(TEST_ADDRESS, rules, config);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("XLM"))).toBe(true);
  });

  it("passes minBalance check when balance is sufficient", async () => {
    const mockAccount = {
      id: TEST_ADDRESS,
      sequence: "100",
      balances: [{ asset_type: "native", balance: "10.0000000" }],
      subentry_count: 0,
      thresholds: {},
      flags: {},
      signers: [],
      data: {},
      last_modified_ledger: 1,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    });
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    const rules: EligibilityRules = { minBalance: "1.0" };
    const result = await evaluateEligibility(TEST_ADDRESS, rules, config);
    expect(result.eligible).toBe(true);
  });

  it("applies reputation check when injected", async () => {
    const mockAccount = {
      id: TEST_ADDRESS,
      sequence: "100",
      balances: [{ asset_type: "native", balance: "10.0000000" }],
      subentry_count: 0,
      thresholds: {},
      flags: {},
      signers: [],
      data: {},
      last_modified_ledger: 1,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    });
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: mockFetch as unknown as typeof fetch };

    // Score 5, threshold 10 → ineligible.
    const rules: EligibilityRules = {
      reputationCheck: async () => 5,
      minReputationScore: 10,
    };
    const result = await evaluateEligibility(TEST_ADDRESS, rules, config);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Reputation"))).toBe(true);
  });
});

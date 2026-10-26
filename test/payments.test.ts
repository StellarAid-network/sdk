/**
 * Unit tests for payments module: buildDonation and ensureTrustline.
 */

import { describe, it, expect, vi } from "vitest";
import { buildDonation, ensureTrustline } from "../src/payments";
import { ValidationError } from "../src/errors";
import type { ResolvedConfig } from "../src/network/config";

const TEST_CONFIG: ResolvedConfig = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  contracts: { help_request: "", reputation: "", attestation: "" },
  fetch: globalThis.fetch,
};

const SENDER = "GBTYIQPBLDAXZ3DGFY5KAYFHRVGOF5V5GU263RTRVQQOAIICCW5S4VEQ";
const RECIPIENT = "GDG2AJ6XVIA2ALXFXOAQV4Y5RBGEF2HVFW7TMT7GIPGQBXYBBNQL6SKL";

const mockAccountFor = (address: string, balances: unknown[] = []) => ({
  id: address,
  sequence: "12345",
  balances: [{ asset_type: "native", balance: "100.0000000" }, ...balances],
  subentry_count: 0,
  thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
  flags: {},
  signers: [],
  data: {},
  last_modified_ledger: 1,
});

// ---------------------------------------------------------------------------
// buildDonation tests
// ---------------------------------------------------------------------------

describe("buildDonation", () => {
  it("builds a valid XDR for an XLM donation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccountFor(SENDER)),
    });
    const config: ResolvedConfig = {
      ...TEST_CONFIG,
      fetch: mockFetch as unknown as typeof fetch,
    };

    const xdr = await buildDonation(
      { from: SENDER, to: RECIPIENT, asset: { code: "XLM" }, amount: "10.0000000" },
      config,
    );

    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(20);
  });

  it("attaches a text memo when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccountFor(SENDER)),
    });
    const config: ResolvedConfig = {
      ...TEST_CONFIG,
      fetch: mockFetch as unknown as typeof fetch,
    };

    const xdr = await buildDonation(
      {
        from: SENDER,
        to: RECIPIENT,
        asset: { code: "XLM" },
        amount: "5.0000000",
        memo: "thank you",
      },
      config,
    );

    expect(typeof xdr).toBe("string");
    // XDR with memo will be longer than without.
    expect(xdr.length).toBeGreaterThan(20);
  });

  it("throws ValidationError when memo exceeds 28 bytes", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() as unknown as typeof fetch };
    await expect(
      buildDonation(
        {
          from: SENDER,
          to: RECIPIENT,
          asset: { code: "XLM" },
          amount: "5.0000000",
          memo: "this memo is definitely way too long for stellar",
        },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid sender address", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() as unknown as typeof fetch };
    await expect(
      buildDonation(
        { from: "bad-address", to: RECIPIENT, asset: { code: "XLM" }, amount: "1.0" },
        config,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for zero amount", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() as unknown as typeof fetch };
    await expect(
      buildDonation({ from: SENDER, to: RECIPIENT, asset: { code: "XLM" }, amount: "0" }, config),
    ).rejects.toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// ensureTrustline tests
// ---------------------------------------------------------------------------

describe("ensureTrustline", () => {
  it("returns null for native XLM (no trustline needed)", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() as unknown as typeof fetch };
    const result = await ensureTrustline(SENDER, { code: "XLM" }, config);
    expect(result).toBeNull();
  });

  it("returns null when trustline already exists", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockAccountFor(SENDER, [
            {
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              asset_issuer: "GDG2AJ6XVIA2ALXFXOAQV4Y5RBGEF2HVFW7TMT7GIPGQBXYBBNQL6SKL",
              balance: "10.0000000",
            },
          ]),
        ),
    });
    const config: ResolvedConfig = {
      ...TEST_CONFIG,
      fetch: mockFetch as unknown as typeof fetch,
    };

    const result = await ensureTrustline(
      SENDER,
      {
        code: "USDC",
        issuer: "GDG2AJ6XVIA2ALXFXOAQV4Y5RBGEF2HVFW7TMT7GIPGQBXYBBNQL6SKL",
      },
      config,
    );
    expect(result).toBeNull();
  });

  it("returns a change_trust XDR when trustline is missing", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccountFor(SENDER)),
    });
    const config: ResolvedConfig = {
      ...TEST_CONFIG,
      fetch: mockFetch as unknown as typeof fetch,
    };

    const xdr = await ensureTrustline(
      SENDER,
      {
        code: "USDC",
        issuer: "GDG2AJ6XVIA2ALXFXOAQV4Y5RBGEF2HVFW7TMT7GIPGQBXYBBNQL6SKL",
      },
      config,
    );
    expect(typeof xdr).toBe("string");
    expect(xdr!.length).toBeGreaterThan(20);
  });

  it("throws ValidationError for invalid account address", async () => {
    const config: ResolvedConfig = { ...TEST_CONFIG, fetch: vi.fn() as unknown as typeof fetch };
    await expect(
      ensureTrustline("not-a-valid-address", { code: "USDC", issuer: RECIPIENT }, config),
    ).rejects.toThrow(ValidationError);
  });
});

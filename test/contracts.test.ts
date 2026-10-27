import { describe, expect, it } from "vitest";
import {
  createStellarAid,
  ContractError,
  mapContractError,
  extractContractError,
  HELP_REQUEST_ERRORS,
  REPUTATION_ERRORS,
  ATTESTATION_ERRORS,
  formatAmount,
  parseAmount,
} from "../src";

describe("Contract wrappers and error mapping", () => {
  const aid = createStellarAid({ network: "testnet" });

  it("exposes contract modules on createStellarAid instance", () => {
    expect(aid.helpRequests).toBeDefined();
    expect(aid.reputation).toBeDefined();
    expect(aid.attestations).toBeDefined();

    expect(typeof aid.helpRequests.create).toBe("function");
    expect(typeof aid.helpRequests.get).toBe("function");
    expect(typeof aid.helpRequests.contribute).toBe("function");
    expect(typeof aid.helpRequests.finalize).toBe("function");
    expect(typeof aid.helpRequests.refund).toBe("function");
    expect(typeof aid.helpRequests.cancel).toBe("function");

    expect(typeof aid.reputation.getScore).toBe("function");
    expect(typeof aid.reputation.getBadges).toBe("function");
    expect(typeof aid.reputation.getConfig).toBe("function");

    expect(typeof aid.attestations.get).toBe("function");
    expect(typeof aid.attestations.attest).toBe("function");
    expect(typeof aid.attestations.revoke).toBe("function");
  });

  describe("Contract error mapping", () => {
    it("maps help request error codes to typed ContractError names", () => {
      const err5 = mapContractError(5, HELP_REQUEST_ERRORS);
      expect(err5).toBeInstanceOf(ContractError);
      expect(err5.code).toBe(5);
      expect(err5.name).toBe("DeadlinePassed");

      const err7 = mapContractError(7, HELP_REQUEST_ERRORS);
      expect(err7.name).toBe("NotOpen");

      const err8 = mapContractError(8, HELP_REQUEST_ERRORS);
      expect(err8.name).toBe("Unauthorized");

      const err11 = mapContractError(11, HELP_REQUEST_ERRORS);
      expect(err11.name).toBe("MilestoneNotFound");
    });

    it("maps reputation and attestation error codes", () => {
      const repErr = mapContractError(4, REPUTATION_ERRORS);
      expect(repErr.name).toBe("InvalidDelta");

      const attErr = mapContractError(6, ATTESTATION_ERRORS);
      expect(attErr.name).toBe("InvalidExpiry");
    });

    it("extracts contract error from simulation/RPC error strings", () => {
      const rpcError = new Error("Transaction simulation failed: HostError: Error(Contract, #5)");
      const mapped = extractContractError(rpcError, HELP_REQUEST_ERRORS);
      expect(mapped).toBeInstanceOf(ContractError);
      expect((mapped as ContractError).code).toBe(5);
      expect(mapped.name).toBe("DeadlinePassed");

      const altFormat = "Contract execution reverted: ContractError: 8";
      const mappedAlt = extractContractError(altFormat, HELP_REQUEST_ERRORS);
      expect((mappedAlt as ContractError).code).toBe(8);
      expect(mappedAlt.name).toBe("Unauthorized");
    });
  });

  describe("Amount conversions", () => {
    it("converts human amounts to on-chain integers and back", () => {
      expect(parseAmount("25.00")).toBe(250_000_000n);
      expect(parseAmount("0.5")).toBe(5_000_000n);
      expect(parseAmount("100")).toBe(1_000_000_000n);

      expect(formatAmount(250_000_000n)).toBe("25.0000000");
      expect(formatAmount(5_000_000n)).toBe("0.5000000");
    });
  });

  describe("Live Testnet read calls", () => {
    it("reads reputation config from deployed contract on testnet", async () => {
      const cfg = await aid.reputation.getConfig();
      expect(cfg.tier1Threshold).toBe(10);
      expect(cfg.tier2Threshold).toBe(50);
      expect(cfg.tier3Threshold).toBe(100);
    });

    it("reads fresh subject score and badges", async () => {
      const randomAccount = "GCFGKLCBV5IGJYGRR7FJNU53HFV5674PMQNNJT6HRAFGUAHZ7V3ZELXR";
      const score = await aid.reputation.getScore(randomAccount);
      expect(typeof score).toBe("number");

      const badges = await aid.reputation.getBadges(randomAccount);
      expect(Array.isArray(badges)).toBe(true);
    });

    it("reads empty attestations for an unverified subject", async () => {
      const randomAccount = "GBTYIQPBLDAXZ3DGFY5KAYFHRVGOF5V5GU263RTRVQQOAIICCW5S4VEQ";
      const attestations = await aid.attestations.get(randomAccount);
      expect(Array.isArray(attestations)).toBe(true);
      expect(attestations.length).toBe(0);
    });
  });
});

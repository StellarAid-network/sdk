import { describe, expect, it } from "vitest";

import { formatAmount, parseAmount, STELLAR_DECIMALS } from "../src/assets";
import { ValidationError } from "../src/errors";

describe("formatAmount", () => {
  it("formats with 7 decimals", () => {
    expect(formatAmount(10_000_000n)).toBe("1.0000000");
    expect(formatAmount(0n)).toBe("0.0000000");
    expect(formatAmount(12_500_000n)).toBe("1.2500000");
    expect(formatAmount(-10_000_000n)).toBe("-1.0000000");
  });

  it("supports explicit decimals", () => {
    expect(formatAmount(42n, 0)).toBe("42");
    expect(formatAmount(1_5n, 1)).toBe("1.5");
  });

  it("rejects invalid decimals", () => {
    expect(() => formatAmount(1n, -1)).toThrow(ValidationError);
    expect(() => formatAmount(1n, 1.5)).toThrow(ValidationError);
  });
});

describe("parseAmount", () => {
  it("parses with 7 decimals", () => {
    expect(parseAmount("12.5")).toBe(125_000_000n);
    expect(parseAmount("1")).toBe(10_000_000n);
    expect(parseAmount("-0.0000001")).toBe(-1n);
    expect(parseAmount("0")).toBe(0n);
  });

  it("rejects too many decimals", () => {
    expect(() => parseAmount("1.00000001")).toThrow(ValidationError);
  });

  it("rejects malformed input", () => {
    expect(() => parseAmount("abc")).toThrow(ValidationError);
    expect(() => parseAmount("1.2.3")).toThrow(ValidationError);
    expect(() => parseAmount("")).toThrow(ValidationError);
  });

  it("round-trips with formatAmount", () => {
    for (const value of ["0.0000001", "123.4567891", "1000.0000000", "-42.5000000"]) {
      expect(formatAmount(parseAmount(value))).toBe(value);
    }
  });
});

describe("STELLAR_DECIMALS", () => {
  it("is 7", () => {
    expect(STELLAR_DECIMALS).toBe(7);
  });
});

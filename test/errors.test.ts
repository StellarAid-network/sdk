import { describe, expect, it } from "vitest";

import {
  AuthError,
  ContractError,
  NetworkError,
  SimulationError,
  StellarAidError,
  SubmissionError,
  ValidationError,
} from "../src/errors";

describe("error hierarchy", () => {
  it("all errors extend StellarAidError", () => {
    const errors = [
      new NetworkError("network"),
      new SimulationError("simulation"),
      new SubmissionError("submission"),
      new ContractError(1, "InvalidAmount"),
      new ValidationError("validation"),
      new AuthError("auth"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(StellarAidError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("ContractError carries the numeric code and the contract error name", () => {
    const error = new ContractError(5, "DeadlinePassed", "too late");

    expect(error).toBeInstanceOf(StellarAidError);
    expect(error.name).toBe("DeadlinePassed");
    expect(error.code).toBe(5);
    expect(error.message).toBe("too late");
  });

  it("ContractError defaults the message to the error name", () => {
    const error = new ContractError(3, "RequestNotFound");
    expect(error.message).toBe("RequestNotFound");
  });

  it("SubmissionError exposes result codes", () => {
    const error = new SubmissionError("rejected", ["tx_failed", "op_underfunded"]);
    expect(error.resultCodes).toEqual(["tx_failed", "op_underfunded"]);
  });

  it("SimulationError exposes diagnostics", () => {
    const error = new SimulationError("bad simulation", { diagnostic: "boom" });
    expect(error.diagnostics).toEqual({ diagnostic: "boom" });
  });
});

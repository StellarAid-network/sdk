/**
 * Typed error classes for the StellarAid SDK.
 *
 * Every error thrown by the SDK extends {@link StellarAidError}, so callers can catch
 * broadly or narrow to a specific class.
 */

/** Base class for all StellarAid SDK errors. */
export class StellarAidError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StellarAidError";
  }
}

/** RPC or Horizon was unreachable or timed out. */
export class NetworkError extends StellarAidError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/** Soroban simulation failed. Includes diagnostic information. */
export class SimulationError extends StellarAidError {
  /** Raw diagnostic events or error string returned by the RPC, when available. */
  public readonly diagnostics?: unknown;

  constructor(message: string, diagnostics?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = "SimulationError";
    if (diagnostics !== undefined) {
      this.diagnostics = diagnostics;
    }
  }
}

/** A transaction was rejected or failed on-chain. Includes result codes. */
export class SubmissionError extends StellarAidError {
  /** Horizon/Soroban result codes that led to the failure, when available. */
  public readonly resultCodes?: string[];

  constructor(message: string, resultCodes?: string[], options?: ErrorOptions) {
    super(message, options);
    this.name = "SubmissionError";
    if (resultCodes !== undefined) {
      this.resultCodes = resultCodes;
    }
  }
}

/**
 * A contract returned a typed error.
 *
 * `name` is the contract error name from the contracts README error table (for example
 * `"DeadlinePassed"`), so callers can branch on it directly.
 */
export class ContractError extends StellarAidError {
  /** Stable numeric contract error code. */
  public readonly code: number;

  constructor(code: number, name: string, message?: string, options?: ErrorOptions) {
    super(message ?? name, options);
    this.name = name;
    this.code = code;
  }
}

/** Bad input: an invalid address, amount, or date. */
export class ValidationError extends StellarAidError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ValidationError";
  }
}

/** A SEP-10 challenge or token failed verification. */
export class AuthError extends StellarAidError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthError";
  }
}

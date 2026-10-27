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

/** A Soroban contract event failed to decode. */
export class EventDecodingError extends StellarAidError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EventDecodingError";
  }
}

export const HELP_REQUEST_ERRORS: Record<number, string> = {
  1: "NotInitialized",
  2: "AlreadyInitialized",
  3: "RequestNotFound",
  4: "InvalidAmount",
  5: "DeadlinePassed",
  6: "DeadlineNotReached",
  7: "NotOpen",
  8: "Unauthorized",
  9: "TokenNotAllowed",
  10: "NothingToRefund",
  11: "MilestoneNotFound",
  12: "MilestoneAlreadyReleased",
  13: "MilestoneNotSubmitted",
  14: "MilestoneAlreadySubmitted",
  15: "MilestoneAlreadyApproved",
  16: "InsufficientApprovals",
  17: "InvalidMilestoneSchedule",
  18: "MilestoneOutOfOrder",
  19: "NotDisputedOrCancelled",
};

export const REPUTATION_ERRORS: Record<number, string> = {
  1: "NotInitialized",
  2: "AlreadyInitialized",
  3: "Unauthorized",
  4: "InvalidDelta",
};

export const ATTESTATION_ERRORS: Record<number, string> = {
  1: "NotInitialized",
  2: "AlreadyInitialized",
  3: "Unauthorized",
  4: "AttestationNotFound",
  5: "AlreadyRevoked",
  6: "InvalidExpiry",
};

/**
 * Maps a numeric error code to a typed ContractError with human-readable name.
 */
export function mapContractError(
  code: number,
  table: Record<number, string>,
  message?: string,
): ContractError {
  const name = table[code] ?? "UnknownContractError";
  return new ContractError(code, name, message ?? `Contract error ${name} (#${code})`);
}

/**
 * Extracts numeric error code from error messages or simulation results if available.
 */
export function extractContractError(
  err: unknown,
  table: Record<number, string>,
): Error {
  if (err instanceof ContractError) return err;
  const str = String(err instanceof Error ? err.message : err);
  const match = str.match(/(?:Error\(Contract,\s*#?|ContractError:?\s*|Error Code:\s*)(\d+)/i);
  if (match && match[1]) {
    const code = parseInt(match[1], 10);
    return mapContractError(code, table, str);
  }
  return err instanceof Error ? err : new StellarAidError(str);
}


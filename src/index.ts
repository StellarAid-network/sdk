/**
 * @stellar-aid/sdk
 *
 * The TypeScript SDK for StellarAid. Configure a client with {@link createStellarAid}
 * and use the individual modules for giveaways, payments, contract wrappers, auth, and
 * event decoding.
 */

export * from "./assets";
export * from "./errors";
export * from "./network";
export * from "./types";
export * from "./events";
export * from "./helpRequests";
export * from "./reputation";
export * from "./attestations";
export * from "./generated";

// Note: Server-only SEP-10 auth functions are exported exclusively via
// `@stellar-aid/sdk/auth` to prevent accidental bundling into client/browser bundles.

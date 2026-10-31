# Changelog

All notable changes to `@stellar-aid/sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (major version tracks `contracts` ABI compatibility).

## [0.1.0-testnet] - 2026-10-31

### Added

- Synced `src/deployments/testnet.json` against `contracts` release `v0.1.0-testnet` (`help_request`, `reputation`, `attestation` IDs and WASM SHA-256 hashes).
- Generated and wrapped Soroban TypeScript bindings for `HelpRequestsModule`, `ReputationModule`, and `AttestationsModule`, including numeric contract error code mapping (`1..19`, `1..4`, `1..6`) to typed `ContractError` instances.
- Claimable-balance `giveaways` builders (`buildCreate`, `buildClaim`, `buildReclaim`), Horizon readers (`listClaimable`, `listCreated`, `getBalance`), time-window predicate helpers (`predicates.window`, `predicates.unconditional`, `predicates.creatorAfter`), and anti-bot `evaluateEligibility`.
- Direct donation and trustline builders in `payments` (`buildDonation`, `ensureTrustline`).
- Server-isolated SEP-10 helpers in `@stellar-aid/sdk/auth` (`createChallenge`, `extractNonce`, `signChallenge`, `verifyChallenge`, `verifyToken`, `createJwt`, `verifyJwt`).
- Soroban event decoder in `@stellar-aid/sdk/events` (`decodeEvent`) covering all 12 domain event variants.
- Public-boundary validation helpers (`src/validation.ts`) enforcing StrKey checksums, positive decimal/bigint amounts, valid timestamps/windows, and strict secret-key rejection.
- TypeDoc API reference site generation and GitHub Pages publishing workflow (`.github/workflows/docs.yml`).

### Security

- Enforced zero secret-key acceptance across all public functions and ESLint/Vitest guardrails (`ServerSigner` / wallet-adapter delegation only).
- Verified client entry bundles (`index`, `giveaways`, `events`) never bundle server-only SEP-10 HMAC or challenge signing code.

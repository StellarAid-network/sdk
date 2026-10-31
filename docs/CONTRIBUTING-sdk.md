# Contributing to `@stellar-aid/sdk`

`@stellar-aid/sdk` is the **sole shared bridge** between Soroban smart contracts (`contracts`) and application surfaces (`api`, `web`). Neither `api` nor `web` may import from each other; shared logic, types, contract wrappers, claimable-balance builders, event decoders, and SEP-10 helpers live here.

---

## 1. Core Invariants

1. **Zero secret keys in the SDK:** No function, option object, or helper in `@stellar-aid/sdk` may accept a Stellar secret seed (`S...`). ESLint (`eslint.config.js`) and `test/no-secret-keys.test.ts` enforce this invariant in CI. Client signing always delegates to a wallet callback/adapter; server SEP-10 signing accepts a `ServerSigner` (`{ publicKey(), sign() }`).
2. **Never hand-edit `src/generated/`:** Files under `src/generated/` and `src/deployments/` are produced automatically via `pnpm sync:bindings` and `pnpm sync:deployments`. Place ergonomic wrappers, amount conversions, and error mapping in `src/helpRequests/`, `src/reputation/`, and `src/attestations/`.
3. **Validate at every public boundary:** Use helpers in `src/validation.ts` (`assertAccountAddress`, `assertPositiveAmount`, `assertValidDateWindow`, `assertNotSecretKey`) and throw typed `ValidationError` instances on bad inputs.
4. **Preserve dual ESM + CJS & subpath tree-shaking:** Server-focused modules (`./auth`, `./events`) and browser-focused builders (`./giveaways`) must remain cleanly importable via `package.json` `exports` without dragging Node-only APIs into client bundles.

---

## 2. Adding or Updating a Module

1. Create or update the module under `src/<module>/index.ts` with full TSDoc (`@param`, `@returns`, `@throws`, `@example`) on every public export.
2. Re-export public types in `src/index.ts` (or a dedicated subpath entry in `tsup.config.ts` + `package.json` `exports` if isolating server/client weight).
3. Add unit tests under `test/` covering valid inputs, boundary rejections (`ValidationError`), secret-key rejection (`S...`), and error mapping (`StellarAidError` subclasses).
4. Record a Changeset (`pnpm changeset`) describing semver impact (`patch`, `minor`, or `major` for breaking contract ABI changes — use `docs/migration-template.md` for breaking changes).

---

## 3. Pre-PR Verification Checklist

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs
npm pack --dry-run
```

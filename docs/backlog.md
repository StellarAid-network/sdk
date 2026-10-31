# `@stellar-aid/sdk` Contributor Issue Backlog

Curated post-`v0.1.0-testnet` tasks ready to pick up. None of these items are required for the initial testnet release; each is scoped for external contributors with explicit file paths and acceptance criteria.

---

### 1. `[good first issue]` Implement `payments.buildPathPayment` strict-send & strict-receive builder

- **Labels:** `good first issue`, `payments`
- **Files:** `src/payments/index.ts`, `src/network/index.ts`, `test/payments.test.ts`
- **Context:** `README.md` marks `buildPathPayment(...)` as _(planned)_ so donors can pay in XLM while recipients receive USDC via Stellar DEX path payments.
- **Acceptance criteria:**
  1. Add `buildPathPaymentStrictSend` / `buildPathPayment` in `src/payments/index.ts` returning an unsigned XDR string.
  2. Validate `from`, `to`, `sendAsset`, `destAsset`, `sendAmount`, and `destMin` via `src/validation.ts` (`ValidationError` on invalid input).
  3. Expose on `PaymentsFacade` in `src/network/index.ts` with TSDoc and unit tests in `test/payments.test.ts` using mocked Horizon responses.

### 2. `[good first issue]` Configurable fee-margin application on Soroban wrapper transactions

- **Labels:** `good first issue`, `contracts`
- **Files:** `src/helpRequests/index.ts`, `test/contracts.test.ts`
- **Context:** `CreateRequestParams`, `ContributeParams`, and milestone params accept `feeMargin?: number`, which should scale simulated Soroban resource fees by `1 + feeMargin` (default `0.15`) before assembling unsigned XDRs.
- **Acceptance criteria:**
  1. Validate `feeMargin` (`0 <= feeMargin <= 2`) with `ValidationError`.
  2. Apply the safety margin during simulation/assembly and expose estimated fee stroops on the returned builder object.
  3. Add unit tests verifying default `0.15` and custom `feeMargin` values.

### 3. `[good first issue]` Cursor pagination support for `giveaways.listClaimable` and `listCreated`

- **Labels:** `good first issue`, `giveaways`
- **Files:** `src/giveaways/index.ts`, `test/giveaways.test.ts`
- **Context:** `listClaimable` and `listCreated` currently fetch `limit=200` in a single request. Accounts with >200 historical claimable balances need optional `{ cursor?: string; limit?: number; order?: "asc" | "desc" }`.
- **Acceptance criteria:**
  1. Add backward-compatible pagination options (`limit` validated in `1..200`).
  2. Preserve existing `Promise<ClaimableBalance[]>` return type while adding `listClaimablePage` returning `{ records, nextCursor }`.
  3. Add unit tests covering cursor forwarding and boundary validation.

### 4. `[good first issue]` Property-based round-trip tests for `formatAmount` and `parseAmount`

- **Labels:** `good first issue`, `testing`
- **Files:** `src/assets/index.ts`, `test/amounts.test.ts`
- **Context:** Expand amount conversion tests across `0..18` decimal places, `i128` max bounds, leading/trailing whitespace, and negative balances.
- **Acceptance criteria:**
  1. Add exhaustive boundary cases in `test/amounts.test.ts` verifying `parseAmount(formatAmount(x, d), d) === x`.
  2. Ensure clear `ValidationError` messages on scientific notation (`"1e7"`) and overflow inputs.

### 5. `[help wanted]` True Horizon ledger-timestamp account age check in `evaluateEligibility`

- **Labels:** `help wanted`, `giveaways`, `anti-bot`
- **Files:** `src/giveaways/index.ts`, `test/giveaways.test.ts`
- **Context:** `evaluateEligibility` currently checks `sequence > 0n` when `minAgeDays` is set. Querying the account's earliest `account_created` effect or first transaction `created_at` from Horizon enables exact day-granularity age checks.
- **Acceptance criteria:**
  1. Fetch `/accounts/:id/transactions?order=asc&limit=1` when `minAgeDays > 0`.
  2. Compare `created_at` against `Date.now() - minAgeDays * 86_400_000`.
  3. Add unit tests for accounts younger and older than `minAgeDays`.

### 6. `[good first issue]` Retry with exponential backoff on transient 429/503 RPC & Horizon responses

- **Labels:** `good first issue`, `network`
- **Files:** `src/network/index.ts`, `src/network/config.ts`, `test/network-retry.test.ts`
- **Context:** Public Testnet Horizon/Soroban RPC endpoints occasionally return HTTP `429` or `503`. Optional `retry?: { maxRetries?: number; baseDelayMs?: number }` in `StellarAidConfig` improves resilience.
- **Acceptance criteria:**
  1. Wrap `config.fetch` with opt-in retry logic for idempotent `GET` requests and RPC `simulateTransaction` calls (never auto-retry `POST /transactions` without idempotency check).
  2. Surface `NetworkError` after exhausting retries with `cause` preserved.
  3. Add deterministic unit tests with fake timers.

### 7. `[good first issue]` Strict XDR round-trip corpus tests for `events.decodeEvent`

- **Labels:** `good first issue`, `events`, `testing`
- **Files:** `src/events/index.ts`, `test/events.test.ts`
- **Context:** Build real base64 `xdr.ScVal` fixtures for every event listed in `contracts/docs/ABI.md` and assert exact decoding and `EventDecodingError` behavior on corrupted XDR.
- **Acceptance criteria:**
  1. Cover all 12 event topics (`created`, `contributed`, `funded`, `failed`, `milestone_submitted`, `milestone_approved`, `milestone_released`, `refunded`, `cancelled`, `score_changed`, `attested`, `revoked`) encoded as real `xdr.ScVal` base64 strings.
  2. Assert `EventDecodingError` on missing required fields or unknown topics.

### 8. `[help wanted]` Muxed account (`M...`) awareness at payment & donation boundaries

- **Labels:** `help wanted`, `payments`, `validation`
- **Files:** `src/validation.ts`, `src/payments/index.ts`, `test/payments.test.ts`
- **Context:** Exchanges and custodial wallets often use SEP-23 muxed addresses (`M...`). Decide and support explicit opt-in muxed recipients in `payments.buildDonation`.
- **Acceptance criteria:**
  1. Add `assertMuxedOrAccountAddress` in `src/validation.ts` using `StrKey.isValidMed25519PublicKey`.
  2. Support `M...` destination in `payments.buildDonation` while keeping `G...` enforcement on Soroban contract calls where `M...` is unsupported.
  3. Add unit tests for valid and invalid `M...` addresses.

### 9. `[good first issue]` Browser bundle-size budget check in CI

- **Labels:** `good first issue`, `ci`, `performance`
- **Files:** `scripts/check-bundle-size.ts`, `package.json`, `.github/workflows/ci.yml`
- **Context:** Enforce gzipped size budgets on `dist/index.js`, `dist/giveaways.js`, and `dist/events.js` so accidental heavy dependencies fail CI early.
- **Acceptance criteria:**
  1. Add `pnpm check:size` script measuring gzipped byte size of each ESM entry point.
  2. Fail if `dist/giveaways.js` or `dist/events.js` exceeds 15 KiB gzipped (excluding externalized `@stellar/stellar-sdk`).

### 10. `[help wanted]` Multi-signature SEP-10 threshold verification in `auth.verifyChallenge`

- **Labels:** `help wanted`, `auth`, `security`
- **Files:** `src/auth/index.ts`, `src/types/index.ts`, `test/auth.test.ts`
- **Context:** `verifyChallenge` currently verifies single-key Ed25519 account signatures (`G...`). Supporting multi-sig Stellar accounts via optional Horizon signer-weight lookup enables organization treasuries to sign in with SEP-10.
- **Acceptance criteria:**
  1. Add optional `signers?: Array<{ key: string; weight: number }>` and `medThreshold?: number` to `VerifyChallengeOptions`.
  2. Verify accumulated signature weights meet `medThreshold` without duplicating signers.
  3. Add unit tests for 2-of-3 multi-sig pass, insufficient weight failure, and replay rejection.

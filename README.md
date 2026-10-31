# 🧰 stellar-aid / sdk

**The TypeScript SDK for StellarAid: generated contract bindings, claimable-balance builders, SEP-10 helpers, network config, and shared types.**

![npm](https://img.shields.io/badge/npm-%40stellar--aid%2Fsdk-red)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![License](https://img.shields.io/badge/license-MIT-green)

`sdk` is the **only bridge** between the on-chain world (`contracts`) and the apps ([`web`](https://github.com/stellar-aid/web), [`api`](https://github.com/stellar-aid/api)). Apps never import from each other. They share code exclusively through this package.

---

## Table of contents

1. [What's inside](#whats-inside)
2. [Installation](#installation)
3. [Quick start](#quick-start)
4. [Configuration and networks](#configuration-and-networks)
5. [Modules](#modules)
6. [Error handling](#error-handling)
7. [Repository layout](#repository-layout)
8. [Development](#development)
9. [Generating contract bindings](#generating-contract-bindings)
10. [Testing](#testing)
11. [Versioning and releases](#versioning-and-releases)
12. [Compatibility matrix](#compatibility-matrix)
13. [Browser and server usage](#browser-and-server-usage)
14. [Security notes](#security-notes)
15. [Contributing](#contributing)
16. [License](#license)

---

## What's inside

| Module | Purpose | Used by |
|---|---|---|
| `network` | Network configs (testnet, mainnet, local), RPC and Horizon URLs, passphrases, deployed contract addresses | web, api |
| `giveaways` | Builders and readers for **claimable-balance** giveaways | web, api |
| `payments` | Direct donation and tip transaction builders | web |
| `helpRequests` | Typed client for the Help Request contract (generated bindings plus ergonomic wrappers) | web, api |
| `reputation` | Typed client for the Reputation contract | web, api |
| `attestations` | Typed client for the Attestation contract | web, api |
| `auth` | SEP-10 challenge, verification, and JWT helpers | api, web |
| `assets` | Asset definitions (XLM, USDC) per network, amount formatting and parsing | all |
| `events` | Decoders that turn raw Soroban events into typed domain events | api (indexer) |
| `types` | Shared domain types and zod schemas | all |
| `errors` | Typed error classes and contract error mapping | all |

---

## Installation

```bash
pnpm add @stellar-aid/sdk @stellar/stellar-sdk
# or
npm install @stellar-aid/sdk @stellar/stellar-sdk
# or
yarn add @stellar-aid/sdk @stellar/stellar-sdk
```

`@stellar/stellar-sdk` is a **peer dependency**, so your app controls its version.

**Requirements:** Node.js 20+ for server use, any modern browser for client use. TypeScript 5+ is recommended.

---

## Quick start

> The snippets below show the intended public API. See the generated typedoc site and `src/` for exact signatures.

### 1. Configure the SDK

```ts
import { createStellarAid } from "@stellar-aid/sdk";

const aid = createStellarAid({ network: "testnet" });
// Optional overrides:
// createStellarAid({ network: "testnet", rpcUrl: "...", horizonUrl: "..." })
```

### 2. Create a giveaway (claimable balance)

```ts
const unsignedXdr = await aid.giveaways.buildCreate({
  creator: "G...CREATOR",
  asset: aid.assets.USDC,            // or aid.assets.XLM
  amountPerClaim: "5.00",
  claimers: ["G...A", "G...B", "G...C"],
  claimableFrom: new Date(),         // optional
  expiresAt: new Date(Date.now() + 7 * 864e5), // after this, creator can reclaim
});

// Sign with the user's wallet (Stellar Wallets Kit in `web`)
const signedXdr = await wallet.signTransaction(unsignedXdr);

const result = await aid.submit(signedXdr);
console.log(result.hash);
```

### 3. Claim a giveaway

```ts
const available = await aid.giveaways.listClaimable("G...CLAIMER");

const xdr = await aid.giveaways.buildClaim({
  claimer: "G...CLAIMER",
  balanceId: available[0].id,
});
await aid.submit(await wallet.signTransaction(xdr));
```

### 4. Contribute to a help request (Soroban)

```ts
const request = await aid.helpRequests.get(42n);

const tx = await aid.helpRequests.contribute({
  requestId: 42n,
  contributor: "G...DONOR",
  amount: "25.00",
});
// Simulates, assembles, and returns an XDR to sign
await aid.submit(await wallet.signTransaction(tx.xdr));
```

### 5. Wallet sign-in with SEP-10 (server side)

```ts
import { Keypair } from "@stellar/stellar-sdk";
import { auth } from "@stellar-aid/sdk/auth";

// Server signer (Keypair or KMS/HSM signer — the SDK never accepts raw S... secret strings)
const serverKey = Keypair.fromSecret(process.env.SEP10_SIGNING_KEY!);

// api: issue a challenge
const challengeXdr = auth.createChallenge({ account: "G...", serverKey, homeDomain });

// client: sign challenge via wallet adapter, then api: verify and issue a session token
const signedXdr = await auth.signChallenge({ unsignedXdr: challengeXdr, wallet });
const { token } = auth.verifyChallenge({ signedXdr, serverKey, homeDomain, jwtSecret });
```

---

## Configuration and networks

```ts
type NetworkName = "testnet" | "mainnet" | "local";

interface StellarAidConfig {
  network: NetworkName;
  rpcUrl?: string;          // Soroban RPC override
  horizonUrl?: string;      // Horizon override
  networkPassphrase?: string;
  contracts?: Partial<ContractAddresses>; // override deployed addresses
  fetch?: typeof fetch;     // custom fetch (SSR, tests)
}
```

Default network values:

| Network | Passphrase | Notes |
|---|---|---|
| `testnet` | `Test SDF Network ; September 2015` | Use Friendbot to fund accounts |
| `mainnet` | `Public Global Stellar Network ; September 2015` | Real funds |
| `local` | `Standalone Network ; February 2017` | Stellar quickstart in Docker |

Default RPC and Horizon endpoints for each network are defined in `src/network/config.ts`. For production traffic, **use a dedicated RPC provider** instead of public endpoints.

Contract addresses come from `src/deployments/<network>.json`, synced automatically from the [`contracts`](https://github.com/stellar-aid/contracts) repo on each release.

---

## Modules

### `giveaways` (claimable balances)

Claimable balances are a **native** Stellar feature: funds are locked in a balance entry that only listed claimants can claim, optionally within time windows.

| Function | Description |
|---|---|
| `buildCreate(opts)` | Build a transaction creating one balance per claim slot or one per claimer |
| `buildClaim(opts)` | Build a claim transaction |
| `buildReclaim(opts)` | Creator reclaims an expired, unclaimed balance |
| `listClaimable(account)` | List balances claimable by an account (via Horizon) |
| `listCreated(account)` | List balances an account created |
| `getBalance(id)` | Read one balance and its predicates |
| `evaluateEligibility(account, rules)` | Client-side anti-bot checks (account age, minimum balance, reputation threshold) |

Predicate helpers are exported for custom rules:

```ts
import { predicates } from "@stellar-aid/sdk/giveaways";

predicates.window({ from, until });     // claimable only inside a window
predicates.unconditional();             // always claimable
predicates.creatorAfter(expiresAt);     // creator may reclaim after expiry
```

> **Note:** one claimable balance can have up to 10 claimants. For larger giveaways, the builder creates multiple balances in a single transaction (up to the operation limit), batching automatically.

### `payments`

| Function | Description |
|---|---|
| `buildDonation({ from, to, asset, amount, memo })` | Simple payment with optional memo |
| `buildPathPayment(...)` | Pay in one asset, receive another *(planned)* |
| `ensureTrustline(account, asset)` | Build a change-trust operation if the recipient lacks one |

### `helpRequests`, `reputation`, `attestations`

Thin, typed wrappers over the **generated bindings**, adding:

- Automatic **simulation** and **assembly** of Soroban transactions
- Resource and fee estimation with a configurable safety margin
- Amount conversion between human strings (`"25.00"`) and on-chain integers (`i128`)
- Error mapping from numeric contract errors to typed `ContractError` classes

### `auth` (SEP-10)

| Function | Description |
|---|---|
| `createChallenge` | Server: build a challenge transaction |
| `verifyChallenge` | Server: validate signatures and issue a JWT |
| `verifyToken` | Server: validate a session token |
| `signChallenge` | Client: helper to sign through a wallet adapter |

### `events`

```ts
import { decodeEvent } from "@stellar-aid/sdk/events";

for (const raw of rpcEvents) {
  const evt = decodeEvent(raw);
  // evt.type: "help_request.contributed" | "help_request.funded" | ...
}
```

Used by the `api` indexer so it never hand-parses XDR.

### `assets`

```ts
aid.assets.XLM;
aid.assets.USDC;               // issuer set per network via config
formatAmount(10000000n, 7);    // "1.0000000"
parseAmount("12.5", 7);        // 125000000n
```

> Always confirm the USDC issuer for your network in `src/assets/` before handling real funds.

---

## Error handling

All thrown errors extend `StellarAidError`.

| Class | When |
|---|---|
| `NetworkError` | RPC/Horizon unreachable or timed out |
| `SimulationError` | Soroban simulation failed (includes diagnostic info) |
| `SubmissionError` | Transaction rejected or failed on-chain (includes result codes) |
| `ContractError` | Contract returned a typed error (`code`, `name`, `message`) |
| `ValidationError` | Bad input (invalid address, amount, or date) |
| `AuthError` | SEP-10 challenge or token failure |

```ts
try {
  await aid.submit(signedXdr);
} catch (e) {
  if (e instanceof ContractError && e.name === "DeadlinePassed") {
    // show a friendly message
  }
}
```

---

## Repository layout

```
sdk/
├── CHANGELOG.md               # Release changelog
├── package.json
├── tsconfig.json
├── tsup.config.ts             # Build config (ESM + CJS + d.ts)
├── vitest.config.ts
├── src/
│   ├── index.ts               # createStellarAid + public exports
│   ├── validation.ts          # Public boundary input validation & no-secret-key guards
│   ├── network/               # Config, endpoints, passphrases
│   ├── deployments/           # testnet.json, mainnet.json (synced from contracts)
│   ├── giveaways/             # Claimable-balance builders and readers
│   ├── payments/
│   ├── helpRequests/          # Wrapper around generated binding
│   ├── reputation/
│   ├── attestations/
│   ├── auth/                  # SEP-10
│   ├── events/                # Event decoders
│   ├── assets/
│   ├── errors/
│   ├── types/
│   └── generated/             # ⚠️ AUTO-GENERATED bindings. Do not edit by hand.
├── docs/                      # CONTRIBUTING-sdk.md, backlog.md, migration-template.md
├── scripts/
│   ├── sync-bindings.ts       # Pull and regenerate bindings
│   └── sync-deployments.ts    # Pull deployments JSON
├── test/                      # Unit, snippet, and integration tests
├── examples/                  # Runnable examples (node + browser)
└── .github/workflows/
```

---

## Development

```bash
git clone https://github.com/stellar-aid/sdk.git
cd sdk
pnpm install

pnpm build        # build ESM + CJS + type declarations
pnpm dev          # watch mode
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm format       # prettier
pnpm test         # vitest unit tests
pnpm docs         # generate typedoc into ./docs-site
```

### Using a local build in `web` or `api`

```bash
# in sdk/
pnpm build && pnpm link --global

# in web/ or api/
pnpm link --global @stellar-aid/sdk
```

For active development, run `pnpm dev` in `sdk` so linked consumers see changes.

---

## Generating contract bindings

Bindings in `src/generated/` are produced from the contracts' WASM or deployed contract IDs with the Stellar CLI:

```bash
pnpm sync:bindings            # uses the pinned contracts release in package.json
# or manually:
stellar contract bindings typescript \
  --contract-id <CONTRACT_ID> \
  --network testnet \
  --output-dir src/generated/help_request
```

Rules:

- **Never edit `src/generated/` by hand.** Changes are overwritten.
- Add ergonomic behavior in the wrapper modules (`src/helpRequests/` and so on).
- A contract ABI change means regenerating, updating wrappers, and releasing a matching SDK version.

CI opens an automated PR here whenever a new `contracts` release is tagged.

---

## Testing

| Layer | Tooling | Notes |
|---|---|---|
| Unit | Vitest | Pure logic: amounts, predicates, event decoding, error mapping |
| Integration | Vitest + local Stellar quickstart (Docker) | Creates, claims, and submits for real on a local network |
| Type tests | `tsd` or `expectTypeOf` | Public API types stay stable |

```bash
pnpm test                 # unit
pnpm test:integration     # requires Docker (spins up a local quickstart)
pnpm test:coverage
```

---

## Versioning and releases

- **Semantic versioning.** The SDK major version tracks **contract ABI compatibility**.
- Releases are cut with [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset          # describe your change
pnpm changeset version  # bump versions (maintainers)
pnpm release            # build and publish (CI)
```

- Publishing is done by CI with npm provenance enabled. Never publish from a laptop.
- Pre-release tags: `next` (tracks `main`), `testnet` (matches deployed testnet contracts).

---

## Compatibility matrix

| sdk | contracts | @stellar/stellar-sdk | Node |
|---|---|---|---|
| `0.1.0-testnet` | `v0.1.0-testnet` | `^13.0.0 \|\| ^14.0.0 \|\| ^17.0.0` (check `peerDependencies`) | 20+ |

*(Updated on each release. The `peerDependencies` field in `package.json` is authoritative.)*

---

## Browser and server usage

- **ESM and CJS** builds, **tree-shakeable**, with subpath exports (`@stellar-aid/sdk/giveaways`, `/auth`, `/events`) so the browser bundle stays small.
- `auth.createChallenge` and `verifyChallenge` require **server secrets** and must run only on the server (`api`, or Next.js route handlers in `web`). They are exported from a separate entry point to prevent accidental client bundling.
- The SDK never stores keys and never asks for a secret key. **Signing is always delegated** to the caller (wallet or server signer).

---

## Security notes

- The SDK builds **unsigned** transactions. Users review and sign in their own wallet.
- Validate all user input at the app boundary. The SDK validates addresses, amounts, and dates but cannot judge intent.
- Pin and verify the USDC issuer and contract addresses per network.
- Report vulnerabilities privately. See [SECURITY.md](https://github.com/stellar-aid/.github/blob/main/SECURITY.md).

---

## Contributing

1. Open an issue or comment on an existing one.
2. Branch from `main`. Keep PRs focused.
3. Add tests and a **changeset** (`pnpm changeset`).
4. Run `pnpm lint typecheck test` before pushing.
5. Follow Conventional Commits.

See the org [Contributing guide](https://github.com/stellar-aid/.github/blob/main/CONTRIBUTING.md).

---

## License

MIT. See [LICENSE](./LICENSE).

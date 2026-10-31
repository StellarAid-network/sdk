# Migration Note Template (`@stellar-aid/sdk`)

Copy this template into `CHANGELOG.md` (and your release PR description) whenever releasing a breaking SDK or contract ABI update.

---

## Migrating from `vX.Y.Z` to `vA.B.C`

### Matching `contracts` release

- **Previous contracts tag:** `vX.Y.Z`
- **Target contracts tag:** `vA.B.C`
- **ABI compatibility impact:** `[Additive | Breaking — Function signature | Breaking — Event schema | Breaking — Error code]`

### Summary of breaking changes

1. **`<module>.<method>`**: Explain what changed and why.

### Before / After

```ts
// Before (vX.Y.Z)
// ...

// After (vA.B.C)
// ...
```

### Downstream consumer checklist

- [ ] **`api`**: Regenerate / update indexer handlers if any `StellarAidEvent` variant changed; run `pnpm test` and `pnpm indexer:reconcile`.
- [ ] **`web`**: Update transaction builder calls and error-name branches (`ContractError.name`); run `pnpm typecheck && pnpm test:e2e`.
- [ ] **Deployments**: Run `pnpm sync:deployments` and confirm `src/deployments/testnet.json` (and `mainnet.json`, if applicable) matches `contracts/deployments/`.

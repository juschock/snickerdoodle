# SN Sprint 02 candidate classification

Baseline captured before Sprint 02 edits on branch
`agent/snickerdoodle-stripe-checkout`, parent
`5aaecb0491065d14814970a5ca871b68da484cb1`.

- baseline package version: `1.0.1`
- baseline status SHA-256:
  `b671a772251ce9fdb1dad4c593466b9210ff3618bcb100abf7120970dc84deab`
- baseline tracked working-diff SHA-256:
  `85eb34216e190f0e5a83e255f49ac899f7fc05f69e01aa410e383821038b5273`
- baseline staged-diff SHA-256:
  `1fd3e0768187c9a1393e5665ccc390606ea5f90a18add8bb80d1ecb2bcad0a01`
- accepted Sprint 01 migration SHA-256:
  `b26e7c51ad3a1007181d58960698d8dcd804592c06727244a5b4020ba85323cb`
- accepted Sprint 01 DB harness SHA-256:
  `127291756b697d56417d89374e6402f91b1afdfa4c0ef6acee2bf02f67ed61c0`

The grouped sets below are exhaustive for the baseline status. A later path may
enter the candidate only when this manifest is updated before staging.

## Category A — coherent launch/payment candidate

### Repository, CI, runtime and security configuration

- `.cursor/rules/snickerdoodle-product.mdc`
- `.env.example`
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.gitignore`
- `.gitleaks.toml`
- `.nvmrc`
- `.pre-commit-config.yaml`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `SECURITY.md`
- `eslint.config.mjs`
- `next.config.mjs`
- `playwright.config.ts`
- `playwright.hold.config.ts`
- `proxy.ts`
- `security-headers.mjs`
- `vercel.json`
- `vitest.config.ts`
- tracked deletion of generated `next-env.d.ts`
- `package.json` and `package-lock.json`

### Product application and operational implementation

- every dirty path under `app/**`
- every dirty path under `components/**`
- every dirty path under `lib/**`
- every dirty path under `fulfillment/**`
- every dirty path under `e2e/**` and `e2e-hold/**`
- `scripts/create-brief-access-link.mjs`
- every dirty path under `scripts/db/**`
- every dirty path under `scripts/security/**`
- every dirty path under `supabase/**`, excluding ignored `supabase/.temp/**`
- `supabase/migrations/20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql`
- every dirty path under `tests/**`

### Candidate documentation and controls

- `docs/backend-development-philosophy.md`
- `docs/campaign-families.md`
- `docs/campaign-template-library.md`
- `docs/editor-packet.md`
- `docs/fact-ledger.md`
- `docs/internal-automation-pipeline.md`
- `docs/marketing-plan-zero-budget.md` (accepted Sprint 01 operational wording)
- `docs/operating-doctrine.md`
- `docs/payment-operations.md`
- `docs/production-readiness.md`
- `docs/sample-kit-plan.md`
- `docs/template-taxonomy.md`
- every dirty Markdown path under `docs/studio/**`
- every dirty Markdown path under `docs/customer-readiness/**`, excluding the
  binary artifact classified below
- this classification manifest

### Public-asset cleanup

- `public/icon.svg`
- tracked deletions of `public/apple-icon.png`,
  `public/icon-dark-32x32.png`, `public/icon-light-32x32.png`,
  `public/images/campaign-kit-folder.png`,
  `public/images/campaign-kit-materials.png`,
  `public/images/snickerdoodle-cookies.png`, `public/placeholder-logo.png`,
  `public/placeholder-logo.svg`, `public/placeholder-user.jpg`,
  `public/placeholder.jpg`, and `public/placeholder.svg`

These deletions remain category A only if the frozen build/reference audit
confirms that the effective application no longer uses them.

## Category B — generated/test artifact; never stage

- ignored `node_modules/**`
- ignored `.next/**`
- ignored `.vercel/**`
- ignored `playwright-report/**`
- ignored `test-results/**`
- ignored `supabase/.temp/**`
- ignored `tsconfig.tsbuildinfo`
- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`

The binary predecessor manifest is local generated evidence, not source. It is
preserved byte-for-byte and excluded from the commit.

Its preserved SHA-256 at freeze preparation is
`2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.

## Category C — unrelated campaign workspace; preserve and exclude

- every dirty path under `docs/marketing/**`, including the Canva-reviewed PNG
  and CSV tracking artifacts

The campaign workspace is not needed to build, test, migrate or operate the
local launch/payment candidate. Sprint 02 must not edit, stage or commit it.
The sorted file-and-content fingerprint at freeze preparation is
`f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

## Staging rule

Use an explicit category-A pathspec assembled from this manifest. Never use
`git add .`, `git add -A`, or another repository-wide staging command. After
staging, compare the staged path list against this manifest, run the secret and
generated-artifact scans on the index, and verify that category B/C bytes and
status entries are unchanged.

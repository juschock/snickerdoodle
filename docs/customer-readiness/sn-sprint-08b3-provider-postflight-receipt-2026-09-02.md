# SN Sprint 08B.3 hosted Supabase postflight receipt

Status: **PASS — HOSTED DATABASE CONVERGED / COMMERCIAL HOLD**

Captured: 2026-09-02 UTC

This receipt is secret-free. It contains no customer value, contact value, raw intake content, provider payload, payment identifier, credential, authentication factor, or API key.

## Exact source and target

- Accepted source: Snickerdoodle `1.1.0-rc.3`, branch `agent/snickerdoodle-stripe-checkout`, commit `380cee4bb475b3b9e45b4b580931a4025e2aa816`, tree `2368420fc27b0bfd631b5ac4df7dc67f4e2a22d5`.
- Exact local privacy migration: `20260902064553_implement_privacy_lifecycle_and_retention.sql`, SHA-256 `87f7fd24f87e134ea79d8d4053bdd1c6e50ea324fb1d6effc662c1fcde344cb9`.
- Exact local 21-file migration ledger SHA-256: `3c114fc848f734e09ca20f3fa467c9713f2a7d3238b52f6090507cf1f6d38258`.
- Target only: Supabase project `iybwbnabyphpzlmzypga`, `snickerdoodle-studio`, organization `mrwwseppdikgzvhkvdsl`, `ACTIVE_HEALTHY`, `us-east-2`, PostgreSQL `17.6` (provider build `17.6.1.141`). Operator/session context was `postgres`/`postgres`.
- Existing provider backup observed immediately before DDL: `2026-09-02 09:18:39 UTC`. This proves a physical restore point exists; it does not prove a production restore. Storage objects are excluded and PITR was not credited.

## Preflight and exact application

- Fresh provider ledger was exactly 20 entries; privacy was absent; all expected first 20 entries were unchanged. Canonical provider version/name list SHA-256: `866d026e3116ae11b79926b19a5c8f13837db55a03618495f9c5d7194f7c7506`.
- Historical graph counts were 2 checkout intents, 1 order, 1 Stripe event, 1 webhook receipt, and 2 manager-queue rows. Component hashes matched the prior receipt: intents `a6488c08128a1a30083a383f5d49ed35`, orders `897e260fb994e8e8ad28726091c8e87b`, events `ae8c2d18518a2ada07a08a9f33806ca0`, receipts `75411bc82c003a1fbec2769b1c9da57f`, queue `4ab6fff68e0c77a257769bf4c8a5bc6f`.
- The blocked payload hash remained exactly `48c1040d46ef414f62bbddee70b3f9ed`; the rc.3 field-aware validator accepted every existing governed checkout payload without changing any payload bytes.
- The exact migration bytes were applied once with no provider-side edit, pre-transform, retry, or compensation. Provider mapping: `20260902153801_implement_privacy_lifecycle_and_retention`.
- Post-apply provider ledger is exactly 21 entries. The first 20 remain unchanged; canonical provider 21-entry version/name SHA-256: `6fbde4ef961ffa8f5a140e5b22e190fd29ac0c092b94fa05e3cbb2b52fd4ac51`.

## Data and semantic postflight

- The payload hash remains unchanged and matches exactly once. Its authoritative order/payment/queue graph is unchanged. The only whole-row fingerprint difference is the expected addition of nullable privacy columns; the pre-existing-column intent hash remains `a6488c08128a1a30083a383f5d49ed35` and all four other component hashes remain exact.
- No raw content was copied into privacy operations: requests 0, scopes 0, actions 0, export artifacts 0, privacy audit receipts 0. Five symbolic retention-policy rows exist; all are inactive and zero contain an approved duration.
- Fifteen privacy routines are present; all 15 pin an explicit search path. The validator is field-aware and Luhn-aware. Create-request remains service-role-only; authenticated access is limited to three intentional, internally authorizing privacy RPCs. No destructive privacy request, export, correction, restriction, deletion, or retention action was executed on hosted data.
- Hosted Auth inventory is aggregate-only: 1 Auth user, 1 active owner profile, and 1 verified MFA factor. No identity value was read or recorded.
- Exact-order fulfillment is the sole current close path. Legacy close overloads, singleton capacity table/index, and the obsolete global one-active-order token are absent. Payment and manager-queue definitions match the accepted rc.3 candidate; browser-role DML grants on private/payment-internal tables are 0.

## Normalized schema convergence

- Fresh PostgreSQL 17 dual-path replay passed again from the exact source. Clean rc.3 and faithful hosted-20 predecessor converged to schema-only SHA-256 `01037fb52a4249f3b90ca08d8d01de59bf1ae8bda56f498e6d0e6663ac0e52fa`; historical graph preservation and unchanged-payload detector acceptance passed on both paths.
- A definition-inclusive, extension-normalized catalog comparison matched hosted to local exactly in every category: columns `301/e38301791b85b0602c5a710f4fd71b29`; constraints `186/6061952be7b3491a4d63a04548d39578`; functions `56/97694c2baf753f2e102606fc3f0b2b29`; indexes `95/5cda482e128ce2ac589239a3b20a6590`; policies `11/21a03af7a1979e5ea3897ec53fa78cef`; relations/sequences `35/65dde0af3d1a887ba386b9e8576c8a8f`; triggers `13/e95ded004e9c136620630b02dc016458`. Combined category receipt SHA-256: `eae1694a40494ebbe0d84aaaf8fa52085d31f88a2074c050c6e833a96f3b9182`.
- All 46 hosted SECURITY DEFINER routines pin an explicit search path. `PUBLIC` and `anon` can execute 0; 11 authenticated elevated RPCs are intentional exact candidate boundaries with internal authorization. All public and private application tables have RLS enabled; browser-sensitive DML grants are 0; the explicit application ACL receipt is 24 items, hash `3dc546c45c89bef2927f5c7be8af58a7`.

## Supabase Security Advisor

- Actual post-DDL run: 33 findings = 22 INFO `rls_enabled_no_policy` and 11 WARN `authenticated_security_definer_function_executable`; 0 critical findings.
- The 22 INFO findings are **known non-blocking**: they identify intentionally fail-closed tables with RLS and no direct browser policy.
- The 11 WARN findings are **accepted with reason for this candidate**: each is an intentional authenticated RPC whose exact hosted definition matches the locally adversarially tested action-time authorization boundary. No permissive policy or broader grant was added to suppress the advisor.
- References: [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy); [authenticated SECURITY DEFINER RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Boundary and disposition

- **SN08B.3 PASS; SN08B hosted Supabase migration/convergence work is complete.**
- External changes in this tranche: exactly one authorized hosted Supabase migration transaction. No durable test/customer row, destructive privacy action, restore, Stripe/Vercel/mail/DNS mutation, deployment, push, charge, refund, publication, PrepperGo action, or production promotion occurred.
- Hosted restore rehearsal remains unproven; Stripe sandbox, protected exact-rc.3 Vercel preview, mail authentication/flow, monitoring, legal/financial decisions, and any public promotion remain later gates.
- Frozen exclusions remain outside custody: binary `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`; marketing aggregate `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`; prior partial provider receipt `cd74752d8e3f6041c35dcda9427ff05ae9feb1307f07a6037ff38f8d621154f6`.

# Snickerdoodle closed-state correction packet

Status: **PREPARED / INTERNAL / NOT AUTHORIZED FOR DEPLOYMENT**
Prepared: 2026-08-29
Scope: one truth-safe closed public surface for Snickerdoodle; no commercial opening

## Authorization boundary

Actual-CEO approval of this packet would authorize **only** the exact closed-state correction identified below and its verified closed-state rollback, after every listed preflight and separate external-action gate passes. It would not authorize an offer, price, payment, checkout, intake, customer or prospect data, collaborator participation or access, G5/external acquisition, social or email publication, campaign activity, production database migration, provider reconfiguration, broader deployment, or commercial availability.

This packet itself grants no commit, push, Vercel, Supabase, DNS, payment, analytics, account, publication, or other external authority. No such action occurred while preparing it.

## Exact source and review identity

The deployment source is the exact code/config candidate that existed **before this non-build-input packet was added**:

- whole-candidate fingerprint: `0cddcf66b4780ecb9cea6d8f94957ae422aaa62ccc3f099a64792d0f4cc8ce6f`
- branch: `agent/snickerdoodle-stripe-checkout`
- Git `HEAD`: `5aaecb0491065d14814970a5ca871b68da484cb1`
- origin at preparation time: `https://github.com/juschock/CauseBrief.git`
- dirty-status entries in the frozen source candidate: `120`
- local Vercel link only: project `prj_s5ioDg3l81ogNgZwmOREf3Q7iKQE`, organization `team_eeG1yT8TtHfgdO7JkmiLkYTg`

The whole-candidate fingerprint is:

```sh
set -o pipefail
{ git diff --binary HEAD; while IFS= read -r -d '' f; do printf '%s\0' "$f"; shasum -a 256 "$f"; done < <(git ls-files --others --exclude-standard -z | LC_ALL=C sort -z); } | shasum -a 256
```

The raw `path + NUL` bytes are part of the definition. An `xargs shasum`-only stream is not equivalent.

The exact source candidate received independent whole-candidate PASS reviews, with matching pre/post fingerprints, in:

1. `01a04b44-bfd7-77b2-a667-6b58f17839ce`
2. `01a04b44-c1cd-78d1-8d77-68a611adcd84`
3. `01a04b44-c46c-7f70-b9c0-1f3e259d40b5`

Historical fingerprints `035c8d2708c2be86fdfde6e95c796906d52e360793c3003288edfb4468ed2098`, `1b7e7ed25206f0b0f4da828adb0c548aa8e4b9b7927eb86da5221747ce56379f`, and `4a430976d7bbf869b224458fd68fcf951bf4227412bd0a4530d319d0b0b7901a` are superseded evidence and must not identify a deployment.

The HEAD-relative dirty fingerprint is review identity, not a post-commit artifact hash. The status-independent source-snapshot manifest bound to it contains 157 existing tracked or nonignored files, excludes only this packet, and has SHA-256 `62f1ee8613a436994005728ccc8421871b54b8da2f2839e3401cbc88a4cdf17c`. For each NUL-safe `LC_ALL=C` path-sorted file, its byte stream is `path + NUL + POSIX permission mode + NUL + ordinary shasum record`; nonexistent staged-deletion paths are skipped. This manifest must reproduce after a clean snapshot is materialized even though the HEAD-relative dirty fingerprint necessarily changes after commit.

```sh
set -o pipefail
while IFS= read -r -d '' f; do
  [ "$f" = 'docs/customer-readiness/closed-state-correction-packet.md' ] && continue
  [ -f "$f" ] || continue
  mode=644; [ -x "$f" ] && mode=755
  printf '%s\0%s\0' "$f" "$mode"
  shasum -a 256 "$f"
done < <(git ls-files --cached --others --exclude-standard -z | LC_ALL=C sort -z) | shasum -a 256
```

Because the source is dirty and uncommitted, **do not deploy the current working directory**. A separately authorized release action must first materialize an immutable snapshot that reproduces source-snapshot manifest `62f1ee8613a436994005728ccc8421871b54b8da2f2839e3401cbc88a4cdf17c`, record its mapping back to reviewed dirty fingerprint `0cddcf66b4780ecb9cea6d8f94957ae422aaa62ccc3f099a64792d0f4cc8ce6f`, and receive its own approval. A clean commit, signed archive plus the approved manifest path list, or equivalent immutable snapshot is still required.

## Exact included source/config hashes

Each directory aggregate below is calculated by sorting every current file path under that directory with `LC_ALL=C`, then emitting `path + NUL + ordinary shasum record` for each file and hashing the resulting byte stream.

| Included build input | SHA-256 | Count |
| --- | --- | ---: |
| `app/` | `0cdd00b6998ff429887adda3cf188284af249bd799887d73a1c96790d9c14d30` | 21 |
| `components/` | `3ee08da2ed8d33dbe8992310bd73b1b57e0c42234cd6760a04bfeaa4e5fc48ec` | 23 |
| `lib/` | `60b793130e920a1272bda44faf0da09f4c00624b8813ad403615988ed99ddb63` | 16 |
| `public/` | `c144736c7bb09f43495aaa1b5edf9331d60601fb0ad29842a10975d471ffc88d` | 1 |

The composite 72-file deploy-input manifest comprises those four directories plus the 11 root files below. Using the same `path + NUL + ordinary shasum record` formula, its SHA-256 is `83dcca3a8565ace15d35e4e452e03e339e6e008aff0ae481f9a0d99866af9ed7`.

```sh
{
  printf '%s\n' .nvmrc .env.example package.json package-lock.json next.config.mjs vercel.json proxy.ts security-headers.mjs tsconfig.json postcss.config.mjs components.json
  rg --files app components lib public
} | LC_ALL=C sort -u | while IFS= read -r f; do
  printf '%s\0' "$f"
  shasum -a 256 "$f"
done | shasum -a 256
```

Exact root file hashes:

| File | SHA-256 |
| --- | --- |
| `.nvmrc` | `f14b4987904bcb5814e4459a057ed4d20f58a633152288a761214dcd28780b56` |
| `.env.example` | `bf411c3da26d4aa1c0e3c0ac3cb80ed1983a4a19fc343c3b2a32eab39273b6dc` |
| `package.json` | `d23ad64f16f6c068108c0dabebc85369ba3f322cf43ba83b77a1c74d3d55231b` |
| `package-lock.json` | `e1c655171abb7e95acfce2cc9516a87e781dcde7da3e1bb60af2c42cf3c8243a` |
| `next.config.mjs` | `d162948f3018a9dc5ac0e3bb44faeb5fa4ea667ecad4d0312436c2eb99b6e3ea` |
| `vercel.json` | `3136e628999395003b5f2a96d467fe4323c8fe2be9fb7436f21c3abc54c73c48` |
| `proxy.ts` | `5f209f3d36861e591498c023f36fa229db07b8eb7b25bdb3dd925b88d9f8fcc8` |
| `security-headers.mjs` | `33aa673e201fabd545a5016b552374821276f2d382d7e7ca30025767e2631c72` |
| `tsconfig.json` | `86c57aa7eec3e819fc7f5f7075219d9383d4ce824b751816636e581170b7cc97` |
| `postcss.config.mjs` | `54b5708e687b8c9ecc8dbeebf29801dbec1213f890c5e018d7ca9c1541a6f7e3` |
| `components.json` | `1301860ec7b710eaa7455957545ee4e756e361215cb29cc4cce2192eb47e45fb` |

Test/evidence aggregates, using the same directory formula:

| Evidence set | SHA-256 | Count |
| --- | --- | ---: |
| `tests/` | `03a227dc2b0830c3fbfaaced3f777ee781dd81e9a8d099af9bc1fc31e6b5d1d3` | 11 |
| `e2e/` | `7afac62ef9d1be85f440187346135979b3cab9dbb639b70e27f9a7dc45720721` | 1 |
| `e2e-hold/` | `3d8fe058012742733f34b75b16d81fc52b794b2dd1928c6836ec9e2b934cb1f4` | 1 |

No source set includes this packet. Adding the packet does not change the deploy build, but it does change the live working-tree fingerprint; that successor workspace identity is not a substitute for the deployment-source identity above.

## Local build evidence and limitations

- Node: `v22.23.2`
- npm: `10.9.8`
- Next.js: `16.3.3`
- build command: `npm run build` → `next build --webpack`
- result: 20 generated application entries, no build error
- local Next build ID: `H0QsY0IIuQ-rG1iMFcLka`
- local `.next/BUILD_ID` hash: `8f0f3febc57421f6231d7291eda2cc5761302b9d45c9f1a2aa36bf7387d71943`

Selected build-manifest hashes:

| Artifact | SHA-256 |
| --- | --- |
| `.next/build-manifest.json` | `6b3fc66d517143f8f86fb68c461db89a8b11c4aa82b57e68560debd568290e33` |
| `.next/routes-manifest.json` | `f7e687d94c1a1386554527dec514a9e75516a1ac15af30129ccb410f4c2dd0db` |
| `.next/prerender-manifest.json` | `dfa5859168ae329c0e472b64e9dbe0ce6f3e7f73c324e1ad73f337ef8882df59` |
| `.next/required-server-files.json` | `d4675dabeab13fc9fb869b55e72ac94295b6e2067c48c77937b8fd0431d8b18b` |
| `.next/server/app-paths-manifest.json` | `35c14b89b2292cca90d11e9d12e7debe630a5f0b35474959a7d05a3efb82fdc1` |

These selected files are stable point-in-time local evidence; the mutable `.next` tree is not used as an aggregate release identity because local start/dev tooling may add trace files. This is not a deployable archive or Vercel identity. A Vercel build may have a different build ID even when source-equivalent. Only the later hashed `.vercel/output` prebuilt artifact, immutable unaliased validation deployment ID, exact source snapshot, environment preflight, and hosted read-back may identify the artifact eligible for promotion.

## Runtime, base-path, and Vercel assumptions

1. `package.json` requires Node `22.x`; `.nvmrc` resolves locally to `22.23.2`. Hosted Node selection and the actual Vercel runtime remain unverified and must be read back before promotion.
2. The Next application owns `basePath: '/snickerdoodle'`.
3. The bare project root `/` is redirected by `proxy.ts` to `/snickerdoodle` with status 307 and security headers. `vercel.json` intentionally has no redirect that could bypass the proxy.
4. The canonical public URLs are under `https://racoben.com/snickerdoodle`. The parent Racoben project is assumed to proxy that prefix to this project. That parent rewrite, alias, and revision are not verified here.
5. `images.unoptimized` is intentional. The public artifact inventory is one SVG icon; no audio, video, customer image, or AI-generated marketing image is part of this correction.
6. `vercel.json` uses `npm ci` and `npm run build`. An action-time process must pin the CLI/toolchain rather than use an unbounded latest CLI.
7. The local `.vercel/project.json` is link evidence only and must not be committed. No provider setting was read or changed.

## Required exact closed environment

Every commercial gate must be missing or exactly `false`; for an exact correction deployment, record all eight as exactly `false` in the action-time redacted environment manifest:

```text
SNICKERDOODLE_COMMERCIAL_READY=false
SNICKERDOODLE_OFFER_APPROVED=false
SNICKERDOODLE_FULFILLMENT_READY=false
SNICKERDOODLE_REVIEWER_READY=false
SNICKERDOODLE_LEGAL_APPROVED=false
SNICKERDOODLE_PAYMENTS_READY=false
SNICKERDOODLE_G5_ASSIGNED=false
SNICKERDOODLE_MONETARY_APPROVED=false
SNICKERDOODLE_PAYMENTS_ENABLED=false
```

`NEXT_PUBLIC_SNICKERDOODLE_EMAIL` must be unset or exactly `snickerdoodle@racoben.com` for this reviewed copy. `CHECKOUT_SECURITY_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are neither needed nor authorized for the closed correction; their presence gives no permission and must not cause a provider call. Environment names and truth states may be recorded, but secret values must never enter the packet or logs.

Any true, alternate, absent-when-required, unreviewed, or contradictory value is a stop. No environment flag grants a business approval.

## Public route and copy inventory

| Route | Exact closed treatment | Promotion assertion |
| --- | --- | --- |
| Direct Snickerdoodle deployment root `/` (not the parent `racoben.com/` root) | Proxy redirect to `/snickerdoodle`; no public content at the direct project root | Exactly one 307; resolve the raw absolute-or-relative `Location` against the request URL and require the resolved URL to have the request origin, exact pathname `/snickerdoodle`, and no query or fragment; shared CSP/HSTS/frame/nosniff headers; no redirect loop; verify on both immutable unaliased deployments and the post-promotion direct project alias if one exists |
| `/snickerdoodle` | Product-readiness hold; not accepting orders; fictional samples only; no offer, intake, payment, capacity, or fulfillment | 200; hold heading and disclaimer visible; no `$99`, 48-hour, fit-check, intake, order, or human-review CTA |
| `/snickerdoodle/samples` | Three clearly labeled fictional sample packages for product evaluation | 200; fictional/not customer work/not offer/not capacity language visible |
| `/snickerdoodle/samples/{adoption-event,year-end-appeal,restaurant-local-discovery}` | Fictional detail with no customer/result claim and no service CTA | 200; fictional disclaimer; no real-customer attribution |
| `/snickerdoodle/faq` | Closed-state FAQ: orders, intake, payment, capacity, and fulfillment unavailable | 200; no commercial FAQ branch |
| `/snickerdoodle/privacy` | Closed privacy branch: no private intake/checkout; product-question email and minimal technical analytics disclosure | 200; no claim that campaign data is currently accepted |
| `/snickerdoodle/terms` | Closed terms branch: no work, order, payment, private intake, capacity reservation, or fulfillment commitment | 200; no `$99`, turnaround, revision, or current-service terms |
| `/snickerdoodle/brief` | Same commercial-hold surface; fragment cleaned client-side; no form or token exchange | 200; fragment removed; no form controls; `noindex`, `no-referrer`, `no-store` |
| `/snickerdoodle/brief/received` | Same commercial-hold surface | 200; no receipt/fulfillment implication in closed mode; `noindex` |
| `/snickerdoodle/checkout/success` | “Payments are not part of this release”; no session lookup | 200; `noindex`; no success/order assertion |
| `/snickerdoodle/checkout/cancel` | “Payments are not part of this release”; no payment attempt | 200; `noindex` |
| `/snickerdoodle/robots.txt` | Allows public evaluation pages; disallows brief and checkout prefixes | 200; brief absent from sitemap |
| `/snickerdoodle/sitemap.xml` | Home, FAQ, privacy, terms, sample index, and three fictional sample routes only | 200; no brief/checkout/API route |
| `/snickerdoodle/not-a-real-page` | Product-specific 404 | 404; no commercial CTA |

### Stale claim disposition

The closed correction uses explicit runtime unavailability rather than deleting the dormant future-commercial components:

- **Price (`$99`)**: not rendered on closed home, FAQ, privacy, or terms; checkout is unavailable.
- **Turnaround (`48 hours`)**: not rendered on closed public/legal routes.
- **Human review**: not presented as a currently available service in closed public output.
- **Fit check/private intake**: no public fit-check or brief link; direct `/brief` renders hold and strips fragments without exchanging them.
- **Capacity/fulfillment**: explicitly unavailable; fictional samples are not evidence of capacity.
- **Offer/order**: explicitly unavailable; asking a product question creates no order or reservation.
- **Payment**: no SDK/runtime; compatibility endpoints remain unconditional no-store 503 responses; success/cancel pages make no lookup.

Commercial components and conditional legal copy remain dormant source, not approved claims. Turning every commercial gate true would expose them and is outside this packet. Any hosted appearance of price, turnaround, available human review, fit-check/intake, capacity, offer/order, or payment is a failed correction and triggers rollback.

## Closed/private API contract

| Method and route | Required closed response |
| --- | --- |
| `POST /snickerdoodle/api/checkout` | 503 JSON `{ "error": "Checkout is unavailable." }`; `Cache-Control: no-store`; no environment/provider/data access |
| `POST /snickerdoodle/api/stripe/webhook` | 503 JSON `{ "error": "Payments are not part of this release." }`; `Cache-Control: no-store`; no signature parsing/provider/data access |
| `POST /snickerdoodle/api/brief-access` | 503 JSON `{ "error": "Private intake is not available." }`; `Cache-Control: no-store`; reject before body/token/provider handling |
| `POST /snickerdoodle/api/brief` | 503 same private-intake error and no-store; reject before body/origin/rate-limit/database handling |
| `GET/HEAD /snickerdoodle/api/health` | 200; no-store; GET body exactly `{ "status": "ok", "service": "snickerdoodle" }` |

The health route is shallow application liveness only. It does not prove environment truth, dependency readiness, database state, source revision, or payment/intake readiness. The hosted route matrix, deployment identity, and environment read-back below are mandatory companions.

## Capability-fragment and privacy boundary

- The closed `/brief` page mounts `BriefFragmentCleanup`; any hash fragment, including `#access=...`, is removed with `history.replaceState` and is not sent to an API.
- When commercial mode is closed, no invite token is validated, exchanged, persisted, or logged; no form is rendered.
- `/brief`, `/api/brief`, and `/api/brief-access` use no-store/no-referrer treatment.
- Vercel Analytics is pageview-only in this candidate. Its `beforeSend` filter drops every brief-path event and any URL containing an `access` query or fragment, then strips all remaining query strings and fragments.
- No custom Vercel event tracking, ad pixel, session replay, audio, video, customer image, or customer-data analytics is part of this correction.
- Public mailto actions include the product-question link, footer site-support link, and the terms/privacy contact links. They resolve to the same reviewed public address in this candidate. None is campaign intake, an order, a capacity reservation, or consent for marketing automation. Verified inbox ownership and privacy/support handling are promotion prerequisites.

## Verification evidence

| Discipline | Exact local evidence | Residual/hosted gate |
| --- | --- | --- |
| Technical | Node 22.23.2 default build passed; 20 application entries; typecheck and lint passed; 11 test files/45 tests passed | Hosted Node/project/root/parent rewrite and deployment read-back remain unproven |
| Claims | Closed E2E verifies hold copy and absence of `$99`, 48-hour, fit-check link, brief link, and commercial terms/FAQ copy | Hosted HTML, metadata, cache, aliases, and search/social previews must be checked |
| Legal | Closed terms/privacy branches deny current offer, intake, payment, capacity, and fulfillment | Counsel/owner legal acceptance, retention/deletion ownership, and live contact handling remain HOLD |
| Security | Security headers, 503/no-store APIs, no payment/AI/upload SDK path, secret scan, dependency audits/signatures, and private-fragment cleanup passed locally | Hosted headers, function runtime, provider configuration, logs, aliases, leaked-password setting, and incident ownership remain HOLD |
| Accessibility | Closed home, brief, and samples passed automated WCAG A/AA/2.1-AA axe checks | Automated checks are not full accessibility review; hosted keyboard/screen-reader/manual checks remain HOLD |
| Mobile | Responsive components and the gate-true 390×844 flow passed without horizontal overflow in the reviewed cross-matrix | A closed-state hosted 390×844 overflow/navigation check is required before promotion |
| Analytics/privacy | Private-path suppression and query/fragment stripping are unit-tested; closed brief does no data handling | Hosted Analytics configuration, actual request/log behavior, retention, and provider read-back remain HOLD |

The final local closed build was tested with `npm run test:e2e:hold:built`: 3/3 passed. An initial sandbox-only server bind returned `EPERM`; the identical built artifact passed when local port binding was allowed. This is not hosted evidence.

## Immutable validation preview, promotion, and rollback identity

All fields in this subsection are blocking placeholders until a separately authorized action-time Vercel window. Never infer or prefill them.

```text
IMMUTABLE_SOURCE_SNAPSHOT_ID=UNASSIGNED
SOURCE_SNAPSHOT_CONTENT_SHA256=62f1ee8613a436994005728ccc8421871b54b8da2f2839e3401cbc88a4cdf17c
DEPLOY_INPUT_CONTENT_SHA256=83dcca3a8565ace15d35e4e452e03e339e6e008aff0ae481f9a0d99866af9ed7
VERCEL_CLI_VERSION=UNASSIGNED_MUST_BE_PINNED_AND_REVIEWED
VERCEL_PROJECT_ROOT=UNASSIGNED_MUST_EQUAL_DOT
IMMUTABLE_SOURCE_ROOT_REALPATH=UNASSIGNED
BUILD_OUTPUT_SCHEMA_VALIDATOR_SHA256=UNASSIGNED_MUST_MATCH_PINNED_CLI_AND_OFFICIAL_CONTRACT
BUILD_OUTPUT_SCHEMA_VALIDATION_RECEIPT_SHA256=UNASSIGNED
VERCEL_PREBUILT_OUTPUT_SHA256=UNASSIGNED
PRIMARY_CLOSED_VALIDATION_DEPLOYMENT_ID=UNASSIGNED
PRIMARY_CLOSED_VALIDATION_URL=UNASSIGNED
VERIFIED_CLOSED_ROLLBACK_DEPLOYMENT_ID=UNASSIGNED
VERIFIED_CLOSED_ROLLBACK_URL=UNASSIGNED
PRE_CHANGE_PRODUCTION_DEPLOYMENT_ID=UNVERIFIED_STALE_DO_NOT_ROLL_BACK_TO_BY_DEFAULT
PRODUCTION_ALIAS_REVISION_AFTER_PROMOTION=UNASSIGNED
HOSTED_POSTFLIGHT_BODY_MANIFEST_SHA256=UNASSIGNED
```

Required sequence after separate authorization:

1. Freeze an immutable source snapshot. Recompute the 157-file path/mode/content manifest as exactly `62f1ee8613a436994005728ccc8421871b54b8da2f2839e3401cbc88a4cdf17c` and the 72-file deploy-input manifest as exactly `83dcca3a8565ace15d35e4e452e03e339e6e008aff0ae481f9a0d99866af9ed7`; record that both map to reviewed dirty fingerprint `0cddcf66b4780ecb9cea6d8f94957ae422aaa62ccc3f099a64792d0f4cc8ce6f`. Stop if any differs.
2. Read-only capture the current production deployment/alias and parent rewrite. Treat the currently reported stale commercial deployment as unsafe; do not make it the default rollback target.
3. Pin and record one reviewed Vercel CLI version and one complete schema validator bound to that CLI version and the official Build Output API contract, then pull only the exact approved production-target project/environment metadata. Read back and record the provider project ID and configured project root. Stop unless the configured project root is exactly repository root (`.` or provider `null` with documented `.` semantics), the CLI working directory is the immutable source root realpath, and every closed-state value matches this packet. A nested, ambiguous, unavailable, or changed project root is a packet reset, not an operator choice. Record gate names/truth states without secret values. The `--skip-domain` syntax below was verified locally against Vercel CLI `41.1.4`, but that observation does not select or authorize the action-time version.
4. From that exact immutable source-root working directory, with the pinned CLI and exact approved production-target metadata, run the local certification and then `vercel build --prod` once. Before hashing or deployment, validate `.vercel/output/config.json` and every `.vc-config.json` against the complete pinned schemas, including every present optional field and the selected CLI's supported runtime identifiers. Record the validator hash plus a path/config-content-hash/validator-result receipt, and obtain three independent exact-receipt PASS reviews. Any schema error, unsupported runtime, missing validator, validator drift, or fewer than three PASS reviews is a stop. Then set `SNICKERDOODLE_IMMUTABLE_SOURCE_ROOT_REALPATH` to the recorded canonical absolute source root and `SNICKERDOODLE_VERCEL_PROJECT_ROOT` to literal `.` for every manifest invocation. Run the exact serialization-boundary script below. It fails unless its current directory is the recorded immutable source root and the approved project root is literal `.`, so the hashed `.vercel/output` is the same output location the reviewed CLI will deploy. It requires `.vercel` and `.vercel/output` themselves to be real directories, rejects every descendant symlink and other non-directory/non-regular entry, rejects regular-file modes other than `0644` or `0755`, applies the enumerated minimum structural config checks, and rejects every present `.vc-config.json` `filePathMap` except an empty plain object. It then hashes every permitted deploy-consumed file path, full canonical mode, and content digest. Record its file count and `VERCEL_PREBUILT_OUTPUT_SHA256`. Extract the root/function config path-and-content-hash subset from this exact manifest and require exact set equality with the three-PASS schema receipt. Recompute both the full manifest and that equality from the same working directory immediately before and after each deployment; any content, path, count, validator, receipt, or set-binding drift is a stop/reset. Do not search for or select another `.vercel/output`; any metadata or CLI behavior that resolves a different output root is a stop/reset.
5. Deploy that one exact production-target `.vercel/output` artifact twice using `vercel deploy --prebuilt --prod --skip-domain --force`: once for the immutable primary validation deployment and once for the immutable closed rollback deployment. The selected CLI's `--force` behavior must be reviewed to guarantee a new deployment; `--skip-domain` is mandatory so neither deployment automatically receives production domains. Do not rebuild between them.
6. Verify both unaliased production-target deployment IDs and immutable URLs independently with the complete hosted checklist and body manifest. They must be `READY`, share the exact prebuilt-output hash, render the same closed behavior, and have unequal deployment IDs and URLs. Equality is a stop because it would not provide an independent rollback identity.
7. Promote the exact primary unaliased validation deployment ID; do not issue a fresh production rebuild.
8. Verify the production alias and the Racoben parent canonical path against the same checklist.
9. If any postflight fails, promote the already verified unaliased closed rollback deployment. Do **not** roll back to the stale commercial build merely because it was previous.
10. Re-run the closed checklist after rollback and record the resulting alias/deployment identity.

No step may use a mutable URL or branch name as artifact identity. Deployment ID, exact source snapshot, environment manifest, and hosted body manifest must agree.

The action-time `.vercel/output` manifest command is:

```sh
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const expectedSourceRoot = process.env.SNICKERDOODLE_IMMUTABLE_SOURCE_ROOT_REALPATH;
const projectRoot = process.env.SNICKERDOODLE_VERCEL_PROJECT_ROOT;
if (!expectedSourceRoot || !isAbsolute(expectedSourceRoot)) {
  throw new Error('missing canonical immutable source root');
}
if (projectRoot !== '.') throw new Error(`approved Vercel project root must be literal dot, got: ${projectRoot}`);
const sourceRoot = realpathSync('.');
if (sourceRoot !== realpathSync(expectedSourceRoot)) {
  throw new Error(`wrong manifest working directory: ${sourceRoot}`);
}
const vercelRoot = resolve(sourceRoot, projectRoot, '.vercel');
const root = resolve(sourceRoot, projectRoot, '.vercel/output');
const files = [];
for (const directory of [vercelRoot, root]) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`prebuilt root must be a real directory: ${directory}`);
  }
}
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!stat.isFile()) throw new Error(`unsupported prebuilt entry: ${absolute}`);
    const mode = (stat.mode & 0o7777).toString(8).padStart(4, '0');
    if (mode !== '0644' && mode !== '0755') throw new Error(`noncanonical mode ${mode}: ${absolute}`);
    const path = relative(sourceRoot, absolute).split(sep).join('/');
    const content = readFileSync(absolute);
    if (path === '.vercel/output/config.json') {
      const outputConfig = JSON.parse(content.toString('utf8'));
      if (
        outputConfig == null ||
        typeof outputConfig !== 'object' ||
        Array.isArray(outputConfig) ||
        outputConfig.version !== 3
      ) {
        throw new Error(`malformed Build Output API config: ${absolute}`);
      }
    }
    if (name === '.vc-config.json') {
      const config = JSON.parse(content.toString('utf8'));
      if (
        config == null ||
        typeof config !== 'object' ||
        Array.isArray(config) ||
        Object.keys(config).length === 0 ||
        typeof config.runtime !== 'string' ||
        config.runtime.trim() === ''
      ) {
        throw new Error(`malformed Vercel Function config: ${absolute}`);
      }
      const entryKey = config.runtime === 'edge' ? 'entrypoint' : 'handler';
      const entry = config[entryKey];
      if (typeof entry !== 'string' || entry.trim() === '' || isAbsolute(entry)) {
        throw new Error(`invalid ${entryKey} in Vercel Function config: ${absolute}`);
      }
      const configDirectory = dirname(absolute);
      const entryAbsolute = resolve(configDirectory, entry);
      const entryRelative = relative(configDirectory, entryAbsolute);
      if (entryRelative === '..' || entryRelative.startsWith(`..${sep}`) || isAbsolute(entryRelative)) {
        throw new Error(`escaping ${entryKey} in Vercel Function config: ${absolute}`);
      }
      const entryStat = lstatSync(entryAbsolute);
      if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
        throw new Error(`invalid ${entryKey} target in Vercel Function config: ${absolute}`);
      }
      if (Object.hasOwn(config, 'filePathMap')) {
        if (
          config.filePathMap == null ||
          typeof config.filePathMap !== 'object' ||
          Array.isArray(config.filePathMap) ||
          Object.keys(config.filePathMap).length > 0
        ) {
          throw new Error(`external prebuilt filePathMap is unsupported: ${absolute}`);
        }
      }
    }
    const contentHash = createHash('sha256').update(content).digest('hex');
    files.push([path, mode, contentHash]);
  }
}
walk(root);
if (!files.some(([path]) => path === '.vercel/output/config.json')) {
  throw new Error('missing .vercel/output/config.json');
}
files.sort((a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0])));
const manifest = `${files.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
console.log(createHash('sha256').update(manifest).digest('hex'), files.length);
NODE
```

The printed count and hash are one identity. This embedded script is a serialization-boundary checker, not the complete pinned schema validator required above. It rejects a symlinked root, descendant symlink, socket, FIFO, device, other special entry, noncanonical regular-file mode, missing/non-object/non-v3 root config, non-object/array/empty function config, missing or empty runtime, missing/empty/absolute/escaping/missing/symlinked/non-file handler or edge entrypoint, malformed JSON, and every present `filePathMap` except an empty plain object. The separate complete schema gate rejects unsupported runtimes and invalid optional or nested fields. Supporting a rejected entry, weakening either validator, or changing their division of responsibility requires a new serialization design and fresh packet review.

## Hosted post-deploy fingerprint and checklist

The action-time operator must produce a redacted, append-only receipt containing:

- Vercel deployment ID, immutable unaliased validation URL, status `READY`, framework, Node/runtime evidence, project ID, source snapshot/commit/archive ID, and build timestamp;
- the exact redacted environment-name/truth-state manifest;
- the direct Snickerdoodle deployment root `/` on both unaliased closed deployments and the post-promotion direct project alias if one exists: exactly one 307; resolve the raw absolute-or-relative `Location` against the request URL and require the resolved URL to have the request origin, exact pathname `/snickerdoodle`, and no query or fragment; shared CSP/HSTS/frame/nosniff headers; no redirect loop; this assertion does not apply to the parent `racoben.com/` root;
- HTTP status, redirect chain, canonical URL, `Cache-Control`, CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, and referrer policy for every public/private route above;
- SHA-256 of each final response body for home, FAQ, privacy, terms, sample index, three samples, brief, brief-received, checkout success/cancel, robots, sitemap, health, and 404;
- JSON bodies/statuses for all four closed POST endpoints and GET/HEAD health;
- browser proof that `#access=synthetic-nonsecret` is removed without an API exchange, cookie, form, analytics event, or retained URL fragment;
- DOM/text assertions that no stale price, turnaround, currently available human review, fit-check/intake, capacity, offer/order, or payment claim is present;
- canonical and Open Graph URLs at `https://racoben.com/snickerdoodle...` and verification through both the direct immutable validation URL and parent production route;
- desktop plus 390×844 mobile screenshots or DOM measurements, menu/keyboard checks, and fresh axe A/AA results;
- analytics/network/log inspection showing no private-path/query/fragment event and no Supabase, payment, AI, intake, or database-provider call; the only allowlisted provider transport is a scrubbed public Vercel Analytics pageview with no query or fragment;
- production alias identity before/after promotion and after any rollback.

Raw secrets, real capability tokens, personal data, customer/prospect data, and provider credentials must never enter this receipt. Use only synthetic nonsecret fragments and empty request bodies.

## Stop and reset rules

Stop before promotion, or roll back after promotion, on any of the following:

- source-snapshot manifest, deploy-input manifest, pinned file hash, Vercel prebuilt-output hash, schema-validator hash, schema-receipt hash, reviewed config path/content-hash set, config-set-to-prebuilt-manifest binding, prebuilt entry type/mode/filePathMap scope, package lock, Node major, Next version, base path, project/root, or security-header drift;
- any edit to this packet after its own exact review, or any edit to the deployment source after its three whole-candidate PASS reviews;
- fewer than three independent PASS reviews for the exact operational packet/version being used;
- any commercial/payment gate not exactly false, an unreviewed public email identity, or an unexpected secret/provider binding;
- inability to name and verify unequal primary and closed rollback deployment IDs/URLs before production promotion;
- a rebuild between verified validation and production instead of promotion of the same immutable deployment;
- any stale price, turnaround, human-review availability, fit-check/intake, capacity, offer/order, payment, or customer-result claim;
- any non-503 closed POST endpoint, request-body/token processing while closed, session/payment lookup, Supabase/payment/AI/intake/database-provider request, unexpected analytics request, or customer-data path;
- failure to strip a capability fragment, a private-path/query/fragment analytics event, unexpected cookie, cacheable private response, or missing noindex/no-referrer rule;
- health, canonical path, parent rewrite, alias, security header, accessibility, mobile, 404, robots, sitemap, or body-manifest mismatch;
- missing rollback authority/operator, incomplete incident receipt, or any request to broaden the action into offer, payment, intake, data, collaborator, G5, campaign, publication, database, DNS, or provider work.

A material source change creates a new whole-candidate fingerprint, source-snapshot manifest, and deploy-input manifest and resets its three-review set from zero. A packet edit creates a new packet hash and resets the packet review set from zero. A provider/build/environment change invalidates the Vercel prebuilt-output hash and validation evidence even if source content is unchanged.

## Current blockers and external actions avoided

This packet is not yet actionable because immutable source snapshot, Vercel runtime/environment read-back, primary unaliased validation ID, verified closed rollback ID, current production deployment ID, parent rewrite identity, hosted body manifest, action-time operator, and deployment/rollback authority are all unassigned or unverified. The source remains dirty and uncommitted; the GitHub origin still uses the historical `CauseBrief` name.

No Vercel, Supabase, DNS, GitHub, payment, analytics, email, social, Canva, customer, collaborator, or other external system was accessed or mutated. No commit, push, deployment, publication, account change, spend, real token, or real/customer data was used.

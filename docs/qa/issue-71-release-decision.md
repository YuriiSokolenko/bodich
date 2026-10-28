# Stage 20F — informational release decision and evidence package (#71)

Parent: [Stage 20 launch epic #60](https://github.com/YuriiSokolenko/bodich/issues/60). Related: #66 (rights), #67 (legal), #68 (native Romanian), #69 (real-device QA), #70 (Cloudflare/security), #59 (genuine products, **not a dependency** for an informational-only site).

**Current status: NO-GO, unsigned policy default.** This repository has **no verified named BODICH release authority**, no signed legal/rights/native-RO/QA/security approvals, no verified Cloudflare production owner/domain, and no frozen candidate with a proven live rollback. A passing build, merged PR, reviewer comment, CI artifact or this record **does not authorize publication**. Proposed 2026-11-12 is only an unaccepted planning target.

## Evidence and decision format

The checked-in [decision matrix](issue-71-release-decision.json) is intentionally **NO_GO / POLICY_DEFAULT** with eight explicit **BLOCKED** gates, actionable remediations and no invented names, signatures or hashes. It is not a forged signed NO-GO. Each gate has:

- `id`, linked issue number, `status` (`PASS` / `BLOCKED` / `N_A`), reason, actual owner and independent reviewer, review date, evidence reference, exact 40-hex git commit SHA and 64-hex dist-manifest digest.
- Required coverage: complete release assets/rights (#66); legal operator/privacy (#67); rendered native Romanian/EN-RO (#68); physical-device/browser/WCAG 2.2 AA and performance (#69); CI/live security (#70); zero private drafts/products/commerce in **actual dist** (#70); domain, Cloudflare account, rollback and ownership (#70); frozen candidate (#71).
- Any `BLOCKED`, `N_A`, partial approval or unknown means **NO-GO**. `N_A` is documented only to explain why a check cannot be used, **never** to waive a required GO gate. Each non-passing gate must have an actionable remediation entry; do not silently drop blocked rows.
- Evidence pointers must be non-secret GitHub issue/PR/Actions refs or opaque `restricted:` IDs for documents stored in an authorized off-repository system. Never commit private evidence documents, signatures, personal data, account credentials or 132 supplier drafts. The validator only checks reference **shape**, not that a person, right or document is genuine.

For an attributable **human-signed NO-GO** or **GO**, collect actual signatory name, accountable role, dated signature record in controlled storage, and the **exact** candidate commit/digest. Every passing gate needs its own dated owner/reviewer decision linked to those exact identifiers. Every PASS requires a **different independent reviewer** from that gate's owner (names are normalized for Unicode/whitespace/case); the final decision authority also **cannot** self-review a gate. A gate review date after the final signature date is rejected (gate dates have day precision). Only the real authorized BODICH operator can issue the final decision. Legal counsel, rights-owner/reviewer, native Romanian reviewer, QA/accessibility lead and deployment/security reviewer must independently confirm their own scopes. An operator signature does not substitute for them.

## Candidate and machine verification

On the final *release-safe*, clean, pinned commit (Node 24), run `npm ci`, `npm audit --audit-level=high`, `npm run check`, `npm run pages:self-test`, `npm run build`, `npm run pages:verify`, `npm run catalog:products:dist`, `npm run catalog:reconcile:routes`, `npm run seo:routes`, `npm run media:public` and `npm run assets:release`. Require the same green source+dist Gitleaks scans, pinned build and non-root smoke checks in the **Pages release security** workflow. A beta presentation build is not a release candidate.

Then run:

```sh
npm run release:decision:check
npm run release:decision:self-test
npm run release:decision:verify
```

The last command re-hashes **every regular file** in dist, rejects symlinks, and checks the Pages leak/allow-list and asset-rights reports against the same files. The canonical `distManifestSha256` is SHA-256 of the UTF-8 JSON serialization of the sorted array of `{pathSha256,sha256,bytes}` records, with file paths hashed, sorted by **UTF-16 codepoint ordering** (not locale/ICU) to match the Pages producer. It is a content identity, not a Cloudflare deployment ID or proof of rights. It is printed locally by the verification command. For human GO, the validator independently runs `git rev-parse --verify HEAD` and `git status --porcelain --untracked-files=all` from this repository: the verified checkout must be the exact signed SHA, be the correct repository root and have **no tracked modifications or untracked files** (ignored build artifacts do not count). Record the exact source SHA and dist manifest digest in the human-controlled decision; the source check complements but cannot prove that a particular external build was actually produced by that source. Preserve the raw CI run URL, job conclusion, execution date, signed evidence refs, the candidate artifact and its SHA outside any public build; short-retention GitHub artifacts are not permanent evidence.

For the final authorization check **after independent signed reviews**, keep the finalized decision record *outside the candidate repository* to avoid the impossible self-referential problem of committing a document that contains its own commit SHA. For example, on an authorized controlled workstation:

```sh
node scripts/verify-release-decision.mjs --decision=/private/approved-release-decision.json --verify-dist --require-go --candidate-sha=<exact-40-hex-candidate-commit>
```

This command **fails closed** on any missing gate, N/A, signature, dirty/wrong Git checkout, mismatched commit or content hash, gate reviews dated after the signature, missing immutable prior build, missing domain/account/deployment owner, expired deployment window, future-dated human review or incomplete rollback/post-release plan. Release decision signing accepts canonical UTC `Z` timestamps with whole seconds or exactly three decimal places; blocked explanations may legitimately mention pending work. The protected supplier draft count is cross-checked between the Pages release policy and the 132-record source inventory. It never deploys or changes DNS, Cloudflare settings, sitemap, robots or redirects. In GitHub CI the committed NO-GO record is tested and independently checked against the generated dist; **NO-GO is an expected successful audit state**, not a passing release authorization. Never wire the ordinary CI checks directly to production promotion.

## Manual Cloudflare and launch controls

Before even considering GO, the authorized domain and Cloudflare account/project owner must approve site access, production release window in UTC, actual named deploy operator, exact previous **successful production** Cloudflare deployment ID, previous immutable build SHA-256, a witnessed rollback rehearsal and a concrete post-release checklist. Capture real preview URL/project ID, observed HTTP status/CSP/headers and cache behavior, and browser inspection in an access-controlled evidence record; static checks cannot certify hosting. Cloudflare preview deployments are **not** rollback targets. See [Cloudflare Pages runbook](../deployment/cloudflare-pages.md).

Post-release verification plan (must be approved before GO): inspect the intended hostname and selected Cloudflare production deployment; test root redirect, each allowed EN/RO route, accessibility and language switch, live CSP/noindex/robots/sitemap and contact behavior; repeat a private-data leak check against **served** URLs and caches, verify no price/cart/stock/checkout, and capture timestamps and sanitized evidence. Have a named owner ready to restore the previous production deployment, purge affected caches if authorized, recheck multiple edge responses, and escalate suspected disclosure. Signing GO **does not execute** deployment.

**No public product claims:** the 132 KingTech supplier-reference drafts and private gallery/review/ledger outputs remain entirely offline. Actual unverified BODICH items, cart, price, stock and payment endpoints are excluded. #59 may remain blocked while the informational-only site is evaluated; any future real-product launch requires a separate authorized workflow. No `robots` or `noindex` rule makes leaked private content safe.

## Outstanding remediation

The committed decision JSON is the currently authoritative checklist of each of the eight blockers. The human release authority must verify the evidence, resolve each issue and provide a fresh dated decision for **one immutable build**. If a new commit, generated asset, header, policy, legal copy or deployed configuration changes the candidate, revoke the prior sign-off and re-review the new exact SHA and artifact digest. Until all gates are documented and independently signed, record **NO-GO** without fabricating an exemption.

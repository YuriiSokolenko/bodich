# Stage 13 — audited source-reference review ledger (#49, epic #24)

**132 KingTech research references are unpublished.** This is not a BODICH product list, product-photo evidence, approval of manufacturer identity or a commerce workflow. All 132 start with an empty events array (derived status `unreviewed`); there are **zero** automatic sign-offs. Issue #47's offline gallery reads this ledger and displays verified **recorded decisions**, not real product approval.

## Read-only inspection

Node.js 24, from the repository root:

```sh
npm ci
npm run catalog:review:ledger:check
npm run catalog:review:ledger:self-test
npm run catalog:review:ledger:export
npm run catalog:art:generate
npm run catalog:review:build
npm run catalog:review:check
```

Open `visual-qa/private-catalog-review/index.html` locally; use EN/RO, review status, category and other filters. `approval-checklist.csv` and `approval-checklist.json` are deterministic, escaped read-only exports including 132 decision summaries, blockers, gates and audit event history. `visual-qa/catalog-review-audit.json` is a separate complete ledger export. Generated output is ignored and must not be published or used for sensitive storage. Viewing/filtering/exporting cannot write an approval.

## Versioned contract and migration

- `docs/catalog/review-ledger.json` is the ONLY committed decision record. `schemaVersion: 1`, `purpose`, `revisions` (Git blob SHA-1 of exact raw bytes for source inventory, reference overrides, illustration manifest and EN/RO copy matrix), and `records` are mandatory.
- Each frozen `sourceId` occurs exactly once, with the unchanged canonical supplier URL and unpublished draft slug, including direct-only and opaque `kt-sq-...` IDs. Do not rewrite these as BODICH IDs.
- `events: []` derives `unreviewed` and four `not_reviewed` gates. Status is **derived**, never editable on a record. Every event includes source ID, unique ID, actor-supplied reviewer name and role, canonical UTC timestamp, rationale, reviewed four-manifest revision set, predecessor hash and its own SHA-256 payload digest. These hashes detect accidental modification; they are **not digital signatures or authentication**. Git commit and external PR review carry the auditable change history.
- Inventory changes, moved source URLs, altered localized copy/illustration or added/retired IDs fail validation until a deliberately reviewed **new schema/revision migration PR** reconciles all IDs, documents the old/new revisions and re-reviews affected records. Do not merely change revision hashes or delete earlier events: events tied to old revisions must stay inspectable in Git history and must **never** confer eligibility under a new snapshot. A v2 migration should support archived old-revision histories and fresh gate decisions, not silently inherit approval. The frozen snapshot also has independent release reconciliation in `scripts/reconcile-catalog-release.mjs`.
- Since schema v1 requires every event to match the frozen revision set, modifications of these four inputs **intentionally fail closed** until an explicit migration is implemented/reviewed. There is no automatic rollover. **[Issue #51](https://github.com/YuriiSokolenko/bodich/issues/51) tracks revision-epoch migration and is a prerequisite for Stage 14 changes after real approvals exist.** Do not bypass the pin by merely editing revision hashes.

## Record decisions only after a human review

Create a JSON file **outside `public/`, `src/pages/`, `dist/` and Git** (for example, in an untracked temporary directory). Use a unique event ID; `at` must be the **actual** UTC time you performed the review. Do not use the sample attribution below as a factual sign-off. Read `revisions` from `docs/catalog/review-ledger.json` without modification.

A minimal **illustrative** decision payload (replace placeholders, especially reviewer, timestamp and the real revisions; do not commit this sample as evidence):

```json
{
  "sourceId": "kt-1",
  "eventId": "kt-1-hold-example-001",
  "kind": "status",
  "status": "on_hold",
  "at": "2026-10-26T12:00:00Z",
  "reviewer": { "name": "REPLACE_WITH_ACTUAL_REVIEWER", "role": "owner" },
  "reason": "No independent BODICH model identity evidence is available for this supplier reference.",
  "reviewedRevisions": {
    "inventory": "b1af06e0d35cd5b22599009ccf63ce41b6443418",
    "overrides": "6bbc24622d43787cff9967c555166fcfca1147cc",
    "art": "15e537c65cd484341f8d1b97c4aca28839e63293",
    "copy": "4cff7d5a87b355b2119ed9d89c19fafaba042f47"
  },
  "expectedPreviousHash": null
}
```

```sh
node scripts/catalog-review-ledger.mjs --apply /path/to/your-decision.json
npm run catalog:review:ledger:check
git diff -- docs/catalog/review-ledger.json
```

For subsequent decisions on the same record, set `expectedPreviousHash` to the last event's `hash`, provide a **later** UTC timestamp (not more than five minutes in the future on `--apply`) and a new event ID. Applying a semantically *identical* prior import is idempotent even if JSON key order changes: no second event or commit change (v1 uses canonical SHA-256 hashes with recursively sorted object keys; array order is significant). Reusing the ID with changed fields, a concurrent predecessor or a changed manifest is rejected. Corrections are new events (never edit/remove existing events). `rejected` and `on_hold` **revoke previously approved gate states**, preserving their historical evidence in old events; a fresh `in_review` decision and four new gate sign-offs are required before any later approval. A subsequent gate decision invalidates a former pending-signoff or eligible status.

**Begin a review with an explicit `in_review` status event.** A gate decision is forbidden while `unreviewed`, `on_hold` or `rejected`: reopen with another `in_review` status event first. The gate-to-role map is `identity` → `owner | legal_reviewer`, `imagery` → `owner | rights_reviewer`, `specifications` → `owner | technical_reviewer`, `editorial` → `owner | editorial_reviewer | legal_reviewer`. These role strings are *not authentication*; reviewer authority must be verified in the promotion PR.

For a **gate** event use `kind: "gate"`, `gate: "identity" | "imagery" | "specifications" | "editorial"` and `decision: "not_reviewed" | "needs_evidence" | "approved" | "rejected" | "not_applicable_with_reason"`. Omit `status`. Human rationale is mandatory even for `not_applicable_with_reason`; that option **never** satisfies promotion eligibility.

An approved gate additionally requires `evidence: [{ "ref", "version", "verifiedOn", "provenance" }]`; imagery evidence also requires `rightsOwner`. The `ref` may be an independent safe HTTPS URL **without query/fragment credentials or tokens**, or an **opaque** `restricted:<id>` pointing to a separately access-controlled document. Do not commit contract content, private links with tokens, customer data, personal IDs or signatures. Supplier URLs alone cannot independently prove BODICH rights. `details` is gate-specific:
- `identity`: BODICH manufacturer, exact model, variant, and independent `legalAuthorityRef`.
- `imagery`: authorized exact-model photo or verified exact-model technical illustration (never generic AI/competitor photo), model, SHA-256 digest, rights owner and written-permission reference.
- `specifications`: concrete reviewed claims, independently verified, contradictions resolved.
- `editorial`: native Romanian, English, legal, commercial and unresolved-flags review all explicitly confirmed.

An `evidence_complete_pending_signoff` **status event** requires all four independent gates approved and consistent exact-model identity. A subsequent `approved_for_promotion` requires a *new* status event from a specifically attributed `publication_approver` **whose normalized name differs from all four approving gate reviewers**, with a scoped `signoff` object containing:

```json
{
  "statement": "I explicitly approve this source research record only for a separate BODICH promotion PR.",
  "authorizationRef": "restricted:opaque-approval-register-id"
}
```

A textual actor name, checked box, Git hash or linked document is **not proof** that the signer has authority or that the underlying evidence is authentic. **The PR reviewer must independently authenticate authority, legal rights, identity, image match, specs and both languages against controlled originals.** Treat unclear, disputed or unverifiable evidence as on hold or rejected.

## Separate publication boundary

An eligible source-reference record authorizes at most a **new, separately reviewed promotion PR**. It cannot create or mutate `confirmedProducts`, Astro pages, stock, prices, warranty, cart or payments. Stage 14 must establish *real* BODICH manufacturer/model identity, authorized exact-model assets and evidence. The source draft and this review system remain isolated from public routes, sitemap and production `dist/`.

Website CI and Browser Visual QA run ledger validation and negative tests; after both normal and nested-base builds, the gallery leak checker checks for review-ledger filenames and markers. Public GitHub and GitHub Actions artifacts are **not confidential**. There is no in-gallery edit or upload action, by design.

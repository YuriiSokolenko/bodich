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

## Versioned contract and revision epochs (schema v2, #51)

- `docs/catalog/review-ledger.json` is the ONLY committed record of the **current** epoch. `schemaVersion: 2`, `purpose`, `currentEpoch`, `epochs` and `records` are mandatory. The former v1 file was backfilled deterministically (`--upgrade-v1`): epoch 1 pins the original four manifest revisions (Git blob SHA-1 of the exact raw bytes of source inventory, reference overrides, illustration manifest and EN/RO copy matrix) and every record and event was copied verbatim. Event IDs, hashes, timestamps, actors and evidence of legacy v1 history are never rewritten.
- An **epoch** is one immutable manifest revision set. Each `epochs[]` entry stores its original revisions and `sourceCount`. Epoch 1 must reconcile exactly 132 frozen source IDs; later epochs reconcile the IDs declared by their migration record. A *previous* epoch additionally carries an `archive` reference (path, SHA-256 seal, record and event counts); a *later* epoch carries its `migration` record.
- Each frozen `sourceId` occurs exactly once per epoch, with its canonical supplier URL and unpublished draft slug, including direct-only and opaque `kt-sq-...` IDs. IDs stay case-sensitive; a case-insensitive collision is rejected. Do not rewrite these as BODICH IDs.
- `events: []` derives `unreviewed` and four `not_reviewed` gates. Status is **derived** from the *current* epoch's events only, never editable on a record. Every event includes source ID, unique ID (unique across **all** epochs), actor-supplied reviewer name and role, canonical UTC timestamp, rationale, the epoch's four-manifest revision set, predecessor hash, its own SHA-256 payload digest and (epoch 2+) an `epoch` marker inside the hashed payload so it cannot be moved between epochs. These hashes detect accidental modification; they are **not digital signatures or authentication**. Git commit and external PR review carry the auditable change history.
- Until a migration is merged, any change to the four manifests (altered supplier URL, identity, photo, specifications, copy or legal-rights input, moved URL, added or retired ID) **fails closed**: the ledger reports `Stale manifest revisions`, and no draft can be approved or promoted. Do not edit revision hashes by hand; a hand edit is also detected (pinned archives and migration hashes).

## Epoch migration: new manifests without inherited approvals

A migration is explicit, auditable and belongs in its **own reviewed PR** together with the manifest change it answers to (or after it). It never rewrites history:

1. **Plan** (read-only): `npm run catalog:review:ledger:plan` prints a request template with the `expectedPreviousSeal` (SHA-256 of the current epoch's complete history), the new on-disk revisions, the names of changed manifests and the exact added, retired and changed (URL/slug) sources derived from the manifests. Placeholders in `<angle brackets>` are rejected until you replace them.
2. **Complete the request** outside Git (never under `public/`, `src/pages/` or `dist/`): migration ID, the *actual* UTC time, attributed `owner`, a documented rationale, and for each added source a safe `provenance` (`ref` is an HTTPS URL without query/fragment/credentials, or an opaque `restricted:<id>`; `note` is a short single line), for each retired source and each URL/slug change a reason, and optional `supersedes` for a replacement ID. Do not put personal data, e-mail addresses, contract text, tokens or customer data into any of these fields; they are committed to a public repository.
3. **Apply**: `node scripts/catalog-review-ledger.mjs --migrate <request.json>`. The tool seals the current epoch (byte-for-byte copy of every record and event) into `docs/catalog/review-ledger-archive/epoch-NNN.json`, then starts epoch N+1 with **every record `unreviewed`**, all gates `not_reviewed`, promotion eligibility false and no inherited publication permission, whether the change concerned a supplier URL, identity, photo, specifications, copy or legal rights. Per-record carry-over is deliberately not offered: re-review is the only way back. Re-importing the identical request is idempotent; reusing the migration ID with different content is rejected.
4. **Review**: the PR reviewer checks the migration record against the diff of the four manifests, the archive against the previous Git history, and that no event outside `docs/catalog/review-ledger-archive/` or `review-ledger.json` changed.

Validation (`npm run catalog:review:ledger:check`, CI) enforces: contiguous epochs; each archive present, referenced and matching its SHA-256 seal, record count and event count (deleted or injected history); intact hash chains and monotonic timestamps inside every epoch; no event dated before its migration (stale events) or carrying another epoch's marker or revisions (mixed epochs); a migration hash chained to the previous seal and previous migration; exact reconciliation of declared versus real added/retired/changed sources; no reuse of a retired ID, even with different case (ID collision); unique URLs and draft slugs; and no unreferenced or unexpected file in the archive directory.

**Reading history.** The gallery and `visual-qa/catalog-review-audit.json` show each record's sealed earlier epochs in a **separate "Previous epoch history" block, labelled previous epoch only, not effective**; their events never count towards the current status, gates, blockers, eligibility or the audit event count. Sources retired by a migration appear under `retiredRecords` in the audit export with their archived history and retirement reason.

**Decisions after a migration** must declare `"epoch": <currentEpoch>` and the epoch's `reviewedRevisions` (epoch 1 events keep the legacy form without `epoch`). A decision written against an older epoch, or reusing an archived event ID, is rejected. The frozen snapshot also has independent release reconciliation in `scripts/reconcile-catalog-release.mjs`; Stage 14 must update that report together with its first migration.

## Record decisions only after a human review

Create a JSON file **outside `public/`, `src/pages/`, `dist/` and Git** (for example, in an untracked temporary directory). Use a unique event ID; `at` must be the **actual** UTC time you performed the review. Do not use the sample attribution below as a factual sign-off. Read the current epoch's `revisions` (`epochs[<currentEpoch> - 1].revisions` in `docs/catalog/review-ledger.json`) without modification; from epoch 2 on also set `"epoch"`.

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

For subsequent decisions on the same record, set `expectedPreviousHash` to the last event's `hash`, provide a **later** UTC timestamp (not more than five minutes in the future on `--apply`) and a new event ID. Applying a semantically *identical* prior import is idempotent even if JSON key order changes: no second event or commit change (v1 uses canonical SHA-256 hashes with recursively sorted object keys; array order is significant). Reusing the ID with changed fields, a concurrent predecessor or a changed manifest is rejected (a changed manifest requires the epoch migration above). Corrections are new events (never edit/remove existing events). `rejected` and `on_hold` **revoke previously approved gate states**, preserving their historical evidence in old events; a fresh `in_review` decision and four new gate sign-offs are required before any later approval. A subsequent gate decision invalidates a former pending-signoff or eligible status.

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

A sealed previous epoch is **never** evidence for the current one: an earlier `approved_for_promotion` in `previousEpochs` authorizes nothing.

## Separate publication boundary

An eligible source-reference record authorizes at most a **new, separately reviewed promotion PR**. It cannot create or mutate `confirmedProducts`, Astro pages, stock, prices, warranty, cart or payments. Stage 14 must establish *real* BODICH manufacturer/model identity, authorized exact-model assets and evidence. The source draft and this review system remain isolated from public routes, sitemap and production `dist/`.

Website CI and Browser Visual QA run ledger validation and negative tests; after both normal and nested-base builds, the gallery leak checker checks for review-ledger filenames and markers. Public GitHub and GitHub Actions artifacts are **not confidential**. There is no in-gallery edit or upload action, by design.

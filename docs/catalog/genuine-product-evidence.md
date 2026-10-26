# Stage 14 — Genuine BODICH evidence intake (Issue #53)

Parent epic: #24. Prerequisites: Stage 13 #49 (review ledger), #51 / PR #52 (versioned, sealed review epochs).

**Status: blocked pilot; zero approved products.** This is a public, safe-metadata *contract*, not a legal determination or an inventory claim. The 132 frozen KingTech supplier references remain independent unpublished research. They are not 132 BODICH products. No supplier photo, seller listing, generic BODICH render or draft marketing copy authorizes product/branding/sales claims.

## Pilot

The **single pilot source is \`kt-127\` (KingTech K-102G5)**, selected only as a traceable research lead. We have **no genuine manufacturer/identity authorization, exact-model photo rights, independently verified BODICH specifications, approved English/Romanian marketing/legal copy, or attributed authorized human decisions** for a BODICH product matching this lead. There are intentionally **zero** \`records\` in \`genuine-product-evidence.json\`. The computed pilot outcome \`blocked_on_hold_no_signoff\` is an *evidence assessment*, **not** a forged \`on_hold\` human decision in the Stage 13 ledger. The current ledger remains \`unreviewed\`.

Run \`npm run catalog:genuine:check\` for fail-closed intake validation, \`npm run catalog:genuine:self-test\` for fixtures, and \`npm run catalog:genuine:export\` to produce the ignored **local-only** \`visual-qa/genuine-product-evidence-gaps.json\`. The export enumerates *every* one of the 132 source IDs, including opaque Square IDs. Each row explicitly distinguishes \`sourceReviewed\`, \`bodichIdentityVerified\`, \`promotionEligible\`, per-gate evidence completeness, current human review status, and previous-epoch history (*never effective*). The private bilingual review gallery and approval-checklist CSV/JSON show the same blockers.

## Intake contract

The committed file \`docs/catalog/genuine-product-evidence.json\` pins \`ledgerEpoch\` and all **four current manifest revisions** to Stage 13. A changed inventory, overrides, art manifest or copy matrix must use the **reviewed epoch migration procedure** in \`review-ledger-runbook.md\`; seal the old history, reconcile added/retired and changed IDs, reset effective approvals, and update the frozen release-reconciliation fixtures in \`scripts/reconcile-catalog-release.mjs\` when necessary. Do **not** silently edit an existing event, alter an archive or inherit approval from an old epoch. The intake epoch must then be deliberately updated and all evidence rechecked.

An optional intake record links to **one existing source ID** while storing an independent *proposed*, not established, \`proposedBodichIdentity: {manufacturer, model, variant}\`. It has \`evidence: []\` and \`unresolved: []\` until real evidence is supplied. Do not create empty/default reviewer identities, human decision timestamps or event IDs; only genuine human reviewers may add decisions to the **existing** Stage 13 ledger via its append-only CLI, in a separately reviewed PR.

Each evidence entry requires:
- Unique \`id\`, \`gate\` and \`kind\`; exact \`scope: {manufacturer, model, variant}\` **of the proposed BODICH product**.
- \`ref\` to a controlled original (prefer opaque \`restricted:\` identifier), \`sha256\` of the original version/asset, \`version\`, safe \`provenance\`, \`providerRole\`, an opaque \`providerRef\` identifying who supplied it off-repo, and \`providedOn\`.
- \`verifiedOn\` (calendar date) **only after reinspection**, or \`null\` until checked, and optional \`expiresOn\`. The presence of a date or hash alone is **not authentication or a legal approval**.
- \`facts\` particular to its gate. Manufacturer authorization must identify origin and an independent authority reference; photo evidence must be a photograph of the **exact** product with asset digest, rights owner and separate written permission reference. AI concepts, illustrations and vendor photographs cannot qualify as a product photograph. Technical evidence must provide individual numeric \`name\`, \`value\` and \`unit\` with its own evidence/provenance/date. Editorial evidence needs separately verified EN copy, native-RO review, legal review and commercial review, each tied to a text digest.
- Each unresolved contradiction, doubtful claim, incorrect variant or rights dispute is recorded as \`{gate, code, note, evidenceIds}\` and blocks the relevant gate. Missing, expired, unverified and mismatched-scope evidence also blocks. All fields are schema validated; unknown fields fail.

**Only safe metadata belongs on public GitHub.** Never upload original contracts, signatures, personal IDs, customer data, photographs with unlicensed rights, source private files, credentials or tokenized links. Keep documents in controlled private storage and use non-identifying \`restricted:\` pointers. Never claim BODICH ownership from a matching KingTech reference. All evidence is **subject to independent human inspection**; automated validators can check consistency, not authenticity or permission.

## Four separate gates; no second approval engine

\`scripts/catalog-genuine-evidence.mjs\` reports evidence completeness and gap reason codes for the Stage 13 gates: \`identity\`, \`imagery\`, \`specifications\`, \`editorial\`. It does **not** approve or change gates. Stage 13's attributed append-only reviewer decisions remain the sole human decision workflow. Promotion is blocked unless the intake is current, the scope and rights are complete, all relevant contradictions resolved, four current-epoch ledger gates are human-approved, and a distinct publication approver signs off. An approval claim unsupported by the independently linked intake fails CI; old-epoch decisions are shown for historical reference only.

This pilot **does not** migrate any draft to \`confirmedProducts\`, create public product routes, prices, stock, warranties or checkout. A later **separate promotion PR** and real authorized owner/legal/technical/RO rights reviews are mandatory. Browser QA, catalog reconciliation and leak guards must stay green before that work can proceed.

## Current evidence-gap interpretation

For every absent product intake record the offline export provides reason codes such as \`missing_bodich_manufacturer_authorization\`, \`missing_authorized_exact_model_photo\`, \`missing_independent_model_specifications\`, and \`missing_en_ro_legal_commercial_review\`. Additional blockers distinguish concepts vs photos, wrong variants, expired/unverified evidence, unresolved conflicts and missing current-epoch human decisions. These are **known evidence gaps**, not judgments about whether a future genuine BODICH product exists. This is intentionally a bounded, truthful **blocked pilot**.

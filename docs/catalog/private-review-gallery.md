# Issue #47 — offline bilingual catalog draft review

**Private to the website, not confidential storage.** This is an unpublished local review artifact, never an Astro route or a public asset. The repository is public: **anyone with a GitHub account can generally access artifacts for public repositories** (subject to GitHub's current access controls and retention). This gallery is *not private data storage*, even though it is not deployed to the website. Do not place confidential company data here.

## Data and status

The gallery joins four source-of-truth files and the separate version-controlled `docs/catalog/review-ledger.json` (one event history for each of the 132 IDs): docs/catalog/source-inventory.json (132 frozen source IDs), docs/catalog/reference-overrides.json (EN/RO unpublished draft overlays), docs/catalog/art-manifest.json (original diagrams) and docs/catalog/copy-review-matrix.json (copy QA), using the same identity and status contract as the Issue #35 reconciliation report.

Each record has its complete supplier title and full source ID, canonical URL, category, artwork family, draft slug, lifecycle, EN/RO description, linked evidence, numeric-spec count, unresolved flags and four pending approval gates. These are **KingTech research references, not BODICH products**. The original per-family diagrams are always marked **ILLUSTRATIVE STUDY — NOT A PRODUCT PHOTOGRAPH**. None are approved model-specific photos.

The three existing AI-generated BODICH images are sourced from `docs/catalog/review-media/turbines/` (not `public/`) and displayed separately as **marketing concepts**, not attached to any of the 132 reference SKUs.

## Local commands (Node.js 24)

~~~sh
npm ci
npm run catalog:reconcile
npm run catalog:art:generate
npm run catalog:review:ledger:check
npm run catalog:review:ledger:self-test
npm run catalog:review:self-test
npm run catalog:review:build
npm run catalog:review:check
~~~

Open **visual-qa/private-catalog-review/index.html** directly in a browser. This is an offline file: no server, CDN or network is required. Source evidence links navigate to external sites only when clicked.

The review UI has EN/RO switching, category/lifecycle/editorial-flag/illustration-availability filters, and search across titles, full IDs, slugs and both language descriptions. Long supplier identifiers wrap without truncation.

Ignored output files in visual-qa/private-catalog-review:

- **index.html**, review.css, review.js: offline review gallery.
- **images/**: copies of original generated 600px draft diagrams; missing files show an explicit unavailable placeholder and do not remove the item.
- **concepts/**: the three pre-existing AI marketing concepts, clearly separated from source SKUs.
- **approval-checklist.csv**: 132-row spreadsheet export with formula-injection protection.
- **approval-checklist.json**: complete structured evidence, bilingual description and blocker matrix for every SKU.

This is a **read-only gallery of auditable persisted review decisions**, not a click-to-approve interface. Changing filters, language or exports never grants approval. Decision history, per-gate evidence, blockers, and status are shown separately from supplier-stage research. Read the [Stage 13 reviewer runbook](./review-ledger-runbook.md) for recording/reversing decisions, re-review and revision-epoch migration. Each record shows its ledger epoch; sealed history of earlier epochs is displayed in a separate *previous epoch only* block (also in the CSV/JSON as `previousEpochEventCount` / `previousEpochHistory`) and never affects status, gates, blockers or promotion eligibility.

## CI and shipping isolation

Website CI first generates the unpublished diagrams, runs review self-tests, generates the gallery and uploads a separate GitHub Actions artifact named **unpublished-bilingual-catalog-review** with seven-day retention. It also checks for leaking the gallery into public Astro output after both normal and nested-base builds. The existing Website CI and Browser Visual QA still validate actual public routes.

The output must **never** be copied to public/, src/pages/, dist/ or hosted as public content.

## Promotion criteria

All 132 items remain **draft**, not company-approved. To promote *any* item to an approved catalog entry, collect:

1. **Company-approved BODICH manufacturer/model identity**, independent of the supplier research listing.
2. **Exact-model authorized photography or technically faithful approved imagery.** Original diagrams and generic AI concepts do not count as product images.
3. **Written image provenance, permitted use and rights sign-off.** Never copy or relabel supplier photographs.
4. **Native Romanian, marketing and legal copy sign-off**, including resolution of the item's unresolved editorial tags.
5. Separately verified specifications, evidence and legal/commercial publication approvals.

Only a separate, reviewed PR can then create an entry in the public verified confirmedProducts collection, with its real company verification source/date and approved localization/assets. No staged supplier record is published by this feature. Prices, stock, cart and checkout remain disabled.

## Test coverage

The --self-test mode checks duplicate source IDs and slugs, missing Romanian copy, missing art entries and real raster files, unapproved artwork disclosure, false photo flags, source/review drift, missing human sign-off, and attempted leakage into public HTML. The --check mode validates exactly 132 distinct rendered cards and **byte-for-byte manifest-to-HTML/CSV parity, structured JSON rows/count, all 132 generated diagrams, all three packaged marketing concepts and local stylesheet/script copies**. It verifies original asset bytes, labels, and absence of private review content from public output. If original drawings are missing, regenerate with `npm run catalog:art:generate` before checking. **Disposable regression tests also deliberately alter HTML/CSV/JSON, images and concept files**, and check each specific rejection; extra non-dotfile assets remain errors, while incidental OS dotfiles (such as `.DS_Store`) do not affect the asset inventory. Invoking the CLI through a symlink is supported. The deeper source, art, copy and Issue #35 validators are still mandatory.

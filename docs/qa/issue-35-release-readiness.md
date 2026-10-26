# Issue #35 — Inventory reconciliation and prelaunch release readiness

**Status: BLOCKED pending company, brand/rights, legal and native Romanian approval.**
Snapshot: **2026-10-23** KingTech external-source capture. This is not a live supplier availability audit, BODICH stock list, distribution agreement, price list or launch clearance.

## Machine-checkable accounting

Run **npm run catalog:reconcile** after **npm ci**. The SKU-by-SKU JSON report is emitted at **visual-qa/catalog-reconciliation.json**, including category memberships, draft slug, canonical supplier source, lifecycle, spec count, original illustrative fallback, copy review state and explicit exclusions/holds. The guard pins the captured manifest Git-blob SHA, 132 unique IDs (128 listed + 4 direct-only), per-section reported/discovered/cross-list counts and the exact three exclusion identities, requiring an explicit baseline update after any deliberate source refresh. It fails on missing, duplicate, orphaned or silently modified records; **npm run check** executes this audit and 22 negative fixtures (20 reconciliation mutations plus 2 discounted-identity cases), and disposable production-route regressions. Existing source, localized-copy, numeric-evidence, image and intake validators remain mandatory.

| Source section | Unique source SKUs | Source reported | Notes |
| --- | ---: | ---: | --- |
| G5 turbines | 11 | 11 | 1 discontinued, 1 industrial-only |
| G4+ turbines | 17 | 17 | 7 discontinued, 1 industrial-only |
| TP turboprops | 4 | 4 | Separate from jet thrust units |
| Discounted Turbines | 0 | 0 | Collection tag, never a duplicate SKU |
| Warranty Purchase | 1 | 1 | KingTech service, not BODICH warranty |
| Engine Oil | 4 | 4 | Source-labelled container quantities |
| Batteries | 2 | 2 | Additional source 404 excluded |
| Turbine Accessories | 93 | 0 top-level | 89 nested-listing records + 4 verified direct-only |
| Gift Card | 0 | Not a shop SKU | Separate external Square reference |
| **Unique captured source products** | **132** | | **128 category-listed + 4 verified direct-only** |

All **132** distinct source IDs have **132 unpublished bilingual drafts**, **132 source-indexed original illustrative-art entries**, and **132 EN/RO review-matrix rows**. Draft slugs are unique across families. All 132 overlays remain draft with empty image arrays. All 132 illustration records remain unapproved with pending rights and distinct source-indexed EN/RO alt. There are four reproducible output variants per reference (360/600/1200 WebP and 600 PNG), saved exclusively under the unpublished draft-assets directory. These are **generic original category diagrams, not verified product photographs**. A fitting product image still requires separate company approval.

The checked-in source inventory contains **three explicit exceptions**, each with evidence: an external Square Gift Card checkout (not a shop SKU), the out-of-scope Promotional Items section pending approval, and battery product ID 27, whose product-level page returned an application 404. These are declared source-side holds/exclusions, not silently discarded entries from the 132 captured SKUs. Four direct-only accessory pages are also explicitly retained.

### Unresolved review and data fidelity

- Source lifecycles: **121 unknown, 8 discontinued, 2 industrial-only, 1 out-of-stock** — none indicates BODICH availability.
- **206 source-linked structured measurements** in total; 98 reference records deliberately have no structured numeric spec. Existing G4+/G5/TP ledgers hold disputed measurements and evidence.
- **132/132 Romanian copy reviews outstanding**. The editorial matrix records **123 SKUs with 225 unresolved tags**. The other nine are not automatically legally approved.
- **132 image-rights/company approvals pending**; zero approved supplier-product photographs and zero public source illustrations. Image generation/check validates derivatives and unreferenced output, while public guards block leaked/copied drafts.
- Current public taxonomy: **38 provisional source mappings** and **94 unmapped**. The private reference taxonomy covers every draft but is not equivalent to a BODICH approved inventory.

## Routes, browser and regression verification

Website CI executes **npm run check**, production build, **npm run catalog:reconcile:routes**, and the existing catalog route validation at both root and non-root deployment bases. The new audit reads actual EN/RO generated category pages, checks exact product-card totals and empty states, and detects unexpected detail directories. A recursive full-build audit additionally rejects private catalog artifacts, source SKU slugs and supplier/Square checkout references in static files, generated routes, JS/JSON/CSS/XML/sitemap content and copied assets. With no company-approved products, the expected output is **5 public categories × 2 locales = 10 category routes and zero product-detail routes**.

Disposable route regression fixtures reject wrong card totals, missing empty states, unexpected or missing routes, and leaked JS/sitemap/private files. An isolated disposable CI fixture injects two *synthetic* product records and builds localized product cards/details, image alt, concept disclosures and non-root navigation links without publishing a source SKU. Existing source validators test discounted membership as a tag of an existing engine and exercise discontinued, industrial-only, service, gift-card, accessories, technical-unit and source-provenance cases.

Browser Visual QA checks real category pages and saves EN/RO screenshots at **320px and 1440px** for turbine engines and ECU/controls, in addition to the existing five-width responsive navigation and image tests. Browser screenshots and workflow checks must be inspected in this PR; this document does **not** predeclare green QA.

**Not applicable in this draft-only phase:** public search, filters, discount/stock badges, public source-linked specifications and checkout. There is no approved inventory to search, price, label, or sell. Simulating source products publicly would violate the no-fake-stock/no-price promise. Such controls must receive separate implementation and QA when real BODICH products have been expressly approved. Their absence is not a successful functional test.

## Source baseline change control

- [ ] For any future KingTech source-catalog refresh, conduct a **separate source-audit review**: compare added, removed and cross-listed source identities against original evidence, document every exclusion, and explicitly approve changed section counts and source lifecycle facts before updating `SNAPSHOT_BASELINE` or its pinned Git-blob SHA. Never refresh the pin merely to silence CI.
- [ ] Preserve LF in the catalog JSON files across Windows/macOS/Linux checkouts (enforced via `.gitattributes`), then rerun the reconciliation fixtures and release QA for the proposed snapshot.

## Company approval and follow-up checklist

- [ ] Confirm legal BODICH company identity, domain ownership, trade name, public contact details and brand.
- [ ] Validate KingTech trademark and specification attribution/reuse permissions; do not imply an authorized distributor or manufacturer relationship.
- [ ] Independently approve each real BODICH candidate SKU, technical revisions, source links and lifecycle (including discontinued/industrial-only/unknown statuses).
- [ ] Approve per-SKU image rights, suitability, optimized derivatives and EN/RO alt before an explicit publishing PR.
- [ ] Obtain native Romanian legal/marketing proofreading, close every outstanding matrix tag and review glossary/claims.
- [ ] Determine whether external warranty-transfer and Square gift-card references remain permanently excluded from BODICH offerings.
- [ ] Approve actual BODICH availability, prices, shipping, warranty, returns and legal notices *before* any future commerce change. **This issue adds no checkout, payment or fake stock/spec claims.**
- [ ] Prelaunch only: physical devices, Safari/Firefox, final native Romanian proofreading, production domain/SEO, accessibility and security review. These are not within Issue #35.

### Implementation traceability

Prior import stages: Issues [#25](https://github.com/YuriiSokolenko/bodich/issues/25) through [#34](https://github.com/YuriiSokolenko/bodich/issues/34). Core evidence: [source inventory](../catalog/source-inventory.json), [source category counts](../catalog/source-coverage.md), [copy matrix](../catalog/copy-review-matrix.json), [illustration manifest](../catalog/art-manifest.json), [commerce exceptions](../catalog/commerce-reference-evidence.md), [artwork policy](../catalog/visual-artwork.md) and [EN/RO glossary](../catalog/copy-style-guide.md).

**Outcome: offline reconciliation is complete only when CI passes; company/legal approval and launch readiness are still pending.**

# KingTech source inventory (unpublished research only)

**This is a reference audit, NOT a BODICH product feed.** No KingTech product is authorized for publication as a BODICH product. Nothing in `docs/catalog/source-inventory.json` is imported by Astro or added to `confirmedProducts`. Product titles, manufacturer and URLs are source provenance, not BODICH branding. No source product images, prices, stock, technical claims, or proprietary descriptions are copied into BODICH public product records.

## Browser-rendered source coverage — 23 October 2026

The source site renders its store client-side. This table compares **source-reported counts** from the rendered pages with the number of unique product URLs actually inventoried. The latest snapshot contains **123 distinct product references, all individually loaded with HTTP 200**, not a claim that the source inventory is complete.

| Section | Source-reported count | Inventory | Review result |
|---|---:|---:|---|
| [Turbine G5](https://www.kingtechturbines.com/shop/turbine-g5/29) | 11 | 11 | Matched |
| [Turbines G4+](https://www.kingtechturbines.com/shop/turbines-g4/2) | 17 | 17 | Matched, includes discontinued and industry-only |
| [Turbines TP](https://www.kingtechturbines.com/shop/turbines-tp/3) | 4 | 4 | Matched |
| [Discounted Turbines](https://www.kingtechturbines.com/shop/discounted-turbines/4) | Not reported | 0 | Appears empty; source count not independently confirmed |
| [Warranty Purchase](https://www.kingtechturbines.com/shop/warranty-purchase/10) | 1 | 1 | Matched; service, not an engine |
| [Engine Oil](https://www.kingtechturbines.com/shop/engine-oil/8) | 4 | 4 | Matched |
| [Batteries](https://www.kingtechturbines.com/shop/batteries/7) | 2 | 2 | Matched currently visible; one older indexed item requires archive review |
| [Turbine Accessories](https://www.kingtechturbines.com/shop/turbine-accessories/6) | No top-level count; 89 across 14 child-category results | 84 | **Incomplete**: bracket 13 vs 10, pumps 28 vs 26 |
| [Gift Card](https://www.kingtechturbines.com/) | Not measured | 0 | Separate digital checkout, manual review required |

The initial non-rendered seed contained 53 URL candidates; the browser audit expanded the current verified set to 123. Two old indexed references (battery ID 27 and temperature probe ID 138) are retained as **documented pending exclusions**, not silently dropped or represented as available stock. They require direct-URL/archive verification. Cross-listed counts are computed from source numeric IDs; current snapshot found no cross-section duplicates.

## Repeatable maintenance process

1. Review the source site's robots.txt and access rules. Only use publicly visible product/category links and avoid automated access if disallowed. Do not copy third-party descriptions, product media or prices.
2. With Node 24, install the optional browser audit tooling with `npm install --no-save --package-lock=false playwright@1.64.1` and `npx playwright install --only-shell chromium`, then run `npm run catalog:source:refresh`. This traverses the nine starting sections, follows paginated results and accessories subcategories, deduplicates by immutable numeric source product ID, requests each individual product URL and records URL check status, current source title, provenance and unresolved variants. The command rewrites only the review inventory. It fails if any listing is unreachable, any category count cannot be measured or any result count differs; **do not silently overwrite a previously better verified inventory with an incomplete crawl.**
3. Run `npm run catalog:source:check`. Offline validation enforces unique numeric IDs, exact canonical URLs with the same source ID, supported nine-section taxonomy, valid BODICH provisional category links, coverage totals, exclusion evidence and absence of price/media/stock payloads. Negative regression fixtures cover malformed sources, duplicates, category IDs and counts.
4. Manually compare every source section and pagination with the recorded counts. Check cross-listed/discounted items, discontinued/out-of-stock/industrial-only entries, services, gift-card digital offers and possible item variations. Resolve `unmapped`, `needs_human_review`, `unknown`, `not_checked` and every listed warning with evidence. A passing shape test **does not** prove all pages were discovered.
5. Review the diff against the previous capture. Require human approval before updating any public-facing BODICH product records, translations or artwork. New entries stay unpublished; add no company stock claims or SKU specifications based on the reference alone.

The live refresh is an inventory maintenance aid, not permission to publish or a substitute for source/manual QA. The initial manifest intentionally marks gaps; issue #25 must **not** be marked complete until the full online and manual coverage checks succeed. Gift cards and categories with no individual product URL require a documented reason for exclusion or a verified digital/service reference. The site may change after the capture date.

### Source identity and cross-listings

Source records use `kt-<source numeric product ID>`, not inferred SKUs, so a product appearing in multiple sections remains a single record with several `sourceCategoryIds`. Its origin is recorded in `evidenceUrls`, and nested paths in `subcategoryUrls`. `mappedCategoryId` is an explicit **provisional** link to the current BODICH taxonomy, or `null` with `mappingStatus: "unmapped"` when no safe mapping exists. This does not imply authorized manufacture, distribution or resale.

### Checklist before completing issue #25

- [ ] Nine source sections fully crawled and counts measured, not estimated
- [ ] Accessories subcategories and pagination reconciled; no missing links
- [ ] Product URLs open; title and source status verified without guessing
- [ ] Cross-listings and discontinued/archived records reconciled
- [ ] Warranty/digital services and gift cards included or excluded with exact source evidence
- [ ] Every unknown/ambiguous field explicitly marked for review
- [ ] Unique ID/URL/category-link validator and CI pass
- [ ] Review confirms reference JSON cannot publish as BODICH stock


## Remaining discrepancies

- Engine Bracket reports 13 source results, but only 10 unique links were extracted.
- Pump reports 28 source results, but only 26 unique links were extracted.
- Discounted Turbines and the Accessories parent page have no source-reported numeric product count; inspect the empty category/hub manually.
- Gift Card and two previously indexed but now-unlisted item URLs still require human verification.

Do not close issue #25 or merge the PR until these coverage gaps are resolved or explicitly reviewed with source evidence.

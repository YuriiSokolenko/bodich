# KingTech source inventory — publicly available research, not BODICH stock

**Captured and reconciled 23 October 2026.** This source-reference JSON is publicly visible in GitHub, but is **not loaded into the BODICH website product catalog**. No KingTech artwork, copied descriptions, prices, inventory quantities or resale rights are claimed. The public `confirmedProducts` list remains unchanged.

## Source section coverage

The KingTech Square storefront is client-rendered. Counts below are from the rendered shop pages, including their nested accessory categories. A separately verified product page may exist even when it is absent from the current listing.

| Section | Source-reported shop results | Captured product references | Coverage |
|---|---:|---:|---|
| [Turbine G5](https://www.kingtechturbines.com/shop/turbine-g5/29) | 11 | 11 | Matched |
| [Turbines G4+](https://www.kingtechturbines.com/shop/turbines-g4/2) | 17 | 17 | Matched, includes discontinued / industrial-only |
| [Turbines TP](https://www.kingtechturbines.com/shop/turbines-tp/3) | 4 | 4 | Matched |
| [Discounted Turbines](https://www.kingtechturbines.com/shop/discounted-turbines/4) | 0 | 0 | Verified empty |
| [Warranty Purchase](https://www.kingtechturbines.com/shop/warranty-purchase/10) | 1 | 1 | Matched; service rather than engine |
| [Engine Oil](https://www.kingtechturbines.com/shop/engine-oil/8) | 4 | 4 | Matched |
| [Batteries](https://www.kingtechturbines.com/shop/batteries/7) | 2 | 2 | Matched current listing; ID 27 excluded separately |
| [Turbine Accessories](https://www.kingtechturbines.com/shop/turbine-accessories/6) | 0 direct; 89 across 14 nested categories | 93 (89 listed + 4 direct-only) | All nested counts matched |
| [Gift Card](https://www.kingtechturbines.com/) | Not a shop category (external checkout) | 0 | External digital service documented |
| **Total unique verified source products** | **128 listed items** | **132** | **128 category-linked + 4 direct-only** |

### Reconciliation of the five previously invisible category items

**Cause:** Square's catalog uses both numeric URL IDs and newer opaque alphanumeric item IDs. The initial crawler regex matched only digits. A browser comparison confirmed that the rendered **Engine Bracket category contains 13 links**, of which **3 have opaque IDs**; the **Pump category contains 28 links**, of which **2 have opaque IDs**. All five product pages were separately opened and their canonical URLs and titles checked.

| Original category | Source title | Verified canonical product page |
|---|---|---|
| Engine Bracket | Stainless Steel Bracket for K102 | [Opaque ID VCEY…](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k102/VCEYUYCU5FJF2GZQMXDNZXJO) |
| Engine Bracket | Stainless Steel Bracket for K130 | [Opaque ID ECX6…](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k130/ECX6KXRCBWRIZ2YGLCIVQAWT) |
| Engine Bracket | Engine Bracket K450 | [Opaque ID PYRA…](https://www.kingtechturbines.com/product/engine-bracket-k450/PYRA6D5K64KITYJCJGXLZCQU) |
| Pump | KingTech KP500V+ | [Opaque ID LRO5…](https://www.kingtechturbines.com/product/kingtech-kp500v-/LRO5A4V3ZOBXOVEKU4F3PPC3) |
| Pump | PISCO One-Way Valve | [Opaque ID B6UE…](https://www.kingtechturbines.com/product/pisco-one-way-valve/B6UE3Q5GGAWUC57XIETALASF) |

The inventory uses `kt-N` for numeric source IDs and `kt-sq-OPAQUE_ID` for Square opaque IDs. This permits safe deduplication without inventing product numbers or collapsing two distinct source records. These five items have `sourceDiscovery: "category_listing"`.

### Four valid direct-only product pages

Four additional numeric-ID pages were independently verified by their product titles and canonical URL metadata, despite being absent from current category tiles. They are retained as **research references**, with `sourceDiscovery: "direct_verified_unlisted"`, `confidence: "medium"` and `needs_human_review`. They do **not** increase the current shop's reported category result counts.

- [ID 32 — Power Cable](https://www.kingtechturbines.com/product/power-cable/32)
- [ID 33 — G4/G4+ Data Cable](https://www.kingtechturbines.com/product/g4-g4-data-cable/33)
- [ID 107 — Fuel Solenoid Valve](https://www.kingtechturbines.com/product/fuel-solenoid-valve/107) (its source page displays an out-of-stock notice)
- [ID 138 — Temp Probe - K30/45G](https://www.kingtechturbines.com/product/temp-probe-k30-45g/138)

All four are provisionally classified under Accessories with **no invented subcategory listing**. Their canonical URLs and titles were confirmed in a browser probe on 2026-10-23.

### Explicit service and missing-item exclusions

- **Gift Card:** the KingTech homepage navigation goes directly to [Square's digital Gift Card checkout](https://app.squareup.com/gift/CA5XP82NMZYB7/order), not to a `/shop` or `/product` listing. It is a documented **external digital service**, not a product ID; section product count is 0.
- **Battery ID 27:** [850mAh-9.9V LIFE Battery](https://www.kingtechturbines.com/product/850mah-9-9v-life-battery/27) now renders the site's own **404 / Page not found** screen even though its HTTP transport response is 200. Preserve this exact source evidence as an exclusion, not a verified live product.
- **Promotional Items:** [separate source section](https://www.kingtechturbines.com/shop/promotional-items/9) is outside the nine specified sections and remains explicitly excluded pending a separate scope decision.

There were **no detected cross-listings between the nine shop sections** in the captured current source snapshot. Source status labels are evidence-only; `unknown` is not a stock or availability assertion.

## Repeatable audit and acceptance guards

1. Use Node 24. For the optional on-demand live browser audit: `npm install --no-save --package-lock=false playwright@1.64.1`, `npx playwright install --only-shell chromium`, then `npm run catalog:source:refresh`. The crawler traverses the nine shop sections, all accessory subcategories, numeric **and opaque** product links, plus the four independently verified direct-only URLs. It verifies actual product content in addition to HTTP status, and never edits the published BODICH catalog.
2. Run `npm run catalog:source:check` or `npm run check`. The offline parser fixtures check both numeric and opaque Square IDs; the validator checks unique stable IDs, canonical URLs, all nine sections, source/category counts including direct-only references, exclusion evidence, noncommercial fields and negative fixtures. The comparison guard rejects lost IDs even when a new crawl has the same number of items.
3. The GitHub workflow is **manual-dispatch only** and read-only. It uploads proposed candidate JSON instead of pushing commits. Audit exit statuses: **0** when counts match, **2** when valid but incomplete, **1** for fatal crawler/browser/network errors. A valid incomplete crawl is shown as a warning, not permission to delete previously verified IDs.
4. Human verification of variants, provisional manufacturing attribution, exact statuses and final Romanian product copy belongs to later content-intake/launch tasks. Unverified values deliberately remain `null`, `unknown`, `unmapped` or `needs_human_review`; no source record is automatically published or asserted as BODICH stock.

## Issue #25 source-inventory acceptance

- [x] Nine source sections captured or explicitly documented as non-product service
- [x] All counted source shop results matched after fixing opaque Square IDs
- [x] Each of 132 referenced product URLs verified for actual product content
- [x] Archived/unlisted direct references and the inaccessible ID 27 handled explicitly
- [x] Gift Card checkout documented separately without inventing a product ID
- [x] Stable IDs, canonical URLs, category mapping and regression guards validated
- [x] Public website stock remains untouched; future local artwork and Romanian descriptions are deferred to their own issues

Re-run a live audit before merging or promoting any reference into public BODICH products. Source pages can change after the captured date.

# Discount, warranty, and Gift Card reference mapping — issue #32

**Research snapshot:** KingTech source inventory captured 2026-10-23; bilingual nonphysical staging reviewed 2026-10-25. **Not an offer by BODICH.** This intake does not authorize resale, discount terms, warranties, voucher issuance, delivery, payments, supplier branding rights or publication as available products. Supplier pages can change; a later source audit must reconcile changes before approval.

## All three requested sections accounted for

| Original KingTech section | Source count | Mapping / identity | BODICH publication status |
|---|---:|---|---|
| [Discounted Turbines](https://www.kingtechturbines.com/shop/discounted-turbines/4) | **0** in captured snapshot | Derived `discounted` collection tag for **existing** G4+/G5/TP engine source IDs; never a second SKU | No sale/discount listing; tag cannot create a product route |
| [Warranty Purchase](https://www.kingtechturbines.com/shop/warranty-purchase/10) | **1** | [Warranty Transfer](https://www.kingtechturbines.com/product/warranty-transfer/100), source ID **kt-100**, one `service` reference draft | Unpublished, approval `draft`, legal approval pending; no payment or guarantee |
| [Gift Card](https://www.kingtechturbines.com/) | **0 shop SKUs** | One standalone **external digital reference**, `kingtech-gift-card-external`. Homepage points to [separate Square gift checkout](https://app.squareup.com/gift/CA5XP82NMZYB7/order); the link is evidence only | Unpublished, approval `draft`, no checkout, code issuance or redemption |

### Discounts are relationships, not products

The 2026-10-23 source audit found **no Discounted Turbines category-listed products**, and the category displayed an empty-state message. It would be inaccurate to invent discounted products or a price list. `buildReferenceDrafts()` produces **one draft per source ID** and derives the `discounted` tag from a source item's current category memberships. `discountedReferenceDrafts()` only selects these *same object instances* for a noncommercial reference grouping; it does not clone records. A future source cross-listing must retain exactly one verified primary category (`g5`, `g4` or `tp`) and the original identity, model, canonical URL, maker and historical source status. Discount-only or service/digital entries fail validation.

**No source retail price, percentage markdown, expiration date, historic discontinued label or inventory claim may be treated as an active BODICH promotion.** `source.status` is retained for provenance, not as availability.

### Nonphysical reference 1 — kt-100, warranty transfer

- **Original source title:** Warranty Transfer, in the KingTech **Warranty Purchase** category.
- **Original URL:** https://www.kingtechturbines.com/product/warranty-transfer/100
- **Source brand:** KingTech Turbines (seller/source attribution). `manufacturer: null` in the original inventory is preserved; do not reclassify a service as a KingTech-manufactured physical product.
- **Model/type:** no model, `itemType: service`, `categoryId: warranty-service`; one source ID and one reference overlay.
- **Staging:** `approval: draft`, `warranty.offerStatus: reference_only`, `warranty.legalApproval: pending`, `specs: []`, `images: []`. No price, live route, warranty coverage, term, transfer eligibility, return right, payment or fulfillment promise.

**EN reference excerpt (exact name and summary)**

> **KingTech Warranty Transfer — reference only** An unpublished record of a KingTech warranty-transfer service; BODICH does not offer a warranty purchase or transfer.

**RO reference excerpt (exact name and summary)**

> **Transfer de garanție KingTech — doar referință** Înregistrare nepublicată a unui serviciu KingTech de transfer al garanției; BODICH nu oferă cumpărarea sau transferul garanției.

The full EN/RO summary and original authored explanation are stored in the `kt-100` editorial override, not in public `confirmedProducts`.

### Nonphysical reference 2 — external Gift Card

- **Original supplier:** KingTech Turbines; source is its homepage link. Square's external destination is captured only as provenance in `source-inventory.json`.
- **Identity:** `kingtech-gift-card-external` is a **reference ID, not an SKU** or KingTech `/product` record. The supplier section's product count stays at zero. No product slug or BODICH route is generated.
- **Staging:** `externalReferenceServices` in `src/catalog/reference.ts`, `itemType: digital`, `approval: draft`, `offerStatus: reference_only`, `legalApproval: pending`. No redeemable code, value, purchase action, seller terms or delivery promise.

**EN reference excerpt (exact name and summary)**

> **KingTech Gift Card — external reference only** A supplier-linked digital gift card, recorded for catalog research; BODICH does not sell or issue gift cards.

**RO reference excerpt (exact name and summary)**

> **Card cadou KingTech — doar referință externă** Card cadou digital de la furnizor, documentat doar pentru catalog; BODICH nu vinde și nu emite carduri cadou.

These are **internal draft/reference descriptions**, not retail cards. Both languages and the exact quoted name/summary excerpts are checked by the offline validator. Supplier Square checkout must never be injected into a BODICH purchase link.

## Items outside the nine requested categories

The inventory contains **132 distinct source product references** and every one has a single primary classification among the requested shop sections: 11 G5, 17 G4+, 4 TP, 93 accessories (including **4 directly verified but unlisted** original-source pages), 4 oils, 2 batteries, and 1 warranty service. Gift Card has no corresponding product ID. This is **132 source IDs + 1 non-SKU external service reference**, not 133 products.

The audit keeps two explicit non-shippable/out-of-scope exceptions:

1. [Promotional Items](https://www.kingtechturbines.com/shop/promotional-items/9) is an *additional source section outside the specified nine*. Its contents are not imported until scope, identity, maker and legal approval are separately reviewed; do not infer that a promotional listing is a discounted turbine.
2. [850mAh-9.9V LIFE Battery, original ID 27](https://www.kingtechturbines.com/product/850mah-9-9v-life-battery/27) showed a storefront-level 404 in the captured audit, despite an HTTP 200 response. It is an **explicitly excluded, unverified page**, not a seventh consumable.

The four verified direct-only accessory references (32, 33, 107, 138) are already mapped as accessory source IDs, not orphan items or newly invented categories. See [source coverage](./source-coverage.md). If a future crawl detects a product lacking any of the nine primary categories, hold it as an exception pending a human mapping decision; **never auto-assign a new BODICH SKU**.

## Guardrails and reproducible fixtures

Run `npm run catalog:source:check` (included in `npm run check` and CI). `scripts/validate-commerce-references.mjs` validates: unique source IDs; source URLs/title/manufacturer/historical status; a derived discount grouping only over G4+/G5/TP; one service warranty record with KingTech attribution and explicit EN/RO disclaimers; exactly one externally referenced digital Gift Card with no purchasable SKU; existing promotional/unavailable-product exclusions; and no commercial publication of either nonphysical entity.

`node scripts/validate-commerce-references.mjs --self-test` covers **positive synthetic cross-listing for G4+, G5 and TP** (identity-preserving membership) and exact-error negative fixtures for warranty approval, historic source URL/title/manufacturer/status tampering, invalid/future review dates, missing EN/RO disclaimers, unapproved commerce-field injection, leaked Square URLs (including nested query links), Gift Card promotion/public SKU leakage, duplicate warranty records, discount-only orphan/non-engine membership and removed gift/promotion/battery exclusions. The evidence excerpt fixture rejects documentation that diverges from the stored EN/RO names or summaries.

Future releases still require **BODICH company and legal approval**, rights review, separate reviewed commercial content, payment/compliance handling and a deliberate public-catalog migration. This task deliberately creates **no public routes, prices, checkout, gift-code issuance or warranty purchase**.

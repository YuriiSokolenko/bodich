# Issue #33 — original BODICH catalog illustrations

## Scope and honest fallback

The frozen supplier inventory has **132 importable source IDs**: 17 G4+, 11 G5, 4 TP, 93 accessories, 4 oils, 2 batteries and one warranty-transfer service. The separately linked gift card is **not** a source product ID and discounts are a tag, not extra SKUs.

[The art manifest](./art-manifest.json) maps **every source ID** to a reproducible original category diagram, a per-SKU shot brief, KingTech attribution and source URL, EN/RO alt text, rights/provenance and stable delivery paths. Every record is marked **documented_illustrative_fallback**, **original_diagram**, **rights pending**, **approved false**, **isProductPhoto false**.

**No artwork is approved for publication.** The source drafts stay unpublished. The website still has zero confirmed products. These drawings are deliberately category-based fallbacks, not faithful KingTech geometry, actual product photographs, or real BODICH-made engines.

## Artwork groups

| Family | Count | Generic depiction, NEVER a specification |
|---|---:|---|
| G4+ turbojet | 17 | Abstract axial barrel and blades |
| G5 turbojet | 11 | Abstract barrel with different radial pattern |
| TP turboprop | 4 | Generic propeller and jet study; no real blade count |
| ECU and controls | 10 | Abstract controller/board |
| Electrical components | 7 | Abstract electrical connections |
| Fuel systems | 40 | Abstract fuel transfer loop |
| Mounting hardware | 17 | Invented bracket geometry; no fitment claim |
| Turbine protection | 5 | Abstract mesh/shield; no protection claim |
| Maintenance parts | 14 | Generic service-tool shape |
| Oil | 4 | Generic container/droplet, not package evidence |
| Batteries | 2 | Generic electrical storage motif, not cell or plug proof |
| Warranty service | 1 | Generic document, not a BODICH warranty |
| **Total** | **132** | All indexed by stable, unique source ID |

Each brief in the manifest is per-SKU and includes the original supplier reference, but the graphic itself only shows the source ID as a reference index, not a supposed product-model stamp. Distinct deterministic visual seeds are used per SKU. All family art shares the BODICH visual-study style: charcoal aerospace background, muted teal metal, copper accents and a consistent studio-like 4:3 frame.

## Sources, exports and checks

The editable artwork source is [the deterministic geometry generator](../../scripts/generate-catalog-art.mjs). All pixels are created locally from authored SVG geometric primitives through sharp 0.35.5. There are **no scraped, reused or repainted supplier images**, vendor logos, or proprietary input photographs.

The exported graphics themselves include the permanent statements **BODICH / VISUAL STUDY** and **ILLUSTRATIVE DIAGRAM · NOT A PRODUCT PHOTO**. This does not claim BODICH manufactured any referenced engine. KingTech stays attributed in the inventory/manifest as the external supplier, not in a fabricated housing badge.

For every ID, running npm run catalog:art:generate exports under docs/catalog/draft-assets/<source-id>/:

| File | Dimensions | Use |
|---|---:|---|
| concept-360.webp | 360 × 270 | Mobile/card |
| concept-600.webp | 600 × 450 | Tablet/card |
| concept-1200.webp | 1200 × 900 | Gallery review |
| concept-600.png | 600 × 450 | Portable fallback |

The 528 rasters are **generated, not committed**: they remain under the deliberately gitignored draft-assets directory, not public/images/catalog. Website safety rules prohibit unreferenced public catalog imagery. CI uploads the exported set plus **12 category contact sheets** from visual-qa/catalog-art as the artifact named **unpublished-catalog-art-review**. These contact sheets support category-by-category screenshot review; the images are not currently served on product cards.

To validate offline using Node 24, run these commands in sequence:

    npm ci
    npm run catalog:art:manifest
    npm run catalog:art:self-test
    npm run catalog:art:generate
    npm run catalog:art:check

The manifest gate verifies 132/132 mapping, uniqueness, family assignment, exact source URL/title, safety disclosures, rights status and derivative paths; negative fixtures enforce these invariants. Raster checks verify WebP/PNG decoding headers, dimensions, maximum size, private EXIF/XMP/text flags, and no orphan files under the draft asset tree. No fetch from the supplier's site is needed.

## Ownership, product identity and publication gates

1. **Visible disclosures are mandatory if images are ever published.** EN: "Illustrative visualization — not an actual product photograph". RO: "Vizualizare ilustrativă — nu este fotografia produsului real". The localized alt from the manifest must also remain truthful. Generated generic geometry is not evidence for a particular model, specification or fitment.
2. **Company approval remains pending.** This issue does not change source-reference approval, does not turn a reference into public stock, and never inserts generated images into the confirmed product list. Later issues #34 and #35 must separately review localized copy and real manufacturer/product identity before promotion.
3. **Rights and provenance.** The versioned procedural source and manifest provide exact provenance. Obtain an owner/IP and branding review before clearing rights. For genuine manufacturer photos, require written commercial-use permissions, model and revision verification, and retained evidence; do not label an authentic photo as original concept art.
4. **Human quality review.** Review each of the 12 group contact sheets and individual full-size illustrations, checking category silhouette, localizations, legible notices, absence of competitor marks and false technical/commercial claims. Generated previews and automated image safety tests are not substitute approvals.
5. **Public release later.** Only deliberate per-image company clearance can move a selected WebP/PNG into public/images/catalog, with references from company-verified product records and visible bilingual concept disclosure. Run the existing orphan/metadata checks and responsive Safari/Firefox/device QA before launch.

**Current coverage: 132/132 documented honest fallbacks; 0 approved genuine or company-cleared product images.**

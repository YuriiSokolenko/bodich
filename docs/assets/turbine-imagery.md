# BODICH turbine imagery inventory

## Hero concept — Issue #10, Stage 3A

| Property | Value |
| --- | --- |
| Asset | `public/images/turbines/bodich-hero-concept.webp` |
| Format | WebP, 1,672 × 941 pixels (wide, approximately 16:9) |
| Optimized size | 60,106 bytes (approximately 59 KiB) |
| SHA-256 | `d5882b9758b117898675d5da8407ba379783b9af772aa285942288cb0160bdbe` |
| Purpose | Homepage hero artwork; reserved left-side negative space for headings and calls to action |
| Status | **Concept rendering / Vizualizare conceptuală** — not an actual BODICH product photograph |
| Origin | Original AI-generated BODICH-branded concept created October 23, 2026, for Issue #10 |
| Visual reference | Broad engineering form of small RC jet turbine engines, using the KingTech website as a product-category reference only. No KingTech photography, logo, distinctive branding or other assets are reused; the design is fictional. |

### Generation provenance and commercial-use review

- **Generator:** OpenAI ChatGPT image generation (image-generation tool), October 23, 2026.
- **Requested art direction (descriptive brief, not a guaranteed verbatim internal model prompt):** Cinematic photorealistic studio rendering of a compact RC-type jet turbine; horizontal three-quarter view, engine on right, ample dark negative space left; cool studio lighting and restrained red accents; red metal inlet with protective mesh and visible spinner; black/gunmetal turbine housing bearing clearly legible **BODICH**; mounting hardware and external fittings; heat-tinted bronze/blue/purple exhaust nozzle on a dark reflective floor.
- **Branding/reference:** KingTech's website (https://www.kingtechturbines.com/) informed only the broad *category and form factor* of miniature model-aircraft turbines. The generated artwork is not sourced from or represented as any KingTech SKU, photograph, drawing or authorized derivative.
- **Source status:** The full-resolution image-generation PNG was retained in the generation conversation but **not included in this Git repository**; this PR commits only the WebP delivery asset to avoid unnecessary repository weight. To make exact regenerated pixels available long-term, archive the source separately with the generation record.
- **Use/rights context:** Generated using ChatGPT subject to the applicable [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) and [Service Terms](https://openai.com/policies/service-terms/). OpenAI's terms describe output ownership as between the user and OpenAI, subject to law, but **do not guarantee exclusivity or freedom from third-party IP claims**. Before commercial publication, the site owner should confirm ownership/permission for the **BODICH** brand and review the design for confusing resemblance to a specific third-party product.
- **Representation:** This is synthetic concept art only, not a BODICH-engineering design, verified product photo or advertisement for an existing model.

### Accessible text alternatives

**EN:** Concept rendering of a BODICH-branded miniature jet turbine engine with a red intake housing, dark metal body and a heat-tinted bronze, blue and purple exhaust nozzle, against a charcoal studio background.

**RO:** Vizualizare conceptuală a unui motor turboreactor miniatural marca BODICH, cu admisie roșie, corp metalic închis la culoare și duză de evacuare metalică cu nuanțe de bronz, albastru și violet, pe fundal de studio gri-închis.

### Usage and representation rules

- **Label prominently when published:** "Concept rendering" (EN) / "Vizualizare conceptuală" (RO).
- The image depicts a fictional concept, not a manufacturing prototype or a verified product. Do not associate it with a real SKU, specifications, certification, thrust rating, price, warranty or inventory.
- For the homepage hero, preserve the full subject and negative space; do not stretch the raster or place white text over the engine.
- The image is not integrated into the homepage in Stage 3A. Responsive integration and layout behavior belong to later stages of Issue #10 / homepage work.
- The source studio render was produced specifically for this project and exported to an optimized WebP delivery asset; no third-party product photo is redistributed.

## Product-card concept 01 — Issue #10, Stage 3B (first asset)

| Property | Value |
| --- | --- |
| Asset | `public/images/turbines/bodich-card-concept-01.webp` |
| Format | WebP, 1,254 × 1,254 pixels (1:1 square) |
| Optimized size | 148,998 bytes (approximately 146 KiB) |
| SHA-256 | `4bfe319393b64502c6203d1cb731e67729418a572c70190a88216251f673eefd` |
| Purpose | Turbine category/product discovery card, not a product listing for a verified SKU |
| Status | **Concept rendering / Vizualizare conceptuală** |
| Origin | Original AI-generated concept image created with OpenAI ChatGPT image generation on October 23, 2026 (Bucharest local date). GitHub PR #12 was opened October 22, 2026 UTC; these dates describe the same local calendar night. This is a new generation following Stage 3A, not a crop of the hero asset. |

**Art-direction brief:** Square premium studio-style AI-generated concept image of one compact BODICH-branded fictional RC-type jet turbine, front three-quarter intake view; legible BODICH lettering on anodized red inlet housing, fine intake mesh, dark gunmetal center body, machined fittings, red accents, bronze/blue/purple heat-tinted exhaust, charcoal background and subtle floor reflection. No third-party logo, genuine SKU, thrust specification or certification marks.

**EN alt:** Concept rendering of a BODICH-branded miniature jet turbine with red front intake, dark metal housing, visible fittings and a heat-tinted exhaust nozzle.

**RO alt:** Vizualizare conceptuală a unui motor turboreactor miniatural marca BODICH, cu admisie frontală roșie, carcasă metalică închisă la culoare, racorduri vizibile și duză de evacuare cu nuanțe termice.

This is **asset 1 of a planned 2–4 matching Stage 3B images**. It must not be mistaken for a photograph or specification of an available BODICH engine. Apply the same concept-labeling and rights-review requirements documented above; **commercial-use / third-party IP review has not yet been completed** and is a pre-publication gate, not an implied clearance. The source generation PNG is not committed; the optimized WebP is the versioned site asset.

**Integration follow-up (Stages 3C/3D):** The exhaust nozzle is close to the right image edge. Avoid blind square `object-fit: cover` crops, test `object-position` / contained layouts across screen sizes, and expose a visible localized **Concept rendering / Vizualizare conceptuală** caption adjacent to the image (not burned into the raster). Provide a smaller approximately 600 px card variant or `srcset` to reduce catalog-grid transfer size. Further cards, variants and on-page integration are separate stages.

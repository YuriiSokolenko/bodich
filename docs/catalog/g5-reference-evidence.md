# KingTech G5 editorial reference staging — issue #27

**Review date: 2026-10-24. Unpublished third-party research, not BODICH stock.**

Exactly **11** distinct G5 source IDs are present in the approved `source-inventory.json` manifest. All 11 have one unpublished editorial record in `reference-overrides.json`. Product identity and manufacturer remain **KingTech**; a BODICH manufacturer or reseller relationship is **not** claimed. The source URLs are research evidence, not public product destinations on the BODICH site.

## Evidence by source identity

| Source ID | Model | Canonical inventory record | Source used for measured specifications | Editorial caveat |
|---|---|---|---|---|
| `kt-126` | K-86G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-86g5-discontinued/126) | [technical specification](https://www.kingtechturbines.com/product/kingtech-k-86g5-discontinued/126) | Discontinued 2025-10-01 |
| `kt-127` | K-102G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-102g5/127) | [technical specification](https://kingtech-gcc.com/product/kingtech-k-102g5/) | Status not verified |
| `kt-128` | K-130G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-130g5/128) | [technical specification](https://kingtech-gcc.com/product/kingtech-k-130g5/) | Status not verified |
| `kt-129` | K-142G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-142g5/129) | [technical specification](https://kingtech-gcc.com/product/kingtech-k-142g5/) | Status not verified |
| `kt-130` | K-160G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-160g5/130) | [technical specification](https://www.kingtechturbines.com/product/kingtech-k-160g5/130) | Status not verified |
| `kt-131` | K-180G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-180g5/131) | [technical specification](https://kingtech-gcc.com/product/kingtech-k-180g5/) | EGT conflict; 700 °C vs 750 °C |
| `kt-132` | K-210G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-210g5/132) | [technical specification](https://www.kingtechturbines.com/product/kingtech-k-210g5/132) | Status not verified |
| `kt-133` | K-240G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-240g5/133) | [technical specification](https://www.kingtechturbines.com/product/kingtech-k-240g5/133) | Status not verified |
| `kt-134` | K-260G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-260g5/134) | [technical specification](https://kingtechturbine.lu/K260G5_1) | Thrust tolerance differs by source |
| `kt-135` | K-320G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-320g5/135) | [technical specification](https://www.kingtechturbines.com/product/kingtech-k-320g5/135) | Status not verified |
| `kt-136` | K-450G5 | [KingTech source](https://www.kingtechturbines.com/product/kingtech-k-450g5-industrial-purchases-only-please-inquire-/136) | [technical specification](https://www.kingtechturbines.com/product/kingtech-k-450g5-industrial-purchases-only-please-inquire-/136) | Industrial purchase inquiries only |

## Why some specifications link to regional distributors rather than the inventory URL

The `canonicalUrl` column identifies an approved source **SKU identity**, not a promise that the same US listing has an accessible, complete technical table. The inventory's `kingtechturbines.com` product pages are JavaScript-rendered; a separate text-based source verification of those exact URLs returned an empty extracted document for **kt-127, kt-128, kt-129 and kt-131**, rather than values that could be corroborated. Never interpret that as proof that the US site lacks specifications, or that its specs match regional sites.

For these four IDs, measurements are sourced specifically from published **KingTech GCC / Gonzo Hobbies regional reseller** tables, not attributed to the US inventory page: [K-102G5](https://kingtech-gcc.com/product/kingtech-k-102g5/), [K-130G5](https://kingtech-gcc.com/product/kingtech-k-130g5/), [K-142G5](https://kingtech-gcc.com/product/kingtech-k-142g5/) and [K-180G5](https://kingtech-gcc.com/product/kingtech-k-180g5/). An independent regional cross-check found the same recorded dimensions, mass, RPM, nominal thrust, fuel-consumption, and pump figures on the KingTech Luxembourg reseller pages for [K-102G5](https://kingtechturbine.lu/K102G5_1), [K-130G5](https://kingtechturbine.lu/K130G5_1), [K-142G5](https://kingtechturbine.lu/K142G5_1), [K-180G5](https://kingtechturbine.lu/K180G5_1) **except the disputed K-180G5 temperature**. These reseller tables are corroboration, **not** a signed factory specification or proof of manufacturing approval.

For **kt-134**, the G5 K-260 measurements are now sourced from the [Luxembourg distributor's complete specification](https://kingtechturbine.lu/K260G5_1), which independently repeats the original selected values. We do not claim the measurements have been cross-checked on the US inventory URL. Even when regional sources agree, company sign-off and original manufacturer documents are still needed before BODICH publication.

## Technical data policy

- All measurements in `reference-overrides.json` carry their own `sourceUrl` and `verifiedOn` value. No specs are calculated from model names. Vendor thrust figures expressed as “kg” in a thrust field are stored as **kgf** (kilogram-force), not kilograms of mass; do not convert them to newtons without documenting the conversion. Dimensions are millimetres and explicitly differentiated as **diameter** and **length**; engine mass is recorded in grams, maximum shaft speed in rpm, and exhaust gas temperature in °C only where unambiguous.
- Fuel use is a **mass flow** in `g/min`. It is not converted to `mL/min` or `L/h`: that conversion would require an independently specified fuel density. Pump model and recommended fuels are preserved in the original English and Romanian descriptions with the model's per-spec evidence link above. The supplier's listed pump model does not establish interchangeability with other BODICH products.
- **K-180G5:** the [KingTech GCC regional distributor](https://kingtech-gcc.com/product/kingtech-k-180g5/) reports max EGT 700 °C whereas the [KingTech Luxembourg distributor](https://kingtechturbine.lu/K180G5_1) reports max EGT 750 °C. Both agree on 103 mm diameter, 251 mm length and 1540 g engine mass. The EGT field is deliberately **absent** in this draft; the offline G5 coverage test blocks accidental reintroduction until a manufacturer confirmation is recorded and the guard is deliberately revised.
- **K-260G5:** the [Luxembourg distributor's specification](https://kingtechturbine.lu/K260G5_1) lists 26 kg thrust; [another vendor](https://www.boomerangrcjets.com/products/kingtech-k-260g5) reports 26 ± 0.5 kg. The draft records only nominal 26 kgf. The original Taiwan web page is no longer used for per-spec evidence because its live HTML contains unrelated, apparently injected gambling links; do not treat unrelated page content as authoritative. No unreviewed tolerance is asserted.
- **K-86G5:** the source marks it discontinued as of 1 October 2025, with *kerosene or Jet A* listed as fuels. Do not silently add diesel (the supplier recommends another engine family for diesel). Engine mass excludes brackets per the source. This is a historical entry, not a backorder offer.
- **K-450G5:** the source says industrial purchase inquiries only. A supplier's display of zero price or out-of-stock is **not** an actual zero-price BODICH listing. The draft has neither price nor availability.
- **K-130G5:** [Luxembourg distributor figures](https://kingtechturbine.lu/K130G5_1) distinguish bare engine mass of 1200 g from 1270 g with brackets. The draft uses only the bare-engine number; do not mix mounting weight into the same field. The unusual diameter relation is corroborated: K-130G5 **94.5 mm** vs [K-142G5 **92.25 mm**](https://kingtechturbine.lu/K142G5_1). Do not infer that thrust must increase with diameter.
- For the other records, supplier lifecycle status is still **unknown**, not “in stock” or “for sale”. Dimensions, thrust and component notes are external-reference facts needing approval before product publication.

## Original BODICH illustration briefs (future issue #33)

These are **original image directions only**, not actual images. Do **not** pull KingTech photographs, brand marks, visual copies of exact hardware, or any seller marketing graphics into the repository. These ideas should be drawn or rendered independently and reviewed for accuracy, ownership, accessibility and whether they could be mistaken for a photograph of an actual model. Each concept should bear a visible *illustration / ilustrație conceptuală* notice.

| Source ID | Model | Original image direction |
|---|---|---|
| `kt-126` | K-86G5 | A small turbine silhouette beside a subdued archive date plate; technical blueprint-style framing, not a live product hero. |
| `kt-127` | K-102G5 | Compact circular inlet and clean profile rendering on a neutral engineering grid; include an explicit concept-art label. |
| `kt-128` | K-130G5 | Three-quarter study of inlet, cylindrical shell and generic mounting points; no exact KingTech hardware replication. |
| `kt-129` | K-142G5 | Side-view proportions study with a restrained line-drawing inset and ample space for future approved specifications. |
| `kt-130` | K-160G5 | Original grayscale studio concept of turbine housing and intake, with non-branded technical callouts. |
| `kt-131` | K-180G5 | Neutral schematic composition emphasizing an unverified-data label, avoiding temperature figures in the artwork. |
| `kt-132` | K-210G5 | Clean sectional-inspired visualization of turbine airflow with a generic non-proprietary silhouette. |
| `kt-133` | K-240G5 | Large-format engineering concept with end-on inlet emphasis and abstract precision-machined surfaces. |
| `kt-134` | K-260G5 | Isometric turbine concept with neutral fuel-system flow icons; do not depict the actual pump or tolerance as verified. |
| `kt-135` | K-320G5 | Longitudinal side profile as a conceptual industrial illustration, minimal background and accessible contrast. |
| `kt-136` | K-450G5 | Industrial-scale turbine concept on a subtle technical grid with a visible 'reference only' designation; no buy button or price. |

**Neutral fallback:** `images: []` for every G5 draft. Any later *approved* BODICH product without a rights-cleared image must use the existing localized, accessible no-photo fallback (rather than supplier imagery or a generated mock product shot). No G5 source draft is imported by Astro runtime, generates an accessible public product card, URL, cart, inventory indicator, price or checkout.

**Next steps / approvals:** original image production is tracked in #33, copy review in #34 and publication reconciliation in #35. The bilingual descriptions here are review drafts, not company-approved marketing. The text in this evidence ledger and the staged copy should be checked against KingTech's actual documentation and by a Romanian reviewer before approval.

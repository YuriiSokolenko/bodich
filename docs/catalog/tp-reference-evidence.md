# KingTech TP reference intake — issue #29

**Verified against KingTech's own TP category and product listings on 2026-10-25.** Research only. This is not BODICH inventory, product photography, technical certification, availability or an offer to sell.

## Inventory parity

The 2026-10-23 [source inventory](./source-inventory.json) lists **four source IDs** under [KingTech's TP category](https://www.kingtechturbines.com/shop/turbines-tp/3). Each source ID maps to exactly one unpublished draft, independent from the G4+ turbojet and G5 records. No additional numbered TP models, propeller-size SKUs, gearbox bundles or accessory variants are invented. The source's generic G4 feature paragraphs are not taken as proof of a particular supplied component.

| Inventory ID | Original KingTech listing | Source status | Unpublished reference slug |
|---|---|---|---|
| `kt-17` | [K-30TPG4+](https://www.kingtechturbines.com/product/kingtech-k-30tpg4-/17) | unknown | `kingtech-k-30tpg4-plus` |
| `kt-18` | [K-45TPG4+](https://www.kingtechturbines.com/product/kingtech-k-45tpg4-/18) | unknown | `kingtech-k-45tpg4-plus` |
| `kt-19` | [K-60TPG4+](https://www.kingtechturbines.com/product/kingtech-k-60tpg4-/19) | unknown | `kingtech-k-60tpg4-plus` |
| `kt-20` | [K-100TPG4+](https://www.kingtechturbines.com/product/kingtech-k-100tpg4-/20) | unknown | `kingtech-k-100tpg4-plus` |

Source status **unknown** is not a statement of availability. TP product metadata contains no vendor prices or seller stock flags. No original photographs were copied.

## Per-product source-transcribed measurements

Each structured measurement carries its corresponding **KingTech item URL** and `verifiedOn: 2026-10-25`. There are **22** measured fields, and **five propeller-size recommendations** (two for K-30). Values below are not inferred from turbojet thrust, nozzle dimensions or generic G4 engine templates.

| Source ID | Length (mm) | Mass (g) | Turbine max (rpm) | Listed power (kW) | EGT max (°C) | Fuel (g/min) | Three-blade propeller recommendation (inches) |
|---|---:|---:|---:|---:|---:|---:|---|
| `kt-17` | 276.5 | 1,200 | 230,000 | **unknown** | **unknown** | 145 | 18 × 12 **or** 18 × 16 |
| `kt-18` | 316 | 1,800 | 170,000 | 5.2 | 700 | 220 | 22 × 12 |
| `kt-19` | 362 | 2,400 | 160,000 | 7.3 | 700 | 240 | 24 × 20 |
| `kt-20` | 384.55 | 3,500 | 135,000 | 13 | 700 | 360 | 26 × 20 |

**Meaning of units:** `rpm` values are explicitly **turbine** speeds, not propeller-shaft speeds. `g/min` measures **fuel mass flow**, not L/h; no density conversion is supported. `power` stores the manufacturer's reported power number without guessing an output-shaft measurement standard. The manufacturer gives all four unit weights without an unambiguous bare-engine versus equipped-assembly definition; each is stored with `scope: not_stated`. None of the four product pages provides a verified gearbox reduction ratio, so `gearboxRatio` stays absent. **No turbine thrust, turbine diameter, or propeller shaft speed** is inherited from G4+ or G5.

Fuel/source specifics: K-30's [KingTech page](https://www.kingtechturbines.com/product/kingtech-k-30tpg4-/17) identifies **Jet A1 and kerosene**, as well as the **KP200BL** pump. The [K-45](https://www.kingtechturbines.com/product/kingtech-k-45tpg4-/18), [K-60](https://www.kingtechturbines.com/product/kingtech-k-60tpg4-/19), and [K-100](https://www.kingtechturbines.com/product/kingtech-k-100tpg4-/20) pages explicitly include **diesel, Jet A1 and kerosene**; their precise pump-model identifiers are not promoted from generic G4 boilerplate. K-100's source associates 13 kW with **6,200 rpm** without a reliable identification of that speed as the propeller-shaft output, so no shaft-rpm field is inserted. The source propeller dimensions are recommendations, not sold-as-separate-SKU options or proof that propellers are in the box.

The reviewed listings do not establish a complete TP package component list. Although common DRM/GSU, pump and fuel-supply wording may appear in G4 marketing copy, `includedComponents` remains absent until SKU-specific supply evidence is verified. This distinction matters for quote preparation.

## English / Romanian component terminology

| English | Romanian | Data caveat |
|---|---|---|
| Turboprop | turbopropulsor / motor turbopropulsor | Not a thrust-only turbojet |
| Turbine shaft | arborele turbinei | Distinct from propeller shaft |
| Propeller shaft / output shaft | arborele elicei / arborele de ieșire | Shaft rpm currently unknown |
| Reduction gearbox | reductor / cutie de reducție | Gear ratio currently unknown |
| Three-blade propeller | elice cu trei pale | Recommended, not necessarily supplied |
| Propeller diameter × pitch | diametrul × pasul elicei | Source specifies inches |
| Brushless fuel pump | pompă de combustibil fără perii | Specific model identified only for K-30 |
| Exhaust gas temperature (EGT) | temperatura gazelor de evacuare | K-30 not supplied |
| Fuel mass flow | consum masic de combustibil | `g/min`, not volume per hour |
| Data Relay Module (DRM) | modul de retransmisie a datelor (DRM) | Not asserted included per TP SKU |
| Ground Support Unit (GSU) | unitate de asistență la sol (GSU) | Not asserted included per TP SKU |

## BODICH-original illustration briefs (unpublished)

These are *new illustrative directions only*, not KingTech photographs or dimensionally accurate CAD models. No asset is committed to `public/` or attached to the editorial record (`images: []`). Each future output must be marked **Concept / Ilustrație conceptuală** and rights-reviewed under #33 before placement, without displaying it as a product photograph.

1. **K-30TPG4+:** clean studio-style cutaway showing a small generic turbine driving a simplified reduction gearbox and a translucent three-blade propeller; alternate pitch options only as schematic arcs, without KingTech logos or actual mount measurements. EN: “Illustrative small turboprop layout, not product photo.” RO: “Schemă conceptuală a unui turbopropulsor compact, nu fotografie de produs.”
2. **K-45TPG4+:** isometric exploded technical illustration of a *generic* turbine, reduction housing and three-blade propeller, arranged along a common axis; no claims about included hardware. EN: “Conceptual turbine-to-propeller power path.” RO: “Traseu conceptual al puterii de la turbină la elice.”
3. **K-60TPG4+:** minimal engineering poster of a generic turboprop behind a propeller silhouette, with annotation lines pointing to the gearbox interface but **no** claimed real reduction ratio or shaft speed. EN: “Concept illustration of a turboprop gearbox interface.” RO: “Ilustrație conceptuală a legăturii dintre turbopropulsor și reductor.”
4. **K-100TPG4+:** restrained sectional illustration focusing on the front gearbox zone and an abstract three-blade sweep; omit precise shaft geometry and any unlabeled manufacturer-specific configuration. EN: “Generic high-output turboprop concept, not a manufacturer photograph.” RO: “Concept generic de turbopropulsor de putere ridicată, nu fotografie a producătorului.”

## Publication and validation boundary

The four `approval: draft` records live solely in `reference-overrides.json`; `src/catalog/reference.ts` is deliberately excluded from public Astro routes. The separate public `confirmedProducts` array remains untouched. Website category/product routes are generated **only** for company-confirmed BODICH items, so no external KingTech TP detail page is published at this intake stage. This is intentional under the #26 publication boundary; company-authorized pages and any actual product photos must be addressed after #33–#35.

The offline `npm run catalog:source:check` gate enforces one-to-one TP source coverage, distinct slugs, model identity, correct category, nonempty EN/RO text, source-specified speed axes, no thrust-only jet defaults, propeller sizes, fuel identity and no unverified gearbox/components; negative fixtures reject lost source IDs, translation omissions, premature approval/images, invalid prop geometry and turbojet contamination.

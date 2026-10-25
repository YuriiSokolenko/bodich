# KingTech G4+ editorial reference staging — issue #28

**Cross-checked on 2026-10-25 (Europe/Tirane local date). Third-party research only; no BODICH stock or sale claim.**

Exactly **17 unique G4+ source IDs** occur in the 2026-10-23 inventory, including **K-30 and K-45** omitted from homepage featured items. The records have 1:1 unpublished EN/RO editorial overlays, per-measurement provenance, distinct reference slugs and draft approval. **104 non-disputed numeric measurements** remain after the review quarantine. Status distribution: **7 discontinued, 1 industrial-only, 9 unknown**. Unknown does not mean available. These research listings do not generate public BODICH cards, URLs or purchase controls.

**Date meanings:** `capturedAt: 2026-10-23` is the supplier inventory snapshot date. `verifiedOn: 2026-10-24` on individual measurements means the value was transcribed and source-attributed on that date, **not independently cross-checked with every distributor**. The 2026-10-25 follow-up is a review of conflicting supplier sources and publication safeguards; it does not retroactively re-date or certify every surviving measurement. Resolve exact engine revisions with factory evidence before product approval.

## Complete source-to-reference mapping

| ID | Model | Canonical source | Source status | Technical evidence and qualification |
|---|---|---|---|---|
| `kt-1` | K-30G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-30g4-discontinued/1) | discontinued | Same product listing |
| `kt-2` | K-45G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-45g4-discontinued/2) | discontinued | Same product listing |
| `kt-3` | K-55G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-55g4-discontinued/3) | discontinued | [KingTech GCC single regional table](https://kingtech-gcc.com/product/kingtech-k-55g4/); not cross-checked against US table |
| `kt-4` | K-65G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-65g4-discontinued/4) | discontinued | Same product listing |
| `kt-5` | K-70G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-70g4-discontinued/5) | discontinued | Same product listing |
| `kt-6` | K-85G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-85g4-discontinued/6) | discontinued | [Single independent retailer table](https://www.towerhobbies.com/product/kingtech-turbines-international-kingtech-k-85g4-turbine-engine-with-ecu/KGT85G4.html); not cross-checked against US table |
| `kt-7` | K-102G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-102g4-/7) | unknown | Same product listing |
| `kt-8` | K-130G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-130g4-/8) | unknown | Same product listing |
| `kt-9` | K-142G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-142g4-/9) | unknown | [Single RC Jet Center table](https://rcjetcenter.com/website/product/kingtech-k-142g4/); not cross-checked against US table |
| `kt-10` | K-160G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-160g4-/10) | unknown | Same product listing |
| `kt-11` | K-180G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-180g4-/11) | unknown | Same product listing |
| `kt-12` | K-210G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-210g4-/12) | unknown | Same product listing |
| `kt-13` | K-235G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-235g4-/13) | unknown | Same product listing |
| `kt-14` | K-260G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-260g4-/14) | unknown | Same product listing |
| `kt-15` | K-320G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-320g4-/15) | unknown | [Single BGD Tech table](https://www.bgdtech.biz/product-page/kingtech-k-320g4); not cross-checked against US table |
| `kt-16` | K-450G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-450g4-industrial-purchases-only-please-inquire-/16) | industrial only | Same product listing |
| `kt-120` | K-86G4+ | [KingTech item](https://www.kingtechturbines.com/product/kingtech-k-86g4-discontinued/120) | discontinued | [Single AerobatX retailer table](https://aerobatx.co.uk/shop/Kingtech-K86-K86G4-turbine); factory revision unresolved |

## Evidence policy and known exceptions

All numeric fields carry their individual `sourceUrl` and `verifiedOn`. Supplier thrust expressed as kilograms is modelled as **kgf**, never kilograms of engine mass; mass is in grams, dimension axes are identified in millimetres, speed is rpm and fuel flow is in g/min. No volume conversions are performed without measured fuel density. A pump code mentioned in copy is not proof of interchangeability. No source-side price, ETA, discount, inventory, image or checkout information is copied.

- **K-30G4+ (kt-1)**: Source says 3 kgf+ rather than an exact nominal thrust; 450 g includes valve and mount. Keep numeric thrust absent.
- **K-45G4+ (kt-2)**: The recorded 450 g includes internal valve, mount, control system and FOD screen; same scope as the JSON draft.
- **K-55G4+ (kt-3)**: Full numeric table from KingTech GCC, linked per spec; source inventory states discontinued.
- **K-65G4+ (kt-4)**: Source lists 600 g without the mounting bracket; discontinued 2025-10-01.
- **K-70G4+ (kt-5)**: Discontinued 2025-10-01; historical remaining-stock marketing is not BODICH availability.
- **K-85G4+ (kt-6)**: Tower Hobbies technical table used; do not confuse K-85 specs with the mislabelled regional K-86 page.
- **K-102G4+ (kt-7)**: Source specifications refer only to the G4+ generation, not same-numbered G5.
- **K-130G4+ (kt-8)**: Source weight is 1200 g bare; 1270 g including mounting hardware.
- **K-142G4+ (kt-9)**: RC Jet Center gives EGT 750 °C and BigPlanes 700 °C. Diameter, length and maximum RPM also vary; all four disputed fields are withheld.
- **K-160G4+ (kt-10)**: Source reports a 1540 g engine, separate from the G5 model of matching nominal thrust.
- **K-180G4+ (kt-11)**: Supplier identifies a KP600BL fuel pump; compatibility not confirmed.
- **K-210G4+ (kt-12)**: Supplier identifies a KP800BL pump; copy does not imply interchangeability.
- **K-235G4+ (kt-13)**: 23.5 kgf is the supplier's nominal G4+ thrust, not a G5 product number.
- **K-260G4+ (kt-14)**: Source describes 26 ±0.5 kgf; numeric field holds nominal 26 kgf only.
- **K-320G4+ (kt-15)**: BGD gives EGT 730 °C, Al's Hobbies 700 °C; omit the disputed value.
- **K-450G4+ (kt-16)**: Industrial inquiries only, never a zero-price retail listing.
- **K-86G4+ (kt-120)**: AerobatX's K-86G4+ table conflicts with earlier Taiwanese data; nominal thrust, diameter, EGT and fuel consumption are withheld. This historical source ID remains distinct from K-86G5.

The K-142G4+ conflicting-temperature sources are [RC Jet Center](https://rcjetcenter.com/website/product/kingtech-k-142g4/) and [BigPlanes](https://www.bigplanes.nl/contents/nl/p27612_Kingtech-K-142G4-New-%281.3kg%29.html). The K-320G4+ conflict is between [BGD Tech](https://www.bgdtech.biz/product-page/kingtech-k-320g4) and [Al's Hobbies](https://alshobbies.co.uk/jet-centre-engines/Kingtech-K-320G4-Turbine-K-320G4). A [KingTech GCC URL for K-85G4+](https://kingtech-gcc.com/product/kingtech-k-85g4/) was encountered during the K-86 research and contains K-85 specifications, not verified K-86 data; the K-86G4+ data uses [AerobatX](https://aerobatx.co.uk/shop/Kingtech-K86-K86G4-turbine) instead. No disputed exhaust temperature is asserted as verified. The source's '+3 kgf' style indicator for K-30 does not prove exact nominal thrust.

### Mass scope and comparability

Every G4+ mass measurement now has a structured `scope`:

- `assembly_with_integrated_hardware` — K-30 and K-45 values include named integrated valve/mount/control hardware.
- `bare_engine` — K-65, K-130 and K-86 explicitly exclude the mounting bracket or refer to bare engine mass.
- `not_stated` — the other 12 engines lack an explicit comparable measurement boundary in the selected source.

Do not use these three groups as directly comparable weights in public tables: `not_stated` is not evidence for a bare-engine measurement. Scope describes what the **cited source** weighs, not what BODICH will supply.

## Regional discrepancies and source-selection rule (2026-10-25 audit)

The US KingTech source inventory product page identifies the SKU, but individual regional listings sometimes have **different technical tables for an identically named G4+ model**. Neither a supplier's current ecommerce listing nor agreement on engine name alone proves an exact factory hardware revision. Numerical fields are omitted where these source statements conflict, even if one is directly from the US listing. The conflicting figures below are documentary evidence **only**, not structured specifications or BODICH performance claims.

| Model | US KingTech G4+ listing | Regional KingTech GCC G4+ listing | Staging decision |
|---|---|---|---|
| K-180G4+ (`kt-11`) | [US KingTech](https://www.kingtechturbines.com/product/kingtech-k-180g4-/11): max EGT 750 °C | [GCC](https://kingtech-gcc.com/product/kingtech-k-180g4/): max EGT 700 °C | EGT **unset**; agreed dimensions, nominal thrust, mass, RPM and fuel flow retained |
| K-210G4+ (`kt-12`) | [US KingTech](https://www.kingtechturbines.com/product/kingtech-k-210g4-/12): 121,000 rpm, max EGT 750 °C and fuel consumption 620 g/min | [GCC](https://kingtech-gcc.com/product/kingtech-k-210g4/): 120,000 rpm, max EGT 650 °C and fuel consumption 590 g/min | RPM, EGT and fuel flow **unset**; diameter 112.6 mm, length 280 mm, engine mass 1,740 g and nominal thrust 21 kgf remain |
| K-260G4+ (`kt-14`) | [US KingTech](https://www.kingtechturbines.com/product/kingtech-k-260g4-/14): max EGT 750 °C | [GCC](https://kingtech-gcc.com/product/kingtech-k-260g4/): max EGT 700 °C | EGT **unset**; identical other core dimensions, RPM and nominal thrust retained |

**Other known conflicts / product revisions:**

- **K-142G4+ (`kt-9`)**: vendor EGT 700 versus 750 °C; a second seller's diameter/length and maximum-RPM figures also differ from [RC Jet Center](https://rcjetcenter.com/website/product/kingtech-k-142g4/). **All four fields are withheld** rather than selected from one reseller. The remaining measurements use a single seller and still require factory review.
- **K-320G4+ (`kt-15`)**: the 700 °C value shown by [KingTech GCC](https://kingtech-gcc.com/product/kingtech-k-320g4/) contrasts with 730 °C in the linked [BGD Tech](https://www.bgdtech.biz/product-page/kingtech-k-320g4) table. EGT remains unset.
- **K-86G4+ (`kt-120`)**: [AerobatX's later G4+ listing](https://aerobatx.co.uk/shop/Kingtech-K86-K86G4-turbine) gives 76 mm, 8.6 kgf, 700 °C and 300 g/min; the older [KingTech Taiwan K86G4+ page](https://kingtechtw.com/product/k85g4/) instead shows 76.5 mm, 8.5 kgf, 770 °C and 280 g/min. The draft retains only non-disputed figures attributed to AerobatX; the contradictory **thrust, diameter, temperature and fuel-flow fields are unset** rather than presented as revision-independent facts. Factory revision identification remains pending. The historical source's `K-86G4+` identity must not be deduplicated with G5.
- **K-45G4+ (`kt-2`)**: an Australian reseller also lists a **K45mG4+** with 230,000 rpm and 770 °C; this may be a distinct variant. Its figures were not mixed into the [source inventory K-45G4+](https://www.kingtechturbines.com/product/kingtech-k-45g4-discontinued/2) record.

**Gate:** [`g4-withheld-specs.json`](./g4-withheld-specs.json) is the single machine-readable source of truth for withheld source ID + field combinations (including dimensional axes) and their written reasons. The validator derives its negative fixtures from that file; the prose above explains the same decisions without a second code-side list. Until authoritative factory revision documentation resolves disagreements, do not restore the withheld G4+ numeric fields as "verified". The offline checker rejects these contradictory values even if a contributor otherwise supplies syntactically valid units and evidence URLs. This policy matches the omitted K-180G5 temperature in issue #27. No assumption about an engine’s availability, interchangeability or BODICH product approval is made from these sources.

## Original illustration briefs, future issue #33

These are descriptions for future **independent BODICH-style concept art**, not permission to reuse supplier images, trademarks, product photos, or replica CAD. Any later concept must be visibly labeled **Concept illustration / Ilustrație conceptuală**, reviewed and kept outside public website assets until company-approved.

| ID | Model | Original-image direction |
|---|---|---|
| `kt-1` | K-30G4+ | Muted archival line drawing beside an unnumbered thrust callout. |
| `kt-2` | K-45G4+ | Generic compact turbine and separate abstract mounting flange sketch. |
| `kt-3` | K-55G4+ | Minimal inlet profile on a technical grid and archive plate. |
| `kt-4` | K-65G4+ | Side silhouette with clearly schematic bracket exclusion. |
| `kt-5` | K-70G4+ | Neutral discontinued-series technical illustration, no stock graphics. |
| `kt-6` | K-85G4+ | Circular intake concept made of independent geometric shapes. |
| `kt-7` | K-102G4+ | Small turbine shell study with bilingual conceptual drawing label. |
| `kt-8` | K-130G4+ | Two abstract profiles showing bare engine versus mounting silhouette. |
| `kt-9` | K-142G4+ | Geometry-only outline, deliberately no temperature annotations. |
| `kt-10` | K-160G4+ | Generic axial turbine intake-to-exhaust schematic. |
| `kt-11` | K-180G4+ | Independent airflow pictograms and non-branded engineering silhouette. |
| `kt-12` | K-210G4+ | Isometric turbine housing concept with abstract flow arrows. |
| `kt-13` | K-235G4+ | Long horizontal non-branded contour and symbolic fuel-flow icons. |
| `kt-14` | K-260G4+ | Shaft-axis and nozzle concept without thrust-tolerance illustration. |
| `kt-15` | K-320G4+ | Large technical illustration with explicit EGT not verified label. |
| `kt-16` | K-450G4+ | Industrial-use conceptual housing with REFERENCE ONLY banner. |
| `kt-120` | K-86G4+ | Historical reference plate emphasizing geometry and archived status. |

**Neutral fallback:** all 17 records have `images: []` and `approval: draft` (enforced by the #28 offline validator). Later image/approval tasks must deliberately revise that guard after separate review. Research collection grouping is available to offline validation via `buildReferenceDrafts`; publishing remains exclusively controlled by `confirmedProducts`. Reviews under #33 (images), #34 (copy) and #35 (approval) remain separate. `npm run catalog:source:check` enforces all G4+ source-ID mappings, category grouping, locale copy, source statuses, standard specs, and regression fixtures for missing or disputed values.

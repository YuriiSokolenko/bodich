# Issue #30 — KingTech turbine accessories reference intake

**Snapshot:** 23 October 2026, original KingTech Square storefront. **Editorial staging:** 25 October 2026. This is a research reference, **not** a BODICH product catalog, stock list, distributor agreement, price sheet or compatibility guarantee. Refer to [source coverage](./source-coverage.md) and the machine-checked [exact source-ID baseline](./accessory-source-ids.json).

## Inventory parity and acceptance

The original site presents **89 accessory listings across 14 nested source categories** and no stand-alone results at the umbrella accessories category. Four independently confirmed product URLs (IDs 32, 33, 107 and 138) are **direct-only**, making **93 unique accessory product IDs**. Each has exactly one source-linked, unpublished editorial override in [reference-overrides.json](./reference-overrides.json). The 28 Pump listings and 13 Engine Bracket listings include five modern opaque Square identifiers; these remain separate IDs rather than being dropped or merged into approximate variants. The captured snapshot has no duplicate cross-listing, but the source category URL arrays are preserved for future cross-listed items.

| Unpublished BODICH reference group | Items |
|---|---:|
| `ecu-controls` | 10 |
| `electrical-components` | 7 |
| `fuel-systems` | 40 |
| `mounting-hardware` | 17 |
| `turbine-protection` | 5 |
| `maintenance-parts` | 14 |
| **Total** | **93** |

These six are **unpublished editorial groups**, not new live sales routes. External accessory records retain `itemType: "accessory"`, `categoryId: "turbine-accessories"`, their full source URL and captured source availability/status. `kt-107` records the source's **out-of-stock** finding; this is not a BODICH stock claim.

### Source facts and explicitly unknown information

- The **variant label** is an exact literal fragment of the manufacturer's source title (for example `KP300DP`, `4mm`, `K260` or `G4/G4+`). A model suffix is not decoded as voltage, controller type, performance or physical interchangeability. Numbered UAT models do **not** establish litres or millilitres.
- The **compatibility status** is `source_title_only` when a literal designation appears in the source title, otherwise `unverified`. `confirmedModels: []` intentionally remains empty in **all 93 records**. A title such as “for K45/55/70/86” is saved *as printed*, **not expanded** into verified generation-specific model support.
- No detailed original-source evidence independently established connector pinouts, pressure/flow ratings, voltage, actual hose ID/OD, bracket hole geometry, exact dimensions, pack quantity, or complete model fitment for these records. Numeric `specs` remain empty instead of fabricating manufacturer measurements. Every record links the exact original product URL; source-title text is the only imported product fact.
- Each of 93 records carries original English and Romanian draft names, summaries and component-aware detail descriptions. Product links and human-readable titles remain attributed to KingTech; descriptions are newly written, not copied. All records have `approval: "draft"`, `images: []`. Company content review and artwork rights clearance follow issues #33–#35, and `confirmedProducts` remains empty.

### Original BODICH artwork directions (not supplied imagery)

Each accessory references one of these **six original illustration briefs** via `artBriefId`. All visuals are proposals **only**; `images: []` is the truthful fallback. Artwork, when later produced, must be an independently created conceptual image, labeled as illustrative in EN/RO and cleared for publication. Do **not** recreate or trace KingTech product photography.

## ecu-controls

**Scope:** Control interfaces, ECU/GSU/DRM units, communications and telemetry. **Original concept brief:** Unbranded, neutral block-and-connector topology on a dark workbench, showing a generic ECU module, GSU display and signal lead. No invented pinouts, displays or manufacturer markings.

## electrical-components

**Scope:** Battery feeds, turbine power leads and pump-side connections. **Original concept brief:** Isometric study of independent power and signal harnesses with clearly differentiated abstract ends. Do not copy connector shapes from the source or suggest any wiring pin assignment.

## fuel-systems

**Scope:** Fuel pumps and suffix variants, tubing, filtration, UAT, fittings and valves. **Original concept brief:** Technical exploded illustration combining a generic pump and fluid path with unconnected filter, air trap and tubing pieces; no calibrated flow arrows or pressure ratings.

## mounting-hardware

**Scope:** Engine brackets plus TP propeller fasteners and spacers. **Original concept brief:** Generic metal bracket outlines alongside a separated generic spacer and bolt against dimensional grid without drawn measurements. Never depict the pictured part as a measured exact-fit KingTech product.

## turbine-protection

**Scope:** Distinct small/medium/large and coded FOD-screen references. **Original concept brief:** Abstract intake-guard mesh study in multiple silhouettes, without implying an actual measured turbine inlet diameter or model-specific fit.

## maintenance-parts

**Scope:** Starter motors, starter cases and clutches, seals, kerosene plug and probe. **Original concept brief:** Flat-lay exploded scene separating starter housing, clutch, O-rings, temperature probe and ignition plug as schematic objects, not a complete repair kit.


## Item-by-item original-source inventory comparison

The source URL shown in each row is the product-level evidence anchor and preserves opaque Square IDs exactly. “Title only” flags an *unverified fitment label*, **not** a confirmed compatibility matrix. Missing labels and detailed measurements stay unknown. Cross-listed items would still have only one row per original source ID.

| Source ID | Original source product link | Source subcategory | Unpublished grouping | Variant as printed | Compatibility evidence |
|---|---|---|---|---|---|
| `kt-30` | [ECU Comm Cable](https://www.kingtechturbines.com/product/ecu-comm-cable/30) | ecu-comm-cable | `ecu-controls` | — | Unverified |
| `kt-32` | [Power Cable](https://www.kingtechturbines.com/product/power-cable/32) | Direct-only | `electrical-components` | — | Unverified |
| `kt-33` | [G4/G4+ Data Cable](https://www.kingtechturbines.com/product/g4-g4-data-cable/33) | Direct-only | `ecu-controls` | G4/G4+ | `G4/G4+` (title only) |
| `kt-35` | [ECU Comm Cable for E Model (Gold Xicoy ECU)](https://www.kingtechturbines.com/product/ecu-comm-cable-for-e-model-gold-xicoy-ecu-/35) | ecu-comm-cable | `ecu-controls` | E Model | `E Model` (title only) |
| `kt-36` | [ECU Comm Cable for E/F Model (Black Xicoy ECU)](https://www.kingtechturbines.com/product/ecu-comm-cable-for-e-f-model-black-xicoy-ecu-/36) | ecu-comm-cable | `ecu-controls` | E/F Model | `E/F Model` (title only) |
| `kt-39` | [Battery/Pump Cable for KT Pump](https://www.kingtechturbines.com/product/battery-pump-cable-for-kt-pump/39) | pump-cable | `electrical-components` | — | `KT Pump` (title only) |
| `kt-41` | [Battery/Pump Cable for K30/45G3](https://www.kingtechturbines.com/product/battery-pump-cable-for-k30-45g3/41) | pump-cable | `electrical-components` | — | `K30/45G3` (title only) |
| `kt-42` | [Pump Cable for G4](https://www.kingtechturbines.com/product/pump-cable-for-g4/42) | pump-cable | `electrical-components` | — | `G4` (title only) |
| `kt-43` | [Pump Cable for G4+/G5](https://www.kingtechturbines.com/product/pump-cable-for-g4-g5/43) | pump-cable | `electrical-components` | — | `G4+/G5` (title only) |
| `kt-44` | [Turbine Power Cable](https://www.kingtechturbines.com/product/turbine-power-cable/44) | turbine-power-cable | `electrical-components` | — | Unverified |
| `kt-45` | [G4/G4+/G5 Battery Cable](https://www.kingtechturbines.com/product/g4-g4-g5-battery-cable/45) | turbine-power-cable | `electrical-components` | G4/G4+/G5 | `G4/G4+/G5` (title only) |
| `kt-46` | [FOD Screen - Small](https://www.kingtechturbines.com/product/fod-screen-small/46) | fod-screen | `turbine-protection` | Small | Unverified |
| `kt-47` | [FOD Screen - Medium](https://www.kingtechturbines.com/product/fod-screen-medium/47) | fod-screen | `turbine-protection` | Medium | Unverified |
| `kt-48` | [FOD Screen - Large](https://www.kingtechturbines.com/product/fod-screen-large/48) | fod-screen | `turbine-protection` | Large | Unverified |
| `kt-49` | [FOD Screen 260](https://www.kingtechturbines.com/product/fod-screen-260/49) | fod-screen | `turbine-protection` | 260 | Unverified |
| `kt-50` | [Data Cable G4/G4+/G5](https://www.kingtechturbines.com/product/data-cable-g4-g4-g5/50) | ecu-comm-cable | `ecu-controls` | G4/G4+/G5 | `G4/G4+/G5` (title only) |
| `kt-51` | [KingTech ECU G2](https://www.kingtechturbines.com/product/kingtech-ecu-g2/51) | ecu-and-gsu | `ecu-controls` | G2 | `G2` (title only) |
| `kt-55` | [GSU KingTech](https://www.kingtechturbines.com/product/gsu-kingtech/55) | ecu-and-gsu | `ecu-controls` | — | Unverified |
| `kt-56` | [KingTech GSU Bluetooth Module](https://www.kingtechturbines.com/product/kingtech-gsu-bluetooth-module/56) | other-accessories | `ecu-controls` | — | Unverified |
| `kt-57` | [KingTech Telemetry](https://www.kingtechturbines.com/product/kingtech-telemetry/57) | other-accessories | `ecu-controls` | — | Unverified |
| `kt-58` | [Fuel Filter](https://www.kingtechturbines.com/product/fuel-filter/58) | other-accessories | `fuel-systems` | — | Unverified |
| `kt-59` | [Shut-Off Valve](https://www.kingtechturbines.com/product/shut-off-valve/59) | other-accessories | `fuel-systems` | — | Unverified |
| `kt-60` | [90 Degree Fuel Festo Fitting](https://www.kingtechturbines.com/product/90-degree-fuel-festo-fitting/60) | other-accessories | `fuel-systems` | — | Unverified |
| `kt-62` | [Engine Bracket K320](https://www.kingtechturbines.com/product/engine-bracket-k320/62) | engine-bracket | `mounting-hardware` | K320 | `K320` (title only) |
| `kt-63` | [Engine Bracket K260](https://www.kingtechturbines.com/product/engine-bracket-k260/63) | engine-bracket | `mounting-hardware` | K260 | `K260` (title only) |
| `kt-65` | [Engine Bracket K30/45 G3/G4](https://www.kingtechturbines.com/product/engine-bracket-k30-45-g3-g4/65) | engine-bracket | `mounting-hardware` | K30/45 G3/G4 | `K30/45 G3/G4` (title only) |
| `kt-66` | [Stainless Steel Bracket for K45/55/70/86](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k45-55-70-86/66) | engine-bracket | `mounting-hardware` | K45/55/70/86 | `K45/55/70/86` (title only) |
| `kt-67` | [Stainless Steel Bracket for K60/85](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k60-85/67) | engine-bracket | `mounting-hardware` | K60/85 | `K60/85` (title only) |
| `kt-68` | [Stainless Steel Bracket for K80/100/120/142](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k80-100-120-142/68) | engine-bracket | `mounting-hardware` | K80/100/120/142 | `K80/100/120/142` (title only) |
| `kt-69` | [Stainless Steel Bracket for K140/160/180](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k140-160-180/69) | engine-bracket | `mounting-hardware` | K140/160/180 | `K140/160/180` (title only) |
| `kt-70` | [Stainless Steel Bracket for K235](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k235/70) | engine-bracket | `mounting-hardware` | K235 | `K235` (title only) |
| `kt-71` | [Starter Motor K30/45 G3](https://www.kingtechturbines.com/product/starter-motor-k30-45-g3/71) | starter-motor | `maintenance-parts` | K30/45 G3 | `K30/45 G3` (title only) |
| `kt-72` | [Starter Motor 45/70](https://www.kingtechturbines.com/product/starter-motor-45-70/72) | starter-motor | `maintenance-parts` | 45/70 | Unverified |
| `kt-73` | [Starter Motor for K60/85](https://www.kingtechturbines.com/product/starter-motor-for-k60-85/73) | starter-motor | `maintenance-parts` | K60/85 | `K60/85` (title only) |
| `kt-74` | [Start Motor K80/210](https://www.kingtechturbines.com/product/start-motor-k80-210/74) | starter-motor | `maintenance-parts` | K80/210 | `K80/210` (title only) |
| `kt-75` | [Starter Motor Case K45/70](https://www.kingtechturbines.com/product/starter-motor-case-k45-70/75) | starter-motor | `maintenance-parts` | K45/70 | `K45/70` (title only) |
| `kt-76` | [Starter Motor Case K60/85](https://www.kingtechturbines.com/product/starter-motor-case-k60-85/76) | starter-motor | `maintenance-parts` | K60/85 | `K60/85` (title only) |
| `kt-77` | [Starter Motor Case K80/210](https://www.kingtechturbines.com/product/starter-motor-case-k80-210/77) | starter-motor | `maintenance-parts` | K80/210 | `K80/210` (title only) |
| `kt-78` | [Starter Motor Clutch](https://www.kingtechturbines.com/product/starter-motor-clutch/78) | starter-motor | `maintenance-parts` | — | Unverified |
| `kt-79` | [Starter Motor K260/320](https://www.kingtechturbines.com/product/starter-motor-k260-320/79) | starter-motor | `maintenance-parts` | K260/320 | `K260/320` (title only) |
| `kt-80` | [Starter Motor Case K235/260/320](https://www.kingtechturbines.com/product/starter-motor-case-k235-260-320/80) | starter-motor | `maintenance-parts` | K235/260/320 | `K235/260/320` (title only) |
| `kt-81` | [KingTech KP200 Pump](https://www.kingtechturbines.com/product/kingtech-kp200-pump/81) | pump | `fuel-systems` | KP200 | Unverified |
| `kt-82` | [KingTech KP300 Pump](https://www.kingtechturbines.com/product/kingtech-kp300-pump/82) | pump | `fuel-systems` | KP300 | Unverified |
| `kt-83` | [KingTech KP500 Pump](https://www.kingtechturbines.com/product/kingtech-kp500-pump/83) | pump | `fuel-systems` | KP500 | Unverified |
| `kt-84` | [KingTech KP600 Pump](https://www.kingtechturbines.com/product/kingtech-kp600-pump/84) | pump | `fuel-systems` | KP600 | Unverified |
| `kt-85` | [KingTech KP800 Pump](https://www.kingtechturbines.com/product/kingtech-kp800-pump/85) | pump | `fuel-systems` | KP800 | Unverified |
| `kt-86` | [KingTech KP300V Pump](https://www.kingtechturbines.com/product/kingtech-kp300v-pump/86) | pump | `fuel-systems` | KP300V | Unverified |
| `kt-87` | [KingTech KP500V](https://www.kingtechturbines.com/product/kingtech-kp500v/87) | pump | `fuel-systems` | KP500V | Unverified |
| `kt-88` | [KingTech KP600V Pump](https://www.kingtechturbines.com/product/kingtech-kp600v-pump/88) | pump | `fuel-systems` | KP600V | Unverified |
| `kt-89` | [KingTech KP800V Pump](https://www.kingtechturbines.com/product/kingtech-kp800v-pump/89) | pump | `fuel-systems` | KP800V | Unverified |
| `kt-90` | [KingTech KP1200V Pump](https://www.kingtechturbines.com/product/kingtech-kp1200v-pump/90) | pump | `fuel-systems` | KP1200V | Unverified |
| `kt-91` | [KingTech KP200BL Pump](https://www.kingtechturbines.com/product/kingtech-kp200bl-pump/91) | pump | `fuel-systems` | KP200BL | Unverified |
| `kt-92` | [KingTech KP300 BL Pump](https://www.kingtechturbines.com/product/kingtech-kp300-bl-pump/92) | pump | `fuel-systems` | KP300 BL | Unverified |
| `kt-93` | [KingTech KP500BL Pump](https://www.kingtechturbines.com/product/kingtech-kp500bl-pump/93) | pump | `fuel-systems` | KP500BL | Unverified |
| `kt-94` | [KingTech KP600BL Pump](https://www.kingtechturbines.com/product/kingtech-kp600bl-pump/94) | pump | `fuel-systems` | KP600BL | Unverified |
| `kt-95` | [KingTech KP800BL Pump](https://www.kingtechturbines.com/product/kingtech-kp800bl-pump/95) | pump | `fuel-systems` | KP800BL | Unverified |
| `kt-96` | [KingTech KP1000BL](https://www.kingtechturbines.com/product/kingtech-kp1000bl/96) | pump | `fuel-systems` | KP1000BL | Unverified |
| `kt-97` | [KingTech KP1200BL Pump](https://www.kingtechturbines.com/product/kingtech-kp1200bl-pump/97) | pump | `fuel-systems` | KP1200BL | Unverified |
| `kt-98` | [KingTech KP1250BL Pump](https://www.kingtechturbines.com/product/kingtech-kp1250bl-pump/98) | pump | `fuel-systems` | KP1250BL | Unverified |
| `kt-99` | [KP Pump Replacement Wire/Valve Set](https://www.kingtechturbines.com/product/kp-pump-replacement-wire-valve-set/99) | pump | `fuel-systems` | — | Unverified |
| `kt-103` | [TP-Propeller Spacer45](https://www.kingtechturbines.com/product/tp-propeller-spacer45/103) | tp-model-accessories | `mounting-hardware` | Spacer45 | Unverified |
| `kt-104` | [Propeller Bolt for K45TP](https://www.kingtechturbines.com/product/propeller-bolt-for-k45tp/104) | tp-model-accessories | `mounting-hardware` | — | `K45TP` (title only) |
| `kt-105` | [TP-Propeller Spacer60/100](https://www.kingtechturbines.com/product/tp-propeller-spacer60-100/105) | tp-model-accessories | `mounting-hardware` | Spacer60/100 | Unverified |
| `kt-106` | [TP-Bolt75L60/100](https://www.kingtechturbines.com/product/tp-bolt75l60-100/106) | tp-model-accessories | `mounting-hardware` | Bolt75L60/100 | Unverified |
| `kt-107` | [Fuel Solenoid Valve](https://www.kingtechturbines.com/product/fuel-solenoid-valve/107) | Direct-only | `fuel-systems` | Fuel | Unverified |
| `kt-108` | [Propane Solenoid Valve](https://www.kingtechturbines.com/product/propane-solenoid-valve/108) | valve | `fuel-systems` | Propane | Unverified |
| `kt-112` | [Fuel Tubing 4mm](https://www.kingtechturbines.com/product/fuel-tubing-4mm/112) | fuel-tubing | `fuel-systems` | 4mm | Unverified |
| `kt-113` | [Fuel Tubing 6mm](https://www.kingtechturbines.com/product/fuel-tubing-6mm/113) | fuel-tubing | `fuel-systems` | 6mm | Unverified |
| `kt-114` | [TEFLON Tubing 4mm](https://www.kingtechturbines.com/product/teflon-tubing-4mm/114) | fuel-tubing | `fuel-systems` | 4mm | Unverified |
| `kt-115` | [UAT 100](https://www.kingtechturbines.com/product/uat-100/115) | UAT | `fuel-systems` | UAT 100 | Unverified |
| `kt-116` | [UAT 150](https://www.kingtechturbines.com/product/uat-150/116) | UAT | `fuel-systems` | UAT 150 | Unverified |
| `kt-117` | [UAT 250](https://www.kingtechturbines.com/product/uat-250/117) | UAT | `fuel-systems` | UAT 250 | Unverified |
| `kt-121` | [Stainless Steel Bracket for K140/170/180/210](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k140-170-180-210/121) | engine-bracket | `mounting-hardware` | K140/170/180/210 | `K140/170/180/210` (title only) |
| `kt-124` | [Kero Plug for K30/45 G3 and G4](https://www.kingtechturbines.com/product/kero-plug-for-k30-45-g3-and-g4/124) | kero-plug | `maintenance-parts` | — | `K30/45 G3` (title only) |
| `kt-125` | [Starter Motor Clutch O-Rings](https://www.kingtechturbines.com/product/starter-motor-clutch-o-rings/125) | starter-motor | `maintenance-parts` | — | Unverified |
| `kt-137` | [FOD Screen 320](https://www.kingtechturbines.com/product/fod-screen-320/137) | fod-screen | `turbine-protection` | 320 | Unverified |
| `kt-138` | [Temp Probe - K30/45G](https://www.kingtechturbines.com/product/temp-probe-k30-45g/138) | Direct-only | `maintenance-parts` | — | `K30/45` (title only) |
| `kt-139` | [KingTech KP300DP Pump](https://www.kingtechturbines.com/product/kingtech-kp300dp-pump/139) | pump | `fuel-systems` | KP300DP | Unverified |
| `kt-140` | [KingTech KP500DP Pump](https://www.kingtechturbines.com/product/kingtech-kp500dp-pump/140) | pump | `fuel-systems` | KP500DP | Unverified |
| `kt-141` | [KingTech KP600DP Pump](https://www.kingtechturbines.com/product/kingtech-kp600dp-pump/141) | pump | `fuel-systems` | KP600DP | Unverified |
| `kt-142` | [KingTech KP800DP Pump](https://www.kingtechturbines.com/product/kingtech-kp800dp-pump/142) | pump | `fuel-systems` | KP800DP | Unverified |
| `kt-143` | [KingTech KP1000DP Pump](https://www.kingtechturbines.com/product/kingtech-kp1000dp-pump/143) | pump | `fuel-systems` | KP1000DP | Unverified |
| `kt-144` | [KingTech KP1200DP Pump](https://www.kingtechturbines.com/product/kingtech-kp1200dp-pump/144) | pump | `fuel-systems` | KP1200DP | Unverified |
| `kt-145` | [KingTech KP1250DP Pump](https://www.kingtechturbines.com/product/kingtech-kp1250dp-pump/145) | pump | `fuel-systems` | KP1250DP | Unverified |
| `kt-146` | [KingTech DRM G5](https://www.kingtechturbines.com/product/kingtech-drm-g5/146) | ecu-and-gsu | `ecu-controls` | G5 | `G5` (title only) |
| `kt-148` | [Stainless Steel Bracket for K65](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k65/148) | engine-bracket | `mounting-hardware` | K65 | `K65` (title only) |
| `kt-149` | [Brushless Starter Motor Assembly](https://www.kingtechturbines.com/product/brushless-starter-motor-assembly/149) | starter-motor | `maintenance-parts` | — | Unverified |
| `kt-151` | [Fuel Tubing 8mm](https://www.kingtechturbines.com/product/fuel-tubing-8mm/151) | fuel-tubing | `fuel-systems` | 8mm | Unverified |
| `kt-sq-B6UE3Q5GGAWUC57XIETALASF` | [PISCO One-Way Valve](https://www.kingtechturbines.com/product/pisco-one-way-valve/B6UE3Q5GGAWUC57XIETALASF) | pump | `fuel-systems` | — | Unverified |
| `kt-sq-ECX6KXRCBWRIZ2YGLCIVQAWT` | [Stainless Steel Bracket for K130](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k130/ECX6KXRCBWRIZ2YGLCIVQAWT) | engine-bracket | `mounting-hardware` | K130 | `K130` (title only) |
| `kt-sq-LRO5A4V3ZOBXOVEKU4F3PPC3` | [KingTech KP500V+](https://www.kingtechturbines.com/product/kingtech-kp500v-/LRO5A4V3ZOBXOVEKU4F3PPC3) | pump | `fuel-systems` | KP500V+ | Unverified |
| `kt-sq-PYRA6D5K64KITYJCJGXLZCQU` | [Engine Bracket K450](https://www.kingtechturbines.com/product/engine-bracket-k450/PYRA6D5K64KITYJCJGXLZCQU) | engine-bracket | `mounting-hardware` | K450 | `K450` (title only) |
| `kt-sq-VCEYUYCU5FJF2GZQMXDNZXJO` | [Stainless Steel Bracket for K102](https://www.kingtechturbines.com/product/stainless-steel-bracket-for-k102/VCEYUYCU5FJF2GZQMXDNZXJO) | engine-bracket | `mounting-hardware` | K102 | `K102` (title only) |

## Validation

Run `npm run catalog:source:check` (Node 24) to validate the 132-item master inventory and compare the **fixed 93 IDs / 14 nested counts / 4 direct-only pages** against this intake, ensure every accessory has a unique draft slug and original EN/RO copy, reject wrong taxonomy, future publication, invented measurements and false compatibility claims, and exercise negative fixtures. Also run `npm run check` and `npm run build`. The on-demand live shop browser audit remains a separate manual process; its result must be manually reviewed before changing the frozen evidence snapshot.

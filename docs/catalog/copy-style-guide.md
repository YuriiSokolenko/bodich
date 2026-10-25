# Issue #34 — bilingual catalog copy policy (EN / RO)

This policy applies to **132 separate KingTech source-reference IDs**, not confirmed BODICH products. Each ID already has independent, original English and Romanian **name**, **summary**, and **description** under `docs/catalog/reference-overrides.json`. Supplier titles, model numbers and technical facts are evidence, **not reusable manufacturer marketing copy**.

## Central EN/RO terminology

| Concept | English preferred | Română — preferred | Editorial rule |
|---|---|---|---|
| Jet turbine | turbojet engine | turboreactor | Never confuse a jet engine's thrust with a turboprop's shaft power. |
| Turboprop | turboprop engine | turbopropulsor | A recommended propeller does not prove inclusion or fitment. |
| Thrust | thrust | tracțiune | `kgf` is kilogram-force, not `kg` mass. Preserve qualifiers `+`, `±` and nominal vs maximum. |
| Shaft power | shaft power | putere la arbore | Use `kW` only when explicitly reported; do not infer it from jet thrust. |
| Rotational speed | rotational speed | turație | `rpm`; identify turbine vs output shaft, never assume the same shaft. |
| Exhaust gas temperature | exhaust gas temperature (EGT) | temperatura gazelor de evacuare (EGT) | `°C`; a disputed maximum is **not verified**, not a single chosen value. |
| Mass / weight | engine mass | masa motorului | `g` / `kg`; distinguish bare engine from assembly with mount/valve. |
| Fuel consumption | mass-based fuel consumption | consum masic de combustibil | `g/min` is mass, not `mL/min` or `L/h`; no density-free conversion. |
| Fuel | kerosene / Jet A1 / diesel | kerosen / Jet A1 / motorină | Only repeat explicitly source-listed options. |
| Fuel pump | fuel pump | pompă de combustibil | Quote exact model code; no inferred system compatibility. |
| Engine control unit | ECU / engine control unit | unitate electronică de comandă (ECU) | Keep ECU/GSU/SBus as source terminology. |
| Battery | battery / accumulator | acumulator | Source `LIFE` designation must not silently become `LiPo`, LiFePO4, or a known cell configuration. |
| Electrical rating | voltage / capacity | tensiune / capacitate | `V` and `mAh`; connector, cells and fitment stay unverified without evidence. |
| Hardware compatibility | compatibility | compatibilitate | A model family in a title is not a certified fitment or pinout. |
| FOD screen | foreign-object-debris screen | ecran de protecție FOD | No safety or performance guarantee inferred from the name. |
| Maintenance | maintenance parts | piese pentru întreținere | Service intervals and suitability need independent records. |
| Reference item | external technical reference | referință tehnică externă | Never imply a manufacturer relationship or local sales offer. |
| Discontinued | discontinued | model retras | Not an indication that BODICH once stocked it. |
| Industrial only | industrial enquiries only | numai pentru solicitări industriale | Does not imply local ordering availability. |
| Unverified | not verified | neverificat / neconfirmat | Omit invented details; keep the uncertainty visible. |

## Editorial checklist

- [x] All **132/132** inventory IDs retain one matching draft with EN/RO names, summaries and detailed copy; 132/132 unpublished artwork records have different, honest EN/RO alternative text.
- [x] Each of the **six source-linked numeric exceptions** has a specific URL, reason, and review tag in [copy-claim-evidence.json](./copy-claim-evidence.json). They remain prose caveats or cross-SKU comparisons, **not certified/nominal structured specifications**.
- [x] Automated checks enforce required fields, unique text by language and field, sensible lengths, model identity, supplier attribution, Romanian diacritics, local decimal conventions, source-linked quantitative claims, source-linked recommended propeller sizes, truthful localized illustration alt and no accidental publication.
- [x] [Copy review matrix](./copy-review-matrix.json) accounts for **every source ID** with reference links, evidence counts, source lifecycle, QA state and open review tags. The validator fails on a missing, duplicated or stale row.
- [ ] Native Romanian legal and marketing proofreading — **prelaunch only**. Automated QA does not represent a native-speaker approval or legal sign-off.
- [ ] Company confirmation of specific products, commercial details, manufacturer permissions, fitment and media rights — **separate Issue #35**. None of these reference items has been published.

## Number, notation and source decisions

Use dot decimals and comma thousands separators in English (`9.9 V`, `1,200 g`, `176,000 rpm`). Use comma decimals and dot thousands separators in Romanian (`9,9 V`, `1.200 g`, `176.000 rpm`). **Four-digit integers may be grouped or ungrouped** (`3,800 mAh` and `3800 mAh` both pass); integers with **five or more digits must use groups of three**, separated by commas in EN and dots in RO. Neither locale allows a grouping mark in the wrong place. Put a space before every recognized engineering unit (`700 °C`, `8,6 kgf`, `3800 mAh`), including N, bar, psi, %, km/h, m/s and °F; case remains significant (`mAh`, `kW`, `rpm`). The validator detects even unspaced claims such as `9.9V`, but rejects the missing space. Retain manufacturer model codes exactly; do not turn `K-86G5` into `K-86G4+` or expand a family qualifier into guaranteed compatibility. The oil titles' source-only `32oz` and gallon labels are kept **verbatim**, because the source does not resolve the ounce/gallon convention; no metric conversion is claimed.

The [review matrix](./copy-review-matrix.json) uses **`supplier_lifecycle_unverified`** for 121 records with unknown source lifecycle and **`numeric_specifications_not_verified`** for the 98 records without linked structured numerical specifications (mostly accessories, oils and service). Other review tags document K-30G4+'s open-ended thrust, K-130G4+'s separate mounted mass, K-260G4+'s thrust tolerance and conflicting EGT, K-100TPG4+'s ambiguous 6,200 rpm, and the distinct LIFE battery capacity comparisons. A warning does not constitute proof of safety, product authenticity, or current stock.

Every numerical claim in EN/RO checked copy with a recognized engineering unit must match either a **linked structured specification** or a documented cross-source/qualified claim in the exception ledger. Each exception also pins an EN/RO **accepted contextual phrase for the specific occurrence** (for example `over 3 kgf` or `3 kgf+`, never bare exact thrust). Changed qualifier wording requires an explicit evidence review. Supplier source URLs identify where the statement originated, not BODICH certification. Do not invent prices, delivery estimates, stock, manufacturer warranty or a BODICH manufacturing claim. The automated EN/RO commercial-language gate rejects **affirmative advertising promises** (for example `in stock at BODICH` / `în stoc la BODICH` or `free delivery` / `livrare gratuită`), while retaining honest disclaimers about unverified inventory, delivery and compatibility; native legal/marketing review remains necessary. The KingTech record identity is always attributed to KingTech. Generic diagrams remain visibly illustrative and unpublished.

## Offline consistency QA

Node 24:

```sh
npm run catalog:copy:check
npm run catalog:copy:self-test
```

For audit, release and future copy changes:

- **Review matrix:** After a deliberate change to the inventory, drafts, claim ledger or image alt, run `npm run catalog:copy:matrix`, inspect the diff and rerun the offline checks. The generator validates source, copy and artwork **before** atomically replacing the review matrix; regular checks never update review status.
- **Node CLI:** A direct-entry fallback for Node 24.0/24.1 is covered by dedicated tests, including simulated native and legacy entrypoint outcomes, import purity, foreign argv and an invalid direct CLI invocation. Canonical filesystem paths handle symlinked script entrypoints.
- **Supplier title labels:** Verbatim titles (for example `Fuel Tubing 4mm`) identify a supplier reference, not independently proven dimensions. The same numbers asserted separately in prose require structured or exception evidence; tests cover both cases.
- **Taxonomy:** The frozen inventory has exactly one non-`discounted` primary category per SKU. A legitimate future multi-category entry needs a reviewed taxonomy/schema change rather than an arbitrary first match.
- **Commercial claims:** Automatic checks catch a curated EN/RO set of *affirmative* promotions including delivery and availability wording; they deliberately preserve truthful uncertainty and negated promises. These rules are not comprehensive: native Romanian legal/marketing approval in #35 remains a prelaunch requirement.

**Release state:** technical/editorial automated consistency checked; **human Romanian proofreading pending**; **BODICH product, warranty, stock, media-rights and legal approvals not granted**.

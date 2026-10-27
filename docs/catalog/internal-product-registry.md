# Stage 18 — Internal BODICH product lifecycle (#58; epic #24)

**Current state: zero registered BODICH products and zero published products.** The 132 KingTech supplier entries remain independent, unpublished research records. The registry is safe metadata on a **public** repository; it is not secure storage, a catalog API, a sign-off tool or evidence of a BODICH product.

## Three distinct identities

1. **Source-reference draft:** one of the 132 supplier entries (kt-* source IDs) in source-inventory.json and reference-overrides.json. Supplier names, descriptions, photos and specifications are not BODICH manufacturer proof. Reviews belong to the Stage 13 review-ledger.json, whose current epoch and immutable previous-epoch archives retain all approvals, rejections, holds and reasons.
2. **Proposed BODICH product:** a separate stable bdc-* identity, BODICH model and independently named bdv-* variants, with localized product slugs, bilingual copy, verified per-claim evidence references and media rights metadata. It can be incomplete and blocked without claiming availability, ownership, rights or a commercial offering. No ID/slug collision or implicit supplier name mapping is allowed.
3. **Verified/promotable BODICH product:** still unpublished. Every variant must have current-epoch Stage 14 independent product evidence tied to the exact BODICH model and variant and all Stage 13 human ledger gates approved. Exact photo rights and independent EN/RO content review are required, with no unresolved media. This status is *eligibility for a future manual PR*, never publication authorization.

Only the explicitly reviewed public confirmedProducts in src/catalog/data.ts can generate routes. The private BODICH JSON and validator belong to docs/ and scripts/ exclusively; src/ and public/ may not import or ship them.

## JSON contract and validation

Registry: docs/catalog/bodich-products.json. Schema v1 requires schemaVersion=1, purpose=internal_bodich_products_unpublished, reviewEpoch, reviewRevisions (four exact Stage 13 manifest SHA-1 revisions) and products array. All unexpected keys are rejected. Its committed products array stays EMPTY in this stage. CI fixture data exists only in memory.

For each candidate product:

- id: immutable lowercase bdc-*; lifecycle: proposed or verified; categoryId: an existing typed BODICH category; identity: BODICH manufacturer and nonempty model.
- slugs: complete en and ro lowercase hyphenated route identifiers, globally unique and different from all source draft slugs, including case-folded collisions.
- editorial: en and ro name, summary, description, state (draft, ready_for_review, reviewed), reviewRef and copySha256. Fingerprint is SHA-256 of the JSON object in name/summary/description key order. A reviewed record requires an opaque restricted: review evidence pointer; draft/ready records have null reviewRef. Such a pointer only claims review metadata and does not authenticate a human or replace Stage 13.
- variants: nonempty list of unique bdv-* ids, exact variant code, an optional sourceId (existing kt-* research lead or null) and claims array. Each source lead can be used by at most one variant. Each claim has kind, finite positive value, exact supported unit and independent Stage 14 evidenceId with exactly matching type, value, unit and BODICH model/variant. Optional dimension/speed metric and mass measurement scope are validated. Unsupported technical claims are always rejected, including in proposed products. Source names are never used to guess variants, claims or identity.
- media: unique bdm-* id, variantId, kind (product_photo, original_concept, original_diagram), opaque restricted: original ref, exact SHA-256, rights status (unknown, cleared, rejected), bilingual alt text and rightsEvidenceId. A cleared product photo must match verified Stage 14 exact-model evidence, variant, digest, rights holder and permission. A concept, diagram or registered unverified image cannot be passed off as exact-model photography. Unknown/rejected photos carry no clearance ID. Concept/diagram rights clearance belongs to the Stage 15 media workflow, never this photo evidence channel.

The validator derives approval and blocking reasons directly from Stage 13/14, not a second writable approval system. It rejects wrong epochs or changed inventory/overrides/art/copy revision hashes, collisions, invalid identities, wrong variant, missing approval, unknown rights, unsupported spec units/values, stale bilingual fingerprints and claims not independently evidenced. A proposed entry may lack a source lead but cannot be verified until a separately reviewed Stage 13/14 workflow supports authentic BODICH-only identities. In v1 each verified variant must have its own current evidence-linked source lead.

All evidence originals, contracts, unlicensed photos, personal identity documents, secrets and customer information stay OFF GitHub. Safe metadata may use only opaque restricted: identifiers into independently controlled private storage. A hash, status or alleged reviewer identity never authenticates the original material.

## Offline commands

With Node 24 and npm ci:

- npm run catalog:products:check — verifies empty committed registry, current epoch, exact 132-source coverage, rights, no site-side registry leaks, and no automatic promotion into confirmedProducts. The real production collection remains empty.
- npm run catalog:products:self-test — exercises an isolated *synthetic* in-memory verified product, variant, localized copy, claim/photo evidence, positive manual-PR eligibility and extensive negative fixtures. It never writes products, source decisions, human events or public routes.
- npm run catalog:products:export — writes the ignored local-only report visual-qa/bodich-product-registry-audit.json. The report is not publication authorization. Do not ship generated exports.
- npm run check and website CI — include these commands plus Stage 13/14 validation, reconciliation, public route and media guards.

Stage 18 intentionally has NO production CRUD, import writer, sales backend, automatic approval, stock, price, payment API or publication operation. Future proposed data should be prepared in a local uncommitted file and introduced only in an independently reviewed change, without editing frozen supplier manifests.

## Manual promotion / stale evidence / rollback (future independent PR)

1. Identify the real BODICH manufacturer, exact model and variant independently. Collect current manufacturer authority, original photographs with written rights and exact per-claim specifications, independent EN and native-RO/legal/commercial review. Originals remain private, with safe evidence digests and restricted: refs.
2. Stage 14 checks evidence completeness against the CURRENT source and 4-manifest revisions. If manifests have changed, follow review-ledger-runbook.md to seal the former epoch, migrate in a separate reviewed PR, reset effective approvals and re-review. Old approvals, holds, rejections and provenance remain audit history but cannot authorize the new epoch.
3. Stage 13 remains the sole human decision authority. Obtain actual attributable, independently reviewed human gate decisions for identity, imagery, specifications and editorial. Check conflicts, withdrawn permissions, blocked states, current digests and all per-variant evidence. Do not edit/forge hash chains or merely flip verified.
4. Independently review a new **publication PR**: assess human authority and original evidence, EN/RO content, current epoch, photo rights and exact digest, claims/units, image security, product and category routes, SEO, reconciliation and release CI. Only in that separate change may an authorized reviewer add a genuinely approved public confirmedProducts record and specifically approved public assets. A pure manual promotion checklist function exists for synthetic testing; it NEVER mutates publication state and is not invoked on actual products in this stage.
5. If approval is withdrawn or stale: stop release and revert the separate public publication PR and public assets; purge any deployed/CDN copies where appropriate. Keep source reference history, sealed ledger epochs and genuine evidence provenance intact for audit. Re-review rather than silently updating status or deleting history.

The Stage 18 change ends with 132 unpublished supplier references, no BODICH products in the committed registry, zero confirmedProducts, and no commerce or customer state.

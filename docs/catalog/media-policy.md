# Stage 15 — media provenance, rights and public-distribution policy (#55)

Parent catalog epic: #24. Complements the Stage 13 ledger and Stage 14 genuine-product evidence gate (#53). **No publication approval is granted here.**

## Current classification and evidence limits

- **Nine WebPs / three original visual concepts**, including six responsive derivatives: fictional BODICH turbine studio renders generated using ChatGPT image generation. All 11 pinned SHA-256 digests are in the [media rights registry](./media-rights.json); available historical generation briefs are in [turbine-imagery.md](../assets/turbine-imagery.md). Verbatim prompts, original PNG generation files, human creator attestations and commercial-use permissions are **not archived here**. These unknowns are explicit, not silently replaced with assumptions.
- **One hand-authored/stored vector turbine banner**: `docs/assets/bodich-banner.svg`. Author and grant of public/commercial use are not independently established; do not infer ownership.
- **One BODICH letterform favicon**: `docs/catalog/review-media/ui/favicon.svg`. Source/rights-holder not documented; not published by default.
- **132 unpublished supplier-reference diagram entries**, each with four generated output paths (WebP 360/600/1200 and PNG 600), from `docs/catalog/art-manifest.json` and `scripts/generate-catalog-art.mjs`. These are procedural technical *illustrations*, **not photographs** or exact-model representations. Their generated files are ignored from Git and may correctly be reported as `missing` before generation.

The machine-readable [registry](./media-rights.json) records image classification (`ai_concept`, `technical_illustration`, `verified_product_photo`), separate rights status (`unverified`, `restricted_review`, `cleared_with_evidence`), permitted usage, source/derivative relationship, claimed context, source ID if relevant, and provenance only where documented. **Every current record is `unverified` and `restricted_review`; none are approved for public use.** Neither an image-generation subscription nor text describing terms is an image license, an IP warranty, or permission for a specific brand.

The deterministic audit hashes bytes that *actually exist* using SHA-256; missing file digests are `null`, never fabricated. It pins and validates SHA-256 for all 11 version-controlled media assets (three main WebPs, six derivatives and two SVGs), links derivatives to originals, rejects duplicates, missing/unattributed assets, unexpected rights states, suspect public files and leaked site HTML. The CI report is `visual-qa/media-inventory.json`. Before generating the 528 diagrams, a local inventory lists them as absent by design. CI runs `--require-generated` after the art generator to verify **all 539** expected media files.

## Isolation and current exposure

- **Normal `npm run build` is the public-safe mode**. Product/hero pages display EN/RO withheld-media notices rather than linking to uncleared WebP. The favicon is also withheld. CI runs `npm run media:public` on built HTML and distributed files and fails on unexpected image assets.
- The 9 WebPs and favicon reside in `docs/catalog/review-media/`, **not** `public/`. The README no longer embeds the generated hero. The separate SVG banner is still a version-controlled document asset and is included in the audit, not an approved web image.
- The **GitHub repository is public**, including historical commits that originally contained the WebPs under `public/`. Anyone may already have accessed/downloaded these files. Relocation, `noindex`, CI artifacts and `visual-qa/` ignore rules **do not make them confidential** and cannot revoke earlier exposure. If genuine privacy or takedown is required, handle it separately with GitHub/history cleanup and authorized owners; do not assume the current repository is a secure evidence store.
- The existing offline review gallery deliberately keeps 132 supplier references and three **separate** BODICH marketing concepts with conspicuous bilingual AI/not-photography text. Website CI uploads the gallery, **including copies of these three AI WebPs**, to a seven-day GitHub Actions artifact in this public repository. This is an additional redistribution path of uncleared concept images, **not** secure private storage or a claim of public-use permission. It may be opened from ignored local files. GitHub Actions artifacts for public repositories must never include confidential permissions, agreements, signatures, full originals or personal information.

## Reproducible workflow (Node 24)

```sh
npm ci
npm run media:check          # registry, SHA-256 originals, no unknown/public images
npm run media:self-test      # negative fixtures for hash, missing, duplicates, leak, rights
npm run media:inventory      # local JSON report, missing diagrams are explicit
npm run catalog:art:generate
npm run media:generated      # requires all 528 diagrams and writes complete report
npm run catalog:review:build # local-only 132-reference bilingual review gallery
npm run catalog:review:check
npm run build
npm run media:public         # validate distributable dist and public/ are image-free
```

For a **disposable, explicitly private/local browser preview only**, use `BODICH_MEDIA_PROFILE=private_review npm run media:stage-private` to stage copies from `docs/catalog/review-media/` into `public/`, then `BODICH_MEDIA_PROFILE=private_review npm run build` or `npm run dev` with that environment variable. This mode **deliberately produces a non-distributable build**. Never deploy, commit the staged public files, or upload `dist/` from that profile. Because the staged files are intentionally blocked from distribution, running `npm run check` or `npm run media:public` in that staged checkout **fails by design**. The staged copies are `.gitignore`d to discourage accidental commits, but their presence still correctly fails the public-media gate. Use a fresh checkout before ordinary CI/public-safe builds. Browser Visual QA uses this opt-in mode solely to test layout, EN/RO disclosures and WebP decoding; normal Website CI independently verifies public-safe output.

## Human clearance: future PR only

1. Identify the specific file **and its exact SHA-256**, all derivatives and intended channels (internal review, marketing, catalog, distribution). Obtain original source/generation context and traceable permission/ownership documents from the actual authorized rights holder; track IP/third-party brand/model risks, jurisdiction and expiration. Use private/restricted references to store evidence, **not** raw confidential files in Git.
2. A named responsible reviewer must evaluate the exact permitted usage, dates, brand and likeness, BODICH manufacturer authorization and any restrictions. Record a verifiable `rightsEvidence`, `clearanceReviewer`, `clearanceDate` and precise `permittedUses` rather than checking a box. **AI-generated does not mean cleared.** Re-approve any changed image bytes or materially changed use; derivatives require an explicit covered scope.
3. Decide separately whether the asset could truthfully be shown as a **photograph of an existing exact BODICH model**. A concept illustration can *never* become an `exact_model_photo` merely through commercial rights clearance or a filename change. Stage 14 independent exact-model image evidence (same SHA, correct variant), company identity, bilingual/editorial/legal review and signed ledger gates remain additional mandatory conditions.
4. Propose a separate reviewed PR changing registry states, source image handling, HTML, verified product data and tests together. No automatic status transition, mass promotion, source-history alteration, commerce activation or supplier-SKU approval is performed by Stage 15.

## Gate failures and limitations

- File missing or modified -> reproducible missing/digest failure; unknown art in `public/`, `docs/assets/`, `docs/catalog/review-media/` or draft-assets -> unattributed failure.
- Unverified media in `public/` or shippable `dist/`, README embed or static HTML reference -> **release rejected**.
- Exact-model photography intake with SHA-256 matching any registered AI concept or technical illustration -> **always rejected regardless of commercial-rights clearance**. Unverified art of any type is also blocked from publication. A permitted marketing concept does not become an actual model photograph.
- Local-only preview disclosure is always visible in EN and RO; a source reference's diagram remains clearly separate from genuine product photography.
- URL scanning covers local image references in generated HTML and the file scanner covers image files in the distribution; arbitrary remote image URLs, CSS inline/data URIs and externally hosted content are outside this gate and require separate manual/CI verification before launch.
- SHA-256 proves byte equality only; it does **not** establish authorship, legal rights or photographic authenticity. Metadata omissions are not evidence. Public Git history remains exposed until separately addressed.

The 132 source drafts, existing ledger event history and `confirmedProducts = []` remain unchanged by this stage.

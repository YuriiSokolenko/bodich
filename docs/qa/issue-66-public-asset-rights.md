# Stage 20A — public asset rights register and release-safe audit (#66)

Parent [Stage 20 launch-readiness epic #60](https://github.com/YuriiSokolenko/bodich/issues/60).
Complements catalog media safeguards #55 and the unpublished-draft program #24.

**Current decision: NO-GO.** A successful automated build audit means only that the exact candidate bytes were inventoried and no *unregistered release media* passed the machine gate. It does **not** grant intellectual-property rights, validate ownership, authenticate a reviewer, or authorize deployment. The BODICH rights-owner position and the proposed 2026-11-03 review target are unconfirmed. An authorized, named human must accept the role and conduct the actual review; #71 governs the final build-level GO/NO-GO.

## Source of truth and boundaries

- [`config/public-asset-rights.json`](../../config/public-asset-rights.json) is the deny-by-default rights register for **public release assets**. The initial `assets` collection is deliberately **empty**: no image, logo, icon, social preview, font or other media is asserted to be cleared.
- [`docs/catalog/media-rights.json`](../catalog/media-rights.json) plus the 132-item [art manifest](../catalog/art-manifest.json) are the **review-only source registries**. Existing AI concepts, SVGs, derivatives and generated diagrams remain `unverified`, not published. A release file whose SHA-256 matches a known uncleared source is rejected even if renamed and separately claimed as approved. A genuinely approved release would need the source rights to be reconciled too.
- `scripts/audit-public-assets.mjs` walks **every regular file in the actual `dist` tree**, computes SHA-256 from its bytes, records its path or sanitized path identifier, provenance and review state. HTML, compiled CSS/JS, `_headers`, sitemap and robots are included in the build-wide digest report. Generated code/markup is not treated as independently media-cleared: its legal/source review and exact-artifact human release sign-off remain pending in #71.
- Every distributed **media** file, including a local image, SVG, brand mark, favicon, video, PDF, web manifest, font or preview, must have an individual register entry with matching **dist-relative path and SHA-256**. Missing, unknown, pending, denied, modified or unpinned media blocks the technical check. Symlinks and special filesystem entries are rejected.
- Referenced local resources from HTML `src`/`srcset`/lazy-load attributes, video `poster`, icon/preload/manifest/image links, OpenGraph/Twitter image/video/audio and Microsoft tile metadata, CSS `url()`/`@import`/quoted `image-set()` are checked against built files. Remote, protocol-relative and embedded `data:`/`blob:` resources in these known media contexts, plus inline SVG, are blocked; self-host and register exact approved bytes instead. External **navigation** links and canonical/hreflang/OG page URLs are not downloaded images. Compiled JavaScript receives a conservative literal scan for remote media URLs, `data:` media and `<svg` tokens; non-media files are checked for common binary media signatures. This is a *best-effort reference scanner*, **not** a complete CSS/JS analyzer, browser runtime trace, MIME verifier, obfuscation detector, legal rights verifier or HTML sanitizer; #70/#73 separately enforce HTML5, CSP and leak checks. Dynamically constructed URLs, nonstandard lazy-load conventions, CSS escapes, JS escape sequences, base64 content without a `data:` prefix and embedded resources without recognizable signatures can evade static pattern detection. Those residual risks require human code and browser review in #71.
- The two historical, unverified inline menu SVG icons have been replaced with CSS-drawn shapes in the release-safe header. This changes no supplier catalog image, product approval or demo art rights.

## Required fields for each newly cleared media asset

Add one entry for each actual emitted media path:

```json
{
  "path": "images/example-approved.svg",
  "classification": "ui_icon",
  "status": "cleared",
  "sha256": "<exact 64-character sha256 of dist file>",
  "sourceRef": "src/original-media-file-or-generator",
  "generatorOrProvenance": "Verified creator / transformation record",
  "rightsOwner": "<verified real owner>",
  "permissionEvidence": "restricted:<opaque-off-repo-record-id>",
  "reviewer": "<real human reviewer>",
  "reviewDate": "YYYY-MM-DD",
  "permittedUses": ["public_website"],
  "representation": "illustrative_icon"
}
```

The example is a **schema illustration, not an approval**. Do not commit fabricated names, approvals, evidence, original permission documents, signatures, full generation originals or private personal details to this public repository. `restricted:` is only a non-sensitive pointer to evidence held in an authorized, access-controlled location **outside** GitHub/source/CI artifacts; the validator cannot independently prove that evidence exists. Human reviewers must validate it.

Valid classifications are `ai_concept`, `technical_illustration`, `product_photograph`, `brand_logo`, `ui_icon`, `font`, `social_preview`, and `other_media`. The identity/type of a concept **does not change** after rights clearance; a synthetic illustration is never documentary photography of an actual BODICH product. License/permission, authorship and accurate product representation are different approval questions.

An unapproved candidate may be recorded with `status: pending | denied | unknown`, but **must be removed from `dist`** before a technically passing release build. A cleared entry missing its named reviewer, date, rights holder, evidence reference, allowed use or exact SHA-256 is rejected; reviewer must differ from the rights owner even after case/whitespace normalization, review date must not be future-dated, and common placeholder words (`TBD`, `example`, `unknown`, `synthetic`, `fixture`, `TODO`, and equivalents) are invalid. **No cleared entry is accepted without a named accountable BODICH rights owner.** These machine checks detect obvious contradictions, not identity fraud: reviewers must separately verify the identities, entitlement and actual off-repo evidence. A stale entry referring to a missing release file is also rejected; update the registry and evidence together.

## Reproducible audit and evidence

```sh
npm ci
npm run check                  # includes negative asset-rights fixtures
npm run build                  # release_safe only; NOT build:beta
npm run assets:release        # hashes every dist file; machine gate fails on violations
node scripts/audit-public-assets.mjs dist --no-write
```

The machine-readable audit is `visual-qa/public-asset-rights-audit.json`, ignored by Git and uploaded as a short-retention CI artifact by **Pages release security**. It contains SHA-256, a safe path or path hash, classification, source/generator, claimed status, owner, off-repo evidence reference, reviewer, confirmation date and remediation for each distributable asset. The separate `quarantinedRegistry` collection covers the 11 checked-in review images plus the 528 generated reference diagram paths, with unknown reviewer/date explicitly `null`, a short SHA-256 prefix (not full private image digests), and a **computed** `distributed` boolean based on exact candidate bytes. A matching digest fails the gate even when disguised as generated code. For human mapping to internal draft paths/full digests, run the offline `npm run media:inventory` and inspect the existing registry; public CI logs use path-hash identifiers to avoid leaking unpublished inventory names.

Audit verdicts:

- `TECHNICAL_NO_GO`: something unregistered, altered, missing or uncleared reached the build (or a forbidden reference exists); the command exits nonzero.
- `OFFLINE_AUDIT_PASSED_HUMAN_NO_GO`: machine checks passed, but a verified human sign-off of the **exact release SHA/artifact** is still absent. No automatic production deployment or "approved" statement.

Build the normal root and `ASTRO_BASE=/bodich-preview` preview in CI, rerun the rights scanner on both outputs, and run the independent `pages:verify`, `media:public` and secret/privacy checks. Neither `noindex` nor a demo/beta flag grants rights. The separately requested `build:beta` still deliberately shows labeled AI artwork for presentation, but its images are **not** cleared release-safe inventory and **must not** be promoted by this gate.

## Remaining manual blockers

1. Name the actual BODICH rights owner, determine permissions for any proposed public media, and verify original off-repo contracts/creator evidence and transformations. Mark any unprovable asset denied or keep it quarantined.
2. Have a **different, real human reviewer** confirm each proposed asset's classification (concept vs actual photograph), exact SHA-256, permitted use, owner, source and evidence, then record their name/date in a reviewed PR.
3. Run #67 legal/operator, #68 native Romanian, #69 actual devices and accessibility, and #70 final Pages and Cloudflare checks. Forward the **exact release build SHA and artifact digest** to #71 for a separately authorized, signed and dated GO/NO-GO. Until all gates clear, **NO-GO**.

The original historical public GitHub/media artifact exposure described in the [catalog media policy](../catalog/media-policy.md) cannot be undone by moving or withholding files.

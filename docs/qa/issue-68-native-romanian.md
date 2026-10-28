# Stage 20C (#68) — native Romanian release sign-off

**Status: NO-GO.** The committed register at `docs/qa/issue-68-romanian-review.json` is an unsigned planning record, not approval. Human review has **not** happened. Parent #60; editorial #57, bilingual UX #56, legal #67, decision #71.

## Evidence, scope and owner

A **named, genuine native Romanian human reviewer** must read the final **rendered** pages alongside English and explicitly confirm native-language competence. The BODICH editorial lead must independently acknowledge closure. No AI, automated translation, source-code proofreading, CI green status or synthesized name may authorize GO. The Stage 20F release authority remains separate and decides deployment.

The committed allow-list currently has **22 localized public routes** (11 EN, 11 RO), plus a root EN fallback, robots.txt and sitemap.xml. The register must contain **every** localized route and all nine shared-component rows. Changing the allow-list without updating the review coverage matrix fails the checker. Private supplier drafts and unapproved product URLs are excluded from public scope.

## Human review procedure

1. Freeze an informational-only `release_safe` candidate SHA; build with Node 24, run all CI/release checks and preserve the exact public-dist manifest digest from Stage 20F. Use the same build bytes and SHA for the entire sign-off.
2. Run `npm run romanian:dist` after `npm run build`. Download the **bilingual-rendered-public-copy-review** Actions artifact or use `visual-qa/romanian-rendered-review.json` locally. It captures both locales' *rendered text* for header, mobile/desktop navigation, language switch, main, footer, and title/description/OG/hreflang, with per-page HTML hashes and the full dist digest. The report's `candidateGitSha` is populated **only** with an explicit `--candidate-sha` and stays null otherwise. `buildCheckoutSha` separately records `GITHUB_SHA` in Actions, which is usually a **synthetic PR merge commit** rather than the PR branch head; it must not be mistaken for a human-approved candidate. Reports also record `basePath` and the digest. The final `--require-pass` always requires an explicit `--candidate-sha`, never an environment fallback. The root report and the separate non-root `visual-qa/romanian-rendered-preview.json` cannot overwrite each other. These are **public GitHub Actions artifacts** (30-day retention), containing only copy already present on public routes: **do not add reviewer identities, private evidence, supplier drafts or other secrets**. Neither file is included in `dist/` or Git history.
3. Native reviewer opens every **real rendered page** in EN and RO side-by-side, including all category pages; compares heading, intro, product-availability qualifiers, educational/technical meaning, contact/privacy/legal statements, SEO titles/descriptions, OG copy, alt/aria text, header/footer, menu, label truncation and terminology. Check navigation on mobile and desktop, canonical/hreflang, RO→EN→RO links and root fallback. Check missing legal/privacy routes as *missing* rather than inventing approvals. Record viewport/browser, date and preview location in restricted evidence.
4. For each correction add a `findings` row with ID `RO-001` etc., `location` (exact route or shared component), `element`, `severity` (`CRITICAL`, `MAJOR`, `MINOR`), `before`, proposed `after`, `status` (`OPEN` or `FIXED`). Fixed findings require `prRef`, `retestRef`, `retestedAt`; rerun review on the changed release SHA and regenerated HTML.
5. Record `PASS` for each route/component only after human inspection with `reviewedAt` and a restricted `evidenceRef`. Any unfinished row or unresolved serious mistranslation, unsupported company/product statement or missing bilingual metadata is NO-GO. A successful semantic scanner **does not** establish linguistic parity.
6. Keep identifying/signature/browser originals outside this public repository. Supply an authorized `--record=/restricted/romanian-review.json` with `status: APPROVED`, named native reviewer, `nativeRomanianConfirmed: true`, dated `signedAt`, `signatureEvidence`, editorial-lead acknowledgement, exact `candidate.gitSha` and `candidate.distManifestSha256`, complete matrix and resolved severe findings.

Before any Stage 20F human GO attempt, independently check:

```sh
node scripts/verify-romanian-qa.mjs --dist --require-pass --candidate-sha=<full-40-character-SHA> --record=/restricted/romanian-review.json
```

Stage 20F `--require-go` runs the same **mandatory** validator on its exact `--dist` and `--candidate-sha`. Supply `--romanian-record=/restricted/romanian-review.json` to Stage 20F; without it, the committed NO-GO record rejects GO. Every new build/copy edit invalidates the previous sign-off. Identity and evidence authenticity still need independent human verification. A GitHub URL used as `evidenceRef` is **only a pointer**, never identity verification or proof that a person inspected the rendered copy. The native reviewer, editorial lead and Stage 20F release authority must be distinct people (NFKC-normalized identity check).

## Technical coverage and limits

`npm run romanian:check` validates the unsigned register and coverage; `npm run romanian:self-test` checks synthetic positive/negative fixtures; `npm run romanian:dist` (and `romanian:dist:preview` for nested builds) parses final Astro HTML, enforces English/Romanian language and OG locale metadata, semantic H1 and layout landmarks, desktop/mobile/footer navigation, exact switch-link counterpart (including nonroot base), and canonical language-alternate targets whenever a canonical/site URL exists. Domain-less NO-GO previews may omit alternates; **final `--require-pass` requires exactly one `en`, `ro` and `x-default` alternate per page**, including the correct non-root path. It captures **rendered** text for human comparison, but cannot judge translation fidelity, clipping, real device rendering or legal adequacy. Existing `seo:routes`, `pages:verify`, `legal:dist` and real-browser #69/#67 gates remain separate and mandatory.

**Release posture:** #68 remains open / NO-GO until independent named native-RO sign-off and a frozen build are evidenced, even if this technical PR merges.

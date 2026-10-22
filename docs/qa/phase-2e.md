# BODICH Phase 2E — Responsive visual QA

**Scope:** Current bilingual Astro preview pages, navigation, Header, Footer, and shared components. This is not an acceptance test for the future real product catalog or checkout.

## Verified run

- [Browser Visual QA — run 39866697953](https://github.com/YuriiSokolenko/bodich/actions/runs/39866697953)
- [Website CI — run 39866698048](https://github.com/YuriiSokolenko/bodich/actions/runs/39866698048)
- Tested source revision: `2b5d1bee8c2f95250b9e00cf525eb48bd84a51c9` (website and browser tests); this document update does not change the tested source.
- Browser: Playwright 1.64.1, Chromium headless
- **49 / 49 browser checks passed**
- **10** language/viewport combinations, **14** screenshots captured

The screenshot ZIP, `report.json` and `report.md` are attached as **bodich-visual-qa-39866697953** to the successful workflow run, subject to GitHub's 14-day retention period.

## Test matrix

| Width | English | Romanian | Navigation |
| --- | --- | --- | --- |
| 320px | PASS | PASS | Mobile disclosure + locale switch |
| 390px | PASS | PASS | Mobile disclosure + locale switch |
| 768px | PASS | PASS | Mobile/tablet disclosure |
| 1024px | PASS | PASS | Desktop navigation |
| 1440px | PASS | PASS | Desktop navigation |

Browser assertions cover: language and routes, one accessible main heading, landmark and footer navigation labels, active route, no horizontal overflow, Header inside viewport, mobile menu dismissal via document-level Escape and outside pointer, focus return to the summary button, no-JavaScript native menu functionality, switching EN/RO while preserving section, switcher target size, keyboard skip link, sampled body/muted/accent/focus/control contrast, console errors, failed requests, HTTP 4xx/5xx resources and browser page-script exceptions. All twelve localized pages resolve successfully.

## Screenshot inspection

Reviewed representative **EN/RO desktop (1024, 1440)** and **mobile (320)** full-page screenshots plus tablet/mobile expanded-menu screenshots (768, 320).

- No obvious cropped navigation labels, accidental horizontal page overflow, or overlapping footer columns in the reviewed viewport captures.
- On narrow Romanian screens, the preview badge wraps onto two lines; its border and surrounding layout remain intact.
- The expanded mobile menu intentionally overlays the page content and shows a clear active-page indicator.
- The current homepage is intentionally sparse and consists of placeholder content; the upcoming product imagery and catalog are outside the scope of this review.

Automated checks and captured images are not a pixel-perfect baseline comparison, exhaustive WCAG audit, or proof of typography equivalence on every browser/OS.

## Deferred before public launch

- Physical-device and cross-browser verification (including Safari/Firefox).
- Native Romanian-language proofreading for public-facing marketing content.
- Final SEO/accessibility review once a real domain, product copy, and legal/contact details exist.
- Confirm production indexing strategy, product images, data, and all commerce flows in later roadmap stages.

**Conclusion:** Phase 2E automated Chromium responsive QA is green at the pinned source revision, and representative screenshots have been reviewed. Final merging of [PR #9](https://github.com/YuriiSokolenko/bodich/pull/9) still requires the normal PR review.

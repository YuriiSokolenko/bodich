# Stage 20D / Issue #87 — locked Linux Firefox + WebKit smoke

This is an **automated compatibility regression gate only**, not launch authorization. It runs Playwright's Linux Firefox and Linux WebKit against the **release-safe** BODICH EN/RO static build. It does not inspect presentation-beta concept images, draft SKU pages or unpublished supplier data.

## Coverage and fail-closed policy

The workflow [Stage 20D Firefox and WebKit Smoke](../../.github/workflows/release-cross-browser-qa.yml) runs on **every PR targeting main** (without path filters, so it can safely be required by branch protection) and on manual workflow_dispatch.

- **48 route cells**: Firefox and WebKit × English and Romanian × home, products, accessories, support, about, contact × 390px mobile and 1440px desktop.
- **8 interactive journeys**: engine × language × viewport. Each starts on products, validates that language switching preserves the route, and navigates to support. Mobile verifies Enter opens the native details menu; Escape closes it and restores focus to summary. Desktop uses primary navigation.
- Every route must return HTTP 200 with exact locale/path, one H1, one semantic header, one footer, one main, and no horizontal overflow. Same-origin images are decoded with source-path diagnostics on failure. Uncaught page errors, console errors, failed same-origin requests, same-origin HTTP 4xx/5xx or unexpected off-origin traffic cause FAIL. Each case waits for static-page network idle and a short settle before validating recorded errors.
- **Navigation cancellation exception is intentionally narrow**: only a same-origin **document** request on the main frame, cancelled while an explicitly initiated link navigation is in progress, with one of the exact abort errors (net::ERR_ABORTED, NS_BINDING_ABORTED, Load cancelled, Cancelled), is benign. Cancelled scripts, styles, images and fetches and aborts outside that window fail.
- The --self-test fixtures check wrong language, wrong route, overflow, external/different-port origins, non-benign request aborts and missing/duplicated/failed matrix cells and journeys. The same pure policy and completeness functions are used by the live runner. Any accepted negative fixture fails the workflow; these fixtures are synthetic and do not claim to be live-device tests.

If a browser cannot launch, unexecuted cells and journeys are reported as FAIL. Screenshots are saved **only on failures**.

## Locked build and integrity

CI checks out the **actual PR head SHA** (not the synthetic PR merge SHA) with checkout credentials disabled, uses **ubuntu-24.04** and Node 24 from .nvmrc, runs one npm ci and npm run qa:lock:check, then npm run check and npm run build. It reuses existing Stage 20D qa:dist:record and qa:dist:verify with the canonical Stage 20F dist manifest, exact source SHA and lockfile SHA-256. It installs only matching browser binaries and Linux OS prerequisites with ./node_modules/.bin/playwright install --with-deps firefox webkit **after freezing the build**. There is no second npm resolution, alternate Playwright install, npx fallback, beta build or post-install rebuild. The Ubuntu runner label is fixed, but the hosted image patch level and system apt packages can still change; browser binaries come from the pinned Playwright version.

Integrity is checked after installation, in the QA runner before/after execution, and again in an independent always-run CI step. Results are written outside dist.

## Clean-checkout reproduction

On Linux with Node 24 and permission to install Playwright OS prerequisites, in a clean checkout of the candidate commit:

~~~bash
npm ci
export QA_OUTPUT_DIR=visual-qa/cross-browser-qa
export QA_HEAD_SHA="$(git rev-parse HEAD)"
npm run qa:lock:check
npm run check
node scripts/release-cross-browser-qa.mjs --self-test
npm run build                         # NEVER build:beta
npm run qa:dist:record
./node_modules/.bin/playwright install --with-deps firefox webkit
npm run qa:dist:verify
npm run preview -- --host 127.0.0.1 --port 4321 --strictPort
~~~

In a second terminal in the same checkout:

~~~bash
export QA_OUTPUT_DIR=visual-qa/cross-browser-qa
export QA_HEAD_SHA="$(git rev-parse HEAD)"
node scripts/release-cross-browser-qa.mjs
npm run qa:dist:verify
~~~

The preview binds to loopback at 127.0.0.1. The browser runner refuses external network hosts.

## Artifact contract and retention

The CI artifact named stage-20d-cross-browser-(run-id) is retained for **14 days**. It uploads summary.json, build-integrity.json and failure-only PNG screenshots. The large installed npm tree inventory is used locally for integrity validation but is not uploaded. Artifacts and screenshots never become public website assets, **but are not confidential**: this public repository's GitHub Actions artifacts can be downloaded by signed-in GitHub users with access under GitHub's artifact rules. Never include secrets, supplier drafts or private reviewer evidence.

summary.json (schemaVersion 1) records the real checkout head SHA, optional GitHub event SHA, canonical dist digest before/after, lock SHA-256, Node and locked Playwright versions, actual reported Firefox/WebKit versions, 48 per-cell PASS/FAIL outcomes, eight journey outcomes, errors and screenshot references. PASS_AUTOMATED_ONLY never means release GO.

If CI cannot start (for example, browser install failure), inspect the failed workflow run: no browser/device pass can be inferred without matching evidence. Preview startup errors and the last 100 preview-log lines are shown on failures.

## What remains NO-GO

**Linux Playwright WebKit is not Apple Safari** (macOS or iOS). **Headless Playwright Firefox is not a real desktop/manual Firefox session**. This workflow does not satisfy physical Android/iPhone checks, VoiceOver/TalkBack, native Romanian sign-off, production field CWV/INP, legal/asset-rights approvals or independent human retesting. The Stage 20D human matrix #69, final decision #71 and epic #60 remain **NO-GO** until separate evidence exists. The existing Chromium visual QA, axe/Lighthouse budget and Pages security workflows are unchanged.

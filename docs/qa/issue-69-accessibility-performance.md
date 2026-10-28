# Stage 20D — real-device accessibility and performance verification (#69)

Parent: [Launch epic #60](https://github.com/YuriiSokolenko/bodich/issues/60). Related: #56, #57 and the independent [Stage 20F release gate #71](issue-71-release-decision.md).

**Status: NO-GO.** The checked-in [versioned QA matrix](issue-69-matrix.json) is an unsigned, explicitly untested baseline. No physical-device, screen-reader, macOS Safari, axe, field Core Web Vitals, or Lighthouse results are claimed. Automated tests alone cannot certify real-device use or WCAG 2.2 AA conformance.

## Coverage and accountable people

The QA/accessibility lead and independent reviewer are **not assigned**. Assign actual people before testing and preserve dated sign-off tied to the exact immutable release candidate. Never invent names, model numbers, browser/OS versions or test dates.

There are ten versioned reports (one per EN/RO for each): real Android phone with stable Chrome + TalkBack; real iPhone with Safari + VoiceOver; desktop stable Chromium; desktop stable Firefox; macOS Safari. Record exact device model, OS/browser versions, date, tester, test evidence, defects, remediation PR, and **a named independent retester**, dated retest and distinct retest reference. The retester must differ from the initial tester, retesting must not predate initial testing, and QA sign-off must not predate any test/retest. Android and iPhone need **portrait and landscape**; desktop requires real desktop/browser sessions.

For every applicable locale/platform manually test: keyboard focus order, skip link, menus and Escape/focus return; touch; images/alt text; names, roles and states of semantic controls; 200% and 400% zoom/reflow; reduced motion; EN/RO language switching; all six informational route types; and mobile TalkBack/VoiceOver with the navigation both closed and expanded. Record WCAG **2.2 AA** findings, axe violations and incomplete checks. No outstanding **critical/serious** issues are allowed. Every defect must link a remediation PR and a documented independent retest. A clean automated scan without human evidence remains **NO-GO**.

**Evidence security:** Keep raw screen recordings and personally identifiable tester/device information in authorized controlled storage. The public index may use consented names or controlled tester IDs resolvable in private records. Use sanitized non-secret GitHub issue/PR/Actions references or opaque restricted: identifiers. Never commit private links with tokens, recordings or unpublished supplier drafts. Preserve artifacts longer than GitHub Actions retention.

## Repeatable automated lab (supporting evidence only)

The dedicated **Stage 20D Release QA (automated only)** GitHub Actions workflow checks out the exact PR head SHA (not the synthetic GitHub merge ref), builds the release-safe informational profile, serves it only on loopback, installs exact-version Playwright/axe/Lighthouse tooling **after** building and runs:

~~~
npm run qa:evidence:check
npm run qa:evidence:self-test
npm run build
# From the repository root, after the build, on Node 24:
npm install --no-save --package-lock=false playwright@1.64.1 @axe-core/playwright@4.14.0 lighthouse@13.5.0
npx playwright install chromium
npm run preview -- --host 127.0.0.1 --port 4321
# In a separate terminal, from the same repository:
npm run qa:release
~~~

The audit scans all six public informational route types in **both languages** with WCAG A/AA axe rules, including expanded mobile menus, and records critical/serious issues and incomplete/manual-review cases. Its 390px Chromium viewport is a **simulation**, never a substitute for a phone.

Lighthouse makes **exactly three independent mobile lab runs** for each EN/RO homepage and products journey (12 runs). Raw Lighthouse JSON and a summary are uploaded as a **30-day Actions artifact**. Each report includes the **exact git checkout/source SHA** (PR head for PR events), the separately reported GitHub event SHA, **Stage 20F-compatible canonical SHA-256 of the complete dist manifest**, execution timestamp, exact tool/browser versions, host environment, CPU/network throttling and screen configuration, per-run metrics and median. Preserve raw files in controlled storage for release sign-off. This is a lab evidence identity, **not** an attestation that a PR-head build equals the eventual signed production build. Rebuild and verify the frozen release candidate's exact SHA and dist digest before final authorization. 
      
The first-party website build uses npm ci and its committed lockfile. The three QA packages are installed at **exact top-level versions** after the build; their transitive dependency tree is **not currently lockfile-pinned**, so byte-for-byte reinstall reproducibility is not guaranteed. Do not present this workflow as a fully hermetic dependency resolution. A separate QA lockfile is recommended before long-term archival/certification; keep the exact per-run tool versions, Lighthouse settings and CI artifact to support audit review. Never drop a failed run or treat an incomplete run group as passing.

| Measurable gate | Threshold |
| --- | --- |
| Lighthouse mobile performance | median score **≥90** |
| Lighthouse accessibility | median score **≥95** |
| Lab LCP | median **≤2,500 ms** |
| Lab CLS | median **≤0.1** |
| Lab TBT | median **≤200 ms** |
| Field p75 LCP (when reportable) | **≤2,500 ms** |
| Field p75 INP (when reportable) | **≤200 ms** |
| Field p75 CLS (when reportable) | **≤0.1** |

**TBT is not INP.** Field INP can only come from actual real-user measurement. Obtain p75 from a credible field source (e.g. CrUX or compliant RUM), with recorded sampling period, eligibility and provenance. If no sufficient real-user sample exists, keep **NO_FIELD_DATA** with null p75 numbers and an explicit reason; never substitute lab TBT or invent a passing field metric. Representative Lighthouse targets do not waive real-device/manual checks on the other routes.

## Human report and release procedure

1. Keep the public [matrix](issue-69-matrix.json) as NO-GO until real reports exist. Each device/locale row starts NOT_RUN. Fill exact version numbers, test date, tester, report reference, both orientations for phones, applicable test results and independent retest. N_A may only apply to desktop touch and mobile-specific screen-reader fields; it cannot waive a required check.
2. Save all ten versioned reports, signed WCAG/QA findings and raw automated artifacts in approved storage. Include defects, remediation PRs and retest links, all bound to one tested source SHA. Do not infer any physical device or assistive-technology run from CI.
3. Transfer the real per-run Lighthouse records and artifact references into the four lab targets of the matrix, retaining at least three valid independent runs each and all environment/configuration details. Do not fabricate results.
4. Run the evidence check: **npm run qa:evidence:check** succeeds for an honest NO-GO, printing missing gate counts. **npm run qa:evidence:self-test** checks both a fully valid **in-memory synthetic GO fixture** and negative cases (median failure, duplicates, independent reviewer/retest, field INP/eligibility, future dates and malformed refs); it never claims that the synthetic data came from a real person or device. **npm run qa:evidence:require-go** fails while real evidence is missing. Even a structurally complete GO needs independent human authenticity checks and sign-off.
5. The separate [Stage 20F release decision](issue-71-release-decision.json) keeps its QA row **BLOCKED** until the release authority verifies the actual dated QA sign-offs against the identical candidate SHA and dist digest. A new commit or changed build invalidates prior sign-off. The public record must include candidateSha and distManifestSha256 matching the actually tested build, with dated and separate initial/retest evidence.

**Planning target:** November 9, 2026, provisional and dependent on access to physical Android/iPhone devices, Safari on macOS, and a named QA lead. No waiver exists for unavailable devices.

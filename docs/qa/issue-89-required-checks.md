# Issue #89 — verify required GitHub Ruleset on `main`

BODICH uses the active **repository branch Ruleset [#26119822](https://github.com/YuriiSokolenko/bodich/settings/rules/26119822)**: `Protect main — required CI`. This is **not classic Branch Protection**. The policy in [`config/required-main-checks.json`](../../config/required-main-checks.json) declares the expected settings; [`scripts/branch-protection-policy.mjs`](../../scripts/branch-protection-policy.mjs) validates source workflows and audits the **actual Ruleset with GET only**.

**No apply/write operation exists.** In particular, do not run the obsolete `--apply --confirm=...` command from earlier versions of PR #90; it would attempt to create an unnecessary second, classic branch-protection rule. Changes to rules are made only by an authorized repository administrator in the [GitHub Ruleset settings](https://github.com/YuriiSokolenko/bodich/settings/rules/26119822).

## Required job contexts

| Required GitHub check (job ID) | Workflow | PR coverage |
| --- | --- | --- |
| `checks` | `.github/workflows/ci.yml` | Every PR to `main`; `create-lockfile` is skipped on PRs and the `checks` job explicitly tolerates that skipped dependency |
| `cloudflare-static-release` | `.github/workflows/pages-release-security.yml` | Every PR to `main` |
| `compatibility-smoke` | `.github/workflows/release-cross-browser-qa.yml` | Every PR to `main`; no path filters |

The Ruleset requires these three check contexts from **GitHub Actions** (`integration_id=15368`) and an **up-to-date branch** (`strict_required_status_checks_policy=true`). The runner rejects job-level `name:`, `strategy:`, conditional skips and incompatible event/path filters that could change or prevent the contexts.

Do **not** require `automated-qa` while `release-qa.yml` has a `pull_request.paths` filter, or `create-lockfile` (intentionally skipped on pull requests).

## Local and CI tests

```bash
npm run branch:policy:self-test
npm run branch:policy:check
npm run check
```

The policy self-test is part of `npm run check`, which runs on every PR to `main`. It tests policy drift, the exact required workflow triggers/job IDs, job-name and matrix regressions, and **simulated Ruleset API responses**. Fixture mutations cover active/enforcement status, default-branch targeting, bypass permissions, required PR rule, approvals, force pushes/deletions, strict up-to-date checks, GitHub Actions integration IDs, missing/extra checks, unexpected rules and read-only GET behavior.

These CI tests **do not call the live GitHub API** and cannot establish that the remote Ruleset is active.

## Audit the actual active Ruleset

From a checkout of the updated PR or merged `main`:

```bash
node scripts/branch-protection-policy.mjs --verify-live
```

The verifier performs exactly two read-only public GitHub API operations:
- `GET /repos/YuriiSokolenko/bodich`: verify the repository identity and `default_branch=main`.
- `GET /repos/YuriiSokolenko/bodich/rulesets/26119822`: verify `active` enforcement, exact default-branch targeting, empty bypass list (`current_user_can_bypass=never`), deletion restriction, non-fast-forward restriction, PR requirement, zero approvals, strict and unskippable status checks and their expected GitHub Actions app IDs.

The endpoint is readable without any administrator token for this public repository. If GitHub enforces an anonymous rate limit, an optional read-capable `GH_TOKEN` environment variable is supported. Do not put tokens into committed files, PR comments or command arguments. HTTP errors, missing fields and unexpected values **fail closed**; neither the CLI nor the automated tests send PUT, PATCH, POST or DELETE requests.

To modify the configuration, edit the active Ruleset in GitHub and then rerun the audit. Do not install overlapping classic branch protection as a workaround.

## Prove actual merge enforcement before closing #89

After reviewing and merging PR #90, the authorized maintainer should record dated evidence that:
1. The live Ruleset still matches `main`, has no bypass actors, `strict_required_status_checks_policy=true`, and requires the three named GitHub Actions checks.
2. An isolated, disposable pull request with a **failed or missing required check** is blocked from merging. Verify this using the GitHub PR UI/API. Never deliberately break `main`; do not bypass or manufacture a success.
3. An up-to-date PR with all required checks green can merge through the normal workflow; a stale PR needs an update to the latest `main`.
4. The release decision remains **NO-GO** until independent human Stage 20D real-device QA and Stage 20F legal/owner signoffs are completed (#60, #69, #71). The ruleset audit does not authorize a production launch.

The first live audit verifies the Ruleset's **configuration**, not an actual negative merge attempt. Keep issue #89 open until the enforcement probe is documented.

## Scope and limitations

The verifier checks repository Ruleset **#26119822**; it does not read or change the classic branch-protection endpoint, detect the impact of other organizational rules, or promise a human legal/compliance sign-off. Do not conflate automated Linux WebKit with Safari real-device QA. The public site stays release-safe, informational-only; no catalog approval, commerce change or deployment follows from this issue.

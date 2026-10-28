# Issue #89 — required PR checks on `main`

This change keeps the expected GitHub branch-protection policy under version control. **A passing CI run does not activate repository branch protection.** Applying the policy is a separate, repository-admin operation, verified against the live GitHub API.

## Required contexts

| GitHub required check (job ID) | Workflow | PR coverage |
| --- | --- | --- |
| `checks` | `.github/workflows/ci.yml` | Every PR to `main`; `create-lockfile` is skipped on PR and the `checks` job explicitly accepts that skipped dependency |
| `cloudflare-static-release` | `.github/workflows/pages-release-security.yml` | Every PR to `main` |
| `compatibility-smoke` | `.github/workflows/release-cross-browser-qa.yml` | Every PR to `main`; path filters were removed in #87 |

Do not add `automated-qa` from `release-qa.yml` to mandatory status checks until its `pull_request.paths` filter is removed. Do not require `create-lockfile`, which is intentionally skipped on PRs. Required status names are job IDs, **not** workflow display names.

The policy resides at [`config/required-main-checks.json`](../../config/required-main-checks.json), with the bounded CLI at [`scripts/branch-protection-policy.mjs`](../../scripts/branch-protection-policy.mjs).

## Automated tests / drift prevention

```bash
npm run branch:policy:self-test
npm run branch:policy:check
npm run check
```

The first command validates the three real PR workflows and exercises negative mutations: missing/duplicated checks, wrong protected branch, non-strict enforcement, a renamed job, filtered PR trigger, narrowed event type, a conditional/skippable job and `continue-on-error`. These tests run as part of `npm run check` in existing Website CI and Pages security workflows. The script intentionally never accesses the GitHub API during CI.

## Apply live branch protection (repository administrator)

The currently connected ChatGPT GitHub actions **cannot read or mutate branch protection**. A repository administrator must execute this one-time step separately; no admin token is committed to this repository, installed as a GitHub Actions secret, or shown in PR logs.

GitHub REST [branch protection administration](https://docs.github.com/en/rest/branches/branch-protection) requires repository **Administration: write** permissions to update it. Use a short-lived fine-grained GitHub token restricted to **only BODICH**, supplied through the environment and never via command-line arguments or a committed file.

From a checked-out `main` after merging the implementation PR:

```bash
# Terminal with an authorized fine-grained GitHub token; input is hidden.
read -rs GH_ADMIN_TOKEN && export GH_ADMIN_TOKEN && echo
node scripts/branch-protection-policy.mjs --apply --confirm=YuriiSokolenko/bodich:main
node scripts/branch-protection-policy.mjs --verify-live
unset GH_ADMIN_TOKEN
```

The apply operation:
- Creates classic protection when missing, with strict checks, `enforce_admins=true`, and force pushes/deletions blocked.
- On an already protected branch, **patches only required check contexts and admin enforcement**, retaining existing reviews, pinned check-app sources, restrictions, and unrelated required contexts. It does not blindly PUT a replacement for an existing rule.
- Fails on insufficient GitHub permissions or HTTP error; checks live API state after apply. Running `--verify-live` separately is an explicit second read.

If your account uses repository **rulesets** rather than classic protection, inspect [GitHub Rules settings](https://github.com/YuriiSokolenko/bodich/settings/rules) and their effective bypass exemptions before applying. The script verifies only classic branch protection, not inherited organization rulesets. Do not assert enforcement unless the active ruleset or branch protection is independently verified.

## Acceptance and manual negative control

After applying, record a dated screenshot or admin API result **outside public artifacts** showing:
1. `main` requires these exact three check contexts and a current head (`strict=true`).
2. The same checks apply to repository admins, including the owner.
3. A disposable PR with one missing/failing required check is **blocked**, even if other checks pass. Do not deliberately break `main` or bypass a failed check.
4. A representative green PR is mergeable, while Stage 20D manual device sign-offs and Stage 20F human release approvals remain **NO-GO**.

Only then check off the live-configuration acceptance criteria and close #89. A green implementation PR alone is **not sufficient**.

## Limitations

GitHub hosted Actions and GitHub's branch protection are different enforcement layers. This policy preserves the existing `automated-qa` path filter and avoids false claims that Linux WebKit is Safari. No production deployment, legal approval, Romanian sign-off, product verification or human launch authorization is implied.

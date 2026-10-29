#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../config/required-main-checks.json', import.meta.url), 'utf8'));
const fixedContexts = ['checks', 'cloudflare-static-release', 'compatibility-smoke'];
const expectedRepository = 'YuriiSokolenko/bodich';
const repositoryPath = '/repos/' + expectedRepository;
const rulesetPath = repositoryPath + '/rulesets/' + policy.rulesetId;
const expectedRulesetId = 26119822;
const expectedIntegrationId = 15368;
const requiredRuleTypes = ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'];

function validatePolicy(candidate) {
  assert.equal(candidate.schemaVersion, 2, 'policy schema version');
  assert.equal(candidate.rulesetId, expectedRulesetId, 'ruleset ID must be pinned');
  assert.equal(candidate.requiredIntegrationId, expectedIntegrationId,
    'GitHub Actions integration ID must be pinned');
  assert.equal(candidate.requirePullRequest, true, 'PR requirement may not be disabled');
  assert.equal(candidate.requiredApprovals, 0, 'approval policy drift requires review');
  assert.equal(candidate.disallowForcePushes, true, 'force pushes may not be allowed');
  assert.equal(candidate.disallowDeletions, true, 'branch deletion may not be allowed');
  assert.equal(candidate.repository, expectedRepository, 'repository must be pinned');
  assert.equal(candidate.branch, 'main', 'protected branch must be main');
  assert.equal(candidate.strict, true, 'branch must be up to date before merge');
  assert.equal(candidate.enforceAdmins, true, 'administrators cannot bypass required checks');
  assert(Array.isArray(candidate.requiredChecks), 'requiredChecks must be a list');
  const names = candidate.requiredChecks.map((c) => c.context);
  assert.deepEqual([...names].sort(), [...fixedContexts].sort(), 'required contexts have drifted');
  assert.equal(new Set(names).size, names.length, 'duplicate required context');
  for (const check of candidate.requiredChecks) {
    assert.equal(check.job, check.context, 'check context must match real job id');
    assert.match(check.workflow, /^\.github\/workflows\/[a-z0-9-]+\.yml$/, 'invalid workflow filename');
  }
  return candidate;
}

function section(source, key, indent) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === ' '.repeat(indent) + key + ':');
  assert(start >= 0, 'missing YAML section ' + key);
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(?:#.*)?$/.test(line)) {
      body.push(line);
      continue;
    }
    const spaces = line.match(/^ */)[0].length;
    if (spaces <= indent) break;
    body.push(line);
  }
  return body.join('\n');
}

function validateWorkflow(check, source) {
  const triggers = section(source, 'on', 0);
  const pullRequest = section(triggers, 'pull_request', 2);
  assert.match(pullRequest, /^ {4}branches: \[main\]$/m, check.context + ': PRs must target main');
  assert.doesNotMatch(pullRequest, /^ {4}(?:paths|paths-ignore|branches-ignore|types):/m,
    check.context + ': filtered pull_request would leave required checks pending');
  const jobs = section(source, 'jobs', 0);
  const job = section(jobs, check.job, 2);
  assert.match(job, /^ {4}runs-on:/m, check.context + ': missing runnable job');
  // GitHub check contexts become job.name or job (matrix-value) when present;
  // requiring the unmodified job ID would leave every PR permanently pending.
  assert.doesNotMatch(job, /^ {4}name:/m, check.context + ': job name changes required context');
  assert.doesNotMatch(job, /^ {4}strategy:/m, check.context + ': matrix changes required context');
  assert.doesNotMatch(job, /^ {4}continue-on-error:/m,
    check.context + ': required jobs may not ignore failures');
  const conditions = [...job.matchAll(/^ {4}if: (.*)$/gm)].map((m) => m[1]);
  if (check.job === 'checks') {
    // create-lockfile is skipped on PRs, but checks explicitly run on this skipped dependency.
    assert.deepEqual(conditions,
      ["always() && (needs.create-lockfile.result == 'success' || needs.create-lockfile.result == 'skipped')"],
      'Website CI checks job condition changed; inspect skipped PR behavior');
    const bootstrap = section(jobs, 'create-lockfile', 2);
    assert.match(bootstrap, /^ {4}if: github.event_name == 'push' && github.ref == 'refs\/heads\/feature\/project-foundation'$/m,
      'bootstrap must remain skipped on every PR');
  } else {
    assert.deepEqual(conditions, [], check.context + ': required job must not have a conditional if');
    assert.doesNotMatch(job, /^ {4}needs:/m,
      check.context + ': required job cannot depend on skippable jobs');
  }
}

function checkWorkflows(loader = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')) {
  validatePolicy(policy);
  for (const check of policy.requiredChecks) {
    validateWorkflow(check, loader(check.workflow));
    console.log('PASS required PR workflow: ' + check.context + ' (' + check.workflow + ')');
  }
}

async function selfTest() {
  checkWorkflows();
  const clone = () => structuredClone(policy);
  for (const change of [
    (p) => { p.strict = false; },
    (p) => { p.enforceAdmins = false; },
    (p) => { p.branch = 'develop'; },
    (p) => { p.requiredChecks.pop(); },
    (p) => { p.requiredChecks[2].context = p.requiredChecks[0].context; },
    (p) => { p.requiredChecks[1].job = 'incorrect-id'; },
    (p) => { p.rulesetId = 123; },
    (p) => { p.requiredIntegrationId = -1; },
    (p) => { p.requirePullRequest = false; },
    (p) => { p.requiredApprovals = 1; },
    (p) => { p.disallowForcePushes = false; },
    (p) => { p.disallowDeletions = false; },
  ]) {
    const candidate = clone();
    change(candidate);
    assert.throws(() => validatePolicy(candidate), 'weakening policy must fail');
  }

  // Exercise *each* required context, including the specially-handled
  // checks/bootstrap dependency. Make mutations against exact PR sections.
  for (const check of policy.requiredChecks) {
    const original = readFileSync(new URL('../' + check.workflow, import.meta.url), 'utf8');
    const replaceOnce = (oldText, replacement) => {
      assert(original.includes(oldText), check.context + ': missing fixture anchor');
      return original.replace(oldText, replacement);
    };
    const jobAnchor = '\n  ' + check.job + ':\n';
    assert.equal(original.split(jobAnchor).length, 2,
      check.context + ': require a unique exact-indentation job anchor');
    const mutations = [
      replaceOnce('  pull_request:\n    branches: [main]',
        '  pull_request:\n    branches: [main]\n    paths:\n      - "src/**"'),
      replaceOnce('  pull_request:\n    branches: [main]',
        '  pull_request:\n    branches: [main]\n    types: [synchronize]'),
      replaceOnce('  pull_request:\n    branches: [main]',
        '  pull_request:\n    branches: [develop]'),
      replaceOnce(jobAnchor, '\n  renamed-' + check.job + ':\n'),
      replaceOnce(jobAnchor,
        '\n  ' + check.job + ':\n    name: Renamed GitHub check\n'),
      replaceOnce(jobAnchor,
        '\n  ' + check.job + ':\n    strategy:\n      matrix:\n        version: [24, 25]\n'),
      replaceOnce(jobAnchor,
        '\n  ' + check.job + ':\n    continue-on-error: true\n'),
    ];
    if (check.job === 'checks') {
      const bootstrapAnchor = "if: github.event_name == 'push' && github.ref == 'refs/heads/feature/project-foundation'";
      mutations.push(replaceOnce(bootstrapAnchor, 'if: true'));
      const ifAnchor = "always() && (needs.create-lockfile.result == 'success' || needs.create-lockfile.result == 'skipped')";
      mutations.push(replaceOnce(ifAnchor, 'always()'));
    } else {
      mutations.push(replaceOnce(jobAnchor,
        '\n  ' + check.job + ':\n    if: false\n'));
      mutations.push(replaceOnce(jobAnchor,
        '\n  ' + check.job + ':\n    needs: [another-job]\n'));
    }
    for (const changed of mutations) {
      assert.throws(() => validateWorkflow(check, changed),
        check.context + ': workflow regression must fail closed');
    }
  }
  // All network calls are mocked here. CI must never need API credentials.
  await selfTestReadOnlyRuleset();
  console.log('PASS branch policy negative fixtures: workflow contexts, ' +
    'ruleset drift, required checks, bypasses, strict mode, and GET-only API');
}

function validateRuleset(ruleset, repository) {
  validatePolicy(policy);
  assert(repository && repository.full_name === expectedRepository,
    'GitHub repository identity mismatch');
  assert.equal(repository.default_branch, policy.branch,
    'repository default branch has drifted');
  assert(ruleset && typeof ruleset === 'object', 'ruleset missing');
  assert.equal(ruleset.id, policy.rulesetId, 'wrong ruleset ID');
  assert.equal(ruleset.source_type, 'Repository', 'ruleset must belong to repository');
  assert.equal(ruleset.source, expectedRepository, 'ruleset repository mismatch');
  assert.equal(ruleset.target, 'branch', 'ruleset must target branches');
  assert.equal(ruleset.enforcement, 'active', 'ruleset is not actively enforced');
  assert.deepEqual(ruleset.conditions?.ref_name?.include, ['~DEFAULT_BRANCH'],
    'ruleset must target the default branch exactly');
  assert.deepEqual(ruleset.conditions?.ref_name?.exclude, [],
    'ruleset must not exclude a target branch');
  assert.deepEqual(ruleset.bypass_actors, [], 'ruleset bypass list must be empty');
  // The API field is user-specific; an unknown/bypass-enabled result is not proof.
  assert.equal(ruleset.current_user_can_bypass, 'never',
    'ruleset caller bypass status is unsafe or cannot be verified');

  assert(Array.isArray(ruleset.rules), 'missing ruleset rules');
  const types = ruleset.rules.map((rule) => rule.type);
  assert.equal(new Set(types).size, types.length, 'duplicate ruleset rule types');
  assert.deepEqual([...types].sort(), [...requiredRuleTypes].sort(),
    'ruleset rule types drifted (including unwanted restrict-updates)');
  const byType = new Map(ruleset.rules.map((rule) => [rule.type, rule]));

  const pr = byType.get('pull_request')?.parameters;
  assert.equal(pr?.required_approving_review_count, policy.requiredApprovals,
    'PR approval requirement changed');
  assert(pr?.allowed_merge_methods?.includes('squash'),
    'squash merge must remain permitted');

  const params = byType.get('required_status_checks')?.parameters;
  assert.equal(params?.strict_required_status_checks_policy, policy.strict,
    'required checks must use the latest main head');
  assert.equal(params?.do_not_enforce_on_create, false,
    'required checks may not be bypassed when creating matching refs');
  const checks = params?.required_status_checks;
  assert(Array.isArray(checks), 'missing required check contexts');
  assert.equal(new Set(checks.map((check) => check.context)).size, checks.length,
    'duplicate required check contexts');
  assert.deepEqual(checks.map((check) => check.context).sort(), [...fixedContexts].sort(),
    'missing or unexpected required check contexts');
  for (const check of checks) {
    assert.equal(check.integration_id, policy.requiredIntegrationId,
      'check is not pinned to the GitHub Actions app');
  }
  return true;
}

function validateReadToken(token) {
  if (token === undefined) return; // Public Ruleset GET needs no credentials.
  assert(typeof token === 'string' && token.length > 0 && !/\s/.test(token),
    'GH_TOKEN must be nonempty and contain no whitespace');
}

async function githubRead(path) {
  assert(path === repositoryPath || path === rulesetPath,
    'read-only auditor permits only repository and pinned Ruleset GET paths');
  const token = process.env.GH_TOKEN;
  validateReadToken(token);
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token !== undefined) headers.Authorization = 'Bearer ' + token;
  const response = await fetch('https://api.github.com' + path, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Do not log authentication headers or user-supplied response bodies.
    throw new Error('GitHub read ' + path + ' failed: HTTP ' + response.status);
  }
  return response.json();
}

async function verifyLive(api = githubRead, announce = true) {
  // Fail closed on a renamed/path-filtered workflow even with a valid live rule.
  checkWorkflows();
  const repository = await api(repositoryPath);
  const ruleset = await api(rulesetPath);
  validateRuleset(ruleset, repository);
  if (announce) {
    console.log('PASS live GitHub Ruleset #' + expectedRulesetId +
      ': active, default branch main, no bypass, PR required, deletion/force pushes blocked, ' +
      'strict up-to-date checks: ' + fixedContexts.join(', '));
  }
}

async function selfTestReadOnlyRuleset() {
  const goodRepository = { full_name: expectedRepository, default_branch: 'main' };
  const goodRuleset = {
    id: expectedRulesetId,
    source_type: 'Repository',
    source: expectedRepository,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    bypass_actors: [],
    current_user_can_bypass: 'never',
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'pull_request', parameters: {
        required_approving_review_count: 0, allowed_merge_methods: ['merge', 'squash', 'rebase'],
      } },
      { type: 'required_status_checks', parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: fixedContexts.map((context) => ({
          context, integration_id: expectedIntegrationId,
        })),
      } },
    ],
  };
  assert.doesNotThrow(() => validateRuleset(goodRuleset, goodRepository));
  const mutations = [
    (r) => { r.id += 1; },
    (r) => { r.source_type = 'Organization'; },
    (r) => { r.source = 'someone/else'; },
    (r) => { r.target = 'tag'; },
    (r) => { r.enforcement = 'evaluate'; },
    (r) => { r.conditions.ref_name.include = ['refs/heads/dev']; },
    (r) => { r.conditions.ref_name.exclude = ['main']; },
    (r) => { r.bypass_actors.push({ actor_type: 'RepositoryRole', actor_id: 5 }); },
    (r) => { r.current_user_can_bypass = 'always'; },
    (r) => { r.current_user_can_bypass = undefined; },
    (r) => { r.rules.pop(); },
    (r) => { r.rules.push({ type: 'update' }); },
    (r) => { r.rules.push({ type: 'deletion' }); },
    (r) => { r.rules.find((x) => x.type === 'pull_request')
      .parameters.required_approving_review_count = 1; },
    (r) => { r.rules.find((x) => x.type === 'pull_request')
      .parameters.allowed_merge_methods = ['merge']; },
    (r) => { r.rules.find((x) => x.type === 'required_status_checks')
      .parameters.strict_required_status_checks_policy = false; },
    (r) => { r.rules.find((x) => x.type === 'required_status_checks')
      .parameters.do_not_enforce_on_create = true; },
    (r) => { r.rules.find((x) => x.type === 'required_status_checks')
      .parameters.required_status_checks.pop(); },
    (r) => { r.rules.find((x) => x.type === 'required_status_checks')
      .parameters.required_status_checks.push({ context: 'unexpected', integration_id: 15368 }); },
    (r) => { r.rules.find((x) => x.type === 'required_status_checks')
      .parameters.required_status_checks[0].integration_id = -1; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(goodRuleset);
    mutate(candidate);
    assert.throws(() => validateRuleset(candidate, goodRepository),
      'ruleset weakened or changed must never validate');
  }
  assert.throws(() => validateRuleset(goodRuleset, {
    ...goodRepository, default_branch: 'development',
  }), /default branch/);
  assert.throws(() => validateRuleset(goodRuleset, {
    ...goodRepository, full_name: 'someone/else',
  }), /identity/);

  assert.doesNotThrow(() => validateReadToken(undefined));
  assert.doesNotThrow(() => validateReadToken('synthetic_read_token'));
  for (const bad of ['', null, 'token with space', 'token\twith-tab',
    'token\nwith-newline', 'token\rwith-return']) {
    assert.throws(() => validateReadToken(bad), /GH_TOKEN/);
  }
  const calls = [];
  const fakeApi = async (path, method) => {
    calls.push({ path, method });
    assert.equal(method, undefined, 'auditor must never request a write method');
    if (path === repositoryPath) return structuredClone(goodRepository);
    if (path === rulesetPath) return structuredClone(goodRuleset);
    assert.fail('unexpected API path');
  };
  await verifyLive(fakeApi, false);
  assert.deepEqual(calls.map((call) => call.path), [repositoryPath, rulesetPath],
    'verify-live must make only the two documented read requests');
  // A missing/forbidden response must fail, never invent a passing rule.
  await assert.rejects(() => verifyLive(async (path) => {
    if (path === repositoryPath) return goodRepository;
    throw new Error('HTTP 403');
  }, false), /HTTP 403/);
  console.log('PASS Ruleset API fixtures: read-only GET, strict mode, no bypass and pinned checks');
}

const args = process.argv.slice(2);
if (args.length !== 1 ||
  !['--self-test', '--check-workflows', '--verify-live'].includes(args[0])) {
  throw new Error('Select exactly one: --self-test, --check-workflows or --verify-live. ' +
    'The old --apply command is disabled; manage Ruleset #26119822 in GitHub settings.');
}
if (args[0] === '--self-test') await selfTest();
else if (args[0] === '--check-workflows') checkWorkflows();
else await verifyLive();

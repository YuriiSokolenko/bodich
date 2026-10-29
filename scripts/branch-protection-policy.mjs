#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../config/required-main-checks.json', import.meta.url), 'utf8'));
const fixedContexts = ['checks', 'cloudflare-static-release', 'compatibility-smoke'];
const expectedRepository = 'YuriiSokolenko/bodich';
const protectionPath = '/repos/' + expectedRepository + '/branches/main/protection';

function validatePolicy(candidate) {
  assert.equal(candidate.schemaVersion, 1, 'policy schema version');
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
  const goodProtection = {
    required_status_checks: { strict: true, contexts: fixedContexts, checks: [] },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
  assert.doesNotThrow(() => verifyProtection(goodProtection));
  for (const change of [
    (p) => { p.required_status_checks.strict = false; },
    (p) => { p.enforce_admins.enabled = false; },
    (p) => { p.required_status_checks.contexts.pop(); },
    (p) => { p.required_status_checks = null; },
    (p) => { p.allow_force_pushes.enabled = true; },
    (p) => { p.allow_deletions.enabled = true; },
  ]) {
    const candidate = structuredClone(goodProtection);
    change(candidate);
    assert.throws(() => verifyProtection(candidate),
      'incomplete live GitHub protection must never verify');
  }
  assert.doesNotThrow(() => requireAdminToken('synthetic_valid_token'));
  for (const badToken of ['', null, 'token with space', 'token\twith-tab',
    'token\nwith-newline', 'token\rwith-carriage-return']) {
    assert.throws(() => requireAdminToken(badToken), /GH_ADMIN_TOKEN/,
      'tokens containing whitespace must fail before the HTTP request');
  }
  await testApiAndApplyFixtures();
  console.log('PASS branch policy negative fixtures: workflow context drift, API 404 handling, ' +
    'missing/conditional jobs and admin branch-protection apply/verify');
}

async function interpretGithubResponse(response, method, path) {
  if (response.status === 404 && method === 'GET' && path === protectionPath) {
    // A 404 can also mean invalid credentials, hidden repository or wrong branch.
    // Only GitHub's explicit unprotected-branch response authorizes creation.
    const payload = await response.json().catch(() => null);
    if (payload?.message === 'Branch not protected') return null;
  }
  if (!response.ok) {
    // Never reveal tokens, headers or arbitrary response contents.
    throw new Error('GitHub ' + method + ' ' + path + ' failed: HTTP ' + response.status);
  }
  if (response.status === 204) return {};
  return response.json();
}

function requireAdminToken(token) {
  assert(token && !/\s/.test(token),
    'GH_ADMIN_TOKEN with repository Administration permission is required');
}

async function githubApi(path, method = 'GET', body) {
  const token = process.env.GH_ADMIN_TOKEN;
  requireAdminToken(token);
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  return interpretGithubResponse(response, method, path);
}

function existingContexts(protection) {
  const checks = protection?.required_status_checks?.checks ?? [];
  const names = protection?.required_status_checks?.contexts ?? [];
  return new Set([...names, ...checks.map((c) => c.context)]);
}

function verifyProtection(protection) {
  assert(protection, 'branch protection is missing (or unreadable with this token)');
  assert.equal(protection.required_status_checks?.strict, true, 'strict required checks are disabled');
  assert.equal(protection.enforce_admins?.enabled, true, 'admin enforcement is disabled');
  // On existing protection we preserve these settings rather than mutate them.
  // Unsafe values require explicit admin remediation, not a false PASS.
  assert.equal(protection.allow_force_pushes?.enabled, false,
    'force pushes are allowed or cannot be verified');
  assert.equal(protection.allow_deletions?.enabled, false,
    'branch deletions are allowed or cannot be verified');
  const installed = existingContexts(protection);
  for (const context of fixedContexts) {
    assert(installed.has(context), 'GitHub branch protection missing required check: ' + context);
  }
}

async function verifyLive(api = githubApi, announce = true) {
  validatePolicy(policy);
  verifyProtection(await api(protectionPath));
  if (announce) {
    console.log('PASS live GitHub branch protection: main; strict=true; admins=true; ' +
      'force-pushes/deletions disabled; ' + fixedContexts.join(', '));
  }
}

function requiredChecksPatch(previous) {
  const old = previous.required_status_checks ?? {};
  const result = new Map();
  for (const check of old.checks ?? []) {
    assert(typeof check.context === 'string' && check.context.length, 'invalid existing GitHub check');
    assert(!result.has(check.context), 'duplicate existing check context');
    const entry = { context: check.context };
    // GitHub GET may return app_id:null. PATCH accepts only integers; do
    // not lose genuine app pinning or relax it to "any app" (-1).
    if (check.app_id !== undefined && check.app_id !== null) {
      assert(Number.isSafeInteger(check.app_id), 'invalid existing app_id');
      entry.app_id = check.app_id;
    }
    result.set(check.context, entry);
  }
  // Preserve all context-only check entries even when GET has both fields.
  for (const context of old.contexts ?? []) {
    assert(typeof context === 'string' && context.length, 'invalid existing status context');
    if (!result.has(context)) result.set(context, { context });
  }
  for (const context of fixedContexts) {
    if (!result.has(context)) result.set(context, { context });
  }
  return { strict: true, checks: [...result.values()] };
}

async function applyLive(api = githubApi,
  confirmed = process.argv.includes('--confirm=' + expectedRepository + ':main'),
  announce = true) {
  validatePolicy(policy);
  assert(confirmed, 'explicit --confirm=' + expectedRepository + ':main is required');
  const previous = await api(protectionPath);
  if (!previous) {
    // Creation only: no pre-existing classic branch protection to overwrite.
    // Require checks, forbid destructive pushes; do not impose approval count.
    await api(protectionPath, 'PUT', {
      required_status_checks: { strict: true, contexts: fixedContexts },
      enforce_admins: true,
      required_pull_request_reviews: null,
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: false,
      lock_branch: false,
      allow_fork_syncing: false,
    });
    if (announce) console.log('Created classic branch protection on main');
  } else {
    // Fail before writing if the existing branch allows bypass via force push
    // or deletion. Admins must handle this explicitly in repository settings.
    assert.equal(previous.allow_force_pushes?.enabled, false,
      'existing protection permits force pushes or does not expose this setting');
    assert.equal(previous.allow_deletions?.enabled, false,
      'existing protection permits deletion or does not expose this setting');
    // Preserve existing approvals, restrictions and pinned check-app sources.
    await api(protectionPath + '/required_status_checks', 'PATCH', requiredChecksPatch(previous));
    if (!previous.enforce_admins?.enabled) {
      await api(protectionPath + '/enforce_admins', 'POST');
    }
    if (announce) console.log('Updated required checks and admin enforcement without replacing restrictions');
  }
  // Always fetch the policy from GitHub again; a successful write is not proof.
  await verifyLive(api, announce);
}

async function testApiAndApplyFixtures() {
  const response = (status, body) => ({
    status, ok: status >= 200 && status < 300,
    json: async () => body,
  });
  assert.equal(await interpretGithubResponse(
    response(404, { message: 'Branch not protected' }), 'GET', protectionPath), null);
  for (const [message, method, path] of [
    ['Not Found', 'GET', protectionPath],
    ['Resource not accessible by integration', 'GET', protectionPath],
    ['Branch not protected', 'GET', protectionPath + '/required_status_checks'],
    ['Branch not protected', 'PATCH', protectionPath],
  ]) {
    await assert.rejects(() => interpretGithubResponse(response(404, { message }), method, path),
      /HTTP 404/, 'untrusted 404 must never trigger a protection PUT');
  }

  function mockApi(initial) {
    let state = structuredClone(initial);
    const calls = [];
    const api = async (path, method = 'GET', body) => {
      calls.push({ path, method, body: structuredClone(body) });
      if (path === protectionPath && method === 'GET') return structuredClone(state);
      if (path === protectionPath && method === 'PUT') {
        assert.equal(state, null, 'creation must never replace existing protection');
        state = {
          required_status_checks: {
            strict: body.required_status_checks.strict,
            contexts: [...body.required_status_checks.contexts],
            checks: body.required_status_checks.contexts.map((context) => ({ context, app_id: null })),
          },
          enforce_admins: { enabled: body.enforce_admins },
          allow_force_pushes: { enabled: body.allow_force_pushes },
          allow_deletions: { enabled: body.allow_deletions },
        };
        return structuredClone(state);
      }
      if (path === protectionPath + '/required_status_checks' && method === 'PATCH') {
        assert(state, 'cannot patch missing protection');
        state.required_status_checks = {
          ...body, contexts: body.checks.map((check) => check.context),
        };
        return structuredClone(state.required_status_checks);
      }
      if (path === protectionPath + '/enforce_admins' && method === 'POST') {
        assert(state, 'cannot set admins on missing protection');
        state.enforce_admins.enabled = true;
        return {};
      }
      assert.fail('unexpected GitHub method/path during branch protection test');
    };
    return { api, calls, snapshot: () => structuredClone(state) };
  }

  const missing = mockApi(null);
  await assert.rejects(() => applyLive(missing.api, false, false), /--confirm=/);
  assert.equal(missing.calls.length, 0, 'unconfirmed command must not call the API');
  await applyLive(missing.api, true, false);
  assert.deepEqual(missing.calls.map((c) => c.method), ['GET', 'PUT', 'GET']);
  assert.deepEqual(missing.calls[1].body.required_status_checks,
    { strict: true, contexts: fixedContexts });
  assert.equal(missing.calls[1].body.enforce_admins, true);
  assert.equal(missing.calls[1].body.allow_force_pushes, false);
  assert.equal(missing.calls[1].body.allow_deletions, false);

  const protectedBranch = {
    required_status_checks: {
      strict: false, contexts: ['pinned-check', 'legacy-context'],
      checks: [{ context: 'pinned-check', app_id: 12345 }, { context: 'legacy-null-app', app_id: null }],
    },
    enforce_admins: { enabled: false },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_pull_request_reviews: { required_approving_review_count: 2 },
    restrictions: { users: ['release-owner'] },
  };
  const existing = mockApi(protectedBranch);
  await applyLive(existing.api, true, false);
  assert.deepEqual(existing.calls.map((c) => c.method), ['GET', 'PATCH', 'POST', 'GET']);
  assert.equal(existing.calls[1].path, protectionPath + '/required_status_checks');
  assert.deepEqual(existing.calls[1].body, {
    strict: true,
    checks: [
      { context: 'pinned-check', app_id: 12345 },
      { context: 'legacy-null-app' },
      { context: 'legacy-context' },
      ...fixedContexts.map((context) => ({ context })),
    ],
  }, 'existing app pinning, unrelated checks and null app_id must survive PATCH');
  assert.deepEqual(existing.snapshot().required_pull_request_reviews,
    protectedBranch.required_pull_request_reviews);
  assert.deepEqual(existing.snapshot().restrictions, protectedBranch.restrictions);

  const alreadyEnforced = mockApi({ ...protectedBranch, enforce_admins: { enabled: true } });
  await applyLive(alreadyEnforced.api, true, false);
  assert.deepEqual(alreadyEnforced.calls.map((c) => c.method), ['GET', 'PATCH', 'GET'],
    'admins already enforced must not receive an unnecessary POST');

  for (const unsafeKey of ['allow_force_pushes', 'allow_deletions']) {
    const unsafe = mockApi({ ...protectedBranch, [unsafeKey]: { enabled: true } });
    await assert.rejects(() => applyLive(unsafe.api, true, false), /permits|does not expose/);
    assert.deepEqual(unsafe.calls.map((c) => c.method), ['GET'],
      'unsafe existing protection must not be silently overwritten');
  }
}

const args = process.argv.slice(2);
const modes = ['--self-test', '--check-workflows', '--verify-live', '--apply'].filter((v) => args.includes(v));
if (modes.length !== 1) {
  throw new Error('Select exactly one: --self-test, --check-workflows, --verify-live, or --apply');
}
if (modes[0] === '--self-test') await selfTest();
else if (modes[0] === '--check-workflows') checkWorkflows();
else if (modes[0] === '--verify-live') await verifyLive();
else await applyLive();

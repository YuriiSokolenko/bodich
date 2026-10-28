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
  assert.doesNotMatch(job, /^ {4}continue-on-error: true$/m, 'required jobs cannot ignore failures');
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

function selfTest() {
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

  const target = policy.requiredChecks.find((c) => c.context === 'compatibility-smoke');
  const original = readFileSync(new URL('../' + target.workflow, import.meta.url), 'utf8');
  const mutate = (oldText, newText) => {
    assert(original.includes(oldText), 'fixture source unexpectedly changed');
    return original.replace(oldText, newText);
  };
  for (const changed of [
    mutate('  pull_request:\n    branches: [main]',
      '  pull_request:\n    branches: [main]\n    paths:\n      - "src/**"'),
    mutate('  pull_request:\n    branches: [main]',
      '  pull_request:\n    branches: [main]\n    types: [synchronize]'),
    mutate('    branches: [main]', '    branches: [develop]'),
    mutate('  compatibility-smoke:', '  renamed-smoke:'),
    mutate('    runs-on: ubuntu-24.04',
      '    if: false\n    runs-on: ubuntu-24.04'),
    mutate('    runs-on: ubuntu-24.04',
      '    continue-on-error: true\n    runs-on: ubuntu-24.04'),
  ]) {
    assert.throws(() => validateWorkflow(target, changed),
      'workflow regression must not be silently accepted');
  }
  console.log('PASS branch policy negative fixtures: drift, missing/filtered/conditional contexts');
}

async function githubApi(path, method = 'GET', body) {
  const token = process.env.GH_ADMIN_TOKEN;
  assert(token && !/\s/.test(token), 'GH_ADMIN_TOKEN with repository Administration permission is required');
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
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) {
    // Never echo tokens, request headers or arbitrary server response bodies.
    throw new Error('GitHub ' + method + ' ' + path + ' failed: HTTP ' + response.status);
  }
  if (response.status === 204) return {};
  return response.json();
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
  const installed = existingContexts(protection);
  for (const context of fixedContexts) {
    assert(installed.has(context), 'GitHub branch protection missing required check: ' + context);
  }
  console.log('PASS live GitHub branch protection: main; strict=true; admins=true; ' +
    fixedContexts.join(', '));
}

async function verifyLive() {
  validatePolicy(policy);
  verifyProtection(await githubApi(protectionPath));
}

async function applyLive() {
  validatePolicy(policy);
  assert(process.argv.includes('--confirm=' + expectedRepository + ':main'),
    'explicit --confirm=' + expectedRepository + ':main is required');
  const previous = await githubApi(protectionPath);
  if (!previous) {
    // Creation only: no pre-existing classic branch protection to overwrite.
    // Require checks, forbid destructive pushes; do not impose approval count.
    await githubApi(protectionPath, 'PUT', {
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
    console.log('Created classic branch protection on main');
  } else {
    // Patch only the required status checks. Keep existing approvals, app source
    // pinning, restrictions, and any additional required contexts.
    const old = previous.required_status_checks ?? {};
    const oldChecks = old.checks ?? [];
    if (oldChecks.length) {
      const added = fixedContexts.filter((name) => !existingContexts(previous).has(name))
        .map((context) => ({ context }));
      await githubApi(protectionPath + '/required_status_checks', 'PATCH',
        { strict: true, checks: [...oldChecks, ...added] });
    } else {
      await githubApi(protectionPath + '/required_status_checks', 'PATCH',
        { strict: true, contexts: [...new Set([...(old.contexts ?? []), ...fixedContexts])] });
    }
    if (!previous.enforce_admins?.enabled) {
      await githubApi(protectionPath + '/enforce_admins', 'POST');
    }
    console.log('Updated required status checks without replacing existing branch restrictions');
  }
  await verifyLive();
}

const args = process.argv.slice(2);
const modes = ['--self-test', '--check-workflows', '--verify-live', '--apply'].filter((v) => args.includes(v));
if (modes.length !== 1) {
  throw new Error('Select exactly one: --self-test, --check-workflows, --verify-live, or --apply');
}
if (modes[0] === '--self-test') selfTest();
else if (modes[0] === '--check-workflows') checkWorkflows();
else if (modes[0] === '--verify-live') await verifyLive();
else await applyLive();

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Regression tests for the GHCR publishing policy in
// .github/workflows/docker-lan-preview.yml. They execute the real `run:` scripts
// of the `gate` and `promote` steps (extracted from the workflow, so the tests
// cannot drift from what CI runs) against stubbed `docker` and `gh` binaries.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/docker-lan-preview.yml'), 'utf8');
const stubs = join(root, 'scripts/test-fixtures/ghcr-publish');
for (const name of ['docker', 'gh']) chmodSync(join(stubs, name), 0o755);

const IMAGE = 'ghcr.io/yuriisokolenko/bodich-lan-preview';
const REPO = 'YuriiSokolenko/bodich';
const OLD = 'a'.repeat(40);
const SHA = 'b'.repeat(40);
const NEWER = 'c'.repeat(40);

function extractRun(stepId) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- id: ${stepId}` || line.trim() === `id: ${stepId}`);
  assert.ok(start >= 0, `step with id ${stepId} not found in the workflow`);
  const stepIndent = lines[start].match(/^\s*/)[0].length;
  let runLine = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    const indent = lines[i].match(/^\s*/)[0].length;
    if (lines[i].trim() && indent < stepIndent) break;
    if (/^\s+(?:-\s+)?(?:name|uses|id): /.test(lines[i]) && indent === stepIndent && i > start) break;
    if (/^\s+run: \|\s*$/.test(lines[i])) { runLine = i; break; }
  }
  assert.ok(runLine >= 0, `step ${stepId} has no run: | block`);
  const contentIndent = lines[runLine].match(/^\s*/)[0].length + 2;
  const out = [];
  for (let i = runLine + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) { out.push(''); continue; }
    if (lines[i].match(/^\s*/)[0].length < contentIndent) break;
    out.push(lines[i].slice(contentIndent));
  }
  return out.join('\n');
}

const gateScript = extractRun('decide');
const promoteScript = extractRun('promote');

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'ghcr-publish-test-'));
  const stubDir = join(dir, 'stub');
  mkdirSync(join(stubDir, 'registry'), { recursive: true });
  return { dir, stubDir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runScript(script, dir, env) {
  const file = join(dir, 'step.sh');
  writeFileSync(file, `${script}\n`);
  return spawnSync('bash', [file], {
    encoding: 'utf8',
    env: { PATH: `${stubs}:${process.env.PATH}`, HOME: dir, RUNNER_TEMP: dir, ...env },
  });
}

function parseOutputs(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
  );
}

// ---------------------------------------------------------------- gate

function gate(overrides) {
  const box = sandbox();
  try {
    const outputFile = join(box.dir, 'output');
    writeFileSync(outputFile, '');
    const result = runScript(gateScript, box.dir, {
      EVENT_NAME: 'pull_request',
      REF: 'refs/pull/1/merge',
      ACTOR: 'YuriiSokolenko',
      PR_AUTHOR: 'YuriiSokolenko',
      REPO,
      HEAD_REPO: REPO,
      GITHUB_OUTPUT: outputFile,
      ...overrides,
    });
    assert.equal(result.status, 0, result.stderr);
    return parseOutputs(outputFile).publish;
  } finally {
    box.cleanup();
  }
}

test('gate publishes pushes to main and same-repository pull requests', () => {
  assert.equal(gate({ EVENT_NAME: 'push', REF: 'refs/heads/main', HEAD_REPO: '', PR_AUTHOR: '' }), 'true');
  assert.equal(gate({}), 'true');
});

test('gate never publishes other branches or fork pull requests', () => {
  assert.equal(gate({ EVENT_NAME: 'push', REF: 'refs/heads/feature/x', HEAD_REPO: '', PR_AUTHOR: '' }), 'false');
  assert.equal(gate({ HEAD_REPO: 'someone/bodich', ACTOR: 'someone', PR_AUTHOR: 'someone' }), 'false');
  assert.equal(gate({ HEAD_REPO: '' }), 'false', 'a deleted fork (null head repo) must not publish');
});

test('gate rejects Dependabot-authored pull requests whoever triggered the event', () => {
  assert.equal(gate({ ACTOR: 'dependabot[bot]', PR_AUTHOR: 'dependabot[bot]' }), 'false');
  // A human synchronizing or reopening a Dependabot PR: actor is the human, author is still Dependabot.
  assert.equal(gate({ ACTOR: 'YuriiSokolenko', PR_AUTHOR: 'dependabot[bot]' }), 'false');
  assert.equal(gate({ ACTOR: 'dependabot[bot]', PR_AUTHOR: 'YuriiSokolenko' }), 'false');
});

// ------------------------------------------------------------- promote

function promote({ eventName = 'push', prNumber = '', head = SHA, env = {}, preseed = {} } = {}) {
  const box = sandbox();
  try {
    const sha = SHA;
    const archManifest = '{"layers":[]}';
    const files = {
      [`${IMAGE}:sha-${sha}-amd64`]: archManifest,
      [`${IMAGE}:sha-${sha}-arm64`]: archManifest,
      ...preseed,
    };
    for (const [ref, content] of Object.entries(files)) {
      writeFileSync(join(box.stubDir, 'registry', ref.replace(/[/:]/g, '_')), content);
    }
    writeFileSync(join(box.stubDir, 'head'), head);
    const outputFile = join(box.dir, 'output');
    const summaryFile = join(box.dir, 'summary');
    writeFileSync(outputFile, '');
    writeFileSync(summaryFile, '');
    const result = runScript(promoteScript, box.dir, {
      STUB_DIR: box.stubDir,
      IMAGE,
      SOURCE_SHA: sha,
      EVENT_NAME: eventName,
      PR_NUMBER: prNumber,
      GITHUB_REPOSITORY: REPO,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      ...env,
    });
    // Snapshot the registry before cleanup: lookups must not read a deleted sandbox.
    const snapshot = new Map(
      readdirSync(join(box.stubDir, 'registry')).map((name) => [name, readFileSync(join(box.stubDir, 'registry', name), 'utf8')]),
    );
    const registry = (ref) => snapshot.get(ref.replace(/[/:]/g, '_')) ?? null;
    const calls = readFileSync(join(box.stubDir, 'calls.log'), 'utf8').split('\n').filter(Boolean);
    return { result, outputs: parseOutputs(outputFile), summary: readFileSync(summaryFile, 'utf8'), registry, calls, sha };
  } finally {
    box.cleanup();
  }
}

test('promotes main to the sha manifest when the commit is still the head', () => {
  const run = promote();
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'true', moving_tag: 'main' });
  const sha = run.registry(`${IMAGE}:sha-${run.sha}`);
  assert.ok(sha, 'multi-arch sha tag must exist');
  assert.equal(run.registry(`${IMAGE}:main`), sha, 'main must be exactly the sha manifest');
  assert.ok(run.calls.includes(`gh api repos/${REPO}/commits/main --jq .sha`));
  assert.match(run.summary, /`main` now points at this commit/);
});

test('promotes pr-<number> using the pull request head', () => {
  const run = promote({ eventName: 'pull_request', prNumber: '7' });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'true', moving_tag: 'pr-7' });
  assert.equal(run.registry(`${IMAGE}:pr-7`), run.registry(`${IMAGE}:sha-${run.sha}`));
  assert.ok(run.calls.includes(`gh api repos/${REPO}/pulls/7 --jq .head.sha`));
  assert.equal(run.registry(`${IMAGE}:main`), null, 'a PR build must never touch main');
});

test('does not move main when a newer commit already is the head, but still publishes the sha tag', () => {
  const previous = '{"previously":"published main"}';
  const run = promote({ head: NEWER, preseed: { [`${IMAGE}:main`]: previous } });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'false', moving_tag: 'main' });
  assert.equal(run.registry(`${IMAGE}:main`), previous, 'main must be left exactly as it was');
  assert.ok(run.registry(`${IMAGE}:sha-${run.sha}`), 'the immutable sha tag is still published');
  assert.match(run.result.stdout, /::notice::main not moved/);
});

test('regression: head advancing during the slow manifest step must not roll main back', () => {
  // Head is SHA when the job starts; creating the multi-arch sha manifest is the
  // slow registry step, during which a newer commit lands. A head read taken
  // before that step (the original bug) would still promote main to SHA.
  const previous = '{"previously":"published main"}';
  const run = promote({
    head: SHA,
    env: { STUB_ADVANCE_HEAD_ON_SHA_CREATE: NEWER },
    preseed: { [`${IMAGE}:main`]: previous },
  });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.outputs.promoted, 'false');
  assert.equal(run.registry(`${IMAGE}:main`), previous);
});

test('freshness is read after the sha manifest is created and immediately before the tag write', () => {
  const run = promote();
  const shaCreate = run.calls.findIndex((c) => c.startsWith(`docker buildx imagetools create --tag ${IMAGE}:sha-${run.sha} `));
  const mainCreate = run.calls.findIndex((c) => c === `docker buildx imagetools create --tag ${IMAGE}:main ${IMAGE}:sha-${run.sha}`);
  assert.ok(shaCreate >= 0 && mainCreate > shaCreate);
  const between = run.calls.slice(shaCreate + 1, mainCreate);
  assert.ok(between.some((c) => c.startsWith('gh api ')), 'the head must be re-read after the sha manifest exists');
  assert.ok(
    run.calls.slice(0, shaCreate).every((c) => !c.startsWith('gh api ')),
    'no freshness read may happen before the slow step and then be reused',
  );
  const lastRead = run.calls.map((c, i) => (c.startsWith('gh api ') && i < mainCreate ? i : -1)).reduce((a, b) => Math.max(a, b));
  assert.deepEqual(
    run.calls.slice(lastRead + 1, mainCreate).filter((c) => c.startsWith('docker buildx imagetools create')),
    [],
    'no registry write may sit between the last freshness read and the tag write',
  );
});

test('a head change during promotion is reported and leaves the tag on a verified manifest', () => {
  const run = promote({ env: { STUB_ADVANCE_HEAD_ON_MOVING_CREATE: NEWER } });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.outputs.promoted, 'true');
  assert.equal(run.registry(`${IMAGE}:main`), run.registry(`${IMAGE}:sha-${run.sha}`));
  assert.match(run.result.stdout, new RegExp(`::warning::main was promoted to ${SHA}, but ${NEWER} landed during promotion`));
  assert.equal(run.calls.filter((c) => c.startsWith('gh api ')).length, 2, 'the head is checked before and after the write');
});

test('fails loudly when the moving tag does not match the sha manifest after promotion', () => {
  const run = promote({ env: { STUB_DROP_TAG: 'main' } });
  assert.notEqual(run.result.status, 0);
  assert.match(run.result.stdout, /::error::main does not match/);
  assert.equal(run.outputs.promoted, undefined, 'must not report a promotion that did not land');
});

test('keeps an already published sha tag instead of overwriting it', () => {
  const existing = '{"manifests":[{"platform":{"os":"linux","architecture":"amd64"}},{"platform":{"os":"linux","architecture":"arm64"}}],"existing":true}';
  const run = promote({ preseed: { [`${IMAGE}:sha-${SHA}`]: existing } });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.registry(`${IMAGE}:sha-${run.sha}`), existing);
  assert.ok(
    !run.calls.some((c) => c.startsWith(`docker buildx imagetools create --tag ${IMAGE}:sha-${run.sha} `)),
    'an existing sha tag must not be re-created',
  );
  assert.equal(run.registry(`${IMAGE}:main`), existing);
});

test('refuses to promote when the sha manifest is missing an architecture', () => {
  const partial = '{"manifests":[{"platform":{"os":"linux","architecture":"amd64"}}]}';
  const run = promote({ preseed: { [`${IMAGE}:sha-${SHA}`]: partial } });
  assert.notEqual(run.result.status, 0);
  assert.equal(run.registry(`${IMAGE}:main`), null, 'main must not be written from an incomplete manifest');
});

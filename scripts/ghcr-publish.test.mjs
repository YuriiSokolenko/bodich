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

const MULTI_ARCH = '{"manifests":[{"platform":{"os":"linux","architecture":"amd64"}},{"platform":{"os":"linux","architecture":"arm64"}}]}';
// Registry entries for a newer commit whose Docker preview checks passed:
// both per-arch images are pushed; the multi-arch sha tag only if its own
// publish-manifest job got that far.
function publishedNewer({ multiArch = false } = {}) {
  return {
    [`${IMAGE}:sha-${NEWER}-amd64`]: '{"layers":["newer"]}',
    [`${IMAGE}:sha-${NEWER}-arm64`]: '{"layers":["newer"]}',
    ...(multiArch ? { [`${IMAGE}:sha-${NEWER}`]: MULTI_ARCH.replace('}]}', '}],"commit":"newer"}') } : {}),
  };
}

test('promotes main to the sha manifest when the commit is still the head', () => {
  const run = promote();
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'true', moving_tag: 'main', points_at: SHA });
  const sha = run.registry(`${IMAGE}:sha-${run.sha}`);
  assert.ok(sha, 'multi-arch sha tag must exist');
  assert.equal(run.registry(`${IMAGE}:main`), sha, 'main must be exactly the sha manifest');
  assert.ok(run.calls.includes(`gh api repos/${REPO}/commits/main --jq .sha`));
  assert.match(run.summary, /`main` now points at this commit/);
});

test('promotes pr-<number> using the pull request head', () => {
  const run = promote({ eventName: 'pull_request', prNumber: '7' });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'true', moving_tag: 'pr-7', points_at: SHA });
  assert.equal(run.registry(`${IMAGE}:pr-7`), run.registry(`${IMAGE}:sha-${run.sha}`));
  assert.ok(run.calls.includes(`gh api repos/${REPO}/pulls/7 --jq .head.sha`));
  assert.equal(run.registry(`${IMAGE}:main`), null, 'a PR build must never touch main');
});

test('leaves main alone when the newer head is not published yet, but still publishes the sha tag', () => {
  const previous = '{"previously":"published main"}';
  const run = promote({ head: NEWER, preseed: { [`${IMAGE}:main`]: previous } });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'false', moving_tag: 'main', points_at: '' });
  assert.equal(run.registry(`${IMAGE}:main`), previous, 'main must be left exactly as it was');
  assert.ok(run.registry(`${IMAGE}:sha-${run.sha}`), 'the immutable sha tag is still published');
  assert.match(run.result.stdout, new RegExp(`::notice::main left for ${NEWER}: its image is not published yet`));
});

test('does not treat a head with only one published architecture as published', () => {
  const previous = '{"previously":"published main"}';
  const run = promote({
    head: NEWER,
    preseed: { [`${IMAGE}:main`]: previous, [`${IMAGE}:sha-${NEWER}-amd64`]: '{"layers":["newer"]}' },
  });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.registry(`${IMAGE}:main`), previous);
  assert.equal(run.registry(`${IMAGE}:sha-${NEWER}`), null, 'no multi-arch tag may be assembled from one architecture');
});

test('regression (review 5711381194): an older run reconciles main to the newest commit whose publisher was cancelled', () => {
  // Commits SHA < NEWER. NEWER passed its checks and pushed both per-arch images,
  // but its publish-manifest job never ran (cancelled as a replaced pending job,
  // cancelled by hand, or failed). The older run for SHA reaches the group later.
  // Previously it skipped its stale promotion and main stayed behind for good.
  const previous = '{"previously":"published main"}';
  const run = promote({ head: NEWER, preseed: { [`${IMAGE}:main`]: previous, ...publishedNewer() } });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'false', moving_tag: 'main', points_at: NEWER });
  const newer = run.registry(`${IMAGE}:sha-${NEWER}`);
  assert.ok(newer, 'the newest commit gets its multi-arch sha tag');
  assert.equal(run.registry(`${IMAGE}:main`), newer, 'main must end on the newest published commit');
  assert.notEqual(run.registry(`${IMAGE}:main`), run.registry(`${IMAGE}:sha-${SHA}`), 'never on the older commit');
  assert.match(run.summary, new RegExp(`promoted to newer commit \`${NEWER}\``));
});

test('promotes to a newer head whose multi-arch sha tag already exists without re-creating it', () => {
  const run = promote({ head: NEWER, preseed: publishedNewer({ multiArch: true }) });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.outputs.points_at, NEWER);
  assert.equal(run.registry(`${IMAGE}:main`), run.registry(`${IMAGE}:sha-${NEWER}`));
  assert.ok(!run.calls.some((c) => c.startsWith(`docker buildx imagetools create --tag ${IMAGE}:sha-${NEWER} `)));
});

test('regression: head advancing during the slow manifest step must not roll main back', () => {
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

test('a head change during promotion to an unpublished commit is reported and left to that commit', () => {
  const run = promote({ env: { STUB_ADVANCE_HEAD_ON_MOVING_CREATE: NEWER } });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'true', moving_tag: 'main', points_at: SHA });
  assert.equal(run.registry(`${IMAGE}:main`), run.registry(`${IMAGE}:sha-${run.sha}`));
  assert.match(run.result.stdout, new RegExp(`::warning::${NEWER} landed while main was being promoted to ${SHA}; reconciling`));
  assert.match(run.result.stdout, new RegExp(`::notice::main left for ${NEWER}`));
  assert.equal(run.calls.filter((c) => c.startsWith('gh api ')).length, 2, 'the head is checked before and after the write');
});

test('a head change during promotion to an already published commit converges on that commit', () => {
  const run = promote({ env: { STUB_ADVANCE_HEAD_ON_MOVING_CREATE: NEWER }, preseed: publishedNewer() });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(run.outputs, { promoted: 'false', moving_tag: 'main', points_at: NEWER });
  assert.equal(run.registry(`${IMAGE}:main`), run.registry(`${IMAGE}:sha-${NEWER}`));
});

test('fails loudly when the moving tag does not match the sha manifest after promotion', () => {
  const run = promote({ env: { STUB_DROP_TAG: 'main' } });
  assert.notEqual(run.result.status, 0);
  assert.match(run.result.stdout, /::error::main does not match/);
  assert.equal(run.outputs.promoted, undefined, 'must not report a promotion that did not land');
});

test('keeps an already published sha tag instead of overwriting it', () => {
  const existing = MULTI_ARCH.replace('}]}', '}],"existing":true}');
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

// ------------------------------------------------- scheduling policy (static)
// GitHub's queue itself cannot be run locally. These assertions pin the
// workflow configuration that the scheduling guarantee depends on.

function jobBlock(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `job ${name} not found`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][\w-]*:\n/);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

test('policy: the publisher queue keeps every waiting run instead of replacing the pending one', () => {
  const job = jobBlock('publish-manifest');
  const concurrency = job.match(/\n    concurrency:\n((?: {6}.*\n)+)/);
  assert.ok(concurrency, 'publish-manifest must declare job-level concurrency');
  const body = concurrency[1];
  assert.match(body, /^ {6}queue: max$/m, 'queue: max is required; the default queue cancels a pending publisher');
  assert.match(body, /^ {6}cancel-in-progress: false$/m, 'queue: max only applies with cancel-in-progress: false');
  assert.match(body, /format\('pr-\{0\}', github\.event\.pull_request\.number\)/, 'one group per pull request');
  assert.match(body, /\|\| 'main' \}\}$/m, 'one group for main');
});

test('policy: no workflow-level concurrency or other job can cancel or bypass publishing', () => {
  assert.doesNotMatch(workflow.split('\njobs:\n')[0], /^concurrency:/m, 'workflow-level concurrency would replace pending runs');
  for (const name of ['gate', 'docker-preview', 'publish-image', 'verify-published']) {
    assert.doesNotMatch(jobBlock(name), /\n    concurrency:/, `${name} must not join a concurrency group`);
  }
  const writes = workflow.match(/imagetools create --tag "\$\{IMAGE\}:\$\{moving_tag\}"/g) ?? [];
  assert.equal(writes.length, 1, 'only the promote step may write main / pr-<number>');
  assert.ok(jobBlock('publish-manifest').includes('imagetools create --tag "${IMAGE}:${moving_tag}"'));
});

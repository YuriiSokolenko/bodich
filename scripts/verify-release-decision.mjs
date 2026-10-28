/**
 * Stage 20F (#71): validate an attributable, candidate-bound GO/NO-GO record.
 *
 * This is an offline integrity/consistency gate, NOT identity authentication,
 * legal clearance, approval, or authorization to deploy. An unsigned NO_GO
 * template remains valid as a blocked planning record.
 *
 * npm run release:decision:check
 * node scripts/verify-release-decision.mjs --verify-dist [--dist=dist]
 * node scripts/verify-release-decision.mjs --decision=/private/release.json --verify-dist --require-go --candidate-sha=<40-hex>
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RECORD = join(ROOT, 'docs/qa/issue-71-release-decision.json');
const DEFAULT_ROMANIAN_RECORD = join(ROOT, 'docs/qa/issue-68-romanian-review.json');
const RELEASE_POLICY = JSON.parse(readFileSync(join(ROOT, 'config/pages-release-allowlist.json'), 'utf8'));
const SOURCE_INVENTORY = JSON.parse(readFileSync(join(ROOT, 'docs/catalog/source-inventory.json'), 'utf8'));
const DRAFT_COUNT = SOURCE_INVENTORY.products.length;
assert(Number.isInteger(DRAFT_COUNT) && DRAFT_COUNT > 0 && RELEASE_POLICY.supplierDraftCount === DRAFT_COUNT,
  'supplier_draft_count_policy_mismatch');
const GATES = new Map([
  ['rights', 66], ['legal', 67], ['romanian', 68], ['qa', 69],
  ['security', 70], ['isolation', 70], ['operations', 70], ['candidate', 71],
]);
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Date validation accepts canonical UTC seconds or precisely three fractional digits.
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INVALID_VALUE = /^(?:tbd|todo|unknown|placeholder|example|fixture|synthetic|unassigned|pending)$/i;
const INVALID_IDENTITY = /\b(?:tbd|todo|unknown|placeholder|example|fixture|synthetic|unassigned|pending)\b/i;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const text = (v, min = 4) => typeof v === 'string' && v.trim().length >= min && !INVALID_VALUE.test(v.trim());
const normalizeName = (v) => typeof v === 'string' ?
  v.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
const person = (v) => text(v, 5) && v.trim().split(/\s+/u).length >= 2 && !INVALID_IDENTITY.test(v);
const ref = (v) => text(v, 12) &&
  (/^restricted:[A-Za-z0-9][A-Za-z0-9._/-]{7,}$/.test(v) && !INVALID_IDENTITY.test(v.slice('restricted:'.length)) ||
   /^https:\/\/github\.com\/YuriiSokolenko\/bodich\/(?:issues|pull|actions|commit|runs)\/[A-Za-z0-9/#._-]+$/.test(v));
const comparePaths = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function date(value, utc = false, futureAllowed = false) {
  if (typeof value !== 'string' || !(utc ? UTC : DATE).test(value)) return false;
  const parsed = new Date(utc ? value : value + 'T00:00:00Z');
  return !Number.isNaN(parsed.valueOf()) &&
    (utc ? parsed.toISOString().replace(/\.000Z$/, 'Z') === value.replace(/\.000Z$/, 'Z') :
      parsed.toISOString().slice(0, 10) === value) &&
    (futureAllowed || parsed.getTime() <= Date.now());
}
function problems(record) {
  const errors = [];
  const fail = (code) => errors.push(code);
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['invalid_record'];
  if (record.schemaVersion !== 1 || record.scope !== 'informational_only') fail('wrong_schema_or_scope');
  if (!['GO', 'NO_GO'].includes(record.decision)) fail('invalid_decision');
  if (!['POLICY_DEFAULT', 'HUMAN_SIGNED'].includes(record.decisionBasis)) fail('invalid_basis');
  const go = record.decision === 'GO';
  const signed = record.decisionBasis === 'HUMAN_SIGNED';
  if (go && !signed) fail('go_must_be_human_signed');
  const release = record.release ?? {};
  if (release.profile !== 'release_safe' || release.supplierDraftCount !== DRAFT_COUNT) fail('wrong_release_profile');
  if (release.gitSha != null && !SHA.test(release.gitSha)) fail('invalid_release_sha');
  if (release.distManifestSha256 != null && !DIGEST.test(release.distManifestSha256)) fail('invalid_artifact_digest');
  if ((go || signed) && (!SHA.test(release.gitSha ?? '') || !DIGEST.test(release.distManifestSha256 ?? '')))
    fail('signed_decision_requires_exact_candidate');
  const actor = record.decisionAuthority ?? {};
  if (signed) {
    if (!person(actor.name) || !text(actor.role, 8) ||
        !ref(actor.signatureEvidence) || !date(actor.signedAt, true))
      fail('missing_attributable_signature');
  } else if (actor.name != null || actor.signatureEvidence != null || actor.signedAt != null) {
    fail('partial_unsigned_authority');
  }
  if (!Array.isArray(record.gates)) return [...errors, 'missing_gate_matrix'];
  const seen = new Set();
  for (const gate of record.gates) {
    if (!gate || !GATES.has(gate.id) || seen.has(gate.id)) {
      fail('unknown_or_duplicate_gate'); continue;
    }
    seen.add(gate.id);
    if (gate.issue !== GATES.get(gate.id)) fail('gate_issue_mismatch_' + gate.id);
    if (!['PASS', 'BLOCKED', 'N_A'].includes(gate.status)) fail('invalid_gate_status_' + gate.id);
    if (!text(gate.reason, 12)) fail('gate_reason_missing_' + gate.id);
    if (gate.status === 'PASS') {
      if (!person(gate.owner) || !person(gate.reviewer) || !ref(gate.evidenceRef) ||
          !date(gate.reviewedAt) || !SHA.test(gate.gitSha ?? '') ||
          !DIGEST.test(gate.distManifestSha256 ?? '') ||
          gate.gitSha !== release.gitSha ||
          gate.distManifestSha256 !== release.distManifestSha256)
        fail('unsubstantiated_pass_' + gate.id);
      if (person(gate.owner) && person(gate.reviewer) &&
          normalizeName(gate.owner) === normalizeName(gate.reviewer))
        fail('gate_requires_independent_reviewer_' + gate.id);
      if (signed && person(actor.name) && person(gate.reviewer) &&
          normalizeName(actor.name) === normalizeName(gate.reviewer))
        fail('decision_authority_cannot_self_review_' + gate.id);
      // Gate reviews are dated to a day; reject any review dated after the signing day.
      if (signed && date(gate.reviewedAt) && date(actor.signedAt, true) &&
          gate.reviewedAt > actor.signedAt.slice(0, 10))
        fail('review_after_decision_' + gate.id);
    }
    if (gate.status !== 'PASS' && go) fail('go_has_nonpassing_gate_' + gate.id);
    if (gate.status !== 'PASS' && !text(gate.reason, 16)) fail('block_needs_explanation_' + gate.id);
  }
  for (const id of GATES.keys()) if (!seen.has(id)) fail('missing_gate_' + id);
  const ops = record.operations ?? {};
  if (ops.rollbackRunbook !== 'docs/deployment/cloudflare-pages.md') fail('wrong_rollback_runbook');
  if (go) {
    for (const field of ['authorizedDomain', 'cloudflareProject', 'deploymentOwner',
      'previousProductionDeploymentId']) if (!text(ops[field], 5)) fail('missing_operations_' + field);
    if (!person(ops.deploymentOwner)) fail('deployment_owner_not_named');
    for (const field of ['accountAuthorizationRef', 'rollbackRehearsalRef',
      'postReleaseVerificationPlanRef']) if (!ref(ops[field])) fail('missing_operations_evidence_' + field);
    if (!DIGEST.test(ops.previousBuildSha256 ?? '')) fail('missing_prior_immutable_build');
    if (!date(ops.windowStartUtc, true, true) || !date(ops.windowEndUtc, true, true) ||
        ops.windowStartUtc >= ops.windowEndUtc) fail('invalid_deployment_window');
  }
  const pending = record.gates.filter((g) => g?.status !== 'PASS').map((g) => g.id);
  if (!Array.isArray(record.remediations)) fail('missing_remediations');
  else {
    const covered = new Set();
    for (const row of record.remediations) {
      if (!row || !GATES.has(row.gateId) || covered.has(row.gateId) || !text(row.action, 12))
        fail('invalid_remediation');
      else covered.add(row.gateId);
    }
    for (const id of pending) if (!covered.has(id)) fail('missing_remediation_' + id);
    if (go && record.remediations.length !== 0) fail('go_has_remediations');
  }
  return errors;
}
function collectDist(dist) {
  assert(existsSync(dist) && lstatSync(dist).isDirectory(), 'missing_dist');
  const files = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      assert(!entry.isSymbolicLink(), 'symlink_in_release');
      if (entry.isDirectory()) walk(absolute);
      else {
        assert(entry.isFile(), 'special_file_in_release');
        const name = relative(dist, absolute).split('\\').join('/');
        const bytes = readFileSync(absolute);
        files.push({ name, pathSha256: hash(name), sha256: hash(bytes), bytes: bytes.length });
      }
    }
  }
  walk(dist);
  return files.sort((a, b) => comparePaths(a.name, b.name));
}
function verifyDist(record, dist, reportsDir) {
  const files = collectDist(dist);
  const minimal = files.map(({ pathSha256, sha256, bytes }) => ({ pathSha256, sha256, bytes }));
  const manifestSha = hash(JSON.stringify(minimal));
  const pages = JSON.parse(readFileSync(join(reportsDir, 'pages-release-evidence.json'), 'utf8'));
  const rights = JSON.parse(readFileSync(join(reportsDir, 'public-asset-rights-audit.json'), 'utf8'));
  assert.equal(pages.schemaVersion, 1);
  assert.equal(pages.releaseProfile, 'release_safe');
  assert.equal(pages.supplierDraftsQuarantined, DRAFT_COUNT, 'draft_inventory_drift');
  assert.equal(pages.verdict, 'offline_checks_passed_live_owner_approval_pending');
  assert.deepEqual(pages.findings, []);
  assert.deepEqual(pages.files, minimal, 'stale_pages_manifest_or_dist_changed');
  assert.equal(rights.profile, 'release_safe');
  assert.equal(rights.verdict, 'OFFLINE_AUDIT_PASSED_HUMAN_NO_GO');
  assert.deepEqual(rights.findings, []);
  assert.equal(rights.distAssetCount, files.length);
  assert.equal(rights.records.length, files.length);
  const records = new Map(rights.records.map((entry) => [entry.pathSha256, entry]));
  assert.equal(records.size, files.length, 'duplicate_rights_manifest_path');
  for (const file of files) {
    const rightsRow = records.get(file.pathSha256.slice(0, 20));
    assert(rightsRow && rightsRow.sha256 === file.sha256 && rightsRow.bytes === file.bytes,
      'stale_rights_manifest_or_dist_changed');
  }
  assert(rights.quarantinedRegistry.every((row) => row.distributed === false),
    'uncleared_supplier_media_in_dist');
  if (record.release.distManifestSha256 != null) {
    assert.equal(record.release.distManifestSha256, manifestSha, 'candidate_digest_mismatch');
  }
  return manifestSha;
}
function selfTest() {
  const base = JSON.parse(readFileSync(DEFAULT_RECORD, 'utf8'));
  assert.deepEqual(problems(base), [], 'committed NO_GO template invalid');
  const sha = 'a'.repeat(40), digest = 'b'.repeat(64);
  const positive = structuredClone(base);
  positive.decision = 'GO';
  positive.decisionBasis = 'HUMAN_SIGNED';
  positive.release.gitSha = sha;
  positive.release.distManifestSha256 = digest;
  positive.decisionAuthority = {
    name: 'Avery Lane', role: 'Verified BODICH release authority',
    signatureEvidence: 'restricted:offline-case-12587932', signedAt: '2026-10-01T08:30:00Z',
  };
  const gateParticipants = [
    ['Riley Stone', 'Morgan Reed'], ['Jordan Vale', 'Harper Quinn'],
    ['Casey Brooks', 'Taylor Lane'], ['Dakota Ray', 'Skyler North'],
    ['Parker Wells', 'Cameron Dale'], ['Jamie Ellis', 'Robin Miles'],
    ['Reese Cooper', 'Morgan Reed'], ['Sage Miller', 'Taylor Lane'],
  ];
  positive.gates = positive.gates.map((g, index) => ({
    ...g, status: 'PASS', owner: gateParticipants[index][0], reviewer: gateParticipants[index][1],
    gitSha: sha, distManifestSha256: digest,
    evidenceRef: 'restricted:offline-case-12587932', reviewedAt: '2026-10-01',
    reason: 'Reviewed exact release candidate with independently retained evidence.',
  }));
  positive.operations = {
    ...positive.operations,
    authorizedDomain: 'bodich.invalid', cloudflareProject: 'preview-pages-project',
    accountAuthorizationRef: 'restricted:offline-case-12587932',
    deploymentOwner: 'Riley Stone',
    windowStartUtc: '2026-10-01T09:00:00Z',
    windowEndUtc: '2026-10-01T10:00:00Z',
    previousProductionDeploymentId: 'prior-deployment-123',
    previousBuildSha256: 'c'.repeat(64),
    rollbackRehearsalRef: 'restricted:offline-case-12587932',
    postReleaseVerificationPlanRef: 'restricted:offline-case-12587932',
  };
  positive.remediations = [];
  // Entirely in-memory synthetic proof: never an actual human GO.
  assert.deepEqual(problems(positive), [], 'synthetic structural GO fixture invalid');
  const negative = (change, expected) => {
    const copy = structuredClone(positive);
    change(copy);
    assert(problems(copy).some((issue) => issue.includes(expected)), expected);
  };
  negative((r) => { r.decisionBasis = 'POLICY_DEFAULT'; }, 'go_must_be_human_signed');
  negative((r) => { r.gates[0].status = 'BLOCKED'; }, 'go_has_nonpassing_gate');
  negative((r) => { r.gates[0].status = 'N_A'; }, 'go_has_nonpassing_gate');
  negative((r) => { r.gates[1].reviewer = null; }, 'unsubstantiated_pass');
  negative((r) => { r.gates[1].distManifestSha256 = 'd'.repeat(64); }, 'unsubstantiated_pass');
  negative((r) => { r.gates[0].reviewer = 'Riley  Stone'; }, 'gate_requires_independent_reviewer');
  negative((r) => { r.gates[1].reviewer = '  JORDAN   vale '; }, 'gate_requires_independent_reviewer');
  negative((r) => { r.gates[1].reviewer = 'Avery  Lane'; }, 'decision_authority_cannot_self_review');
  negative((r) => { r.decisionAuthority.signedAt = '2026-09-30T08:30:00Z'; }, 'review_after_decision');
  negative((r) => { r.gates.pop(); }, 'missing_gate');
  negative((r) => { r.gates.push(r.gates[0]); }, 'unknown_or_duplicate_gate');
  negative((r) => { r.operations.accountAuthorizationRef = null; }, 'missing_operations_evidence');
  negative((r) => { r.operations.previousBuildSha256 = null; }, 'missing_prior_immutable_build');
  negative((r) => { r.operations.windowEndUtc = r.operations.windowStartUtc; }, 'invalid_deployment_window');
  negative((r) => { r.decisionAuthority.signatureEvidence = 'restricted:example'; }, 'missing_attributable_signature');
  negative((r) => { r.decisionAuthority.signedAt = '2026-02-31T08:30:00Z'; }, 'missing_attributable_signature');
  negative((r) => { r.decisionAuthority.signedAt = '2026-10-01T08:30:00.5Z'; }, 'missing_attributable_signature');
  assert(text('Awaiting pending counsel review', 12));
  assert(ref('restricted:offline-case-12587932'));
  assert(!ref('restricted:example'));
  negative((r) => { r.release.gitSha = '0'.repeat(40); }, 'unsubstantiated_pass');
  const blocked = structuredClone(base);
  blocked.remediations = [];
  assert(problems(blocked).some((v) => v.startsWith('missing_remediation_')));
  assert.throws(() => validateSourceState(sha, 'f'.repeat(40), '', ROOT), /candidate_checkout_mismatch/);
  assert.throws(() => validateSourceState(sha, sha, ' M src/pages/index.astro', ROOT), /dirty_candidate_checkout/);
  assert.throws(() => validateSourceState(sha, sha, '', join(ROOT, 'elsewhere')), /wrong_checkout_repository/);
  assert.doesNotThrow(() => validateSourceState(sha, sha, '', ROOT));
  assert.throws(() => assertUnexpiredWindow(positive.operations, Date.parse('2026-10-02T00:00:00Z')),
    /deployment_window_expired/);
  assert.doesNotThrow(() => assertUnexpiredWindow(positive.operations, Date.parse('2026-10-01T09:30:00Z')));
  console.log('Stage 20F release-decision self-test passed (policy NO_GO, synthetic GO, negative signer/gate/SHA/operations/remediation fixtures).');
}
function validateSourceState(expectedSha, actualSha, dirty, gitRoot) {
  assert.equal(actualSha, expectedSha, 'candidate_checkout_mismatch');
  assert.equal(resolve(gitRoot), realpathSync(ROOT), 'wrong_checkout_repository');
  assert.equal(dirty, '', 'dirty_candidate_checkout');
}
function verifySourceCheckout(expectedSha) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8',
    timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  validateSourceState(expectedSha,
    git('rev-parse', '--verify', 'HEAD'),
    git('status', '--porcelain', '--untracked-files=all'),
    git('rev-parse', '--show-toplevel'));
}
function assertUnexpiredWindow(ops, now = Date.now()) {
  assert(Date.parse(ops.windowEndUtc) >= now, 'deployment_window_expired');
}
function main() {
  const args = process.argv.slice(2);
  const allowed = ['--self-test', '--check', '--verify-dist', '--require-go'];
  assert(args.every((s) => allowed.includes(s) || /^(--decision|--dist|--reports-dir|--candidate-sha|--romanian-record)=.+$/.test(s)),
    'usage: [--self-test | --check | --verify-dist] [--decision=path] [--dist=path] [--reports-dir=path] [--require-go --candidate-sha=40hex]');
  if (args.includes('--self-test')) {
    assert(args.length === 1);
    selfTest(); return;
  }
  const option = (name, fallback) => args.find((s) => s.startsWith(name + '='))?.slice(name.length + 1) ?? fallback;
  const document = resolve(option('--decision', DEFAULT_RECORD));
  const record = JSON.parse(readFileSync(document, 'utf8'));
  const errors = problems(record);
  if (errors.length) {
    for (const error of errors) console.error('Release decision finding: ' + error);
    process.exitCode = 1; return;
  }
  const verify = args.includes('--verify-dist');
  const requireGo = args.includes('--require-go');
  if (requireGo && (!verify || record.decision !== 'GO')) {
    console.error('Release decision NO_GO: human-signed GO and --verify-dist required');
    process.exitCode = 1; return;
  }
  if (record.decision === 'GO' && (!verify || !requireGo)) {
    console.error('Release decision GO requires explicit --require-go and independent dist verification');
    process.exitCode = 1; return;
  }
  if (verify) {
    const dist = resolve(option('--dist', join(ROOT, 'dist')));
    const reports = resolve(option('--reports-dir', join(ROOT, 'visual-qa')));
    const sha = option('--candidate-sha', null);
    if (record.decision === 'GO') {
      if (!SHA.test(sha ?? '') || record.release.gitSha !== sha) {
        console.error('Release decision: GO candidate SHA must match explicitly supplied --candidate-sha');
        process.exitCode = 1; return;
      }
      verifySourceCheckout(sha);
      assertUnexpiredWindow(record.operations);
      // #68 must independently verify a native human reviewer on the exact built bytes.
      // The signed record lives in restricted custody; a PASS in #71 alone is insufficient.
      execFileSync(process.execPath, [
        join(ROOT, 'scripts/verify-romanian-qa.mjs'), '--dist', '--require-pass',
        '--dist-dir=' + dist, '--candidate-sha=' + sha,
        '--record=' + resolve(option('--romanian-record', DEFAULT_ROMANIAN_RECORD)),
      ], { cwd: ROOT, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    const manifest = verifyDist(record, dist, reports);
    console.log('Stage 20F reviewed candidate manifest SHA-256: ' + manifest);
  }
  console.log('Stage 20F decision: ' + record.decision +
    (record.decisionBasis === 'POLICY_DEFAULT' ? ' (unsigned default; deployment forbidden)' :
      ' (recorded human signature; identity/evidence require independent verification)'));
}
try {
  main();
} catch (error) {
  // Machine-readable, path-free diagnostic; no stack traces or private evidence.
  const message = typeof error?.message === 'string' && /^[a-z][a-z0-9_]{3,64}$/.test(error.message) ?
    error.message : 'verification_failed';
  console.error('Release decision failure: ' + message);
  process.exitCode = 1;
}

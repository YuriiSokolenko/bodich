#!/usr/bin/env node
/**
 * Issue #53: genuine BODICH evidence intake. Private originals stay off GitHub.
 * Supplier research, submitted evidence and human ledger decisions are THREE different things.
 * This module never writes ledger events, mutates source drafts, or publishes products.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLedger, contextOnDisk, gateNames } from './catalog-review-ledger.mjs';

export const INTAKE_PATH = 'docs/catalog/genuine-product-evidence.json';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const read = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const today = () => new Date().toISOString().slice(0, 10);
const copyDigest = (copy) => {
  assert.ok(copy && typeof copy === 'object', 'Reviewed bilingual copy is missing');
  const normalized = {};
  for (const lang of ['en', 'ro']) {
    normalized[lang] = {};
    for (const field of ['name', 'summary', 'description']) {
      const value = copy[lang]?.[field];
      assert.ok(typeof value === 'string' && value.trim(),
        'Missing current ' + lang + ' product copy: ' + field);
      normalized[lang][field] = value;
    }
  }
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
};
const PURPOSE = 'genuine_bodich_evidence_intake_unpublished';
const SHA = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;
const KINDS = {
  identity: ['manufacturer_authorization'],
  imagery: ['exact_model_photo', 'exact_model_technical_illustration', 'ai_concept', 'supplier_photo'],
  specifications: ['independent_specification'],
  editorial: ['english_review', 'native_romanian_review', 'legal_review', 'commercial_review'],
};
const REQUIRED = {
  identity: ['manufacturer_authorization'],
  imagery: ['exact_model_photo'],
  specifications: ['independent_specification'],
  editorial: [...KINDS.editorial],
};
export const GAP = {
  identity: 'missing_bodich_manufacturer_authorization',
  imagery: 'missing_authorized_exact_model_photo',
  specifications: 'missing_independent_model_specifications',
  editorial: 'missing_en_ro_legal_commercial_review',
};
const checkKeys = (obj, required, optional = []) => {
  assert.ok(obj && typeof obj === 'object' && !Array.isArray(obj), 'Expected object');
  for (const key of required) assert.ok(Object.hasOwn(obj, key), 'Missing field: ' + key);
  for (const key of Object.keys(obj))
    assert.ok(required.includes(key) || optional.includes(key), 'Unexpected field: ' + key);
};
const validDate = (s) => typeof s === 'string' && DATE.test(s) &&
  !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const dateChecked = (s) => assert.ok(validDate(s) && s <= today(),
  'Missing, invalid or future evidence date');
const safeText = (s) => assert.ok(typeof s === 'string' && s.trim() && s.length <= 220 &&
  !/[\u0000-\u001f<>]/.test(s) && !/\S+@\S+\.\S+/.test(s) &&
  !/https?:\/\/\S*[?#]/i.test(s) && !/(?:^|[\s,;])(?:token|password|secret|bearer)\s*[:=]/i.test(s),
'Unsafe or empty public metadata; keep personal/confidential evidence off GitHub');
function safeRef(ref) {
  assert.ok(typeof ref === 'string' &&
    /^restricted:[A-Za-z0-9][A-Za-z0-9._/-]{2,160}$/.test(ref),
  'Supplier-only or public URLs are not controlled evidence: use an opaque restricted: reference');
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function evidenceItem(item, seen) {
  checkKeys(item, ['id', 'gate', 'kind', 'ref', 'sha256', 'version', 'provenance',
    'providerRole', 'providerRef', 'providedOn', 'verifiedOn', 'scope', 'facts'], ['expiresOn']);
  assert.ok(ID.test(item.id) && !seen.has(item.id), 'Duplicate or invalid evidence ID');
  seen.add(item.id);
  assert.ok(gateNames.includes(item.gate) && KINDS[item.gate].includes(item.kind), 'Unknown gate/evidence kind');
  safeRef(item.ref); safeRef(item.providerRef);
  assert.match(item.sha256, SHA, 'Document / asset digest required');
  safeText(item.version); safeText(item.provenance);
  assert.ok(['bodich_owner', 'manufacturer', 'rights_holder', 'independent_lab',
    'translator', 'legal_counsel', 'editorial_team', 'other'].includes(item.providerRole),
  'Unknown provider role');
  dateChecked(item.providedOn);
  if (item.verifiedOn !== null) {
    dateChecked(item.verifiedOn);
    assert.ok(item.verifiedOn >= item.providedOn, 'Evidence verified before it was provided');
  }
  if (item.expiresOn !== undefined && item.expiresOn !== null)
    assert.ok(validDate(item.expiresOn), 'Invalid expiry date');
  checkKeys(item.scope, ['manufacturer', 'model', 'variant']);
  for (const value of Object.values(item.scope)) safeText(value);
  checkKeys(item.facts, ['subject'], ['origin', 'authorizationRef', 'rightsOwner',
    'permissionRef', 'assetSha256', 'photoType', 'name', 'value', 'unit', 'copySha256']);
  safeText(item.facts.subject);
  const f = item.facts;
  if (item.kind === 'manufacturer_authorization') {
    safeText(f.origin); safeRef(f.authorizationRef);
    assert.ok(f.subject === 'manufacture_and_brand_authority', 'Manufacturer authority not stated');
  }
  if (item.gate === 'imagery') {
    if (item.kind === 'exact_model_photo' || item.kind === 'exact_model_technical_illustration') {
      safeText(f.rightsOwner); safeRef(f.permissionRef);
      assert.match(f.assetSha256, SHA);
      assert.equal(f.assetSha256, item.sha256,
        'Original image digest differs from approved-asset digest');
      assert.equal(f.photoType, item.kind === 'exact_model_photo' ? 'photograph' : 'technical_illustration');
    }
  }
  if (item.gate === 'specifications') {
    safeText(f.name);
    assert.ok(typeof f.value === 'number' && Number.isFinite(f.value), 'Spec value must be numeric');
    assert.ok(typeof f.unit === 'string' && /^[A-Za-z°%/0-9.-]{1,24}$/.test(f.unit),
      'Unit required for each exact-model specification');
  }
  if (item.gate === 'editorial') assert.match(f.copySha256, SHA, 'Reviewed copy digest required');
}
function assess(record, sourceId, state, epoch, currentCopy) {
  const reasons = Object.fromEntries(gateNames.map((g) => [g, []]));
  const evidence = record?.evidence || [];
  const identity = record?.proposedBodichIdentity || null;
  for (const gate of gateNames) {
    const found = evidence.filter((e) => e.gate === gate);
    if (!found.length) reasons[gate].push(GAP[gate]);
    for (const kind of REQUIRED[gate])
      if (!found.some((e) => e.kind === kind)) reasons[gate].push('missing_' + kind);
    for (const e of found) {
      if (!identity || !equal(e.scope, identity)) reasons[gate].push('wrong_model_or_variant');
      if (e.verifiedOn === null) reasons[gate].push('evidence_not_verified');
      if (e.expiresOn && e.expiresOn < today())
        reasons[gate].push('expired_evidence');
      if (e.gate === 'imagery' && e.kind !== 'exact_model_photo')
        reasons[gate].push('concept_or_illustration_not_product_photo');
    }
    if (gate === 'editorial' && found.length) {
      const digests = new Set(found.map((e) => e.facts.copySha256));
      if (digests.size !== 1) reasons.editorial.push('editorial_digest_disagreement');
      if (!currentCopy || [...digests].some((digest) => digest !== copyDigest(currentCopy)))
        reasons.editorial.push('stale_or_mismatched_copy_digest');
    }
    if (gate === 'specifications') {
      const observed = new Map();
      for (const e of found) {
        const { name, value, unit } = e.facts;
        const label = JSON.stringify([value, unit]);
        if (observed.has(name) && observed.get(name) !== label)
          reasons.specifications.push('contradictory_specification_claims');
        observed.set(name, label);
      }
    }
    for (const issue of record?.unresolved || [])
      if (issue.gate === gate) reasons[gate].push('unresolved_' + issue.code);
  }
  if (!identity) reasons.identity.push('no_independent_bodich_identity');
  if (identity && identity.manufacturer !== 'BODICH')
    reasons.identity.push('manufacturer_is_not_bodich');
  const img = evidence.filter((e) => e.kind === 'exact_model_photo');
  const gateState = {};
  for (const gate of gateNames) {
    const decision = state.gates[gate];
    const unique = [...new Set(reasons[gate])].sort();
    if (decision.status === 'approved') {
      assert.equal(unique.length, 0,
        'Human gate approved without complete independent current-epoch evidence: ' + sourceId + ' ' + gate);
      if (gate === 'identity') {
        assert.equal(state.gates.identity.details?.manufacturer, identity.manufacturer);
        assert.equal(ledger.gates.identity.details?.model, identity.model);
        assert.equal(ledger.gates.identity.details?.variant, identity.variant);
      }
      if (gate === 'imagery')
        assert.ok(img.some((e) => e.facts.assetSha256 === decision.details?.assetSha256 &&
          e.scope.model === decision.details?.model), 'Approved photo digest/model not in evidence intake');
      if (gate === 'specifications') {
        const labels = evidence.filter((e) => e.gate === 'specifications')
          .map((e) => e.facts.name + ': ' + e.facts.value + ' ' + e.facts.unit);
        assert.ok(decision.details?.verifiedClaims?.every((claim) => labels.includes(claim)),
          'Human-approved spec not backed by per-claim intake evidence');
      }
    }
    gateState[gate] = { reviewState: decision.status, evidenceComplete: unique.length === 0,
      reasons: unique, evidenceCount: evidence.filter((e) => e.gate === gate).length };
  }
  const evidenceComplete = gateNames.every((g) => gateState[g].evidenceComplete);
  assert.ok(!['evidence_complete_pending_signoff', 'approved_for_promotion'].includes(state.status) ||
    evidenceComplete, 'Promotion state cannot bypass genuine-product evidence gaps: ' + sourceId);
  const eligible = evidenceComplete && state.eligibleForPromotion;
  return { sourceId, epoch, pilot: false, intakePresent: Boolean(record),
    proposedBodichIdentity: identity, evidenceCount: evidence.length,
    ledgerStatus: ledger.status, sourceReviewed: state.sourceReviewed,
    bodichIdentityVerified: gateState.identity.reviewState === 'approved' && gateState.identity.evidenceComplete,
    promotionEligible: eligible, previousEpochOnly: (state.previousEpochs || []).map((e) =>
      ({ epoch: e.epoch, effective: false, eventCount: e.eventCount })),
    gates: gateState, blockers: gateNames.flatMap((g) => gateState[g].reasons.map((code) => g + ':' + code))
      .concat(eligible ? [] : ['separate_human_review_and_promotion_pr_required']) };
}
export function validateIntake(intake, sources, ledger, states, { expectedCount = 132 } = {}) {
  checkKeys(intake, ['schemaVersion', 'purpose', 'ledgerEpoch', 'ledgerRevisions', 'pilotSourceId', 'records']);
  assert.equal(intake.schemaVersion, 1);
  assert.equal(intake.purpose, PURPOSE);
  assert.equal(intake.ledgerEpoch, ledger.currentEpoch, 'Stale intake epoch: migrate and review explicitly');
  assert.deepEqual(intake.ledgerRevisions, ledger.epochs.at(-1).revisions,
    'Intake references stale manifest revisions: no automatic approval inheritance');
  assert.ok(Array.isArray(sources) && sources.length === expectedCount, 'Source count mismatch');
  assert.equal(new Set(sources.map((s) => s.sourceId)).size, expectedCount, 'Duplicate source IDs');
  assert.equal(states.length, expectedCount, 'Current review-ledger coverage mismatch');
  assert.ok(sources.some((s) => s.sourceId === intake.pilotSourceId), 'Unknown pilot source ID');
  assert.ok(Array.isArray(intake.records) && intake.records.length <= expectedCount, 'Bad evidence records');
  const byId = new Map(), idSet = new Set();
  for (const record of intake.records) {
    checkKeys(record, ['sourceId', 'proposedBodichIdentity', 'evidence', 'unresolved']);
    assert.ok(sources.some((s) => s.sourceId === record.sourceId) && !byId.has(record.sourceId),
      'Unknown, duplicated or retired source ID');
    if (record.proposedBodichIdentity !== null) {
      checkKeys(record.proposedBodichIdentity, ['manufacturer', 'model', 'variant']);
      Object.values(record.proposedBodichIdentity).forEach(safeText);
    }
    assert.ok(Array.isArray(record.evidence) && record.evidence.length <= 100, 'Invalid evidence list');
    for (const e of record.evidence) {
      evidenceItem(e, idSet);
      assert.ok(!evidenceItemInvalidSource(e), 'Supplier-only evidence cannot authorize BODICH product');
    }
    assert.ok(Array.isArray(record.unresolved) && record.unresolved.length <= 100, 'Invalid unresolved list');
    for (const issue of record.unresolved) {
      checkKeys(issue, ['gate', 'code', 'note', 'evidenceIds']);
      assert.ok(gateNames.includes(issue.gate) && /^[a-z][a-z0-9_]{2,63}$/.test(issue.code),
        'Unsafe issue/gate code');
      safeText(issue.note);
      assert.ok(Array.isArray(issue.evidenceIds) &&
        issue.evidenceIds.every((id) => record.evidence.some((e) => e.id === id)),
      'Conflict references unknown evidence');
    }
    byId.set(record.sourceId, record);
  }
  const decisions = new Map(states.map((s) => [s.sourceId, s]));
  assert.equal(decisions.size, expectedCount, 'Duplicate decision IDs');
  const rows = sources.map((s) => {
    assert.ok(decisions.has(s.sourceId), 'Missing current review decision ' + s.sourceId);
    return assess(byId.get(s.sourceId), s.sourceId, decisions.get(s.sourceId), intake.ledgerEpoch, s.copy);
  });
  const pilot = rows.find((r) => r.sourceId === intake.pilotSourceId);
  pilot.pilot = true;
  pilot.pilotOutcome = pilot.promotionEligible ? 'requires_separate_promotion_pr' : 'blocked';
  return { schemaVersion: 1, purpose: PURPOSE, epoch: intake.ledgerEpoch,
    total: rows.length, productEvidenceIntakes: byId.size,
    eligible: rows.filter((r) => r.promotionEligible).length,
    pilotSourceId: intake.pilotSourceId, pilotOutcome: pilot.pilotOutcome,
    note: 'Supplier research is not BODICH evidence. Ledger actors/hashes are not authentication.',
    rows };
}
// Reject supplier research repackaged as independent product proof, even if its metadata looks complete.
function evidenceItemInvalidSource(item) {
  return /\bking[\s_-]*tech\b/i.test(item.provenance) ||
    /\bking[\s_-]*tech\b/i.test(item.facts.subject) ||
    /\bsupplier[\s_-]*only\b/i.test(item.provenance);
}
export function reportOnDisk() {
  const ctx = contextOnDisk();
  const ledger = read('docs/catalog/review-ledger.json');
  const states = validateLedger(ledger, ctx);
  const overrides = read('docs/catalog/reference-overrides.json');
  const copies = new Map(overrides.records.map((r) => [r.sourceId, r.copy]));
  return validateIntake(read(INTAKE_PATH),
    ctx.sources.map((s) => ({ ...s, copy: copies.get(s.sourceId) })),
    ledger, states);
}
function test() {
  const revisions = { inventory: 'a'.repeat(40), overrides: 'b'.repeat(40),
    art: 'c'.repeat(40), copy: 'd'.repeat(40) };
  const sources = [{ sourceId: 'kt-a' }, { sourceId: 'kt-b' }];
  const ledger = { currentEpoch: 2, epochs: [{ revisions }, { revisions }] };
  const blankGate = () => Object.fromEntries(gateNames.map((g) => [g, { status: 'not_reviewed' }]));
  const states = sources.map((s) => ({ sourceId: s.sourceId, status: 'unreviewed', sourceReviewed: false,
    eligibleForPromotion: false, gates: blankGate(), previousEpochs: [] }));
  const fixture = { schemaVersion: 1, purpose: PURPOSE, ledgerEpoch: 2,
    ledgerRevisions: revisions, pilotSourceId: 'kt-a', records: [] };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ok = (d) => validateIntake(d, sources, ledger, states, { expectedCount: 2 });
  const empty = ok(fixture);
  assert.equal(empty.total, 2); assert.equal(empty.eligible, 0);
  assert.equal(empty.rows[0].pilotOutcome, 'blocked_on_hold_no_signoff');
  assert.ok(empty.rows[0].blockers.some((r) => r.includes('manufacturer_authorization')));
  const bad = (fn, pattern) => {
    const doc = clone(fixture); fn(doc); assert.throws(() => ok(doc), pattern);
  };
  bad((d) => { d.ledgerEpoch = 1; }, /Stale intake epoch/);
  bad((d) => { d.ledgerRevisions.art = '0'.repeat(40); }, /stale manifest/);
  bad((d) => { d.records = [{ sourceId: 'missing', proposedBodichIdentity: null,
    evidence: [], unresolved: [] }]; }, /Unknown, duplicated/);
  bad((d) => { d.records = Array(2).fill({
    sourceId: 'kt-a', proposedBodichIdentity: null, evidence: [], unresolved: [],
  }); }, /Unknown, duplicated/);
  const record = { sourceId: 'kt-a', proposedBodichIdentity: null, evidence: [], unresolved: [] };
  bad((d) => { d.records = [{ ...record, extra: true }]; }, /Unexpected field/);
  const proof = { id: 'evidence-1', gate: 'imagery', kind: 'ai_concept',
    ref: 'restricted:proof-123', sha256: 'a'.repeat(64), version: 'v1',
    provenance: 'marketing artwork', providerRole: 'bodich_owner',
    providerRef: 'restricted:provider-123', providedOn: '2026-10-20',
    verifiedOn: null, scope: { manufacturer: 'BODICH', model: 'X', variant: 'A' },
    facts: { subject: 'illustrative concept' } };
  const concept = clone(fixture);
  concept.records = [{ ...record, proposedBodichIdentity: {
    manufacturer: 'BODICH', model: 'X', variant: 'A' }, evidence: [proof] }];
  const gap = ok(concept).rows[0];
  assert.ok(gap.gates.imagery.reasons.includes('missing_exact_model_photo'));
  assert.ok(gap.gates.imagery.reasons.includes('concept_or_illustration_not_product_photo'));
  assert.equal(gap.promotionEligible, false);
  bad((d) => { d.records = [{ ...record, evidence: [{ ...proof,
    ref: 'https://www.kingtechturbines.com/product/x' }] }]; }, /Supplier-only/);
  bad((d) => { d.records = [{ ...record, evidence: [{ ...proof, sha256: '00' }] }]; }, /digest/);
  bad((d) => { d.records = [{ ...record, evidence: [{ ...proof, verifiedOn: '9999-12-31' }] }]; }, /future/);
  // A wrong variant is valid *evidence intake* but must be a blocking gap.
  const variant = clone(concept);
  variant.records[0].evidence[0].scope.variant = 'other';
  assert.ok(ok(variant).rows[0].gates.imagery.reasons.includes('wrong_model_or_variant'));
  const conflicts = clone(concept);
  conflicts.records[0].unresolved.push({ gate: 'imagery', code: 'rights_conflict',
    note: 'Two authors dispute the rights', evidenceIds: ['evidence-1'] });
  assert.ok(ok(conflicts).rows[0].gates.imagery.reasons.includes('unresolved_rights_conflict'));
  const previous = clone(states);
  previous[0].previousEpochs = [{ epoch: 1, eventCount: 9, statusAtArchive: 'approved_for_promotion' }];
  const before = validateIntake(fixture, sources, ledger, previous, { expectedCount: 2 });
  assert.equal(before.rows[0].promotionEligible, false);
  assert.deepEqual(before.rows[0].previousEpochOnly, [{ epoch: 1, effective: false, eventCount: 9 }]);
  const forged = clone(states);
  forged[0].gates.imagery.status = 'approved';
  assert.throws(() => validateIntake(fixture, sources, ledger, forged, { expectedCount: 2 }),
    /without complete independent/);
  console.log('Genuine BODICH intake self-test passed: gaps, scopes, rights, stale epochs, conflict and approval fail-closed.');
}
function main(args) {
  assert.ok(args.length === 1 && ['--check', '--self-test', '--export'].includes(args[0]),
    'Usage: node scripts/catalog-genuine-evidence.mjs --check | --self-test | --export');
  if (args[0] === '--self-test') return test();
  const report = reportOnDisk();
  if (args[0] === '--export') {
    mkdirSync(at('visual-qa'), { recursive: true });
    writeFileSync(at('visual-qa/genuine-product-evidence-gaps.json'),
      JSON.stringify(report, null, 2) + '\n');
  }
  console.log('Genuine BODICH evidence: ' + report.total + ' source drafts, ' +
    report.productEvidenceIntakes + ' submitted product-intake records; epoch ' + report.epoch +
    '; pilot ' + report.pilotSourceId + ': ' + report.pilotOutcome +
    '; ' + report.eligible + ' promotion-eligible; 0 products published by this workflow.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));

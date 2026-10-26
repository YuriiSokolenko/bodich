#!/usr/bin/env node
/* Issue #49: offline, Git-reviewed source decision history. Not an Astro import.
 * CLI reviewer metadata is a claim, not authentication: human PR review is mandatory.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const ledgerFile = at('docs/catalog/review-ledger.json');
const paths = { inventory: 'docs/catalog/source-inventory.json',
  overrides: 'docs/catalog/reference-overrides.json', art: 'docs/catalog/art-manifest.json',
  copy: 'docs/catalog/copy-review-matrix.json' };
const load = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const blob = (data) => createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nonempty = (v) => typeof v === 'string' && Boolean(v.trim());
const requireValue = (v, message) => assert.ok(v, message);
const keys = (obj, required, optional = []) => {
  requireValue(obj && typeof obj === 'object' && !Array.isArray(obj), 'Expected object');
  for (const key of required) requireValue(Object.hasOwn(obj, key), 'Missing field ' + key);
  for (const key of Object.keys(obj))
    requireValue(required.includes(key) || optional.includes(key), 'Unexpected field ' + key);
};
const currentRevisions = () => Object.fromEntries(Object.entries(paths).map(([name, path]) =>
  [name, blob(readFileSync(at(path)))]));
export const gateNames = ['identity', 'imagery', 'specifications', 'editorial'];
const decisions = ['not_reviewed', 'needs_evidence', 'approved', 'rejected', 'not_applicable_with_reason'];
const statuses = ['unreviewed', 'in_review', 'on_hold', 'rejected',
  'evidence_complete_pending_signoff', 'approved_for_promotion'];
const transitions = {
  unreviewed: ['in_review', 'on_hold', 'rejected'],
  in_review: ['in_review', 'on_hold', 'rejected', 'evidence_complete_pending_signoff'],
  on_hold: ['in_review', 'on_hold', 'rejected'],
  rejected: ['in_review', 'rejected'],
  evidence_complete_pending_signoff: ['in_review', 'on_hold', 'rejected', 'approved_for_promotion'],
  approved_for_promotion: ['in_review', 'on_hold', 'rejected'],
};
export function contextOnDisk() {
  const source = load(paths.inventory), overlays = load(paths.overrides);
  const edits = new Map(overlays.records.map((r) => [r.sourceId, r]));
  return { revisions: currentRevisions(), sources: source.products.map((r) => ({
    sourceId: r.id, sourceUrl: r.canonicalUrl, draftSlug: edits.get(r.id)?.slug,
  })) };
}
function validateDate(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  'Invalid evidence date');
}
function validateUtc(value) {
  requireValue(typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'),
  'Decision must have canonical UTC timestamp');
}
function reference(value) {
  requireValue(nonempty(value) && value.length <= 400 && !/[\r\n<>]/.test(value),
    'Invalid evidence reference; do not commit sensitive contents');
  if (value.startsWith('restricted:')) {
    requireValue(/^restricted:[a-zA-Z0-9][a-zA-Z0-9._/-]{2,160}$/.test(value),
      'Use opaque restricted: identifiers for confidential evidence');
  } else {
    const u = new URL(value);
    requireValue(u.protocol === 'https:' && u.hostname && !u.username && !u.password,
      'Evidence URL must be safe HTTPS');
    requireValue(!u.hostname.toLowerCase().endsWith('kingtechturbines.com'),
      'Supplier-only evidence cannot authorize a BODICH product');
  }
}
function evidenceCheck(items, imagery) {
  requireValue(Array.isArray(items) && items.length > 0 && items.length <= 20,
    'Approval requires traceable evidence');
  const seen = new Set();
  for (const item of items) {
    keys(item, ['ref', 'version', 'verifiedOn', 'provenance'], ['rightsOwner']);
    reference(item.ref);
    requireValue(!seen.has(item.ref), 'Duplicate evidence');
    seen.add(item.ref);
    requireValue(nonempty(item.version) && item.version.length <= 160 &&
      nonempty(item.provenance) && item.provenance.length <= 240 &&
      item.provenance.toLowerCase() !== 'supplier only', 'Missing independent provenance/version');
    validateDate(item.verifiedOn);
    if (imagery) requireValue(nonempty(item.rightsOwner), 'Image rights owner not identified');
  }
}
function gateCheck(event) {
  requireValue(gateNames.includes(event.gate) && decisions.includes(event.decision), 'Invalid gate/decision');
  if (event.decision === 'not_reviewed') {
    requireValue(!event.evidence && !event.details, 'Unreviewed cannot carry evidence or approval');
    return;
  }
  if (event.decision !== 'approved') {
    requireValue(!event.details, 'Nonapproved gate cannot carry approved details');
    if (event.evidence) evidenceCheck(event.evidence, false);
    return;
  }
  evidenceCheck(event.evidence, event.gate === 'imagery');
  const d = event.details;
  requireValue(d && typeof d === 'object', 'Approved gate requires exact facts');
  if (event.gate === 'identity') {
    keys(d, ['manufacturer', 'model', 'variant', 'legalAuthorityRef']);
    requireValue(d.manufacturer === 'BODICH' && nonempty(d.model) && nonempty(d.variant),
      'No approved exact BODICH manufacturer/model/variant identity');
    reference(d.legalAuthorityRef);
  } else if (event.gate === 'imagery') {
    keys(d, ['imageKind', 'model', 'assetSha256', 'rightsOwner', 'writtenPermissionRef']);
    requireValue(['authorized_exact_model_photo', 'verified_exact_model_technical_illustration']
      .includes(d.imageKind), 'AI concept or supplier photo is not verified model imagery');
    requireValue(nonempty(d.model) && /^[a-f0-9]{64}$/.test(d.assetSha256) &&
      nonempty(d.rightsOwner), 'Image identity, integrity and ownership absent');
    reference(d.writtenPermissionRef);
  } else if (event.gate === 'specifications') {
    keys(d, ['verifiedClaims', 'independentVerification', 'contradictionsResolved']);
    requireValue(d.independentVerification === true && d.contradictionsResolved === true &&
      Array.isArray(d.verifiedClaims) && d.verifiedClaims.length > 0 &&
      d.verifiedClaims.every(nonempty), 'Independent technical verification incomplete');
  } else if (event.gate === 'editorial') {
    keys(d, ['nativeRomanianApproved', 'englishApproved', 'legalApproved',
      'commercialApproved', 'unresolvedFlagsResolved']);
    requireValue(Object.values(d).every((value) => value === true),
      'EN/RO native editorial, legal and commercial sign-offs incomplete');
  }
}
const blank = () => ({ status: 'unreviewed',
  gates: Object.fromEntries(gateNames.map((gate) => [gate, {
    status: 'not_reviewed', reviewedBy: null, at: null, reason: null, evidence: [],
  }])), events: 0, lastReviewedAt: null, lastReviewedRevision: null,
  sourceReviewed: false, bodichIdentityVerified: false, eligibleForPromotion: false, blockers: [] });
const ready = (s) => gateNames.every((g) => s.gates[g].status === 'approved') &&
  nonempty(s.gates.identity.details?.model) &&
  s.gates.identity.details.model === s.gates.imagery.details?.model &&
  s.gates.specifications.details?.contradictionsResolved === true &&
  s.gates.editorial.details?.unresolvedFlagsResolved === true;
function reduce(state, event) {
  const s = clone(state);
  if (event.kind === 'gate') {
    gateCheck(event);
    s.gates[event.gate] = { status: event.decision, reviewedBy: event.reviewer,
      at: event.at, reason: event.reason, evidence: event.evidence || [],
      ...(event.details ? { details: event.details } : {}) };
    if (['unreviewed', 'evidence_complete_pending_signoff', 'approved_for_promotion'].includes(s.status))
      s.status = 'in_review';
  } else {
    requireValue(event.kind === 'status' && statuses.includes(event.status), 'Invalid review status');
    requireValue(transitions[s.status].includes(event.status),
      'Forbidden status transition ' + s.status + ' -> ' + event.status);
    if (['evidence_complete_pending_signoff', 'approved_for_promotion'].includes(event.status))
      requireValue(ready(s), 'All independent gates must be approved and consistent before promotion');
    if (event.status === 'approved_for_promotion') {
      requireValue(s.status === 'evidence_complete_pending_signoff' &&
        event.reviewer.role === 'publication_approver', 'Publication approver required');
      keys(event.signoff, ['statement', 'authorizationRef']);
      requireValue(event.signoff.statement ===
        'I explicitly approve this source research record only for a separate BODICH promotion PR.',
      'Missing explicit scoped human sign-off');
      reference(event.signoff.authorizationRef);
    } else requireValue(!event.signoff, 'Signoff may only accompany promotion eligibility');
    // A hold/rejection revokes earlier gate eligibility without deleting history.
    // Re-review must produce new independent gate events before later promotion.
    if (['on_hold', 'rejected'].includes(event.status)) {
      for (const gate of gateNames) {
        if (s.gates[gate].status === 'approved')
          s.gates[gate] = { status: 'needs_evidence', reviewedBy: event.reviewer,
            at: event.at, reason: 'Superseded by ' + event.status + ': ' + event.reason,
            evidence: [] };
      }
    }
    s.status = event.status;
  }
  s.events++;
  s.lastReviewedAt = event.at;
  s.lastReviewedRevision = event.reviewedRevisions;
  s.sourceReviewed = true;
  s.bodichIdentityVerified = s.gates.identity.status === 'approved';
  s.eligibleForPromotion = s.status === 'approved_for_promotion' && ready(s);
  s.blockers = gateNames.filter((g) => s.gates[g].status !== 'approved')
    .map((g) => g + ': ' + s.gates[g].status);
  if (!s.eligibleForPromotion) s.blockers.push('human signoff and separate promotion PR required');
  return s;
}
function eventCheck(event, prev, lastTime, revisions) {
  keys(event, ['sourceId', 'eventId', 'kind', 'at', 'reviewer', 'reason', 'reviewedRevisions',
    'previousHash', 'hash'], ['status', 'gate', 'decision', 'evidence', 'details', 'signoff']);
  requireValue(/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,100}$/.test(event.eventId), 'Invalid event ID');
  keys(event.reviewer, ['name', 'role']);
  requireValue(nonempty(event.reviewer.name) && event.reviewer.name.length <= 120 &&
    ['technical_reviewer', 'rights_reviewer', 'editorial_reviewer', 'legal_reviewer',
      'publication_approver', 'owner'].includes(event.reviewer.role),
  'Human reviewer identity/role required');
  requireValue(nonempty(event.reason) && event.reason.trim().length >= 10 &&
    event.reason.length <= 1200, 'Detailed decision rationale required');
  validateUtc(event.at);
  requireValue(!lastTime || Date.parse(event.at) > Date.parse(lastTime), 'History timestamps must increase');
  requireValue(eq(event.reviewedRevisions, revisions), 'Stale source/content revision');
  requireValue(event.previousHash === prev, 'Review history predecessor conflict');
  const { hash: digest, ...payload } = event;
  requireValue(digest === hash(JSON.stringify(payload)), 'Tampered review event hash');
  if (event.kind === 'gate') requireValue(!event.status && !event.signoff,
    'Gate decision cannot change publication status');
  else requireValue(!event.gate && !event.decision && !event.evidence && !event.details,
    'Status edit cannot smuggle approval gates');
}
export function validateLedger(ledger, ctx) {
  keys(ledger, ['schemaVersion', 'purpose', 'revisions', 'records']);
  requireValue(ledger.schemaVersion === 1 &&
    ledger.purpose === 'unpublished_source_review_only_no_publication',
  'Unknown ledger schema; perform explicit migration');
  requireValue(eq(ledger.revisions, ctx.revisions),
    'Stale manifest revisions; migration and re-review require a separate audited PR');
  requireValue(Array.isArray(ctx.sources) && Array.isArray(ledger.records), 'Missing source or ledger array');
  const sources = new Map();
  for (const source of ctx.sources) {
    requireValue(nonempty(source.sourceId) && nonempty(source.sourceUrl) && nonempty(source.draftSlug),
      'Missing identity in source/overlay');
    requireValue(!sources.has(source.sourceId), 'Duplicate source inventory ID');
    sources.set(source.sourceId, source);
  }
  requireValue(ctx.fixture === true || sources.size === 132, 'Frozen inventory requires 132 IDs');
  requireValue(ledger.records.length === sources.size, 'Missing/extra ledger IDs');
  const seen = new Set(), ids = new Set(), results = [];
  for (const record of ledger.records) {
    keys(record, ['sourceId', 'sourceUrl', 'draftSlug', 'events']);
    const original = sources.get(record.sourceId);
    requireValue(original && !seen.has(record.sourceId), 'Unknown or duplicate source ID: ' + record.sourceId);
    seen.add(record.sourceId);
    requireValue(original.sourceUrl === record.sourceUrl && original.draftSlug === record.draftSlug,
      'Source URL / draft slug mismatch: ' + record.sourceId);
    requireValue(Array.isArray(record.events), 'Review events must be an array');
    let previous = null, lastTime = null, state = blank();
    for (const event of record.events) {
      requireValue(event.sourceId === record.sourceId && !ids.has(event.eventId),
        'Mismatched source or duplicate event ID');
      ids.add(event.eventId);
      eventCheck(event, previous, lastTime, ledger.revisions);
      state = reduce(state, event);
      previous = event.hash; lastTime = event.at;
    }
    if (!record.events.length) state.blockers = gateNames.map((g) => g + ': not_reviewed')
      .concat(['human signoff and separate promotion PR required']);
    results.push({ sourceId: record.sourceId, ...state, history: record.events });
  }
  requireValue(seen.size === sources.size, 'Ledger source reconciliation incomplete');
  return results;
}
export function appendDecision(ledger, ctx, request) {
  validateLedger(ledger, ctx);
  keys(request, ['sourceId', 'eventId', 'kind', 'at', 'reviewer', 'reason',
    'reviewedRevisions', 'expectedPreviousHash'],
  ['status', 'gate', 'decision', 'evidence', 'details', 'signoff']);
  const old = ledger.records.flatMap((r) => r.events).find((event) =>
    event.eventId === request.eventId);
  const { expectedPreviousHash, ...payload } = request;
  if (old) {
    const replay = { ...payload, previousHash: old.previousHash };
    replay.hash = hash(JSON.stringify(replay));
    requireValue(old.sourceId === request.sourceId &&
      old.previousHash === expectedPreviousHash && eq(old, replay),
    'Conflicting duplicate event ID');
    return { ledger, changed: false };
  }
  const record = ledger.records.find((r) => r.sourceId === request.sourceId);
  requireValue(record, 'Unknown source ID');
  const prev = record.events.at(-1)?.hash || null;
  requireValue(prev === expectedPreviousHash, 'Concurrent revision conflict; refresh prior hash');
  const event = { ...payload, previousHash: prev };
  event.hash = hash(JSON.stringify(event));
  const updated = clone(ledger);
  updated.records.find((r) => r.sourceId === request.sourceId).events.push(event);
  validateLedger(updated, ctx);
  return { ledger: updated, changed: true };
}
export function auditExport(ledger, ctx) {
  const states = validateLedger(ledger, ctx);
  return { schemaVersion: 1, purpose: 'offline_review_only_not_publication',
    revisions: ledger.revisions, count: states.length, records: states };
}
function selfTest() {
  const revisions = { inventory: 'a'.repeat(40), overrides: 'b'.repeat(40),
    art: 'c'.repeat(40), copy: 'd'.repeat(40) };
  const ctx = { fixture: true, revisions, sources: [
    { sourceId: 'kt-1', sourceUrl: 'https://example.org/one', draftSlug: 'one' },
    { sourceId: 'kt-sq-OPAQUE', sourceUrl: 'https://example.org/two', draftSlug: 'two' },
  ] };
  const ledger = { schemaVersion: 1, purpose: 'unpublished_source_review_only_no_publication',
    revisions, records: ctx.sources.map((r) => ({ ...r, events: [] })) };
  assert.equal(validateLedger(ledger, ctx).length, 2);
  const input = (id, extra = {}) => ({
    sourceId: 'kt-1', eventId: id, kind: 'status', status: 'in_review',
    at: '2026-10-26T12:00:00Z', reviewer: { name: 'Test reviewer', role: 'owner' },
    reason: 'Explicitly reviewing research reference',
    reviewedRevisions: revisions, expectedPreviousHash: null, ...extra,
  });
  const first = input('event-001'), appended = appendDecision(ledger, ctx, first);
  assert.equal(appended.changed, true);
  assert.equal(appendDecision(appended.ledger, ctx, first).changed, false);
  assert.throws(() => appendDecision(appended.ledger, ctx,
    input('event-001', { reason: 'Conflicting duplicate history event' })), /Conflicting duplicate/);
  assert.throws(() => appendDecision(appended.ledger, ctx,
    input('event-002', { at: '2026-10-26T12:00:01Z' })), /Concurrent revision/);
  assert.throws(() => appendDecision(ledger, ctx, input('event-003', {
    status: 'approved_for_promotion' })), /Forbidden status/);
  assert.throws(() => appendDecision(ledger, ctx, input('event-004', {
    reviewedRevisions: { ...revisions, art: 'f'.repeat(40) } })), /Stale source/);
  const mutate = clone(appended.ledger);
  mutate.records[0].events[0].reason = 'Unauthorized historical modification';
  assert.throws(() => validateLedger(mutate, ctx), /Tampered review/);
  const drop = clone(ledger); drop.records.pop();
  assert.throws(() => validateLedger(drop, ctx), /Missing\/extra/);
  const bogus = clone(ledger); bogus.records[1].sourceId = 'unknown';
  assert.throws(() => validateLedger(bogus, ctx), /Unknown or duplicate/);
  const stale = clone(ledger); stale.revisions.inventory = 'f'.repeat(40);
  assert.throws(() => validateLedger(stale, ctx), /Stale manifest revisions/);
  const gate = input('event-005', { kind: 'gate', gate: 'imagery', decision: 'approved',
    at: '2026-10-26T12:00:01Z', expectedPreviousHash: appended.ledger.records[0].events[0].hash,
    evidence: [{ ref: 'https://example.org/evidence', version: '1',
      verifiedOn: '2026-10-26', provenance: 'Original', rightsOwner: 'Test company' }],
    details: { imageKind: 'ai_marketing_concept', model: 'X', assetSha256: 'a'.repeat(64),
      rightsOwner: 'Test company', writtenPermissionRef: 'restricted:test-rights' },
  });
  delete gate.status;
  assert.throws(() => appendDecision(appended.ledger, ctx, gate), /AI concept/);
  const na = input('event-006', { kind: 'gate', gate: 'identity', decision: 'not_applicable_with_reason',
    at: '2026-10-26T12:00:01Z', expectedPreviousHash: appended.ledger.records[0].events[0].hash });
  delete na.status;
  const held = appendDecision(appended.ledger, ctx, na);
  assert.equal(validateLedger(held.ledger, ctx)[0].gates.identity.status, 'not_applicable_with_reason');
  assert.equal(auditExport(ledger, ctx).records.filter((s) => s.eligibleForPromotion).length, 0);
  // Complete synthetic path: four INDEPENDENT approvals, pending-signoff, human approver.
  let chain = appended.ledger;
  const next = (id, secs, fields) => {
    const last = chain.records[0].events.at(-1);
    const event = input(id, { at: new Date(Date.parse('2026-10-26T12:00:00Z') +
      secs * 1000).toISOString().replace('.000Z', 'Z'),
      expectedPreviousHash: last.hash, ...fields });
    if (event.kind === 'gate') delete event.status;
    chain = appendDecision(chain, ctx, event).ledger;
    return chain;
  };
  const proof = (ref) => [{ ref: 'https://independent.example.org/' + ref,
    version: 'v1', verifiedOn: '2026-10-26', provenance: 'Independent original company register',
    rightsOwner: 'BODICH' }];
  next('identity-001', 2, { kind: 'gate', gate: 'identity', decision: 'approved',
    evidence: proof('model-rights'), details: {
      manufacturer: 'BODICH', model: 'BODICH-X1', variant: 'rev-A',
      legalAuthorityRef: 'restricted:company-model-record',
    } });
  next('imagery-001', 3, { kind: 'gate', gate: 'imagery', decision: 'approved',
    evidence: proof('image-license'), details: {
      imageKind: 'authorized_exact_model_photo', model: 'BODICH-X1',
      assetSha256: 'a'.repeat(64), rightsOwner: 'BODICH',
      writtenPermissionRef: 'restricted:company-image-license',
    } });
  next('specs-001', 4, { kind: 'gate', gate: 'specifications', decision: 'approved',
    evidence: proof('independent-specs'), details: {
      verifiedClaims: ['Test claim with independent validation'],
      independentVerification: true, contradictionsResolved: true,
    } });
  next('editorial-001', 5, { kind: 'gate', gate: 'editorial', decision: 'approved',
    evidence: proof('approved-copy'), details: {
      nativeRomanianApproved: true, englishApproved: true,
      legalApproved: true, commercialApproved: true, unresolvedFlagsResolved: true,
    } });
  assert.equal(validateLedger(chain, ctx)[0].eligibleForPromotion, false);
  next('pending-signoff-001', 6, { status: 'evidence_complete_pending_signoff' });
  assert.throws(() => appendDecision(chain, ctx, input('weak-signoff-001', {
    status: 'approved_for_promotion', at: '2026-10-26T12:00:07Z',
    expectedPreviousHash: chain.records[0].events.at(-1).hash,
  })), /Publication approver required/);
  next('signoff-001', 7, { status: 'approved_for_promotion',
    reviewer: { name: 'Human test publisher', role: 'publication_approver' },
    signoff: { statement:
      'I explicitly approve this source research record only for a separate BODICH promotion PR.',
      authorizationRef: 'restricted:publication-authorization' },
  });
  assert.equal(validateLedger(chain, ctx)[0].eligibleForPromotion, true);
  // Revocation preserves events, but a fast-track reapproval without fresh gates fails.
  next('hold-001', 8, { status: 'on_hold', reason: 'New contradictory evidence surfaced in review' });
  const heldState = validateLedger(chain, ctx)[0];
  assert.equal(heldState.eligibleForPromotion, false);
  assert.equal(heldState.gates.identity.status, 'needs_evidence');
  next('restart-001', 9, { status: 'in_review',
    reason: 'Reopening only after a documented contradictory-evidence investigation' });
  assert.throws(() => appendDecision(chain, ctx, input('fast-track-001', {
    status: 'evidence_complete_pending_signoff', at: '2026-10-26T12:00:10Z',
    expectedPreviousHash: chain.records[0].events.at(-1).hash,
  })), /All independent gates/);
  const wrongModel = clone(appended.ledger);
  wrongModel.records[0].events[0].at = '2026-02-30T12:00:00Z';
  assert.throws(() => validateLedger(wrongModel, ctx), /UTC|Tampered/);
  const directReject = appendDecision(ledger, ctx,
    input('rejection-001', { status: 'rejected', reason: 'No ownership evidence exists for this reference' })).ledger;
  assert.throws(() => appendDecision(directReject, ctx, input('invalid-reapproval-001', {
    status: 'approved_for_promotion', at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: directReject.records[0].events.at(-1).hash,
  })), /Forbidden status/);
  // A gate-specific N/A never removes a blocker; mismatched model or missing RO/legal
  // approval cannot be used to satisfy the promotion transition.
  assert.equal(validateLedger(held.ledger, ctx)[0].gates.identity.status, 'not_applicable_with_reason');
  assert.equal(validateLedger(held.ledger, ctx)[0].eligibleForPromotion, false);
  console.log('Review ledger self-test passed: 132 contract, opaque ID, idempotence, immutable history, stale revision, gated approvals.');
}
function main(args) {
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  requireValue((args.length === 1 && ['--check', '--export'].includes(args[0])) ||
    (args.length === 2 && args[0] === '--apply'),
  'Usage: --check | --export | --self-test | --apply <decision.json>');
  const ctx = contextOnDisk(), ledger = load('docs/catalog/review-ledger.json');
  const states = validateLedger(ledger, ctx);
  if (args[0] === '--check') {
    console.log('Reviewed ledger: ' + states.length + ' unpublished records, ' +
      states.filter((s) => s.eligibleForPromotion).length + ' separate-promotion candidates');
    return;
  }
  if (args[0] === '--export') {
    const output = at('visual-qa/catalog-review-audit.json');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(auditExport(ledger, ctx), null, 2) + '\n');
    return console.log('Wrote offline audit export in ignored visual-qa/');
  }
  const decisionPath = resolve(process.cwd(), args[1]);
  requireValue(decisionPath !== ledgerFile, 'Cannot import the ledger as a decision');
  const request = JSON.parse(readFileSync(decisionPath, 'utf8'));
  const result = appendDecision(ledger, ctx, request);
  if (!result.changed) return console.log('Idempotent import: event already recorded');
  const tmp = ledgerFile + '.tmp';
  requireValue(!existsSync(tmp), 'Existing concurrent/uncompleted write');
  try {
    writeFileSync(tmp, JSON.stringify(result.ledger, null, 2) + '\n', { flag: 'wx' });
    renameSync(tmp, ledgerFile);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
  console.log('Appended decision ' + request.eventId + '. Commit a reviewed Git PR; no product published.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));

#!/usr/bin/env node
/* Issue #49: offline, Git-reviewed source decision history. Not an Astro import.
 * CLI reviewer metadata is a claim, not authentication: human PR review is mandatory.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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
// v1 hashes use recursive canonical key ordering; rewriting a JSON object must not create a new decision.
const canonical = (value) => JSON.stringify(value, (_, item) => {
  if (item && typeof item === 'object' && !Array.isArray(item))
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  return item;
});
const eq = (a, b) => canonical(a) === canonical(b);
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
// Roles are claims, not authentication: human PR review must confirm actual authority.
export const gateRoles = {
  identity: ['owner', 'legal_reviewer'],
  imagery: ['owner', 'rights_reviewer'],
  specifications: ['owner', 'technical_reviewer'],
  editorial: ['owner', 'editorial_reviewer', 'legal_reviewer'],
};
const normalizedIdentity = (name) => name.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en');
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
// Sealed previous-epoch archives. Any unexpected file is an error: half-written or stray history must be visible.
function archivesOnDisk() {
  const dir = at('docs/catalog/review-ledger-archive'), result = {};
  if (!existsSync(dir)) return result;
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    requireValue(/^epoch-\d{3}\.json$/.test(name), 'Unexpected file in review ledger archive: ' + name);
    result['docs/catalog/review-ledger-archive/' + name] =
      JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
  }
  return result;
}
export function contextOnDisk() {
  const source = load(paths.inventory), overlays = load(paths.overrides);
  const edits = new Map(overlays.records.map((r) => [r.sourceId, r]));
  return { revisions: currentRevisions(), archives: archivesOnDisk(), sources: source.products.map((r) => ({
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
// Supplier pages may identify a source record (migration provenance) but never authorize BODICH evidence.
function reference(value, { allowSupplier = false } = {}) {
  requireValue(nonempty(value) && value.length <= 400 && !/[\r\n<>]/.test(value),
    'Invalid evidence reference; do not commit sensitive contents');
  if (value.startsWith('restricted:')) {
    requireValue(/^restricted:[a-zA-Z0-9][a-zA-Z0-9._/-]{2,160}$/.test(value),
      'Use opaque restricted: identifiers for confidential evidence');
  } else {
    let u;
    try { u = new URL(value); }
    catch { throw new Error('Malformed evidence URL: expected full HTTPS URL or restricted: reference'); }
    requireValue(u.protocol === 'https:' && u.hostname && !u.username && !u.password && !u.search && !u.hash,
      'Evidence URL must be safe HTTPS');
    requireValue(allowSupplier || !u.hostname.toLowerCase().endsWith('kingtechturbines.com'),
      'Supplier-only evidence cannot authorize a BODICH product');
  }
}
// Free text in committed migration records: bounded, single-line, no markup, no obvious personal data or tokens.
function safeText(value, min, max, message) {
  requireValue(typeof value === 'string' && value.trim().length >= min && value.length <= max &&
    !/[\u0000-\u001f<>]/.test(value) && !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value) &&
    !/https?:\/\/[^\s]*[@?#]/i.test(value), message +
    ' (single line, no markup, e-mail addresses, credentials or tokens)');
}
const safeId = (value) => requireValue(typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value), 'Unsafe source ID');
// Opaque IDs stay case-sensitive; the folded form only detects deceptive collisions.
const foldId = (value) => value.normalize('NFKC').toLowerCase();
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256Canonical = (value) => hash(canonical(value));
const SHA256 = /^[a-f0-9]{64}$/;
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
      !/\bsupplier[\s_-]*only\b/i.test(item.provenance),
      'Missing independent provenance/version (supplier-only is not sufficient)');
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
  requireValue(event.evidence.every((item) => Date.parse(item.verifiedOn) <= Date.parse(event.at)),
    'Approved evidence cannot be dated after the human decision');
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
    requireValue(s.status === 'in_review', 'Gate decisions require an explicit in_review status');
    requireValue(gateRoles[event.gate]?.includes(event.reviewer.role),
      'Reviewer role is not authorized for this gate: ' + event.gate);
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
      const signer = normalizedIdentity(event.reviewer.name);
      requireValue(gateNames.every((gate) =>
        normalizedIdentity(s.gates[gate].reviewedBy.name) !== signer),
      'Publication approver must be independent of each approving gate reviewer');
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
// `epoch` is part of the hashed payload for events written under schema v2, so an event cannot be moved
// between epochs. Legacy schema-v1 events carry no marker and exist only in epoch 1; they are never rewritten.
function eventCheck(event, prev, lastTime, revisions, epoch = 1, { legacyOnly = false } = {}) {
  keys(event, ['sourceId', 'eventId', 'kind', 'at', 'reviewer', 'reason', 'reviewedRevisions',
    'previousHash', 'hash'], ['status', 'gate', 'decision', 'evidence', 'details', 'signoff',
    ...(legacyOnly ? [] : ['epoch'])]);
  if (event.epoch === undefined) requireValue(epoch === 1,
    'Mixed ledger epochs: event without an epoch marker outside epoch 1');
  else requireValue(event.epoch === epoch, 'Mixed ledger epochs: event belongs to epoch ' + event.epoch);
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
  requireValue(digest === hash(canonical(payload)), 'Tampered review event hash');
  if (event.kind === 'gate') requireValue(!event.status && !event.signoff,
    'Gate decision cannot change publication status');
  else requireValue(!event.gate && !event.decision && !event.evidence && !event.details,
    'Status edit cannot smuggle approval gates');
}
// ---------------------------------------------------------------------------------------------
// Schema v2: versioned revision epochs (issue #51).
// An epoch pins ONE immutable set of four manifest revisions. A changed manifest never edits the
// past: the current epoch is sealed into a read-only archive and a new epoch starts with every
// record unreviewed. History is visible as "previous epoch only"; it never confers eligibility.
// ---------------------------------------------------------------------------------------------
const PURPOSE = 'unpublished_source_review_only_no_publication';
const revisionNames = Object.keys(paths);
const archiveDir = 'docs/catalog/review-ledger-archive';
const archivePath = (epoch) => archiveDir + '/epoch-' + String(epoch).padStart(3, '0') + '.json';
const bySource = (a, b) => byText(a.sourceId, b.sourceId) || byText(a.field ?? '', b.field ?? '');
function revisionSet(value) {
  keys(value, revisionNames);
  for (const name of revisionNames)
    requireValue(typeof value[name] === 'string' && /^[a-f0-9]{40}$/.test(value[name]),
      'Invalid manifest revision');
}
function indexSources(ctx) {
  requireValue(Array.isArray(ctx.sources), 'Missing source or ledger array');
  const sources = new Map();
  for (const source of ctx.sources) {
    requireValue(nonempty(source.sourceId) && nonempty(source.sourceUrl) && nonempty(source.draftSlug),
      'Missing identity in source/overlay');
    requireValue(!sources.has(source.sourceId), 'Duplicate source inventory ID');
    sources.set(source.sourceId, source);
  }
  return sources;
}
function matchSources(records, sources) {
  const seen = new Set();
  for (const record of records) {
    const original = sources.get(record?.sourceId);
    requireValue(original && !seen.has(record.sourceId),
      'Unknown or duplicate source ID: ' + record?.sourceId);
    seen.add(record.sourceId);
    requireValue(original.sourceUrl === record.sourceUrl && original.draftSlug === record.draftSlug,
      'Source URL / draft slug mismatch: ' + record.sourceId);
  }
  requireValue(seen.size === sources.size, 'Ledger source reconciliation incomplete');
}
// Validates every record's append-only chain and derives its state for ONE epoch.
function replay(records, { revisions, epoch, ids, floor = null, legacyOnly = false }) {
  const results = new Map();
  let lastAny = null, eventCount = 0;
  for (const record of records) {
    keys(record, ['sourceId', 'sourceUrl', 'draftSlug', 'events']);
    requireValue(nonempty(record.sourceId) && nonempty(record.sourceUrl) && nonempty(record.draftSlug) &&
      !results.has(record.sourceId), 'Unknown or duplicate source ID: ' + record.sourceId);
    requireValue(Array.isArray(record.events), 'Review events must be an array');
    let previous = null, lastTime = floor, state = blank();
    for (const event of record.events) {
      requireValue(event.sourceId === record.sourceId && !ids.has(event.eventId),
        'Mismatched source or duplicate event ID');
      ids.add(event.eventId);
      eventCheck(event, previous, lastTime, revisions, epoch, { legacyOnly });
      state = reduce(state, event);
      previous = event.hash; lastTime = event.at; eventCount++;
      if (!lastAny || Date.parse(event.at) > Date.parse(lastAny)) lastAny = event.at;
    }
    if (!record.events.length) state.blockers = gateNames.map((g) => g + ': not_reviewed')
      .concat(['human signoff and separate promotion PR required']);
    results.set(record.sourceId, state);
  }
  return { results, lastAny, eventCount };
}
const stripState = ({ epoch, previousEpochs, ...rest }) => rest;
// Legacy reader. Only the deterministic --upgrade-v1 backfill uses it; the repository ledger is v2.
export function validateLedgerV1(ledger, ctx) {
  keys(ledger, ['schemaVersion', 'purpose', 'revisions', 'records']);
  requireValue(ledger.schemaVersion === 1 && ledger.purpose === PURPOSE,
    'Unknown ledger schema; perform explicit migration');
  requireValue(eq(ledger.revisions, ctx.revisions),
    'Stale manifest revisions; migration and re-review require a separate audited PR');
  requireValue(Array.isArray(ledger.records), 'Missing source or ledger array');
  const sources = indexSources(ctx);
  requireValue(ctx.fixture === true || sources.size === 132, 'Frozen inventory requires 132 IDs');
  requireValue(ledger.records.length === sources.size, 'Missing/extra ledger IDs');
  matchSources(ledger.records, sources);
  const { results } = replay(ledger.records, { revisions: ledger.revisions, epoch: 1,
    ids: new Set(), legacyOnly: true });
  return ledger.records.map((record) => ({ sourceId: record.sourceId,
    ...results.get(record.sourceId), history: record.events }));
}
// Backfill: a v1 ledger becomes the (still current) epoch 1 of a v2 ledger. Records and events are copied
// verbatim (IDs, hashes, timestamps, actors, evidence); nothing is added, rehashed or reinterpreted.
export function upgradeV1(v1, ctx) {
  const before = validateLedgerV1(v1, ctx);
  const v2 = { schemaVersion: 2, purpose: PURPOSE, currentEpoch: 1,
    epochs: [{ epoch: 1, revisions: clone(v1.revisions), sourceCount: v1.records.length,
      origin: 'schema_v1_backfill' }],
    records: clone(v1.records) };
  const after = validateLedger(v2, ctx);
  requireValue(eq(before, after.map(stripState)), 'Backfill must not change any review state');
  return v2;
}
function checkMigration(entry, prev, records, seenBefore, migrationIds) {
  const m = entry.migration;
  keys(m, ['migrationId', 'at', 'reviewer', 'reason', 'fromEpoch', 'toEpoch', 'previousEpochSeal',
    'previousMigrationHash', 'fromRevisions', 'toRevisions', 'changedManifests', 'sourceChanges',
    'carriedSourceCount', 'inheritance', 'hash']);
  const { hash: digest, ...payload } = m;
  requireValue(digest === sha256Canonical(payload), 'Tampered migration record hash');
  requireValue(/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,100}$/.test(m.migrationId) && !migrationIds.has(m.migrationId),
    'Invalid or duplicate migration ID');
  migrationIds.add(m.migrationId);
  requireValue(!prev.lastTime || Date.parse(m.at) > Date.parse(prev.lastTime),
    'Migration predates previous-epoch history (stale events)');
  requireValue(!prev.migrationAt || Date.parse(m.at) > Date.parse(prev.migrationAt),
    'Migration timestamps must increase');
  keys(m.reviewer, ['name', 'role']);
  requireValue(nonempty(m.reviewer.name) && m.reviewer.name.length <= 120 &&
    !/[\u0000-\u001f<>]/.test(m.reviewer.name) && m.reviewer.role === 'owner',
  'Migration requires an attributed owner');
  safeText(m.reason, 10, 1200, 'Detailed migration rationale required');
  requireValue(m.fromEpoch === entry.epoch - 1 && m.toEpoch === entry.epoch && m.inheritance === 'none',
    'Migration epoch/inheritance mismatch: no approval may be inherited');
  requireValue(m.previousEpochSeal === prev.seal, 'Migration does not seal the previous epoch archive');
  requireValue(m.previousMigrationHash === prev.migrationHash, 'Migration chain broken');
  revisionSet(m.fromRevisions); revisionSet(m.toRevisions);
  requireValue(eq(m.fromRevisions, prev.entry.revisions) && eq(m.toRevisions, entry.revisions),
    'Migration revisions do not match the epoch records');
  const changedNames = revisionNames.filter((name) => m.fromRevisions[name] !== m.toRevisions[name]);
  requireValue(changedNames.length > 0 && eq(m.changedManifests, changedNames),
    'Migration must name every changed manifest, and at least one must change');

  const current = new Map(records.map((r) => [r.sourceId, r]));
  const added = records.filter((r) => !prev.map.has(r.sourceId))
    .map(({ sourceId, sourceUrl, draftSlug }) => ({ sourceId, sourceUrl, draftSlug })).sort(bySource);
  const retired = [...prev.map.values()].filter((r) => !current.has(r.sourceId))
    .map(({ sourceId, sourceUrl }) => ({ sourceId, sourceUrl })).sort(bySource);
  const changed = [];
  for (const record of records) {
    const old = prev.map.get(record.sourceId);
    if (old) for (const field of ['draftSlug', 'sourceUrl'])
      if (old[field] !== record[field])
        changed.push({ sourceId: record.sourceId, field, from: old[field], to: record[field] });
  }
  changed.sort(bySource);
  for (const item of added) {
    requireValue(!seenBefore.has(foldId(item.sourceId)),
      'Source ID collision with an earlier epoch: ' + item.sourceId);
    safeId(item.sourceId);
  }

  const changes = m.sourceChanges;
  keys(changes, ['added', 'retired', 'changed']);
  for (const list of ['added', 'retired', 'changed'])
    requireValue(Array.isArray(changes[list]) && changes[list].length <= 5000, 'Invalid source change list');
  for (const item of changes.added) {
    keys(item, ['sourceId', 'sourceUrl', 'draftSlug', 'provenance'], ['supersedes']);
    reference(item.sourceUrl, { allowSupplier: true });
    keys(item.provenance, ['ref', 'note']);
    reference(item.provenance.ref, { allowSupplier: true });
    safeText(item.provenance.note, 10, 240, 'Added-source provenance note required');
    if (item.supersedes !== undefined)
      requireValue(Array.isArray(item.supersedes) && item.supersedes.length > 0 &&
        item.supersedes.every((id) => retired.some((r) => r.sourceId === id)) &&
        eq(item.supersedes, [...new Set(item.supersedes)].sort(byText)),
      'Invalid supersedes list (sorted unique retired source IDs required)');
  }
  for (const item of changes.retired) {
    keys(item, ['sourceId', 'sourceUrl', 'reason']);
    safeText(item.reason, 10, 400, 'Retired-source reason required');
  }
  for (const item of changes.changed) {
    keys(item, ['sourceId', 'field', 'from', 'to', 'reason']);
    safeText(item.reason, 10, 400, 'Source change reason required');
  }
  requireValue(eq(changes.added.map(({ sourceId, sourceUrl, draftSlug }) =>
    ({ sourceId, sourceUrl, draftSlug })), added), 'Undeclared or misdeclared added source records');
  requireValue(eq(changes.retired.map(({ sourceId, sourceUrl }) => ({ sourceId, sourceUrl })), retired),
    'Undeclared or misdeclared retired source records');
  requireValue(eq(changes.changed.map(({ sourceId, field, from, to }) =>
    ({ sourceId, field, from, to })), changed), 'Undeclared or misdeclared source URL / draft slug change');
  requireValue(m.carriedSourceCount === records.length - added.length, 'Migration carried-record count drift');
  return changes.retired;
}
function analyze(ledger, ctx, { pending = false } = {}) {
  requireValue(ledger && typeof ledger === 'object' && !Array.isArray(ledger), 'Expected object');
  if (ledger.schemaVersion === 1)
    throw new Error('Ledger schema v1 is legacy: run the deterministic --upgrade-v1 backfill in a reviewed PR');
  requireValue(ledger.schemaVersion === 2 && ledger.purpose === PURPOSE,
    'Unknown ledger schema; perform explicit migration');
  keys(ledger, ['schemaVersion', 'purpose', 'currentEpoch', 'epochs', 'records']);
  const { epochs } = ledger;
  requireValue(Array.isArray(epochs) && epochs.length >= 1 && epochs.length <= 999 &&
    ledger.currentEpoch === epochs.length && Array.isArray(ledger.records),
  'Epoch list does not match the current epoch (deleted, reordered or missing history)');
  const archives = ctx.archives ?? {};
  const eventIds = new Set(), priorEventIds = new Set(), seen = new Set(), migrationIds = new Set();
  const referenced = new Set(), priorHistory = new Map(), lastKnown = new Map(), retiredBy = new Map();
  const summaries = [];
  let prev = null, final = null;
  for (const [index, entry] of epochs.entries()) {
    const isCurrent = index === epochs.length - 1;
    requireValue(entry && typeof entry === 'object' && !Array.isArray(entry), 'Expected epoch object');
    keys(entry, ['epoch', 'revisions', 'sourceCount', ...(isCurrent ? [] : ['archive']),
      ...(index === 0 ? ['origin'] : ['migration'])]);
    requireValue(entry.epoch === index + 1, 'Non-contiguous epoch numbers (deleted or reordered history)');
    revisionSet(entry.revisions);
    requireValue(Number.isInteger(entry.sourceCount) && entry.sourceCount > 0, 'Invalid epoch source count');
    if (index === 0) requireValue(['initial', 'schema_v1_backfill'].includes(entry.origin),
      'Unknown epoch origin');
    else {
      requireValue(entry.migration && typeof entry.migration === 'object', 'Missing migration record');
      validateUtc(entry.migration.at);
      requireValue(!eq(entry.revisions, prev.entry.revisions), 'An epoch must pin a new manifest revision set');
    }
    let records, seal = null;
    if (isCurrent) records = ledger.records;
    else {
      const ref = entry.archive;
      keys(ref, ['path', 'sha256', 'recordCount', 'eventCount']);
      requireValue(ref.path === archivePath(entry.epoch) && SHA256.test(ref.sha256) &&
        Number.isInteger(ref.recordCount) && Number.isInteger(ref.eventCount), 'Invalid archive reference');
      requireValue(Object.hasOwn(archives, ref.path), 'Missing previous-epoch archive (deleted history): ' + ref.path);
      referenced.add(ref.path);
      const doc = archives[ref.path];
      keys(doc, ['schemaVersion', 'kind', 'purpose', 'epoch', 'revisions', 'records']);
      requireValue(doc.schemaVersion === 2 && doc.kind === 'review_ledger_epoch_archive' &&
        doc.purpose === PURPOSE && doc.epoch === entry.epoch && eq(doc.revisions, entry.revisions) &&
        Array.isArray(doc.records), 'Previous-epoch archive header mismatch');
      seal = sha256Canonical(doc);
      requireValue(seal === ref.sha256, 'Tampered previous-epoch archive (seal mismatch)');
      records = doc.records;
    }
    const replayed = replay(records, { revisions: entry.revisions, epoch: entry.epoch, ids: eventIds,
      floor: index ? entry.migration.at : null });
    requireValue(records.length === entry.sourceCount,
      isCurrent ? 'Missing/extra ledger IDs' : 'Archived epoch record count drift (deleted history)');
    if (index === 0 && ctx.fixture !== true)
      requireValue(records.length === 132, 'Frozen inventory requires 132 IDs');
    const folded = new Set(), urls = new Set(), slugs = new Set();
    for (const record of records) {
      safeId(record.sourceId);
      requireValue(!folded.has(foldId(record.sourceId)), 'Duplicate source ID (case-insensitive collision): ' +
        record.sourceId);
      requireValue(!urls.has(record.sourceUrl) && !slugs.has(record.draftSlug),
        'Duplicate source URL or draft slug: ' + record.sourceId);
      folded.add(foldId(record.sourceId)); urls.add(record.sourceUrl); slugs.add(record.draftSlug);
    }
    if (!isCurrent) {
      requireValue(records.length === entry.archive.recordCount && replayed.eventCount === entry.archive.eventCount,
        'Archive reconciliation drift (deleted or injected history)');
      for (const record of records) {
        for (const event of record.events) priorEventIds.add(event.eventId);
        if (!record.events.length) continue;
        if (!priorHistory.has(record.sourceId)) priorHistory.set(record.sourceId, []);
        priorHistory.get(record.sourceId).push({ epoch: entry.epoch, previousEpochOnly: true, effective: false,
          revisions: clone(entry.revisions), archiveSha256: seal,
          statusAtArchive: replayed.results.get(record.sourceId).status,
          eventCount: record.events.length, history: record.events });
      }
    }
    if (index > 0) for (const item of checkMigration(entry, prev, records, seen, migrationIds))
      retiredBy.set(item.sourceId, { epoch: entry.epoch, reason: item.reason });
    for (const record of records) {
      seen.add(foldId(record.sourceId));
      lastKnown.set(record.sourceId, { sourceUrl: record.sourceUrl, draftSlug: record.draftSlug });
    }
    summaries.push({ ...clone(entry), status: isCurrent ? 'current' : 'archived',
      eventCount: replayed.eventCount });
    prev = { entry, map: new Map(records.map((r) => [r.sourceId, r])), seal,
      lastTime: replayed.lastAny, migrationAt: index ? entry.migration.at : null,
      migrationHash: index ? entry.migration.hash : null };
    final = replayed;
  }
  for (const path of Object.keys(archives))
    requireValue(referenced.has(path), 'Unreferenced previous-epoch archive: ' + path);
  const entry = epochs.at(-1);
  if (!pending) {
    requireValue(eq(entry.revisions, ctx.revisions),
      'Stale manifest revisions; migration and re-review require a separate audited PR');
    const sources = indexSources(ctx);
    requireValue(ledger.records.length === sources.size, 'Missing/extra ledger IDs');
    matchSources(ledger.records, sources);
  }
  const states = ledger.records.map((record) => ({ sourceId: record.sourceId,
    ...final.results.get(record.sourceId), history: record.events, epoch: entry.epoch,
    previousEpochs: priorHistory.get(record.sourceId) ?? [] }));
  const current = new Set(ledger.records.map((r) => r.sourceId));
  const retired = [...lastKnown].filter(([id]) => !current.has(id)).map(([sourceId, known]) => ({
    sourceId, ...known, retiredInEpoch: retiredBy.get(sourceId)?.epoch ?? null,
    retirementReason: retiredBy.get(sourceId)?.reason ?? null,
    previousEpochs: priorHistory.get(sourceId) ?? [] }));
  return { states, retired, epochs: summaries, priorEventIds };
}
export function validateLedger(ledger, ctx) { return analyze(ledger, ctx).states; }
const normalizeChanges = (changes) => {
  keys(changes, ['added', 'retired', 'changed']);
  for (const list of ['added', 'retired', 'changed'])
    requireValue(Array.isArray(changes[list]), 'Invalid source change list');
  return clone({
    added: changes.added.map((item) => item?.supersedes ?
      { ...item, supersedes: [...new Set(item.supersedes)].sort(byText) } : item).sort(bySource),
    retired: [...changes.retired].sort(bySource),
    changed: [...changes.changed].sort(bySource),
  });
};
const archiveDocument = (ledger) => ({ schemaVersion: 2, kind: 'review_ledger_epoch_archive',
  purpose: PURPOSE, epoch: ledger.epochs.at(-1).epoch, revisions: clone(ledger.epochs.at(-1).revisions),
  records: clone(ledger.records) });
// Read-only: what a migration to the on-disk manifests would change. Prints a request template.
export function planMigration(ledger, ctx) {
  analyze(ledger, ctx, { pending: true });
  const entry = ledger.epochs.at(-1), next = indexSources(ctx);
  const before = new Map(ledger.records.map((r) => [r.sourceId, r]));
  const changedManifests = revisionNames.filter((name) => entry.revisions[name] !== ctx.revisions[name]);
  requireValue(changedManifests.length > 0, 'No manifest revision changed; nothing to migrate');
  const added = [...next.values()].filter((s) => !before.has(s.sourceId))
    .map((s) => ({ sourceId: s.sourceId, sourceUrl: s.sourceUrl, draftSlug: s.draftSlug,
      provenance: { ref: '<replace: safe HTTPS or restricted: reference>', note: '<replace: how this source was discovered>' } }))
    .sort(bySource);
  const retired = ledger.records.filter((r) => !next.has(r.sourceId))
    .map((r) => ({ sourceId: r.sourceId, sourceUrl: r.sourceUrl, reason: '<replace: why this source was retired>' }))
    .sort(bySource);
  const changed = [];
  for (const record of ledger.records) {
    const now = next.get(record.sourceId);
    if (now) for (const field of ['draftSlug', 'sourceUrl'])
      if (record[field] !== now[field]) changed.push({ sourceId: record.sourceId, field,
        from: record[field], to: now[field], reason: '<replace: why this value changed>' });
  }
  changed.sort(bySource);
  return { migrationId: '<replace: unique migration id>', at: '<replace: actual UTC time>',
    reviewer: { name: '<replace: actual owner>', role: 'owner' },
    reason: '<replace: documented rationale for the manifest change>',
    fromEpoch: entry.epoch, toEpoch: entry.epoch + 1,
    expectedPreviousSeal: sha256Canonical(archiveDocument(ledger)),
    toRevisions: clone(ctx.revisions), sourceChanges: { added, retired, changed } };
}
// Seals the current epoch into a read-only archive and starts the next one with EVERY record unreviewed.
export function migrateLedger(ledger, ctx, request, { now = Date.now() } = {}) {
  analyze(ledger, ctx, { pending: true });
  keys(request, ['migrationId', 'at', 'reviewer', 'reason', 'fromEpoch', 'toEpoch',
    'expectedPreviousSeal', 'toRevisions', 'sourceChanges']);
  validateUtc(request.at);
  requireValue(Date.parse(request.at) <= now + 5 * 60_000,
    'Migration timestamp cannot be in the future beyond five minutes of clock skew');
  const sourceChanges = normalizeChanges(request.sourceChanges);
  const known = ledger.epochs.find((e) => e.migration?.migrationId === request.migrationId);
  if (known) {
    const m = known.migration;
    requireValue(m.fromEpoch === request.fromEpoch && m.toEpoch === request.toEpoch && m.at === request.at &&
      eq(m.reviewer, request.reviewer) && m.reason === request.reason &&
      m.previousEpochSeal === request.expectedPreviousSeal && eq(m.toRevisions, request.toRevisions) &&
      eq(m.sourceChanges, sourceChanges), 'Conflicting duplicate migration ID');
    return { ledger, archive: null, changed: false };
  }
  const entry = ledger.epochs.at(-1);
  requireValue(request.fromEpoch === entry.epoch && request.toEpoch === entry.epoch + 1,
    'Migration must advance exactly one epoch from the current epoch');
  const document = archiveDocument(ledger), seal = sha256Canonical(document);
  requireValue(request.expectedPreviousSeal === seal,
    'Concurrent history conflict; refresh the migration plan (previous epoch seal differs)');
  requireValue(eq(request.toRevisions, ctx.revisions),
    'Migration must reference the exact on-disk manifest revisions');
  const records = [...indexSources(ctx).values()].map(({ sourceId, sourceUrl, draftSlug }) =>
    ({ sourceId, sourceUrl, draftSlug, events: [] })).sort(bySource);
  const migration = { migrationId: request.migrationId, at: request.at, reviewer: clone(request.reviewer),
    reason: request.reason, fromEpoch: request.fromEpoch, toEpoch: request.toEpoch,
    previousEpochSeal: seal, previousMigrationHash: entry.migration?.hash ?? null,
    fromRevisions: clone(entry.revisions), toRevisions: clone(ctx.revisions),
    changedManifests: revisionNames.filter((name) => entry.revisions[name] !== ctx.revisions[name]),
    sourceChanges, carriedSourceCount: records.length - sourceChanges.added.length, inheritance: 'none' };
  migration.hash = sha256Canonical(migration);
  const archive = { path: archivePath(entry.epoch), sha256: seal, recordCount: ledger.records.length,
    eventCount: ledger.records.reduce((n, r) => n + r.events.length, 0) };
  const updated = { schemaVersion: 2, purpose: PURPOSE, currentEpoch: entry.epoch + 1,
    epochs: [...ledger.epochs.slice(0, -1).map(clone), { ...clone(entry), archive },
      { epoch: entry.epoch + 1, revisions: clone(ctx.revisions), sourceCount: records.length, migration }],
    records };
  analyze(updated, { ...ctx, archives: { ...(ctx.archives ?? {}), [archive.path]: document } });
  return { ledger: updated, archive: { path: archive.path, document }, changed: true };
}
export function appendDecision(ledger, ctx, request, { now = Date.now() } = {}) {
  const view = analyze(ledger, ctx);
  keys(request, ['sourceId', 'eventId', 'kind', 'at', 'reviewer', 'reason',
    'reviewedRevisions', 'expectedPreviousHash'],
  ['status', 'gate', 'decision', 'evidence', 'details', 'signoff', 'epoch']);
  const epoch = ledger.currentEpoch;
  if (epoch > 1) requireValue(request.epoch === epoch,
    'Decision must declare the current ledger epoch ' + epoch + '; previous epochs are read-only');
  else if (request.epoch !== undefined) requireValue(request.epoch === 1, 'Decision declares another ledger epoch');
  requireValue(!view.priorEventIds.has(request.eventId),
    'Event ID already used in a previous epoch; previous epochs are read-only');
  // Only new submissions are bounded by wall clock; CI can validate old Git history deterministically.
  validateUtc(request.at);
  requireValue(Date.parse(request.at) <= now + 5 * 60_000,
    'Decision timestamp cannot be in the future beyond five minutes of clock skew');
  const old = ledger.records.flatMap((r) => r.events).find((event) =>
    event.eventId === request.eventId);
  const { expectedPreviousHash, ...payload } = request;
  if (old) {
    const replay = { ...payload, previousHash: old.previousHash };
    replay.hash = hash(canonical(replay));
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
  event.hash = hash(canonical(event));
  const updated = clone(ledger);
  updated.records.find((r) => r.sourceId === request.sourceId).events.push(event);
  validateLedger(updated, ctx);
  return { ledger: updated, changed: true };
}
export function auditExport(ledger, ctx) {
  const view = analyze(ledger, ctx);
  return { schemaVersion: 2, purpose: 'offline_review_only_not_publication',
    currentEpoch: ledger.currentEpoch, revisions: ledger.epochs.at(-1).revisions,
    epochs: view.epochs, count: view.states.length,
    records: view.states.sort(bySource), retiredRecords: view.retired.sort(bySource) };
}
// Issue #51: versioned revision epochs. Every scenario below is a fail-closed or no-inheritance guarantee.
function epochSelfTest({ apply, input, ctx, revisions, approvedLedger, freshLedger }) {
  const R2 = { ...revisions, copy: 'e'.repeat(40) };
  const ctx2 = { ...ctx, revisions: R2 };
  const clock = Date.parse('2026-10-26T12:30:00Z');
  const migrate = (base, context, request) => migrateLedger(base, context, request, { now: clock });

  // 1. A real manifest change cannot keep approvals alive; the old ledger simply stops validating.
  assert.equal(validateLedger(approvedLedger, ctx)[0].eligibleForPromotion, true);
  assert.throws(() => validateLedger(approvedLedger, ctx2), /Stale manifest revisions/);
  assert.throws(() => planMigration(approvedLedger, ctx), /nothing to migrate/);
  const plan = planMigration(approvedLedger, ctx2);
  assert.deepEqual(plan.sourceChanges, { added: [], retired: [], changed: [] });
  assert.equal(plan.fromEpoch, 1);
  const request = (extra = {}) => ({ migrationId: 'epoch-2-copy-revision', at: '2026-10-26T12:10:00Z',
    reviewer: { name: 'Migration owner', role: 'owner' },
    reason: 'Stage 14 changed the EN/RO copy matrix; every approval is reset for re-review',
    fromEpoch: 1, toEpoch: 2, expectedPreviousSeal: plan.expectedPreviousSeal, toRevisions: R2,
    sourceChanges: { added: [], retired: [], changed: [] }, ...extra });

  // 2. Migration archives history verbatim and resets EVERY record, even the one that was promotable.
  const m1 = migrate(approvedLedger, ctx2, request());
  assert.equal(m1.changed, true);
  const ctxA = { ...ctx2, archives: { [m1.archive.path]: m1.archive.document } };
  const e2 = validateLedger(m1.ledger, ctxA);
  assert.equal(e2.length, 2);
  for (const state of e2) {
    assert.equal(state.status, 'unreviewed');
    assert.equal(state.eligibleForPromotion, false);
    assert.equal(state.bodichIdentityVerified, false);
    assert.equal(state.history.length, 0);
    assert.equal(state.epoch, 2);
    assert.ok(gateNames.every((gate) => state.gates[gate].status === 'not_reviewed'));
  }
  assert.deepEqual(e2[0].previousEpochs.map((p) => [p.epoch, p.previousEpochOnly, p.effective, p.eventCount,
    p.statusAtArchive]), [[1, true, false, 7, 'approved_for_promotion']]);
  assert.deepEqual(e2[1].previousEpochs, []);
  assert.ok(eq(m1.archive.document.records, approvedLedger.records),
    'Archived events (IDs, hashes, timestamps, actors, evidence) must be copied verbatim');
  assert.equal(m1.ledger.epochs[0].archive.sha256, m1.ledger.epochs[1].migration.previousEpochSeal);
  assert.equal(m1.ledger.epochs[1].migration.inheritance, 'none');
  assert.deepEqual(m1.ledger.epochs[1].migration.changedManifests, ['copy']);
  assert.equal(m1.archive.path, 'docs/catalog/review-ledger-archive/epoch-001.json');
  assert.equal(auditExport(m1.ledger, ctxA).records[0].previousEpochs[0].history.length, 7);
  assert.equal(auditExport(m1.ledger, ctxA).records[0].history.length, 0);
  assert.equal(auditExport(m1.ledger, ctxA).epochs.length, 2);
  // Idempotent replay of the same reviewed migration; a conflicting reuse of the ID is rejected.
  assert.equal(migrate(m1.ledger, ctxA, request()).changed, false);
  assert.throws(() => migrate(m1.ledger, ctxA, request({ reason: 'A different rationale for the same ID' })),
    /Conflicting duplicate migration/);

  // 3. Nothing from epoch 1 can be reused in epoch 2.
  const epoch2Event = (id, extra = {}) => input(id, { epoch: 2, reviewedRevisions: R2,
    at: '2026-10-26T12:15:00Z', ...extra });
  const gateRequest = epoch2Event('epoch2-gate-001', { kind: 'gate', gate: 'identity', decision: 'needs_evidence' });
  delete gateRequest.status;
  assert.throws(() => apply(m1.ledger, ctxA, gateRequest), /explicit in_review/);
  assert.throws(() => apply(m1.ledger, ctxA, epoch2Event('epoch2-no-marker', { epoch: undefined })),
    /declare the current ledger epoch/);
  assert.throws(() => apply(m1.ledger, ctxA, epoch2Event('epoch2-old-marker', { epoch: 1 })),
    /declare the current ledger epoch/);
  assert.throws(() => apply(m1.ledger, ctxA, epoch2Event('epoch2-old-revs', { reviewedRevisions: revisions })),
    /Stale source\/content revision/);
  assert.throws(() => apply(m1.ledger, ctxA, epoch2Event('signoff-001')), /previous epoch/);
  assert.throws(() => apply(m1.ledger, ctxA, epoch2Event('epoch2-early', { at: '2026-10-26T12:05:00Z' })),
    /timestamps must increase/);
  assert.throws(() => apply(m1.ledger, ctxA, epoch2Event('epoch2-promote', {
    status: 'approved_for_promotion', reviewer: { name: 'Independent approver', role: 'publication_approver' },
  })), /Forbidden status/);
  const reopened = apply(m1.ledger, ctxA, epoch2Event('epoch2-reopen-001'));
  assert.equal(reopened.changed, true);
  assert.equal(apply(reopened.ledger, ctxA, epoch2Event('epoch2-reopen-001')).changed, false);
  const e2b = validateLedger(reopened.ledger, ctxA);
  assert.equal(e2b[0].status, 'in_review');
  assert.equal(e2b[0].eligibleForPromotion, false);
  assert.equal(e2b[0].previousEpochs.length, 1);

  const withOpaque = apply(reopened.ledger, ctxA, epoch2Event('epoch2-opaque-001', {
    sourceId: 'kt-sq-OPAQUE', at: '2026-10-26T12:16:00Z' }));

  // 4. Tampered prior chains, deleted history, mixed epochs, stale events.
  const sealed = (doc, ledger = m1.ledger) => { const l = clone(ledger);
    l.epochs[0].archive.sha256 = sha256Canonical(doc); return l; };
  const withDoc = (doc) => ({ ...ctx2, archives: { [m1.archive.path]: doc } });
  assert.throws(() => validateLedger(m1.ledger, { ...ctx2, archives: {} }), /Missing previous-epoch archive/);
  const editedDoc = clone(m1.archive.document);
  editedDoc.records[0].events[0].reason = 'Unauthorized rewrite of archived history';
  assert.throws(() => validateLedger(m1.ledger, withDoc(editedDoc)), /Tampered previous-epoch archive/);
  assert.throws(() => validateLedger(sealed(editedDoc), withDoc(editedDoc)), /Tampered review event hash/);
  const shortDoc = clone(m1.archive.document);
  shortDoc.records[0].events.pop();
  assert.throws(() => validateLedger(sealed(shortDoc), withDoc(shortDoc)), /Archive reconciliation drift/);
  const noRecord = clone(m1.archive.document);
  noRecord.records.pop();
  assert.throws(() => validateLedger(sealed(noRecord), withDoc(noRecord)), /record count drift/);
  const headless = clone(m1.archive.document);
  headless.records[0].events.shift();
  assert.throws(() => validateLedger(sealed(headless), withDoc(headless)), /predecessor conflict/);
  assert.throws(() => validateLedger(m1.ledger, { ...ctxA, archives: { ...ctxA.archives,
    'docs/catalog/review-ledger-archive/epoch-009.json': m1.archive.document } }), /Unreferenced previous-epoch archive/);
  const editedMigration = clone(m1.ledger);
  editedMigration.epochs[1].migration.reason = 'Quietly rewritten migration rationale text';
  assert.throws(() => validateLedger(editedMigration, ctxA), /Tampered migration/);
  const gap = clone(m1.ledger); gap.epochs[1].epoch = 3;
  assert.throws(() => validateLedger(gap, ctxA), /Non-contiguous/);
  const skipped = clone(m1.ledger); skipped.currentEpoch = 3;
  assert.throws(() => validateLedger(skipped, ctxA), /Epoch list does not match/);
  const lone = clone(m1.ledger); lone.epochs.shift();
  assert.throws(() => validateLedger(lone, ctxA), /Epoch list does not match/);
  const oldEvent = approvedLedger.records[0].events[0];
  const smuggled = clone(m1.ledger); smuggled.records[0].events.push(oldEvent);
  assert.throws(() => validateLedger(smuggled, ctxA), /duplicate event ID/);
  const forged = { ...clone(oldEvent), eventId: 'forged-copy-0001', previousHash: null };
  delete forged.hash; forged.hash = hash(canonical(forged));
  const mixed = clone(m1.ledger); mixed.records[0].events.push(forged);
  assert.throws(() => validateLedger(mixed, ctxA), /Mixed ledger epochs/);
  const stalePayload = { sourceId: 'kt-1', eventId: 'stale-before-migration-001', kind: 'status',
    status: 'in_review', at: '2026-10-26T12:05:00Z', reviewer: { name: 'Test reviewer', role: 'owner' },
    reason: 'Backdated event placed ahead of the migration', reviewedRevisions: R2, epoch: 2, previousHash: null };
  const backdated = clone(m1.ledger);
  backdated.records[0].events.push({ ...stalePayload, hash: hash(canonical(stalePayload)) });
  assert.throws(() => validateLedger(backdated, ctxA), /timestamps must increase/);
  assert.throws(() => validateLedger(m1.ledger, { ...ctxA, fixture: false }), /Frozen inventory requires 132/);

  // 5. Migration request guards.
  const bad = (extra, expected) => assert.throws(() => migrate(approvedLedger, ctx2, request(extra)), expected);
  bad({ expectedPreviousSeal: 'f'.repeat(64) }, /Concurrent history conflict/);
  bad({ toRevisions: revisions }, /exact on-disk manifest revisions/);
  bad({ at: '2099-01-01T00:00:00Z' }, /future/);
  bad({ at: '2026-10-26T12:00:05Z' }, /predates previous-epoch history/);
  bad({ reviewer: { name: 'Publisher', role: 'publication_approver' } }, /attributed owner/);
  bad({ reason: 'Contact owner@example.org about the revision' }, /Detailed migration rationale/);
  bad({ reason: 'short' }, /Detailed migration rationale/);
  bad({ fromEpoch: 2, toEpoch: 3 }, /exactly one epoch/);
  bad({ migrationId: 'x' }, /Invalid or duplicate migration ID/);
  assert.throws(() => migrate(approvedLedger, ctx, request({ toRevisions: revisions })),
    /new manifest revision set|exact on-disk/);

  // 6. Source changes: added/retired/changed IDs need explicit, safe, reconciled provenance.
  const R3 = { ...R2, art: '1'.repeat(40) };
  const ctx3 = { fixture: true, revisions: R3, sources: [
    { sourceId: 'kt-1', sourceUrl: 'https://example.org/one-moved', draftSlug: 'one' },
    { sourceId: 'kt-2', sourceUrl: 'https://example.org/three', draftSlug: 'three' },
  ] };
  const ctxB = { ...ctxA, ...ctx3, archives: ctxA.archives };
  const plan3 = planMigration(withOpaque.ledger, ctxB);
  assert.deepEqual(plan3.sourceChanges.added.map((x) => x.sourceId), ['kt-2']);
  assert.deepEqual(plan3.sourceChanges.retired.map((x) => x.sourceId), ['kt-sq-OPAQUE']);
  assert.deepEqual(plan3.sourceChanges.changed.map((x) => [x.sourceId, x.field]), [['kt-1', 'sourceUrl']]);
  assert.throws(() => migrate(withOpaque.ledger, ctxB, { ...plan3, at: '2026-10-26T12:20:00Z' }),
    /Detailed migration rationale|Invalid or duplicate|replace/);
  const changes = () => ({
    added: [{ sourceId: 'kt-2', sourceUrl: 'https://example.org/three', draftSlug: 'three',
      provenance: { ref: 'https://example.org/three', note: 'Found during the Stage 14 supplier inventory refresh' } }],
    retired: [{ sourceId: 'kt-sq-OPAQUE', sourceUrl: 'https://example.org/two',
      reason: 'Supplier removed the listing during the refresh' }],
    changed: [{ sourceId: 'kt-1', field: 'sourceUrl', from: 'https://example.org/one',
      to: 'https://example.org/one-moved', reason: 'Supplier moved the product page' }],
  });
  const request3 = (extra = {}) => ({ ...plan3, migrationId: 'epoch-3-source-refresh', at: '2026-10-26T12:20:00Z',
    reviewer: { name: 'Migration owner', role: 'owner' },
    reason: 'Supplier inventory refresh retired one source and added another',
    toRevisions: R3, sourceChanges: changes(), ...extra });
  const bad3 = (extra, expected) => assert.throws(() =>
    migrate(withOpaque.ledger, ctxB, request3(extra)), expected);
  bad3({ sourceChanges: { ...changes(), added: [] } }, /misdeclared added source/);
  bad3({ sourceChanges: { ...changes(), retired: [] } }, /misdeclared retired source/);
  bad3({ sourceChanges: { ...changes(), changed: [] } }, /misdeclared source URL/);
  const wrongFrom = changes(); wrongFrom.changed[0].from = 'https://example.org/elsewhere';
  bad3({ sourceChanges: wrongFrom }, /misdeclared source URL/);
  const query = changes(); query.added[0].provenance.ref = 'https://example.org/three?token=secret';
  bad3({ sourceChanges: query }, /safe HTTPS/);
  const mail = changes(); mail.added[0].provenance.note = 'Reported by person@example.org by e-mail';
  bad3({ sourceChanges: mail }, /provenance note required/);
  const supersedes = changes(); supersedes.added[0].supersedes = ['kt-unknown'];
  bad3({ sourceChanges: supersedes }, /Invalid supersedes/);
  const m3 = migrate(withOpaque.ledger, ctxB, request3());
  assert.equal(m3.changed, true);
  assert.equal(m3.archive.path, 'docs/catalog/review-ledger-archive/epoch-002.json');
  const ctxC = { ...ctx3, archives: { ...ctxA.archives, [m3.archive.path]: m3.archive.document } };
  const e3 = validateLedger(m3.ledger, ctxC);
  assert.deepEqual(e3.map((s) => s.sourceId), ['kt-1', 'kt-2']);
  assert.ok(e3.every((s) => s.status === 'unreviewed' && !s.eligibleForPromotion && s.epoch === 3));
  assert.deepEqual(e3[0].previousEpochs.map((p) => [p.epoch, p.eventCount]), [[1, 7], [2, 1]]);
  assert.deepEqual(e3[1].previousEpochs, []);
  assert.equal(m3.ledger.epochs[2].migration.previousMigrationHash, m3.ledger.epochs[1].migration.hash);
  assert.equal(m3.ledger.epochs[2].migration.carriedSourceCount, 1);
  const exported = auditExport(m3.ledger, ctxC);
  assert.deepEqual(exported.retiredRecords.map((r) => [r.sourceId, r.retiredInEpoch]), [['kt-sq-OPAQUE', 3]]);
  assert.equal(exported.retiredRecords[0].previousEpochs.length, 1);
  assert.equal(exported.retiredRecords[0].previousEpochs[0].history.length, 1);
  assert.equal(exported.retiredRecords[0].previousEpochs[0].epoch, 2);
  assert.equal(exported.epochs.length, 3);
  assert.equal(migrate(m3.ledger, ctxC, request3()).changed, false);
  const wrongChain = { ...ctxC.archives, [m1.archive.path]: editedDoc };
  assert.throws(() => validateLedger(m3.ledger, { ...ctxC, archives: wrongChain }), /Tampered previous-epoch archive/);

  // 7. ID collisions, including opaque Square-style IDs that differ only by case or reuse a retired ID.
  const R4 = { ...R3, inventory: '2'.repeat(40) };
  const next = (sources, extraRequest = {}) => {
    const context = { fixture: true, revisions: R4, sources, archives: ctxC.archives };
    const p = planMigration(m3.ledger, context);
    const added = p.sourceChanges.added.map((item) => ({ ...item,
      provenance: { ref: item.sourceUrl, note: 'Found during the next supplier refresh' } }));
    return migrate(m3.ledger, context, { ...p, migrationId: 'epoch-4-collision', at: '2026-10-26T12:25:00Z',
      reviewer: { name: 'Migration owner', role: 'owner' }, reason: 'Collision scenario for the review ledger',
      toRevisions: R4, sourceChanges: { ...p.sourceChanges, added,
        retired: p.sourceChanges.retired.map((item) => ({ ...item, reason: 'Retired during collision test' })),
        changed: p.sourceChanges.changed.map((item) => ({ ...item, reason: 'Moved during collision test' })) },
      ...extraRequest });
  };
  const keep = [{ sourceId: 'kt-1', sourceUrl: 'https://example.org/one-moved', draftSlug: 'one' },
    { sourceId: 'kt-2', sourceUrl: 'https://example.org/three', draftSlug: 'three' }];
  assert.throws(() => next([...keep, { sourceId: 'kt-sq-OPAQUE', sourceUrl: 'https://example.org/two',
    draftSlug: 'two' }]), /Source ID collision with an earlier epoch/);
  assert.throws(() => next([...keep, { sourceId: 'kt-sq-opaque', sourceUrl: 'https://example.org/two-b',
    draftSlug: 'two-b' }]), /Source ID collision with an earlier epoch/);
  assert.throws(() => next([...keep, { sourceId: 'KT-2', sourceUrl: 'https://example.org/four',
    draftSlug: 'four' }]), /case-insensitive collision|Source ID collision/);
  assert.throws(() => next([...keep, { sourceId: 'kt-9', sourceUrl: 'https://example.org/three',
    draftSlug: 'nine' }]), /Duplicate source URL or draft slug|Source URL/);
  assert.throws(() => next([...keep, { sourceId: 'kt-9<', sourceUrl: 'https://example.org/nine',
    draftSlug: 'nine' }]), /Unsafe source ID/);
  const m4 = next([...keep, { sourceId: 'kt-sq-NEWOPAQUE', sourceUrl: 'https://example.org/five',
    draftSlug: 'five' }]);
  assert.equal(m4.ledger.currentEpoch, 4);
  assert.ok(m4.ledger.records.some((r) => r.sourceId === 'kt-sq-NEWOPAQUE'), 'Opaque IDs stay case-sensitive');

  // 8. Deterministic backfill of schema v1 keeps every event byte-for-byte, then enforces the v2 rules.
  const v1 = { schemaVersion: 1, purpose: PURPOSE, revisions: clone(revisions), records: clone(approvedLedger.records) };
  assert.equal(validateLedgerV1(v1, ctx)[0].eligibleForPromotion, true);
  const upgraded = upgradeV1(v1, ctx);
  assert.deepEqual(upgraded, upgradeV1(clone(v1), ctx), 'Backfill must be deterministic');
  assert.ok(eq(upgraded.records, v1.records), 'Backfill must not rewrite IDs, hashes, timestamps, actors or evidence');
  assert.equal(upgraded.epochs[0].origin, 'schema_v1_backfill');
  assert.equal(upgraded.currentEpoch, 1);
  assert.equal(validateLedger(upgraded, ctx)[0].eligibleForPromotion, true);
  assert.deepEqual(upgradeV1({ ...v1, records: ctx.sources.map((r) => ({ ...r, events: [] })) }, ctx),
    { ...freshLedger(ctx, revisions, 'schema_v1_backfill') });
  assert.throws(() => validateLedger(v1, ctx), /schema v1 is legacy/);
  assert.throws(() => upgradeV1(v1, ctx2), /Stale manifest revisions/);
  const legacyEpoch = clone(v1); legacyEpoch.records[0].events[0].epoch = 1;
  assert.throws(() => validateLedgerV1(legacyEpoch, ctx), /Unexpected field epoch/);
  const legacyTamper = clone(v1); legacyTamper.records[0].events[1].reason = 'Silent rewrite of legacy history';
  assert.throws(() => upgradeV1(legacyTamper, ctx), /Tampered review event hash/);
  // The migrated v1 history is archived exactly like native v2 history.
  const upgradedPlan = planMigration(upgraded, ctx2);
  const fromV1 = migrate(upgraded, ctx2, request({ expectedPreviousSeal: upgradedPlan.expectedPreviousSeal }));
  assert.ok(eq(fromV1.archive.document.records, v1.records));

  // 9. Isolation: public Astro sources and config never import the ledger, archives or migration CLI.
  const leaks = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:astro|[mc]?[jt]sx?|json|md)$/.test(entry.name) &&
      /review-ledger|catalog-review-ledger/.test(readFileSync(full, 'utf8'))) leaks.push(full); } };
  walk(at('src'));
  assert.deepEqual(leaks, [], 'Public Astro sources must stay isolated from the review ledger');
  assert.ok(!/review-ledger/.test(readFileSync(at('astro.config.mjs'), 'utf8')));
}
function selfTest() {
  // Deterministic fixture clock; the real --apply still uses the current wall clock.
  const apply = (data, context, event) => appendDecision(data, context, event, {
    now: Date.parse('2026-10-26T12:30:00Z'),
  });
  const revisions = { inventory: 'a'.repeat(40), overrides: 'b'.repeat(40),
    art: 'c'.repeat(40), copy: 'd'.repeat(40) };
  const ctx = { fixture: true, revisions, sources: [
    { sourceId: 'kt-1', sourceUrl: 'https://example.org/one', draftSlug: 'one' },
    { sourceId: 'kt-sq-OPAQUE', sourceUrl: 'https://example.org/two', draftSlug: 'two' },
  ] };
  const freshLedger = (context, revs, origin = 'initial') => ({ schemaVersion: 2, purpose: PURPOSE,
    currentEpoch: 1, epochs: [{ epoch: 1, revisions: revs, sourceCount: context.sources.length, origin }],
    records: context.sources.map((r) => ({ ...r, events: [] })) });
  const ledger = freshLedger(ctx, revisions);
  assert.equal(validateLedger(ledger, ctx).length, 2);
  const input = (id, extra = {}) => ({
    sourceId: 'kt-1', eventId: id, kind: 'status', status: 'in_review',
    at: '2026-10-26T12:00:00Z', reviewer: { name: 'Test reviewer', role: 'owner' },
    reason: 'Explicitly reviewing research reference',
    reviewedRevisions: revisions, expectedPreviousHash: null, ...extra,
  });
  const first = input('event-001'), appended = apply(ledger, ctx, first);
  assert.equal(appended.changed, true);
  assert.throws(() => apply(ledger, ctx, input('future-clock-001', {
    at: '2099-01-01T00:00:00Z',
  })), /Decision timestamp cannot be in the future/);
  // Structural idempotence: recursively reordered keys never affect a v1 event digest.
  const reordered = {
    reason: first.reason,
    reviewer: { role: first.reviewer.role, name: first.reviewer.name },
    expectedPreviousHash: first.expectedPreviousHash,
    reviewedRevisions: Object.fromEntries(Object.entries(first.reviewedRevisions).reverse()),
    at: first.at, status: first.status, kind: first.kind, eventId: first.eventId,
    sourceId: first.sourceId,
  };
  assert.equal(apply(appended.ledger, ctx, reordered).changed, false);
  const reorderedLedger = clone(appended.ledger);
  reorderedLedger.records[0].events[0] = Object.fromEntries(
    Object.entries(reorderedLedger.records[0].events[0]).reverse());
  assert.equal(validateLedger(reorderedLedger, ctx)[0].status, 'in_review');
  assert.equal(apply(appended.ledger, ctx, first).changed, false);
  assert.throws(() => apply(appended.ledger, ctx,
    input('event-001', { reason: 'Conflicting duplicate history event' })), /Conflicting duplicate/);
  assert.throws(() => apply(appended.ledger, ctx,
    input('event-002', { at: '2026-10-26T12:00:01Z' })), /Concurrent revision/);
  assert.throws(() => apply(ledger, ctx, input('event-003', {
    status: 'approved_for_promotion' })), /Forbidden status/);
  assert.throws(() => apply(ledger, ctx, input('event-004', {
    reviewedRevisions: { ...revisions, art: 'f'.repeat(40) } })), /Stale source/);
  const mutate = clone(appended.ledger);
  mutate.records[0].events[0].reason = 'Unauthorized historical modification';
  assert.throws(() => validateLedger(mutate, ctx), /Tampered review/);
  const drop = clone(ledger); drop.records.pop();
  assert.throws(() => validateLedger(drop, ctx), /Missing\/extra/);
  const bogus = clone(ledger); bogus.records[1].sourceId = 'unknown';
  assert.throws(() => validateLedger(bogus, ctx), /Unknown or duplicate/);
  const duplicated = clone(ledger);
  duplicated.records[1].sourceId = duplicated.records[0].sourceId;
  assert.throws(() => validateLedger(duplicated, ctx), /Unknown or duplicate/);
  const wrongUrl = clone(ledger);
  wrongUrl.records[0].sourceUrl = 'https://example.org/other';
  assert.throws(() => validateLedger(wrongUrl, ctx), /Source URL \/ draft slug mismatch/);
  const wrongSlug = clone(ledger);
  wrongSlug.records[0].draftSlug = 'another-slug';
  assert.throws(() => validateLedger(wrongSlug, ctx), /Source URL \/ draft slug mismatch/);
  const shuffled = clone(ledger);
  shuffled.records.reverse();
  assert.deepEqual(auditExport(shuffled, ctx).records.map((r) => r.sourceId),
    auditExport(ledger, ctx).records.map((r) => r.sourceId),
    'Audit export must be invariant under ledger record reordering');
  assert.throws(() => apply(appended.ledger, ctx, input('event-001', {
    sourceId: 'kt-sq-OPAQUE', reason: 'Another event with reused global ID',
  })), /Conflicting duplicate event ID/);
  const stale = clone(ledger); stale.epochs[0].revisions.inventory = 'f'.repeat(40);
  assert.throws(() => validateLedger(stale, ctx), /Stale manifest revisions/);
  const gate = input('event-005', { kind: 'gate', gate: 'imagery', decision: 'approved',
    at: '2026-10-26T12:00:01Z', expectedPreviousHash: appended.ledger.records[0].events[0].hash,
    evidence: [{ ref: 'https://example.org/evidence', version: '1',
      verifiedOn: '2026-10-26', provenance: 'Original', rightsOwner: 'Test company' }],
    details: { imageKind: 'ai_marketing_concept', model: 'X', assetSha256: 'a'.repeat(64),
      rightsOwner: 'Test company', writtenPermissionRef: 'restricted:test-rights' },
  });
  delete gate.status;
  assert.throws(() => apply(appended.ledger, ctx, gate), /AI concept/);
  const na = input('event-006', { kind: 'gate', gate: 'identity', decision: 'not_applicable_with_reason',
    at: '2026-10-26T12:00:01Z', expectedPreviousHash: appended.ledger.records[0].events[0].hash });
  delete na.status;
  const held = apply(appended.ledger, ctx, na);
  assert.equal(validateLedger(held.ledger, ctx)[0].gates.identity.status, 'not_applicable_with_reason');
  const noReason = input('missing-na-reason', {
    kind: 'gate', gate: 'identity', decision: 'not_applicable_with_reason',
    reason: '', at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: appended.ledger.records[0].events.at(-1).hash,
  });
  delete noReason.status;
  assert.throws(() => apply(appended.ledger, ctx, noReason), /Detailed decision rationale/);
  assert.equal(auditExport(ledger, ctx).records.filter((s) => s.eligibleForPromotion).length, 0);
  // URL credentials/query tokens and future-dated claims are not safe public evidence.
  const unsafeRef = input('bad-reference-001', { kind: 'gate', gate: 'identity',
    at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: appended.ledger.records[0].events[0].hash,
    decision: 'approved', evidence: [{ ref: 'https://example.org/document?token=secret',
      version: 'v1', verifiedOn: '2026-10-26', provenance: 'Independent record' }],
    details: { manufacturer: 'BODICH', model: 'X', variant: 'rev-A',
      legalAuthorityRef: 'restricted:legal-reference' } });
  delete unsafeRef.status;
  assert.throws(() => apply(appended.ledger, ctx, unsafeRef), /safe HTTPS/);
  const future = clone(unsafeRef);
  future.eventId = 'future-evidence-001';
  future.evidence[0].ref = 'https://example.org/document';
  future.evidence[0].verifiedOn = '2027-01-01';
  assert.throws(() => apply(appended.ledger, ctx, future), /cannot be dated after/);
  const rejectedGate = input('supplier-only-001', {
    kind: 'gate', gate: 'identity', decision: 'approved',
    at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: appended.ledger.records[0].events[0].hash,
    evidence: [{ ref: 'https://www.kingtechturbines.com/product/foo', version: '1',
      verifiedOn: '2026-10-26', provenance: 'supplier-only' }],
    details: { manufacturer: 'BODICH', model: 'X', variant: 'rev-A',
      legalAuthorityRef: 'restricted:identity-check' },
  });
  delete rejectedGate.status;
  assert.throws(() => apply(appended.ledger, ctx, rejectedGate), /supplier-only|Supplier-only/);
  const invalidRef = clone(rejectedGate);
  invalidRef.eventId = 'malformed-url-001';
  invalidRef.evidence[0].ref = 'not-a-link';
  invalidRef.evidence[0].provenance = 'Independent register';
  assert.throws(() => apply(appended.ledger, ctx, invalidRef), /Malformed evidence URL/);
  const badSpec = input('unverified-specs-001', {
    kind: 'gate', gate: 'specifications', decision: 'approved',
    at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: appended.ledger.records[0].events[0].hash,
    evidence: [{ ref: 'https://independent.example.org/spec', version: 'v1',
      verifiedOn: '2026-10-26', provenance: 'Independent validation' }],
    details: { verifiedClaims: ['Unproven mass'], independentVerification: false,
      contradictionsResolved: true },
  });
  delete badSpec.status;
  assert.throws(() => apply(appended.ledger, ctx, badSpec), /Independent technical verification/);
  const wrongRole = clone(badSpec);
  wrongRole.eventId = 'unauthorized-review-role-001';
  wrongRole.gate = 'imagery';
  wrongRole.reviewer.role = 'technical_reviewer';
  assert.throws(() => apply(appended.ledger, ctx, wrongRole), /Reviewer role is not authorized/);
  const badEditorial = input('missing-romanian-signoff-001', {
    kind: 'gate', gate: 'editorial', decision: 'approved',
    at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: appended.ledger.records[0].events[0].hash,
    evidence: [{ ref: 'https://independent.example.org/editorial', version: 'v1',
      verifiedOn: '2026-10-26', provenance: 'Independent editorial record' }],
    details: { nativeRomanianApproved: false, englishApproved: true, legalApproved: false,
      commercialApproved: true, unresolvedFlagsResolved: true },
  });
  delete badEditorial.status;
  assert.throws(() => apply(appended.ledger, ctx, badEditorial), /sign-offs incomplete/);
  const earlyGate = clone(badSpec);
  earlyGate.eventId = 'gate-before-in-review-001';
  earlyGate.expectedPreviousHash = null;
  assert.throws(() => apply(ledger, ctx, earlyGate), /Gate decisions require an explicit in_review/);
  // Complete synthetic path: four INDEPENDENT approvals, pending-signoff, human approver.
  let chain = appended.ledger;
  const next = (id, secs, fields) => {
    const last = chain.records[0].events.at(-1);
    const event = input(id, { at: new Date(Date.parse('2026-10-26T12:00:00Z') +
      secs * 1000).toISOString().replace('.000Z', 'Z'),
      expectedPreviousHash: last.hash, ...fields });
    if (event.kind === 'gate') delete event.status;
    chain = apply(chain, ctx, event).ledger;
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
  const pendingLedger = clone(chain);
  assert.throws(() => apply(chain, ctx, input('same-reviewer-as-approver', {
    status: 'approved_for_promotion', at: '2026-10-26T12:00:07Z',
    reviewer: { name: ' TEST   REVIEWER ', role: 'publication_approver' },
    expectedPreviousHash: chain.records[0].events.at(-1).hash,
    signoff: { statement:
      'I explicitly approve this source research record only for a separate BODICH promotion PR.',
      authorizationRef: 'restricted:publication-approval' },
  })), /Publication approver must be independent/);
  assert.throws(() => apply(chain, ctx, input('weak-signoff-001', {
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
  const approvedLedger = clone(chain);
  // Enumerate every forbidden transition; valid transitions are covered by the full path
  // and the hold/rejection/re-review fixtures.
  const stateLedgers = {
    unreviewed: ledger, in_review: appended.ledger,
    on_hold: apply(ledger, ctx, input('base-hold-001', {
      status: 'on_hold', reason: 'Explicit owner hold during investigation',
    })).ledger,
    rejected: apply(ledger, ctx, input('base-reject-001', {
      status: 'rejected', reason: 'Explicit owner rejection for identity evidence',
    })).ledger,
    evidence_complete_pending_signoff: pendingLedger,
    approved_for_promotion: approvedLedger,
  };
  for (const [from, base] of Object.entries(stateLedgers)) {
    for (const to of statuses.filter((candidate) => !transitions[from].includes(candidate))) {
      const last = base.records[0].events.at(-1);
      const request = input('matrix-' + from + '-' + to, {
        status: to, at: '2026-10-26T12:00:20Z',
        expectedPreviousHash: last?.hash || null,
        reviewer: { name: 'Independent publication test reviewer', role: 'publication_approver' },
      });
      assert.throws(() => apply(base, ctx, request), /Forbidden status transition/,
        'Transition must be forbidden: ' + from + ' -> ' + to);
    }
  }
  // Revocation preserves events, but a fast-track reapproval without fresh gates fails.
  next('hold-001', 8, { status: 'on_hold', reason: 'New contradictory evidence surfaced in review' });
  const heldState = validateLedger(chain, ctx)[0];
  assert.equal(heldState.eligibleForPromotion, false);
  assert.equal(heldState.gates.identity.status, 'needs_evidence');
  next('restart-001', 9, { status: 'in_review',
    reason: 'Reopening only after a documented contradictory-evidence investigation' });
  assert.throws(() => apply(chain, ctx, input('fast-track-001', {
    status: 'evidence_complete_pending_signoff', at: '2026-10-26T12:00:10Z',
    expectedPreviousHash: chain.records[0].events.at(-1).hash,
  })), /All independent gates/);
  const wrongModel = clone(appended.ledger);
  wrongModel.records[0].events[0].at = '2026-02-30T12:00:00Z';
  assert.throws(() => validateLedger(wrongModel, ctx), /UTC|Tampered/);
  const directReject = apply(ledger, ctx,
    input('rejection-001', { status: 'rejected', reason: 'No ownership evidence exists for this reference' })).ledger;
  const rejectedGateAttempt = clone(badSpec);
  rejectedGateAttempt.eventId = 'gate-on-rejected-001';
  rejectedGateAttempt.expectedPreviousHash = directReject.records[0].events.at(-1).hash;
  assert.throws(() => apply(directReject, ctx, rejectedGateAttempt),
    /Gate decisions require an explicit in_review/);
  assert.throws(() => apply(directReject, ctx, input('invalid-reapproval-001', {
    status: 'approved_for_promotion', at: '2026-10-26T12:00:01Z',
    expectedPreviousHash: directReject.records[0].events.at(-1).hash,
  })), /Forbidden status/);
  // A gate-specific N/A never removes a blocker; mismatched model or missing RO/legal
  // approval cannot be used to satisfy the promotion transition.
  assert.equal(validateLedger(held.ledger, ctx)[0].gates.identity.status, 'not_applicable_with_reason');
  assert.equal(validateLedger(held.ledger, ctx)[0].eligibleForPromotion, false);
  epochSelfTest({ apply, input, ctx, revisions, approvedLedger, freshLedger });
  console.log('Review ledger self-test passed: 132 contract, opaque ID, idempotence, immutable history, stale revision, gated approvals, versioned epochs.');
}
// Writes through exclusive temp files; a failure leaves neither a partial ledger nor a stray archive.
function writeAtomically(files) {
  const temps = files.map(({ file }) => file + '.tmp');
  requireValue(files.every(({ file }, i) => !existsSync(temps[i]) && (!file.includes('/review-ledger-archive/') ||
    !existsSync(file))), 'Existing concurrent/uncompleted write');
  const renamed = [];
  try {
    files.forEach(({ file, data }, i) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(temps[i], JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    });
    files.forEach(({ file }, i) => { renameSync(temps[i], file); renamed.push(file); });
  } catch (error) {
    for (const temp of temps) if (existsSync(temp)) unlinkSync(temp);
    for (const file of renamed) if (file !== ledgerFile && existsSync(file)) unlinkSync(file);
    throw error;
  }
}
function main(args) {
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  const single = ['--check', '--export', '--upgrade-v1', '--migrate-plan'];
  requireValue((args.length === 1 && single.includes(args[0])) ||
    (args.length === 2 && ['--apply', '--migrate'].includes(args[0])),
  'Usage: --check | --export | --self-test | --apply <decision.json> | --upgrade-v1 | --migrate-plan | --migrate <migration.json>');
  const ctx = contextOnDisk(), ledger = load('docs/catalog/review-ledger.json');
  if (args[0] === '--upgrade-v1') {
    if (ledger.schemaVersion === 2) return console.log('Ledger is already schema v2: nothing to backfill');
    writeAtomically([{ file: ledgerFile, data: upgradeV1(ledger, ctx) }]);
    return console.log('Backfilled schema v1 ledger into schema v2 epoch 1 (events copied verbatim). Commit a reviewed Git PR.');
  }
  if (args[0] === '--migrate-plan') {
    console.log(JSON.stringify(planMigration(ledger, ctx), null, 2));
    return;
  }
  if (args[0] === '--migrate') {
    const requestPath = resolve(process.cwd(), args[1]);
    requireValue(requestPath !== ledgerFile, 'Cannot import the ledger as a migration');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    const result = migrateLedger(ledger, ctx, request);
    if (!result.changed) return console.log('Idempotent import: migration already recorded');
    writeAtomically([{ file: at(result.archive.path), data: result.archive.document },
      { file: ledgerFile, data: result.ledger }]);
    return console.log('Migrated to epoch ' + result.ledger.currentEpoch + '; epoch ' + request.fromEpoch +
      ' sealed read-only in ' + result.archive.path + '. Every record is unreviewed again. Commit a dedicated reviewed PR; no product published.');
  }
  const states = validateLedger(ledger, ctx);
  if (args[0] === '--check') {
    console.log('Reviewed ledger: ' + states.length + ' unpublished records, epoch ' + ledger.currentEpoch +
      ' (' + (ledger.currentEpoch - 1) + ' sealed previous), ' +
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
  writeAtomically([{ file: ledgerFile, data: result.ledger }]);
  console.log('Appended decision ' + request.eventId + '. Commit a reviewed Git PR; no product published.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));

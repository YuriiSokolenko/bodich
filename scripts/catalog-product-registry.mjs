#!/usr/bin/env node
/**
 * Stage 18 / #58: private, read-only BODICH product registry.
 * No publication, promotion, ledger-event writing, reviewer authentication, or HTTP API.
 * The Stage 13 ledger and Stage 14 evidence intake remain the only approval authorities.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportOnDisk } from './catalog-genuine-evidence.mjs';
import { contextOnDisk } from './catalog-review-ledger.mjs';
import { unverifiedMediaDigests, nonPhotoMediaDigests } from './catalog-media-policy.mjs';
import { catalogCategories, confirmedProducts } from '../src/catalog/data.ts';
import { permittedSpecUnits } from '../src/catalog/reference.ts';

export const REGISTRY_PATH = 'docs/catalog/bodich-products.json';
const PURPOSE = 'internal_bodich_products_unpublished';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pathAt = (p) => resolve(root, p);
const load = (p) => JSON.parse(readFileSync(pathAt(p), 'utf8'));
const SHA = /^[0-9a-f]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^(?:bdc|bdv|bdm)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Opaque identifiers only; never accept traversal-like path segments.
const evidenceRef = /^restricted:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const categoryIds = new Set(catalogCategories.map((item) => item.id));
const clone = (v) => JSON.parse(JSON.stringify(v));
const fold = (v) => v.normalize('NFKC').toLowerCase();
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function keys(obj, required, optional = []) {
  assert.ok(obj && typeof obj === 'object' && !Array.isArray(obj), 'Expected object');
  for (const k of required) assert.ok(Object.hasOwn(obj, k), 'Missing field: ' + k);
  for (const k of Object.keys(obj))
    assert.ok(required.includes(k) || optional.includes(k), 'Unexpected field: ' + k);
}
function safe(value, label, max = 320) {
  assert.ok(typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= max && !/[\u0000-\u001f<>]/.test(value) &&
    !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value) &&
    !/https?:\/\/\S*[@?#]/i.test(value) &&
    !/\b(?:password|secret|bearer)\s*[:=]/i.test(value), 'Unsafe or missing ' + label);
}
function restricted(ref, label) {
  assert.ok(typeof ref === 'string' && ref.length <= 180 && evidenceRef.test(ref),
    label + ' requires safe restricted: pointer');
}
function unique(name, value, taken) {
  assert.ok(typeof value === 'string' && ID.test(value) && value.startsWith(name + '-'),
    'Invalid ' + name + ' identity');
  const folded = fold(value);
  assert.ok(!taken.has(folded), 'Duplicate/colliding identity: ' + value);
  taken.add(folded);
}
function revision(rev) {
  keys(rev, ['inventory', 'overrides', 'art', 'copy']);
  for (const value of Object.values(rev)) assert.match(value, /^[a-f0-9]{40}$/, 'Invalid revision');
}
function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
function activeProof(item, kind, identity, today) {
  return Boolean(item && item.kind === kind && validDate(item.verifiedOn) &&
    item.verifiedOn <= today &&
    (item.expiresOn === undefined || item.expiresOn === null ||
      (validDate(item.expiresOn) && item.expiresOn >= today)) &&
    item.scope?.manufacturer === identity.manufacturer &&
    item.scope?.model === identity.model &&
    item.scope?.variant === identity.variant);
}
function checkedSpec(spec, intakeRecord, identity, variantId, today) {
  keys(spec, ['kind', 'value', 'unit', 'evidenceId'], ['metric', 'scope']);
  assert.ok(Object.hasOwn(permittedSpecUnits, spec.kind), 'Unknown technical claim kind');
  assert.ok(permittedSpecUnits[spec.kind].includes(spec.unit), 'Unsupported spec unit');
  assert.ok(typeof spec.value === 'number' && Number.isFinite(spec.value) && spec.value > 0,
    'Invalid numeric claim');
  if (spec.metric !== undefined)
    assert.ok(['diameter', 'length', 'turbine', 'propeller'].includes(spec.metric) &&
      ((spec.kind === 'dimension' && ['diameter', 'length'].includes(spec.metric)) ||
       (spec.kind === 'speed' && ['turbine', 'propeller'].includes(spec.metric))),
    'Invalid metric for technical claim');
  if (spec.scope !== undefined)
    assert.ok(spec.kind === 'mass' && ['bare_engine',
      'assembly_with_integrated_hardware', 'not_stated'].includes(spec.scope),
    'Invalid mass measurement scope');
  if (spec.kind === 'mass') assert.ok(spec.scope, 'Mass claim requires measurement scope');
  if (['dimension', 'speed'].includes(spec.kind))
    assert.ok(spec.metric, 'Dimension/speed claim requires independently evidenced axis');
  safe(spec.evidenceId, 'technical evidence ID', 101);
  const proof = intakeRecord?.evidence?.find((e) => e.id === spec.evidenceId);
  assert.ok(activeProof(proof, 'independent_specification', identity, today) &&
    proof.facts.name === spec.kind && proof.facts.value === spec.value &&
    proof.facts.unit === spec.unit &&
    proof.facts.metric === spec.metric && proof.facts.scope === spec.scope,
    'Unsupported technical claim for variant ' + variantId + ': exact current independent evidence required');
}
function checkedMedia(media, variants, intakeBySource, ids, registeredUnverified, registeredNonPhotos, today) {
  keys(media, ['id', 'variantId', 'kind', 'ref', 'assetSha256', 'rights', 'alt',
    'rightsEvidenceId']);
  unique('bdm', media.id, ids);
  const variant = variants.find((v) => v.id === media.variantId);
  assert.ok(variant, 'Media must belong to an existing variant');
  assert.ok(['product_photo', 'original_concept', 'original_diagram'].includes(media.kind),
    'Unknown media classification');
  restricted(media.ref, 'Media original');
  assert.match(media.assetSha256, SHA, 'Media asset SHA-256 required');
  assert.ok(['unknown', 'cleared', 'rejected'].includes(media.rights), 'Unknown media rights state');
  keys(media.alt, ['en', 'ro']);
  for (const lang of ['en', 'ro']) safe(media.alt[lang], lang + ' media alt', 320);
  const identity = variant.identity;
  if (media.kind === 'product_photo') {
    assert.ok(!registeredNonPhotos.has(media.assetSha256) &&
      !registeredUnverified.has(media.assetSha256),
    'Illustration/concept cannot be an exact-model product photo');
    if (media.rights === 'cleared') {
      safe(media.rightsEvidenceId, 'photo evidence ID', 101);
      const proof = intakeBySource.get(variant.sourceId)?.evidence
        ?.find((e) => e.id === media.rightsEvidenceId);
      assert.ok(activeProof(proof, 'exact_model_photo', identity, today) &&
        proof.sha256 === media.assetSha256 &&
        proof.facts.assetSha256 === media.assetSha256 &&
        proof.facts.photoType === 'photograph' &&
        proof.facts.permissionRef && proof.facts.rightsOwner,
      'Cleared photo needs current exact-model rights and identity evidence');
    } else {
      assert.equal(media.rightsEvidenceId, null, 'Unknown/rejected rights cannot carry clearance');
    }
  } else {
    // Concepts may be discussed internally, but never satisfy an exact-product-photo gate.
    assert.equal(media.rightsEvidenceId, null, 'Concept/diagram is not exact-model photo clearance');
    assert.ok(media.rights !== 'cleared', 'Concept/diagram clearance must use Stage 15 registry, not product-photo approval');
  }
}
function checkedEditorial(entry, lang) {
  keys(entry, ['state', 'name', 'summary', 'description', 'reviewRef', 'copySha256']);
  assert.ok(['draft', 'ready_for_review', 'reviewed'].includes(entry.state),
    'Unknown ' + lang + ' editorial state');
  for (const field of ['name', 'summary', 'description'])
    safe(entry[field], lang + ' editorial ' + field, field === 'description' ? 2000 : 480);
  assert.equal(entry.copySha256, digest({
    name: entry.name, summary: entry.summary, description: entry.description,
  }), 'Stale ' + lang + ' editorial digest');
  if (entry.state === 'reviewed') restricted(entry.reviewRef, lang + ' editorial reviewer evidence');
  else assert.equal(entry.reviewRef, null, 'Draft copy cannot claim completed review');
}
export function validateRegistry(registry, { report, ledger, intake, sources, published = [],
  expectedSourceCount = 132, unverified = new Set(), nonPhotos = new Set(),
  today = new Date().toISOString().slice(0, 10) }) {
  keys(registry, ['schemaVersion', 'purpose', 'reviewEpoch', 'reviewRevisions', 'products']);
  assert.equal(registry.schemaVersion, 1, 'Explicit registry migration required');
  assert.equal(registry.purpose, PURPOSE);
  assert.ok(validDate(today), 'Validator today must be an ISO calendar date');
  assert.equal(registry.reviewEpoch, ledger.currentEpoch, 'Stale product registry review epoch');
  assert.equal(ledger.epochs?.at(-1)?.epoch, ledger.currentEpoch,
    'Current review epoch must be the last signed-off epoch');
  revision(registry.reviewRevisions);
  assert.deepEqual(registry.reviewRevisions, ledger.epochs.at(-1).revisions,
    'Stale product registry manifest revisions');
  assert.equal(report.epoch, registry.reviewEpoch, 'Independent intake epoch mismatch');
  assert.ok(Array.isArray(sources) && sources.length === expectedSourceCount,
    'Source reference coverage must be reconciled independently');
  assert.equal(report.total, expectedSourceCount, 'Independent Stage 14 coverage mismatch');
  const sourceIds = new Set(sources.map((r) => r.sourceId));
  assert.equal(sourceIds.size, expectedSourceCount, 'Duplicate source research identities');
  assert.ok(Array.isArray(registry.products) && registry.products.length <= 1000,
    'Invalid product collection');

  // Every producer namespace stays disjoint from supplier IDs and slugs,
  // including case-folded collisions; ASCII-only ID/slug regexes forbid homoglyphs.
  const ids = new Set(sources.map((r) => fold(r.sourceId)));
  const slugs = new Set(sources.map((r) => fold(r.draftSlug)));
  const sourceClaims = new Set();
  const intakeBySource = new Map(intake.records.map((r) => [r.sourceId, r]));
  const reviewed = new Map(report.rows.map((r) => [r.sourceId, r]));
  assert.equal(reviewed.size, expectedSourceCount, 'Incomplete Stage 14 review rows');
  for (const p of published) {
    ids.add(fold(p.id)); slugs.add(fold(p.slug));
  }
  const result = [];
  for (const product of registry.products) {
    keys(product, ['id', 'lifecycle', 'categoryId', 'identity', 'slugs', 'editorial',
      'variants', 'media']);
    unique('bdc', product.id, ids);
    assert.ok(['proposed', 'verified'].includes(product.lifecycle), 'Unknown product lifecycle');
    assert.ok(categoryIds.has(product.categoryId), 'Unknown BODICH category');
    keys(product.identity, ['manufacturer', 'model']);
    assert.equal(product.identity.manufacturer, 'BODICH', 'Supplier identity is not BODICH');
    safe(product.identity.model, 'model identity');
    keys(product.slugs, ['en', 'ro']);
    for (const lang of ['en', 'ro']) {
      const slug = product.slugs[lang];
      assert.ok(typeof slug === 'string' && SLUG.test(slug), 'Invalid ' + lang + ' localized slug');
      assert.ok(!slugs.has(fold(slug)), 'Supplier/public/registry slug collision: ' + slug);
      slugs.add(fold(slug));
    }
    keys(product.editorial, ['en', 'ro']);
    for (const lang of ['en', 'ro']) checkedEditorial(product.editorial[lang], lang);
    assert.ok(Array.isArray(product.variants) && product.variants.length > 0 &&
      product.variants.length <= 100, 'Product requires at least one explicit variant');
    assert.ok(Array.isArray(product.media) && product.media.length <= 100,
      'Invalid product media list');
    const variants = [];
    const blockers = [];
    for (const variant of product.variants) {
      keys(variant, ['id', 'code', 'sourceId', 'claims']);
      unique('bdv', variant.id, ids);
      safe(variant.code, 'variant designation');
      assert.ok(variant.sourceId === null || sourceIds.has(variant.sourceId),
        'Unknown retired or absent source lead');
      if (variant.sourceId !== null) {
        assert.ok(!sourceClaims.has(variant.sourceId),
          'Source reference claimed by multiple variants; manual identity resolution required');
        sourceClaims.add(variant.sourceId);
      }
      const identity = { manufacturer: 'BODICH', model: product.identity.model,
        variant: variant.code };
      const intakeRecord = intakeBySource.get(variant.sourceId);
      if (intakeRecord) {
        assert.deepEqual(intakeRecord.proposedBodichIdentity, identity,
          'Source intake identity/variant conflict; never infer from KingTech naming');
      }
      assert.ok(Array.isArray(variant.claims) && variant.claims.length <= 100,
        'Invalid claim list');
      const claimKinds = new Set();
      for (const claim of variant.claims) {
        checkedSpec(claim, intakeRecord, identity, variant.id, today);
        const metricKey = [claim.kind, claim.metric ?? '', claim.scope ?? ''].join(':');
        assert.ok(!claimKinds.has(metricKey), 'Conflicting/duplicate technical claim');
        claimKinds.add(metricKey);
      }
      const state = reviewed.get(variant.sourceId);
      if (!state?.promotionEligible) blockers.push(variant.id + ':Stage 13/14 current-epoch approval missing');
      if (!intakeRecord) blockers.push(variant.id + ':independent BODICH evidence intake missing');
      variants.push({ ...variant, identity });
    }
    for (const media of product.media)
      checkedMedia(media, variants, intakeBySource, ids, unverified, nonPhotos, today);
    for (const variant of variants) {
      if (!product.media.some((m) => m.variantId === variant.id &&
        m.kind === 'product_photo' && m.rights === 'cleared'))
        blockers.push(variant.id + ':no cleared exact-model photograph');
    }
    for (const lang of ['en', 'ro'])
      if (product.editorial[lang].state !== 'reviewed')
        blockers.push(lang + ':independent editorial review not recorded');
    if (product.media.some((m) => m.rights !== 'cleared'))
      blockers.push('unresolved media rights; remove/review non-cleared assets');
    // Review of the SOURCE draft is not review of independent BODICH copy.
    // All four Stage 14 editorial evidence kinds must bind to the current
    // combined EN/RO product text for EVERY actual product variant.
    const content = Object.fromEntries(['en', 'ro'].map((lang) => {
      const { name, summary, description } = product.editorial[lang];
      return [lang, { name, summary, description }];
    }));
    const combinedCopyDigest = digest(content);
    for (const variant of variants) {
      const proofs = intakeBySource.get(variant.sourceId)?.evidence ?? [];
      const editorial = proofs.filter((proof) =>
        proof.gate === 'editorial' && activeProof(proof, proof.kind, variant.identity, today) &&
        proof.facts?.bodichCopySha256 === combinedCopyDigest);
      for (const kind of ['english_review', 'native_romanian_review', 'legal_review', 'commercial_review']) {
        const matches = editorial.filter((proof) => proof.kind === kind);
        if (matches.length !== 1)
          blockers.push(variant.id + ':missing or ambiguous independent BODICH ' + kind);
        const lang = kind === 'english_review' ? 'en' :
          kind === 'native_romanian_review' ? 'ro' : null;
        if (lang && product.editorial[lang].state === 'reviewed' &&
          !matches.some((proof) => proof.ref === product.editorial[lang].reviewRef))
          blockers.push(variant.id + ':unbound ' + lang + ' editorial reviewRef');
      }
    }
    if (product.lifecycle === 'verified')
      assert.equal(blockers.length, 0, 'Verified product missing promotion prerequisites: ' +
        blockers.join('; '));
    result.push({ id: product.id, lifecycle: product.lifecycle, categoryId: product.categoryId,
      variants: variants.map((v) => ({
        id: v.id, sourceId: v.sourceId,
        sourceReviewStatus: reviewed.get(v.sourceId)?.ledgerStatus ?? 'unreviewed',
        sourceBlockers: reviewed.get(v.sourceId)?.blockers ?? ['no_source_evidence'],
      })), blockers: [...new Set(blockers)], promotionEligibleForManualPR:
        product.lifecycle === 'verified' && blockers.length === 0 });
  }
  return { schemaVersion: 1, purpose: PURPOSE, reviewEpoch: registry.reviewEpoch,
    sourceReferences: sourceIds.size, proposed: result.filter((r) => r.lifecycle === 'proposed').length,
    verified: result.filter((r) => r.lifecycle === 'verified').length,
    published: published.length, products: result,
    note: 'Read-only audit, not sign-off. Separate independent promotion PR required.' };
}

/** A manual PR checklist, NEVER a publication operation or a generated public product. */
export function planManualPromotion(report, id) {
  const row = report.products.find((p) => p.id === id);
  assert.ok(row && row.promotionEligibleForManualPR,
    'No manual promotion plan: verified registry product and current human approvals required');
  return { productId: id, operation: 'manual_pr_only', executed: false,
    requires: ['Independent owner/legal/technical/RO and rights reviewer in new PR',
      'Revalidate epoch, exact evidence claims, copy and image digests at PR merge',
      'Create reviewed public confirmedProducts change separately',
      'Re-run public routes, image rights, reconciliation and rollback checks'],
    rollback: 'Revert the separate publication PR; registry and historical ledger remain untouched' };
}
const STAGE18_MAX_COMMITTED_PRODUCTS = 0; // Change only via separately reviewed registry PR.
function visitFiles(dir, each) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Symlink forbidden in public build or source: ' + full);
    if (entry.isDirectory()) visitFiles(full, each);
    else {
      assert.ok(entry.isFile(), 'Unexpected non-file in public tree: ' + full);
      each(full);
    }
  }
}
function checkNoPublicLeak(registry, published = confirmedProducts) {
  // Source scanner is a heuristic tripwire, not a complete information-flow proof.
  // The actual built output has a separate independent distribution gate.
  const privateIds = new Set(registry.products.flatMap((p) => [
    p.id, ...p.variants.map((v) => v.id), ...p.media.map((m) => m.id),
  ]).map(fold));
  for (const product of published)
    assert.ok(!privateIds.has(fold(product.id)),
      'Private registry identity copied to confirmedProducts without independent publication PR');
  const blocked = [REGISTRY_PATH, 'catalog-product-registry.mjs',
    'internal_bodich_products_unpublished'];
  for (const dir of ['src', 'public']) visitFiles(pathAt(dir), (file) => {
    if (!/\.(?:ts|tsx|js|jsx|astro|json|html|mjs|md|mdx)$/.test(file)) return;
    const body = readFileSync(file, 'utf8');
    for (const forbidden of blocked)
      assert.ok(!body.includes(forbidden),
        'Private registry referenced by public source: ' + relative(root, file));
  });
  if (existsSync(pathAt('astro.config.mjs'))) {
    const config = readFileSync(pathAt('astro.config.mjs'), 'utf8');
    for (const forbidden of blocked)
      assert.ok(!config.includes(forbidden), 'Private registry referenced by Astro configuration');
  }
}
function checkBuiltOutput(distPath = 'dist') {
  const dir = pathAt(distPath);
  assert.ok(existsSync(dir), 'Public dist/ output must exist for distribution leak check');
  // Independent of source imports: catch embedded registry data and any registry-style
  // BODICH IDs even after a build transform or renaming of the source import.
  const leaked = /(?:internal_bodich_products_unpublished|\b(?:bdc|bdv|bdm)-[a-z0-9]+(?:-[a-z0-9]+)*\b)/i;
  visitFiles(dir, (file) => {
    if (!/\.(?:html?|xml|json|js|mjs|css|svg|txt|md|webmanifest)$/.test(file)) return;
    assert.ok(!leaked.test(readFileSync(file, 'utf8')),
      'Unpublished BODICH registry data found in distribution: ' + relative(root, file));
  });
}
function onDisk() {
  const report = reportOnDisk(); // always validates Stage 13 ledger and Stage 14 evidence
  const ctx = contextOnDisk();
  const ledger = load('docs/catalog/review-ledger.json');
  const intake = load('docs/catalog/genuine-product-evidence.json');
  return { report, ledger, intake, sources: ctx.sources,
    published: confirmedProducts,
    unverified: unverifiedMediaDigests(), nonPhotos: nonPhotoMediaDigests() };
}
function selfTest() {
  const revisions = { inventory: 'a'.repeat(40), overrides: 'b'.repeat(40),
    art: 'c'.repeat(40), copy: 'd'.repeat(40) };
  const source = { sourceId: 'kt-1', draftSlug: 'supplier-sample' };
  const identity = { manufacturer: 'BODICH', model: 'Synthetic test prototype', variant: 'Variant A' };
  const sha = '1'.repeat(64);
  const photo = { id: 'photo-1', kind: 'exact_model_photo', gate: 'imagery', sha256: sha,
    verifiedOn: '2026-10-20', scope: identity, facts: { assetSha256: sha,
      photoType: 'photograph', rightsOwner: 'Fixture rights holder',
      permissionRef: 'restricted:fixture-permission' } };
  const specification = { id: 'spec-1', kind: 'independent_specification',
    gate: 'specifications', verifiedOn: '2026-10-20', scope: identity,
    facts: { name: 'thrust', value: 100, unit: 'N' } };
  const env = { ledger: { currentEpoch: 1, epochs: [{ revisions }] },
    report: { epoch: 1, total: 1, rows: [{ sourceId: 'kt-1',
      promotionEligible: true, ledgerStatus: 'approved_for_promotion', blockers: [] }] },
    intake: { records: [{ sourceId: 'kt-1', proposedBodichIdentity: identity,
      evidence: [photo, specification] }] }, sources: [source], published: [],
    expectedSourceCount: 1, unverified: new Set(), nonPhotos: new Set() };
  const edit = (state, name) => ({ state, name, summary: 'Synthetic example only',
    description: 'No actual BODICH product or performance claims.',
    reviewRef: state === 'reviewed' ? 'restricted:synthetic-' + name.slice(0, 2) : null,
    copySha256: digest({ name, summary: 'Synthetic example only',
      description: 'No actual BODICH product or performance claims.' }) });
  const product = { id: 'bdc-synthetic-one', lifecycle: 'verified',
    categoryId: 'turbine-engines', identity: { manufacturer: 'BODICH',
      model: identity.model }, slugs: { en: 'synthetic-one', ro: 'sintetic-unu' },
    editorial: { en: edit('reviewed', 'Synthetic One'),
      ro: edit('reviewed', 'Prototip Sintetic') },
    variants: [{ id: 'bdv-synthetic-a', code: identity.variant, sourceId: 'kt-1',
      claims: [{ kind: 'thrust', value: 100, unit: 'N', evidenceId: 'spec-1' }] }],
    media: [{ id: 'bdm-synthetic-photo', variantId: 'bdv-synthetic-a',
      kind: 'product_photo', ref: 'restricted:synthetic-photo', assetSha256: sha,
      rights: 'cleared', rightsEvidenceId: 'photo-1',
      alt: { en: 'Synthetic sample photograph', ro: 'Fotografie sintetică de test' } }] };
  const doc = { schemaVersion: 1, purpose: PURPOSE, reviewEpoch: 1,
    reviewRevisions: revisions, products: [product] };
  const ok = (d = doc, e = env) => validateRegistry(d, e);
  const ready = ok();
  assert.equal(ready.verified, 1);
  assert.deepEqual(planManualPromotion(ready, product.id).executed, false);
  const bad = (mutate, pattern, e = env) => {
    const d = clone(doc); mutate(d);
    assert.throws(() => ok(d, e), pattern);
  };
  bad((d) => { d.reviewEpoch = 2; }, /Stale product registry/);
  bad((d) => { d.reviewRevisions.copy = 'f'.repeat(40); }, /Stale product registry/);
  bad((d) => { d.products[0].id = 'kt-1'; }, /Invalid bdc identity/);
  bad((d) => { d.products[0].slugs.en = 'supplier-sample'; }, /slug collision/);
  bad((d) => { d.products[0].slugs.ro = d.products[0].slugs.en; }, /slug collision/);
  bad((d) => { d.products.push(clone(d.products[0])); }, /Duplicate\/colliding identity/);
  bad((d) => { d.products[0].variants.push(clone(d.products[0].variants[0])); },
    /Duplicate\/colliding identity/);
  bad((d) => { d.products[0].variants[0].code = 'Variant B'; }, /identity\/variant conflict/);
  bad((d) => { d.products[0].variants[0].sourceId = 'kt-missing'; }, /Unknown retired/);
  bad((d) => { d.products[0].variants[0].claims[0].value = 101; }, /Unsupported technical claim/);
  bad((d) => { d.products[0].variants[0].claims[0].unit = 'kg'; }, /Unsupported spec unit/);
  bad((d) => { d.products[0].variants[0].claims[0].evidenceId = 'fake'; },
    /Unsupported technical claim/);
  bad((d) => { d.products[0].media[0].rights = 'unknown'; }, /Unknown\/rejected rights/);
  bad((d) => { d.products[0].media[0].assetSha256 = '2'.repeat(64); },
    /Cleared photo needs/);
  bad((d) => { d.products[0].media[0].kind = 'original_concept'; },
    /Concept\/diagram is not exact-model/);
  bad((d) => { d.products[0].editorial.ro.state = 'draft'; }, /Draft copy cannot/);
  bad((d) => { d.products[0].editorial.ro.summary = 'Stale edit'; }, /Stale ro editorial/);
  bad((d) => { d.products[0].extra = 'bad'; }, /Unexpected field/);
  bad((d) => { d.products[0].variants[0].claims[0].scope = 'bare_engine'; },
    /Invalid mass measurement/);
  bad((d) => { d.products[0].variants[0].claims.push(clone(d.products[0].variants[0].claims[0])); },
    /Conflicting\/duplicate/);
  const stale = structuredClone(env);
  stale.report.rows[0].promotionEligible = false;
  bad(() => {}, /Verified product missing promotion prerequisites/, stale);
  const draft = clone(doc);
  draft.products[0].lifecycle = 'proposed';
  draft.products[0].editorial.ro = edit('draft', 'Prototip Sintetic');
  draft.products[0].media[0].rights = 'unknown';
  draft.products[0].media[0].rightsEvidenceId = null;
  assert.equal(ok(draft, stale).proposed, 1);
  assert.throws(() => planManualPromotion(ok(draft, stale), product.id),
    /No manual promotion plan/);
  bad((d) => { d.products[0].media[0].assetSha256 = sha; },
    /Illustration\/concept cannot/, { ...env, nonPhotos: new Set([sha]) });
  const expired = structuredClone(env);
  expired.intake.records[0].evidence[0].expiresOn = '2020-01-01';
  bad(() => {}, /Cleared photo needs/, expired);
  const withoutProof = structuredClone(env);
  withoutProof.intake.records[0].evidence.pop();
  bad(() => {}, /Unsupported technical claim/, withoutProof);
  assert.equal(ok({ ...doc, products: [] }).sourceReferences, 1);
  console.log('Stage 18 synthetic-only registry tests passed: IDs, variants, bilingual copy, rights, source proof, epoch and manual promotion gates.');
}
function main(args) {
  assert.ok(args.length >= 1 && args.length <= 2 &&
    ['--check', '--self-test', '--export', '--dist-check'].includes(args[0]) &&
    (args[0] === '--dist-check' || args.length === 1),
    'Usage: node scripts/catalog-product-registry.mjs --check | --self-test | --export | --dist-check [dist]');
  if (args[0] === '--self-test') return selfTest();
  const registry = load(REGISTRY_PATH);
  const report = validateRegistry(registry, onDisk());
  // Stage 18 accepts only the empty committed registry; a future registry PR
  // must explicitly revise this limit and independently review all records.
  assert.equal(registry.products.length, STAGE18_MAX_COMMITTED_PRODUCTS,
    'Stage 18 committed registry cardinality requires independent review');
  checkNoPublicLeak(registry);
  if (args[0] === '--dist-check') {
    checkBuiltOutput(args[1] || 'dist');
    console.log('No unpublished BODICH identities or registry payload in static distribution.');
    return;
  }
  if (args[0] === '--export') {
    mkdirSync(pathAt('visual-qa'), { recursive: true });
    writeFileSync(pathAt('visual-qa/bodich-product-registry-audit.json'),
      JSON.stringify(report, null, 2) + '\n');
  }
  console.log('Internal BODICH registry: ' + report.sourceReferences + ' unpublished supplier references; ' +
    report.products.length + ' actual products; no public changes; epoch ' + report.reviewEpoch);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));

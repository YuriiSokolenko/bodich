#!/usr/bin/env node
// Offline QA for unpublished bilingual supplier-reference product copy.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const paths = {
  inventory: 'docs/catalog/source-inventory.json',
  drafts: 'docs/catalog/reference-overrides.json',
  art: 'docs/catalog/art-manifest.json',
  exceptions: 'docs/catalog/copy-claim-evidence.json',
  matrix: 'docs/catalog/copy-review-matrix.json',
};
const languages = ['en', 'ro'], fields = ['name', 'summary', 'description'];
const qaStatus = 'automated_consistency_checked_unpublished';
const humanStatus = 'pending_prelaunch_native_Romanian_legal_marketing_review';
const measurementPattern = /(^|[^\p{L}\p{N}])([0-9][0-9.,]*)\s+(g\/min|mL\/min|L\/h|mAh|kgf|rpm|°C|mm|cm|kW|mL|Ah|kg|g|V|W|L)(?![\p{L}/])/gu;
const sortUnique = (xs) => [...new Set(xs)].sort();
const keyFor = (x) => x.sourceId + '/' + x.value + '/' + x.unit;

function parseQuantity(token, lang) {
  const format = lang === 'en'
    ? /^(?:[0-9]+(?:\.[0-9]+)?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)$/
    : /^(?:[0-9]+(?:,[0-9]+)?|[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?)$/;
  if (!format.test(token)) return null;
  return Number(lang === 'en' ? token.replaceAll(',', '') : token.replaceAll('.', '').replace(',', '.'));
}
function measured(copy, lang) {
  const out = [];
  for (const field of fields) {
    if (typeof copy?.[field] !== 'string') continue;
    for (const m of copy[field].matchAll(measurementPattern))
      out.push({ value: parseQuantity(m[2], lang), unit: m[3], surface: m[2] + ' ' + m[3] });
  }
  return out;
}
function equivalent(a, b) {
  return a.unit === b.unit && a.value !== null && Math.abs(a.value - b.value) < 0.000001;
}
export function expectedMatrix(inventory, drafts, exceptions) {
  const edits = new Map(drafts.records.map((d) => [d.sourceId, d]));
  return {
    schemaVersion: 1,
    purpose: 'unpublished_catalog_copy_review',
    requiredHumanProofreading: humanStatus,
    items: inventory.products.map((source) => {
      const draft = edits.get(source.id);
      const extra = exceptions.entries.filter((x) => x.sourceId === source.id);
      return {
        sourceId: source.id,
        sourceCategory: source.sourceCategoryIds.find((x) => x !== 'discounted'),
        sourceUrl: source.canonicalUrl,
        supplierLifecycle: source.sourceStatus,
        structuredSpecCount: draft?.specs?.length ?? 0,
        evidenceUrls: sortUnique([...(source.evidenceUrls ?? []),
          ...(draft?.specs ?? []).map((x) => x.sourceUrl), ...extra.map((x) => x.sourceUrl)]),
        copyStatus: qaStatus,
        humanRomanianReview: humanStatus,
        unresolved: sortUnique([
          ...(source.sourceStatus === 'unknown' ? ['supplier_lifecycle_unverified'] : []),
          ...((draft?.specs?.length ?? 0) === 0 ? ['numeric_specifications_not_verified'] : []),
          ...extra.map((x) => x.reviewTag),
        ]),
      };
    }),
  };
}
export function validate(input) {
  const { inventory, drafts, art, exceptions, matrix } = input, errors = [];
  const fail = (msg) => errors.push(msg);
  if (!Array.isArray(inventory?.products) || !Array.isArray(drafts?.records) ||
      !Array.isArray(art?.entries) || !Array.isArray(matrix?.items) ||
      [inventory.products.length, drafts.records.length, art.entries.length, matrix.items.length].some((n) => n !== 132))
    return ['Frozen inventory, translations, artwork and review matrix must cover 132 records'];
  if (exceptions?.schemaVersion !== 1 ||
      exceptions?.purpose !== 'documented_non_nominal_or_cross_reference_copy_claims' ||
      !Array.isArray(exceptions.entries)) return ['Invalid claim exception ledger'];
  const sources = new Map(inventory.products.map((p) => [p.id, p]));
  const edits = new Map(drafts.records.map((p) => [p.sourceId, p]));
  const artById = new Map(art.entries.map((p) => [p.sourceId, p]));
  if (sources.size !== 132 || edits.size !== 132 || artById.size !== 132)
    fail('Duplicate or missing SKU identities');
  const knownUrls = new Set(inventory.products.map((x) => x.canonicalUrl));
  const exceptionsByKey = new Map();
  for (const e of exceptions.entries) {
    if (!sources.has(e.sourceId) || !Number.isFinite(e.value) || e.value < 0 ||
        !knownUrls.has(e.sourceUrl) || typeof e.note !== 'string' || e.note.length < 45 ||
        !/^[a-z_]+$/.test(e.reviewTag ?? '') || !/^(?:kgf|rpm|g|mAh)$/.test(e.unit))
      fail('Invalid, unclear or unsourced claim exception: ' + e.sourceId);
    if (exceptionsByKey.has(keyFor(e))) fail('Duplicate claim exception: ' + keyFor(e));
    exceptionsByKey.set(keyFor(e), e);
  }
  const seenText = new Map(), usedClaims = new Set();
  for (const source of inventory.products) {
    const id = source.id, edit = edits.get(id), image = artById.get(id);
    if (!edit || !image) { fail('No copy or image/alt metadata for ' + id); continue; }
    if (edit.approval !== 'draft' || edit.images?.length !== 0 ||
        image.approved !== false || image.rights !== 'pending' ||
        image.kind !== 'original_diagram' || image.isProductPhoto !== false ||
        image.sourceUrl !== source.canonicalUrl || image.sourceTitle !== source.sourceTitle)
      fail('Unapproved art or unpublished catalog boundary violated: ' + id);
    if (edit.model && !languages.every((lang) => edit.copy?.[lang]?.name?.includes(edit.model)))
      fail('Exact supplier model omitted: ' + id);
    for (const lang of languages) {
      const copy = edit.copy?.[lang], alt = image.alt?.[lang];
      if (!copy || Object.keys(copy).sort().join(',') !== [...fields].sort().join(',') ||
          !fields.every((field) => typeof copy[field] === 'string')) {
        fail('Complete copy.' + lang + ' fields required: ' + id);
        continue;
      }
      const ranges = { name: [25, 150], summary: [90, 260], description: [240, 1250] };
      for (const field of fields) {
        const value = copy[field], [min, max] = ranges[field], normalized = value.trim().normalize('NFC');
        if (normalized !== value || value.length < min || value.length > max ||
            /[\u0000-\u001f\u007f\uFFFD<>]/u.test(value))
          fail('Invalid copy length/format: ' + id + '/' + lang + '/' + field);
        const hash = lang + '/' + field + '/' + normalized.toLowerCase().replace(/\s+/g, ' ');
        if (seenText.has(hash)) fail('Non-unique ' + lang + '.' + field + ': ' + id);
        seenText.set(hash, id);
      }
      if (!fields.some((field) => copy[field].toLowerCase().includes('kingtech')))
        fail('No supplier attribution: ' + id + '/' + lang);
      if (lang === 'ro' && !/[ăâîșț]/i.test(Object.values(copy).join(' ')))
        fail('Romanian diacritics missing: ' + id);
      if (typeof alt !== 'string' || alt.length < 85 || alt.length > 260 ||
          !alt.includes(id) || !alt.includes(source.sourceTitle) ||
          !alt.startsWith(lang === 'en' ? 'Illustrative ' : 'Diagramă ilustrativă ') ||
          !alt.includes(lang === 'en' ? 'not an actual product photograph' : 'nu este o imagine a produsului real'))
        fail('Missing/unlocalized image alt: ' + id + '/' + lang);
      for (const claim of measured(copy, lang)) {
        if (claim.value === null) {
          fail('Wrong decimal/thousands locale format: ' + id + '/' + lang + '/' + claim.surface);
          continue;
        }
        if ((edit.specs ?? []).some((spec) => equivalent(spec, claim))) continue;
        const key = keyFor({ sourceId: id, ...claim });
        if (!exceptionsByKey.has(key)) fail('Numeric copy claim lacks evidence: ' + id + '/' + lang + '/' + claim.surface);
        else usedClaims.add(key + '/' + lang);
      }
      const propeller = lang === 'en'
        ? /\b([0-9]+)\s*×\s*([0-9]+)\s*inch(?:es)?\b/g
        : /\b([0-9]+)\s*×\s*([0-9]+)\s*țoli\b/g;
      for (const m of (copy.summary + ' ' + copy.description).matchAll(propeller)) {
        if (!(edit.turboprop?.propellers ?? []).some((p) =>
          p.diameterInches === Number(m[1]) && p.pitchInches === Number(m[2])))
          fail('Propeller dimension has no evidence: ' + id + '/' + lang);
      }
    }
    if (fields.some((field) => edit.copy?.en?.[field] === edit.copy?.ro?.[field]) ||
        image.alt?.en === image.alt?.ro) fail('Identical EN and RO text: ' + id);
    if (/\b(?:order now|buy now|ships today|in stock at BODICH|guaranteed by BODICH)\b/i.test(
      fields.map((f) => edit.copy?.en?.[f] ?? '').join(' ')))
      fail('Unapproved commercial claims: ' + id);
  }
  for (const exception of exceptions.entries)
    for (const lang of languages)
      if (!usedClaims.has(keyFor(exception) + '/' + lang))
        fail('Unused/unpaired copy evidence exception: ' + exception.sourceId + '/' + lang);
  if (matrix?.schemaVersion !== 1 || matrix?.purpose !== 'unpublished_catalog_copy_review' ||
      matrix.requiredHumanProofreading !== humanStatus ||
      JSON.stringify(matrix.items) !== JSON.stringify(expectedMatrix(inventory, drafts, exceptions).items))
    fail('Review matrix stale, silent omissions, or human gate removed');
  return errors;
}
function selfTest(input) {
  assert.deepEqual(validate(input), [], 'baseline must pass');
  const negative = (mutate, phrase) => {
    const fixture = structuredClone(input); mutate(fixture);
    assert(validate(fixture).some((e) => e.includes(phrase)), phrase);
  };
  negative((x) => { delete x.drafts.records[0].copy.ro.description; }, 'Complete copy.ro');
  negative((x) => { x.drafts.records[0].copy.ro = { ...x.drafts.records[0].copy.en }; }, 'Identical EN');
  negative((x) => { x.drafts.records[1].copy.en.summary = x.drafts.records[0].copy.en.summary; }, 'Non-unique');
  negative((x) => { x.drafts.records[0].copy.en.summary = x.drafts.records[0].copy.en.summary.replace('8.6 kgf', '9.9 kgf'); }, 'Numeric copy claim');
  negative((x) => { x.drafts.records[0].copy.ro.summary = x.drafts.records[0].copy.ro.summary.replace('8,6 kgf', '8.6 kgf'); }, 'decimal/thousands');
  negative((x) => { x.art.entries[0].alt.ro = x.art.entries[0].alt.en; }, 'image alt');
  negative((x) => { x.matrix.items.pop(); }, 'cover 132');
  negative((x) => { x.exceptions.entries[0].value = 999; }, 'Numeric copy claim');
  negative((x) => { x.matrix.items[1].unresolved = []; }, 'Review matrix stale');
  console.log('Copy QA regression fixtures: 9 expected failures detected');
}
const options = process.argv.slice(2);
if (options.some((x) => !['--write-matrix', '--self-test'].includes(x)))
  throw new Error('Unknown argument; use --write-matrix or --self-test');
const input = {
  inventory: read(paths.inventory), drafts: read(paths.drafts),
  art: read(paths.art), exceptions: read(paths.exceptions),
  matrix: options.includes('--write-matrix') ? null : read(paths.matrix),
};
if (options.includes('--write-matrix')) {
  input.matrix = expectedMatrix(input.inventory, input.drafts, input.exceptions);
  writeFileSync(paths.matrix, JSON.stringify(input.matrix, null, 2) + '\n');
}
const errors = validate(input);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else {
  console.log('Copy QA passed: 132 unpublished EN/RO records, source claims, alt and review rows');
  if (options.includes('--self-test')) selfTest(input);
}

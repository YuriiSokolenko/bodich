#!/usr/bin/env node
// Issue #30: deterministic OFFLINE acceptance. Never use unpublished research
// items for Astro routes, commerce, availability or product images.
import { readFileSync } from 'node:fs';
import { buildReferenceDrafts, validateReferenceDrafts, referenceAccessoryGroups } from '../src/catalog/reference.ts';
const read = (name) => JSON.parse(readFileSync('docs/catalog/' + name, 'utf8'));
const inventory = read('source-inventory.json');
const overlays = read('reference-overrides.json');
const baseline = read('accessory-source-ids.json');
const briefs = readFileSync('docs/catalog/accessory-reference-evidence.md', 'utf8');
const drafts = buildReferenceDrafts(inventory, overlays);
const original = inventory.products.filter((p) => p.sourceCategoryIds.includes('accessories'));
const names = ['en', 'ro'];
const canonical = (x) => typeof x === 'string' &&
  x.startsWith('https://www.kingtechturbines.com/product/');
const expectedIds = new Set(baseline.sourceIds);
const validCopy = (x) => x && typeof x === 'object' &&
  ['name', 'summary', 'description'].every((key) =>
    typeof x[key] === 'string' && x[key].trim().length >= (key === 'description' ? 140 : key === 'summary' ? 45 : 10));
const equalSet = (left, right) => left.length === right.length &&
  new Set(left).size === left.length && left.every((x) => right.includes(x));

function audit(source, rows, edits) {
  const errors = [];
  const fail = (s) => errors.push(s);
  const current = source.products.filter((p) => p.sourceCategoryIds.includes('accessories'));
  const selected = rows.filter((p) => p.itemType === 'accessory');
  const byId = new Map(rows.map((p) => [p.sourceId, p]));
  const over = edits.records.filter((p) => p.accessory !== undefined);
  if (baseline.capturedAt !== source.capturedAt || baseline.expectedDistinctCount !== 93 ||
      baseline.expectedListedCount !== 89 || baseline.expectedDirectOnlyCount !== 4 ||
      !equalSet(current.map((p) => p.id), baseline.sourceIds))
    fail('Accessory source inventory differs from captured 93-ID baseline');
  if (selected.length !== 93 || over.length !== 93 ||
      !equalSet(selected.map((p) => p.sourceId), baseline.sourceIds) ||
      !equalSet(over.map((p) => p.sourceId), baseline.sourceIds))
    fail('Accessory draft coverage must equal all 93 original source IDs exactly once');
  const byCategory = new Map();
  let unlisted = 0;
  for (const p of current) {
    if (!canonical(p.canonicalUrl) || !p.sourceTitle) fail('Missing accessory source evidence: ' + p.id);
    if (p.sourceDiscovery === 'direct_verified_unlisted') {
      unlisted++;
      if (p.subcategoryUrls.length) fail('Direct-only accessory misrepresented as listed: ' + p.id);
    }
    for (const url of p.subcategoryUrls) byCategory.set(url, (byCategory.get(url) ?? 0) + 1);
    const d = byId.get(p.id);
    if (!d || d.itemType !== 'accessory' || d.categoryId !== 'turbine-accessories' ||
        d.approval !== 'draft' || d.images.length || d.specs.length || d.turboprop !== null ||
        d.source.status !== p.sourceStatus || d.source.url !== p.canonicalUrl)
      { fail('Accessory draft must remain unpublished, correctly typed and source-linked: ' + p.id); continue; }
    const a = d.accessory;
    if (!a || a.sourceUrl !== p.canonicalUrl ||
        a.sourceSubcategoryUrls.join('|') !== p.subcategoryUrls.join('|') ||
        !referenceAccessoryGroups.includes(a.groupId) || a.artBriefId !== a.groupId ||
        !briefs.includes('## ' + a.artBriefId))
      fail('Missing category, source sub-listing or original artwork brief: ' + p.id);
    if (!a?.compatibility || !['unverified', 'source_title_only'].includes(a.compatibility.status) ||
        a.compatibility.confirmedModels.length ||
        (a.compatibility.status === 'unverified') !== (a.compatibility.sourceLabel === null))
      fail('Unverified fitment was treated as a confirmed compatible model: ' + p.id);
    if (a?.compatibility?.sourceLabel && !p.sourceTitle.includes(a.compatibility.sourceLabel))
      fail('Compatibility label not literally present in source title: ' + p.id);
    if (a?.variantLabel && !p.sourceTitle.includes(a.variantLabel))
      fail('Variant identifier not literally present in source title: ' + p.id);
    for (const locale of names) {
      if (!validCopy(d.copy?.[locale]) ||
          !d.copy[locale].name.includes(p.sourceTitle) ||
          !d.copy[locale].summary.includes(p.sourceTitle))
        fail('Incomplete ' + locale + ' accessory editorial copy: ' + p.id);
    }
  }
  if (unlisted !== baseline.expectedDirectOnlyCount)
    fail('Missing or changed direct-only accessory reference count');
  if (Object.keys(baseline.subcategoryCounts).length !== byCategory.size ||
      Object.entries(baseline.subcategoryCounts).some(([url, count]) => byCategory.get(url) !== count))
    fail('Nested accessory category counts lost parity');
  for (const locale of names) {
    const actual = selected.map((d) => d.copy?.[locale]?.description);
    if (new Set(actual).size !== actual.length)
      fail('Repeated generic accessory description in ' + locale);
  }
  if (selected.some((d) => !/^kingtech-accessory-[a-z0-9-]+$/.test(d.slug)) ||
      new Set(selected.map((d) => d.slug)).size !== selected.length)
    fail('Missing or duplicate accessory slug');
  return errors;
}

const errs = [
  ...validateReferenceDrafts(inventory, overlays, drafts),
  ...audit(inventory, drafts, overlays),
];
if (process.argv.includes('--self-test')) {
  const mutate = (id, change) => drafts.map((d) => d.sourceId === id ? change(d) : d);
  const sample = original[0].id;
  const cases = [
    [drafts.filter((d) => d.sourceId !== sample), 'coverage'],
    [mutate(sample, (d) => ({ ...d, approval: 'company_approved' })), 'unpublished'],
    [mutate(sample, (d) => ({ ...d, images: [{ path: 'fake.webp' }] })), 'unpublished'],
    [mutate(sample, (d) => ({ ...d, copy: { ...d.copy, ro: null } })), 'editorial'],
    [mutate(sample, (d) => ({ ...d, accessory: {
      ...d.accessory, compatibility: { ...d.accessory.compatibility, confirmedModels: ['K-999G5'] },
    } })), 'fitment'],
    [mutate(sample, (d) => ({ ...d, accessory: { ...d.accessory, sourceUrl: 'https://example.org/item' } })), 'source'],
    [mutate(sample, (d) => ({ ...d, accessory: { ...d.accessory, groupId: 'fictional-group' } })), 'category'],
    [mutate(sample, (d) => ({ ...d, specs: [{ kind: 'voltage', value: 12, unit: 'V' }] })), 'unpublished'],
    [mutate(sample, (d) => ({ ...d, source: { ...d.source, status: 'discontinued' } })), 'source'],
    [mutate(sample, (d) => ({ ...d, copy: { ...d.copy, en: {
      ...d.copy.en, description: drafts.find((other) => other.sourceId !== d.sourceId && other.itemType === 'accessory').copy.en.description,
    } } })), 'generic'],
  ];
  for (const [changed, marker] of cases) {
    if (!audit(inventory, changed, overlays).length)
      errs.push('Accessory negative fixture escaped: ' + marker);
  }
  const badEdit = structuredClone(overlays);
  badEdit.records.find((p) => p.sourceId === sample).accessory.compatibility.sourceLabel = 'K-999G5';
  if (!validateReferenceDrafts(inventory, badEdit, buildReferenceDrafts(inventory, badEdit))
      .some((s) => s.includes('Invalid/unsourced accessory metadata')))
    errs.push('Fabricated compatibility source label bypassed schema');
  const badCategory = structuredClone(overlays);
  badCategory.records.find((p) => p.sourceId === 'kt-17').accessory =
    structuredClone(overlays.records.find((p) => p.sourceId === sample).accessory);
  if (!validateReferenceDrafts(inventory, badCategory, buildReferenceDrafts(inventory, badCategory))
      .some((s) => s.includes('Non-accessory')))
    errs.push('Accessory metadata on turboprop bypassed schema');
}
if (errs.length) {
  errs.forEach((e) => console.error('Accessories: ' + e));
  process.exitCode = 1;
} else {
  console.log('Accessories validated: 93 unique original source SKUs (89 listed + 4 direct-only), 14 nested category counts, 93 EN/RO draft pairs; no publication/fitment claims' + (process.argv.includes('--self-test') ? '; negative fixtures passed' : '') + '.');
}

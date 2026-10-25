#!/usr/bin/env node
// Issue #30: deterministic OFFLINE acceptance. Never use unpublished research
// items for Astro routes, commerce, availability or product images.
import { readFileSync } from 'node:fs';
import { buildReferenceDrafts, validateReferenceDrafts, referenceAccessoryGroups, accessoryTitleQualifier } from '../src/catalog/reference.ts';
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
    if (a?.compatibility?.sourceLabel !== accessoryTitleQualifier(p.sourceTitle))
      fail('Truncated or invented compatibility label: ' + p.id);
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
    // Reject verbatim reuse; families may still share provisional review text.
    // Do not claim that an individual title token makes family boilerplate unique.
    if (new Set(actual).size !== actual.length)
      fail('Repeated verbatim accessory description in ' + locale);
  }
  if (selected.some((d) => !/^kingtech-accessory-[a-z0-9-]+$/.test(d.slug)) ||
      new Set(selected.map((d) => d.slug)).size !== selected.length)
    fail('Missing or duplicate accessory slug');
  return errors;
}


/**
 * Compare the committed editorial ledger against the actual data: counts,
 * unique source rows, source links, category, literal variants and fitment.
 * Exact markdown rows are intentional: this is a frozen intake audit ledger.
 */
function ledgerProblems(source, rows, markdown) {
  const problems = [];
  const selected = rows.filter((d) => d.itemType === 'accessory');
  const byId = new Map(selected.map((d) => [d.sourceId, d]));
  const inventoryRows = source.products.filter((p) => p.sourceCategoryIds.includes('accessories'));
  const groupStart = '| Unpublished BODICH reference group | Items |';
  const groupTable = markdown.split(groupStart)[1]?.split('\n\n')[0] ?? '';
  const countRows = [...groupTable.matchAll(/^\| `([a-z-]+)` \| (\d+) \|$/gm)];
  if (countRows.length !== referenceAccessoryGroups.length ||
      new Set(countRows.map((r) => r[1])).size !== countRows.length ||
      countRows.some((r) => !referenceAccessoryGroups.includes(r[1]) ||
        selected.filter((d) => d.accessory?.groupId === r[1]).length !== Number(r[2])) ||
      !groupTable.includes('| **Total** | **93** |'))
    problems.push('Ledger summary group counts differ from accessory data');
  const header = '| Source ID | Original source product link | Source subcategory | Unpublished grouping | Variant as printed | Compatibility evidence |\n|---|---|---|---|---|---|\n';
  const section = markdown.split(header)[1]?.split('## Validation')[0];
  if (!section) return [...problems, 'Ledger item-by-item table header missing'];
  const actualLines = section.split('\n').filter((l) => l.startsWith('| `kt-'));
  const expectedLines = inventoryRows.map((p) => {
    const d = byId.get(p.id), a = d?.accessory;
    if (!p.sourceTitle || !a) return '';
    const subcategory = p.subcategoryUrls.map((u) =>
      u.match(/\/shop\/([^/]+)\//)?.[1] ?? '?').join(', ') || 'Direct-only';
    const label = a.compatibility?.sourceLabel ?
      '`' + a.compatibility.sourceLabel + '` (title only)' : 'Unverified';
    return '| `' + p.id + '` | [' + p.sourceTitle.replaceAll('|', '/') +
      '](' + p.canonicalUrl + ') | ' + subcategory + ' | `' + a.groupId +
      '` | ' + (a.variantLabel ?? '—') + ' | ' + label + ' |';
  });
  if (actualLines.length !== 93 ||
      expectedLines.length !== actualLines.length ||
      actualLines.some((line, i) => line !== expectedLines[i]))
    problems.push('Ledger 93-row source/category/variant/fitment table differs from data');
  return problems;
}

const errs = [
  ...validateReferenceDrafts(inventory, overlays, drafts),
  ...audit(inventory, drafts, overlays),
  ...ledgerProblems(inventory, drafts, briefs),
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
  for (const [id, truncated] of [
    ['kt-124', 'K30/45 G3'],
    ['kt-138', 'K30/45'],
  ]) {
    const altered = structuredClone(overlays);
    altered.records.find((p) => p.sourceId === id).accessory.compatibility.sourceLabel = truncated;
    if (!validateReferenceDrafts(inventory, altered, buildReferenceDrafts(inventory, altered))
      .some((e) => e.includes('Invalid/unsourced accessory metadata')))
      errs.push('Truncated source-title fitment qualifier bypassed schema: ' + id);
  }
  const wrongVariant = structuredClone(overlays);
  wrongVariant.records.find((p) => p.sourceId === 'kt-107').accessory.variantLabel = 'Fuel';
  if (!validateReferenceDrafts(inventory, wrongVariant, buildReferenceDrafts(inventory, wrongVariant))
      .some((e) => e.includes('Invalid/unsourced accessory metadata')))
    errs.push('Generic fluid name accepted as SKU variant');
  const groupHeading = '| `ecu-controls` | 10 |';
  if (!ledgerProblems(inventory, drafts, briefs.replace(groupHeading, '| `ecu-controls` | 11 |'))
      .some((e) => e.includes('summary group counts')))
    errs.push('Ledger wrong-group-count fixture escaped');
  const matchingLine = briefs.split('\n').find((line) => line.startsWith('| `kt-124`'));
  if (!matchingLine || !ledgerProblems(inventory, drafts, briefs.replace(matchingLine,
    matchingLine.replace('K30/45 G3 and G4` (title only)', 'K30/45 G3` (title only)')))
      .some((e) => e.includes('93-row')))
    errs.push('Ledger truncated fitment-row fixture escaped');
  const missingItem = briefs.split('\n').find((line) => line.startsWith('| `kt-138`'));
  if (!missingItem || !ledgerProblems(inventory, drafts, briefs.replace(missingItem + '\n', ''))
      .some((e) => e.includes('93-row')))
    errs.push('Ledger omitted-source-row fixture escaped');
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

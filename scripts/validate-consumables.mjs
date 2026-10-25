#!/usr/bin/env node
// Issue #31: isolated, network-free coverage/spec/ledger checks for unpublished source references.
import { readFileSync } from 'node:fs';
import { buildReferenceDrafts, validateReferenceDrafts } from '../src/catalog/reference.ts';

const load = (filename) => JSON.parse(readFileSync('docs/catalog/' + filename, 'utf8'));
const inventory = load('source-inventory.json');
const overrides = load('reference-overrides.json');
const drafts = buildReferenceDrafts(inventory, overrides);
const ledger = readFileSync('docs/catalog/consumables-reference-evidence.md', 'utf8');
const REQUIRED = {
  'kt-21': { section: 'oil', title: 'KingTech Special Blend Oil, 2 Gallons', volume: '2 Gallons' },
  'kt-22': { section: 'oil', title: 'KingTech Special Blend Oil, 1 Gallon', volume: '1 Gallon' },
  'kt-23': { section: 'oil', title: 'KingTech Special Blend Oil, 32oz', volume: '32oz' },
  'kt-122': { section: 'oil', title: 'KingTech Red Dyed Special Blend Oil, 2 Gallons', volume: '2 Gallons' },
  'kt-24': { section: 'batteries', title: '3800mAh-9.9V LIFE Battery', capacity: 3800 },
  'kt-25': { section: 'batteries', title: '2100mAh-9.9V LIFE Battery', capacity: 2100 },
};
const expectedIds = Object.keys(REQUIRED);
const category = (p) => p.sourceCategoryIds.filter((id) => id === 'oil' || id === 'batteries');
const unique = (items) => new Set(items).size === items.length;
const sameIds = (items) => unique(items) && items.length === expectedIds.length &&
  expectedIds.every((id) => items.includes(id));
const enoughCopy = (c) => c && ['name', 'summary', 'description'].every((key) =>
  typeof c[key] === 'string' && c[key].trim().length >= (key === 'description' ? 160 : key === 'summary' ? 65 : 20));

const header = '| Source ID | Original KingTech listing | Section | Distinct source variant | Source-verified fields | Needs review |\n|---|---|---|---|---|---|\n';
function sourceRow(p, d) {
  if (!d) return '';
  const variant = d.oil ? d.oil.volume.sourceLabel + (d.oil.blend === 'red_dyed_special_blend' ? ' / red dyed' : ' / standard') :
    d.battery.capacity.value + ' mAh / ' + d.battery.voltage.value + ' V / LiFe';
  const verified = d.oil ? 'Source oil-size label and turbine use' :
    'Title-listed chemistry, nominal voltage and capacity';
  const unknown = d.oil ? 'Container count; unit conversion; sale details' :
    'Cell count; connectors; specific fitment; sale details';
  return '| ' + p.id + ' | [' + p.sourceTitle + '](' + p.canonicalUrl + ') | ' +
    (category(p)[0] === 'oil' ? 'Engine Oil' : 'Batteries') + ' | ' + variant +
    ' | ' + verified + ' | ' + unknown + ' |';
}
function check(source, rows, edits, evidence) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const original = source.products.filter((p) => category(p).length);
  const selected = rows.filter((d) => d.itemType === 'oil' || d.itemType === 'battery');
  const edited = edits.records.filter((d) => d.oil !== undefined || d.battery !== undefined);
  if (source.capturedAt !== '2026-10-23' || original.length !== 6 ||
      !sameIds(original.map((p) => p.id)) || !sameIds(selected.map((p) => p.sourceId)) ||
      !sameIds(edited.map((p) => p.sourceId)))
    fail('Expected exactly four oil and two battery source IDs and overrides, no phantom variants');
  const sections = new Map(source.sections.map((s) => [s.id, s]));
  for (const [section, count] of [['oil', 4], ['batteries', 2]]) {
    const s = sections.get(section);
    if (!s || s.reportedCount !== count || s.discoveredCount !== count ||
        original.filter((p) => category(p).includes(section)).length !== count)
      fail('Original shop section count mismatch: ' + section);
  }
  const missingBatteryExclusion = !source.exclusions.some((e) => e.sectionId === 'batteries' &&
    e.evidenceUrl === 'https://www.kingtechturbines.com/product/850mah-9-9v-life-battery/27' &&
    /404|not found/i.test(e.reason));
  if (missingBatteryExclusion) fail('Missing source 404 exclusion for battery ID 27');
  const rowsById = new Map(rows.map((d) => [d.sourceId, d]));
  const sourceById = new Map(original.map((p) => [p.id, p]));
  for (const id of expectedIds) {
    const e = REQUIRED[id], p = sourceById.get(id), d = rowsById.get(id);
    if (!p || p.sourceTitle !== e.title || category(p).length !== 1 ||
        category(p)[0] !== e.section || p.sourceDiscovery !== 'category_listing' ||
        p.canonicalUrl !== p.evidenceUrls[0] ||
        !p.canonicalUrl.startsWith('https://www.kingtechturbines.com/product/'))
      { fail('Missing/altered original source identity: ' + id); continue; }
    if (!d || d.source.title !== p.sourceTitle || d.source.url !== p.canonicalUrl ||
        d.source.manufacturer !== p.manufacturer || d.source.status !== p.sourceStatus ||
        d.approval !== 'draft' || d.images.length || d.turboprop !== null || d.accessory !== null ||
        d.categoryId !== (e.section === 'oil' ? 'engine-oil' : 'batteries') ||
        d.itemType !== (e.section === 'oil' ? 'oil' : 'battery') ||
        d.slug !== (edits.records.find((edit) => edit.sourceId === id)?.slug))
      { fail('Staging/visibility/identity error: ' + id); continue; }
    if (!enoughCopy(d.copy?.en) || !enoughCopy(d.copy?.ro) ||
        d.copy.en.description === d.copy.ro.description)
      fail('Incomplete or non-distinct EN/RO original copy: ' + id);
    const metadata = d.oil ?? d.battery;
    if (!metadata || metadata.sourceUrl !== p.canonicalUrl ||
        metadata.artBriefId !== id || !evidence.includes('### ' + id + ' —') ||
        !Array.isArray(metadata.sourceNotes) || metadata.sourceNotes.length < 1)
      fail('Missing source notes or unique artwork direction: ' + id);
    if (e.section === 'oil') {
      if (d.battery !== null || !d.oil || d.specs.length ||
          d.oil.volume.sourceLabel !== e.volume || d.oil.packQuantity !== null ||
          d.oil.intendedUse !== 'turbine_engine_oil' ||
          d.oil.blend !== (id === 'kt-122' ? 'red_dyed_special_blend' : 'special_blend'))
        fail('Oil product/pack/colour identity changed: ' + id);
    } else if (d.oil !== null || !d.battery ||
        d.battery.capacity.value !== e.capacity || d.battery.voltage.value !== 9.9 ||
        d.battery.cellCount !== null || d.battery.connector !== null ||
        d.battery.compatibleApplications.length !== 0 ||
        d.specs.length !== 2)
      fail('Battery chemistry/capacity or unsourced connector/fitment: ' + id);
  }
  if (selected.some((d) => !d.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) ||
      !unique(selected.map((d) => d.slug)))
    fail('Consumables slugs are not unique or valid');
  for (const locale of ['en', 'ro']) {
    if (!unique(selected.map((d) => d.copy?.[locale]?.description)))
      fail('Duplicate ' + locale + ' copy in consumables');
  }
  const table = evidence.split(header)[1]?.split('\n\n')[0] ?? '';
  const actual = table.split('\n').filter((line) => line.startsWith('| kt-'));
  const expected = original.map((p) => sourceRow(p, rowsById.get(p.id))).filter(Boolean);
  if (actual.length !== 6 || expected.length !== 6 ||
      actual.some((line, i) => line !== expected[i]))
    fail('Evidence ledger does not preserve six exact source/variant rows');
  if (!evidence.includes('## Source limitations') || !evidence.includes('## Approval and validation'))
    fail('Evidence limitations and approval notes missing');
  return errors;
}
const errors = [
  ...validateReferenceDrafts(inventory, overrides, drafts),
  ...check(inventory, drafts, overrides, ledger),
];

if (process.argv.includes('--self-test')) {
  const expectRejected = (label, mutated) => {
    if (![...validateReferenceDrafts(inventory, overrides, mutated),
          ...check(inventory, mutated, overrides, ledger)].length)
      errors.push('Negative fixture escaped: ' + label);
  };
  const mutate = (id, f) => drafts.map((d) => d.sourceId === id ? f(d) : d);
  expectRejected('removed 32oz listing', drafts.filter((d) => d.sourceId !== 'kt-23'));
  expectRejected('invented pack count', mutate('kt-22', (d) => ({ ...d, oil: { ...d.oil, packQuantity: 2 } })));
  expectRejected('red dye variant collapse', mutate('kt-122', (d) => ({
    ...d, oil: { ...d.oil, blend: 'special_blend' },
  })));
  expectRejected('wrong battery capacity', mutate('kt-24', (d) => ({
    ...d, battery: { ...d.battery, capacity: { ...d.battery.capacity, value: 2100 } },
  })));
  expectRejected('unsupported battery connector', mutate('kt-25', (d) => ({
    ...d, battery: { ...d.battery, connector: 'XT60' },
  })));
  expectRejected('invented cell count', mutate('kt-24', (d) => ({
    ...d, battery: { ...d.battery, cellCount: 3 },
  })));
  expectRejected('fabricated fitment', mutate('kt-24', (d) => ({
    ...d, battery: { ...d.battery, compatibleApplications: ['K-100G5'] },
  })));
  expectRejected('unsourced spec unit', mutate('kt-25', (d) => ({
    ...d, specs: d.specs.map((s) => s.kind === 'voltage' ? { ...s, unit: 'mAh' } : s),
  })));
  expectRejected('approved phantom stock', mutate('kt-21', (d) => ({ ...d, approval: 'company_approved' })));
  const alteredLedger = ledger.replace(/(\| kt-23 \|[^\n]*)\n/, '');
  if (!check(inventory, drafts, overrides, alteredLedger).some((s) => s.includes('ledger')))
    errors.push('Negative fixture escaped: removed evidence row');
  const changedSource = structuredClone(inventory);
  changedSource.products.find((p) => p.id === 'kt-25').sourceTitle = '2100mAh-11.1V LIFE Battery';
  if (!check(changedSource, drafts, overrides, ledger).some((s) => s.includes('identity')))
    errors.push('Negative fixture escaped: altered source voltage');
  const wrongExclusion = structuredClone(inventory);
  wrongExclusion.exclusions = wrongExclusion.exclusions.filter((e) => e.sectionId !== 'batteries');
  if (!check(wrongExclusion, drafts, overrides, ledger).some((s) => s.includes('exclusion')))
    errors.push('Negative fixture escaped: lost 404 exclusion');
}
if (errors.length) {
  for (const error of errors) console.error('Consumables: ' + error);
  process.exitCode = 1;
} else {
  console.log('Consumables validated: 4 oil + 2 batteries; native source units; 6 EN/RO original drafts; no invented variants or publication' +
    (process.argv.includes('--self-test') ? '; negative fixtures passed' : '') + '.');
}

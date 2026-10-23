#!/usr/bin/env node
// Pure, offline guard. Only a separate on-demand audit accesses KingTech.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogCategories } from '../src/catalog/data.ts';

const KNOWN_SECTIONS = ['g5', 'g4', 'tp', 'discounted', 'warranty', 'oil', 'batteries', 'accessories', 'gift-card'];
const allowedMappings = new Set(catalogCategories.map((c) => c.id));
const allowedStatuses = new Set(['discontinued', 'industrial_only', 'out_of_stock', 'unknown', 'archived_or_missing']);
const noCommerce = new Set(['price', 'currency', 'stock', 'inventory', 'image', 'images', 'media', 'checkout', 'available']);
const expectedOrigin = 'https://www.kingtechturbines.com';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validSourceUrl(str, prefix = null) {
  if (typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.origin === expectedOrigin && url.protocol === 'https:' && !url.username && !url.password &&
      !url.search && !url.hash && (!prefix || url.pathname.startsWith(prefix));
  } catch { return false; }
}
function validate(doc) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['Invalid document'];
  if (doc.schemaVersion !== 1 || doc.sourceSite !== expectedOrigin || doc.purpose !== 'public_repo_reference_not_site_product' || doc.companyStockClaim !== false) {
    fail('Manifest must be review-only schemaVersion 1 and never claim BODICH stock');
  }
  if (!datePattern.test(doc.capturedAt || '') || Number.isNaN(Date.parse(doc.capturedAt + 'T00:00:00Z')) ||
      new Date(doc.capturedAt).toISOString?.() === 'INVALID') fail('Invalid capture date');
  if (!Array.isArray(doc.sections) || !Array.isArray(doc.products) || !Array.isArray(doc.exclusions) || !Array.isArray(doc.warnings)) {
    return [...problems, 'Manifest sections/products/exclusions/warnings must be arrays'];
  }
  const actualSections = doc.sections.map((s) => s.id);
  if (actualSections.length !== KNOWN_SECTIONS.length || new Set(actualSections).size !== KNOWN_SECTIONS.length ||
      KNOWN_SECTIONS.some((id) => !actualSections.includes(id))) fail('Manifest must inventory exactly the nine source sections');
  const ids = new Set(), urls = new Set(), numerics = new Set();
  for (const [idx, p] of doc.products.entries()) {
    const here = 'products[' + idx + ']';
    if (!p || typeof p !== 'object' || Array.isArray(p)) { fail(here + ' must be object'); continue; }
    const numeric = typeof p.sourceNumericId === 'string' && /^[0-9]+$/.test(p.sourceNumericId);
    const opaque = p.sourceNumericId === null && typeof p.sourceOpaqueId === 'string' && /^[A-Z0-9]{16,40}$/.test(p.sourceOpaqueId);
    const idPart = numeric ? p.sourceNumericId : p.sourceOpaqueId;
    if ((!numeric && !opaque) ||
        (numeric && p.sourceOpaqueId != null) ||
        p.id !== (numeric ? 'kt-' : 'kt-sq-') + idPart) fail(here + ' stable source ID is invalid');
    if (ids.has(p.id)) fail('Duplicate source ID ' + p.id);
    ids.add(p.id);
    if (!validSourceUrl(p.canonicalUrl, '/product/')) fail(here + ' has invalid canonical source URL');
    const match = (p.canonicalUrl || '').match(/\/product\/[^/]+\/([A-Za-z0-9]+)$/);
    if (!match || match[1] !== idPart) fail(here + ' canonical source ID mismatch');
    if (urls.has(p.canonicalUrl)) fail('Duplicate canonical URL ' + p.canonicalUrl);
    urls.add(p.canonicalUrl);
    if (numerics.has(idPart)) fail('Duplicate source product identifier ' + idPart);
    numerics.add(idPart);
    if (!['category_listing', 'direct_verified_unlisted'].includes(p.sourceDiscovery)) fail(here + ' invalid discovery provenance');
    if (p.sourceTitle !== null && (typeof p.sourceTitle !== 'string' || !p.sourceTitle.trim())) fail(here + ' title invalid');
    if (p.manufacturer !== null && (typeof p.manufacturer !== 'string' || !p.manufacturer.trim())) fail(here + ' manufacturer invalid');
    if (!allowedStatuses.has(p.sourceStatus)) fail(here + ' unknown status');
    if (p.possibleVariants !== null && !Array.isArray(p.possibleVariants)) fail(here + ' variants must be array or null');
    if (!['low', 'medium', 'high'].includes(p.confidence)) fail(here + ' invalid confidence');
    if (p.reviewStatus !== 'needs_human_review') fail(here + ' must remain review-only');
    if (!['provisional', 'unmapped'].includes(p.mappingStatus)) fail(here + ' invalid mapping state');
    if (p.mappedCategoryId !== null && !allowedMappings.has(p.mappedCategoryId)) fail(here + ' references unknown BODICH taxonomy');
    if ((p.mappedCategoryId === null) !== (p.mappingStatus === 'unmapped')) fail(here + ' mapping state inconsistent');
    if (p.capturedAt !== doc.capturedAt) fail(here + ' capturedAt inconsistent');
    if (!/^http_(200|[0-9]{1,3})$|^not_checked$/.test(p.urlCheck || '')) fail(here + ' URL check invalid');
    if (!Array.isArray(p.sourceCategoryIds) || !p.sourceCategoryIds.length ||
        p.sourceCategoryIds.some((id) => !KNOWN_SECTIONS.includes(id)) ||
        new Set(p.sourceCategoryIds).size !== p.sourceCategoryIds.length) fail(here + ' invalid source taxonomy links');
    if (!Array.isArray(p.evidenceUrls) || !p.evidenceUrls.length ||
        !p.evidenceUrls.includes(p.canonicalUrl) || p.evidenceUrls.some((u) => !validSourceUrl(u)))
      fail(here + ' evidence URLs are missing/invalid');
    if (!Array.isArray(p.subcategoryUrls) || p.subcategoryUrls.some((u) => !validSourceUrl(u, '/shop/')))
      fail(here + ' invalid subcategories');
    if (p.sourceDiscovery === 'direct_verified_unlisted' && p.subcategoryUrls?.length)
      fail(here + ' unlisted direct product cannot claim a category listing');
    if (Object.keys(p).some((k) => noCommerce.has(k.toLowerCase()))) fail(here + ' contains public commerce fields');
  }
  for (const section of doc.sections) {
    if (!KNOWN_SECTIONS.includes(section.id)) fail('Unexpected section ' + section.id);
    if (!validSourceUrl(section.url)) fail('Invalid section URL ' + section.id);
    if (!['matched', 'incomplete', 'manual_review_required', 'external_service_documented'].includes(section.status)) fail('Invalid section status ' + section.id);
    if (section.reportedCount !== null && (!Number.isSafeInteger(section.reportedCount) || section.reportedCount < 0))
      fail('Invalid measured source count ' + section.id);
    const actual = doc.products.filter((p) => p.sourceCategoryIds?.includes(section.id));
    if (actual.length !== section.discoveredCount) fail('Category discovered count mismatch: ' + section.id);
    const cross = actual.filter((p) => p.sourceCategoryIds.length > 1).length;
    if (cross !== section.crossListedCount) fail('Category cross-listed count mismatch: ' + section.id);
    if (!Array.isArray(section.subcategories)) fail('Missing subcategories for ' + section.id);
    if (section.status === 'matched' && section.reportedCount === null) fail('Cannot call an unmeasured section matched: ' + section.id);
    if (section.id === 'gift-card' &&
        (section.status !== 'external_service_documented' || section.reportedCount !== null ||
          section.discoveredCount !== 0 || section.externalDestinationUrl !== 'https://app.squareup.com/gift/CA5XP82NMZYB7/order'))
      fail('Gift Card must be documented as a separate external digital checkout');
    if (section.id === 'accessories' &&
        section.subcategories?.reduce((n, sub) => n + sub.discoveredCount, 0) + (section.directOnlyCount || 0) !== section.discoveredCount)
      fail('Accessory listing plus direct-only reference counts disagree');
    if (section.id === 'accessories' && section.status === 'matched' &&
        section.subcategories?.some((sub) => sub.status !== 'matched' || sub.reportedCount !== sub.discoveredCount))
      fail('Incomplete child-category listings cannot be marked matched');
    if (section.status === 'matched' && section.id !== 'accessories' && section.reportedCount !== section.discoveredCount)
      fail('Section count does not match source: ' + section.id);
  }
  for (const exclusion of doc.exclusions) {
    if (exclusion.sectionId === 'gift-card' && exclusion.externalDestinationUrl !== 'https://app.squareup.com/gift/CA5XP82NMZYB7/order')
      fail('Gift card exclusion must name the observed Square checkout');
    if (!validSourceUrl(exclusion.evidenceUrl) || typeof exclusion.reason !== 'string' || !exclusion.reason.trim())
      fail('Exclusion must have source evidence and reason');
  }
  return problems;
}
// The only accepted removal evidence is an exclusion already present in the
// previously committed manifest; one newly emitted by the crawler cannot
// excuse a regression it just introduced.
function continuityProblems(previous, current) {
  const oldIds = new Set((previous.products || []).map((p) => p.id));
  const newIds = new Set((current.products || []).map((p) => p.id));
  const previouslyExcluded = new Set((previous.exclusions || []).flatMap((entry) => {
    if (!validSourceUrl(entry.evidenceUrl, '/product/')) return [];
    const match = entry.evidenceUrl.match(/\/product\/[^/]+\/([A-Za-z0-9]+)$/);
    if (!match || !entry.reason?.trim()) return [];
    return [( /^[0-9]+$/.test(match[1]) ? 'kt-' : 'kt-sq-') + match[1]];
  }));
  const lost = [...oldIds].filter((id) => !newIds.has(id) && !previouslyExcluded.has(id));
  return lost.length ? ['Previously catalogued source IDs disappeared without a pre-existing documented exclusion: ' + lost.join(', ')] : [];
}
const file = resolve('docs/catalog/source-inventory.json');
let doc;
try { doc = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error('Source inventory missing or invalid: ' + e.message); process.exit(1); }
const errors = validate(doc);
const previousPath = process.argv.find((arg) => arg.startsWith('--compare='));
if (previousPath) {
  try {
    const previous = JSON.parse(readFileSync(resolve(previousPath.slice('--compare='.length)), 'utf8'));
    errors.push(...validate(previous).map((e) => 'Previous inventory invalid: ' + e));
    errors.push(...continuityProblems(previous, doc));
  } catch (error) {
    errors.push('Cannot check previous inventory: ' + error.message);
  }
}
if (process.argv.includes('--self-test')) {
  const clone = () => structuredClone(doc);
  if (doc.products.length === 0) errors.push('Self-test requires at least one reference product');
  else {
    const cases = [
      (d) => d.products.push(structuredClone(d.products[0])),
      (d) => d.products[0].canonicalUrl = 'https://example.com/evil',
      (d) => d.products[0].sourceCategoryIds = ['unknown-category'],
      (d) => d.products[0].mappedCategoryId = 'not-a-BODICH-category',
      (d) => d.sections[0].discoveredCount++,
      (d) => d.products[0].price = 500,
      (d) => { const p = d.products.find((p) => p.sourceOpaqueId); if (p) p.sourceOpaqueId = 'INVALID'; },
      (d) => { const p = d.products.find((p) => p.sourceDiscovery === 'direct_verified_unlisted'); if (p) p.subcategoryUrls.push('https://www.kingtechturbines.com/shop/pump/12'); },
    ];
    for (const test of cases) {
      const copy = clone();
      test(copy);
      if (validate(copy).length === 0) errors.push('Negative fixture was accepted');
    }
    const before = clone(), after = clone();
    const removed = after.products.shift();
    const newRef = structuredClone(removed);
    newRef.sourceNumericId = String(Number(removed.sourceNumericId) + 100000);
    newRef.id = 'kt-' + newRef.sourceNumericId;
    newRef.canonicalUrl = removed.canonicalUrl.replace(/\/[0-9]+$/, '/' + newRef.sourceNumericId);
    newRef.evidenceUrls = removed.evidenceUrls.map((url) => url === removed.canonicalUrl ? newRef.canonicalUrl : url);
    after.products.push(newRef);
    if (after.products.length !== before.products.length || continuityProblems(before, after).length === 0)
      errors.push('Equal-volume source ID substitution bypassed regression guard');
    before.exclusions.push({ sectionId: removed.sourceCategoryIds[0],
      evidenceUrl: removed.canonicalUrl, reason: 'Manually approved absence from source', count: 1 });
    if (continuityProblems(before, after).length !== 0)
      errors.push('Pre-existing manual exclusion was rejected');
  }
}
if (errors.length) {
  for (const error of errors) console.error('Source inventory: ' + error);
  process.exitCode = 1;
} else {
  console.log('Source inventory validated: ' + doc.products.length + ' unique review-only references; ' + doc.sections.length + ' source sections' + (process.argv.includes('--self-test') ? '; negative fixtures passed' : '') + '.');
}

#!/usr/bin/env node
// Pure, offline guard. Only a separate on-demand audit accesses KingTech.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { catalogCategories } from '../src/catalog/data.ts';
import { buildReferenceDrafts, validateReferenceDrafts, referenceTaxonomy } from '../src/catalog/reference.ts';

const KNOWN_SECTIONS = ['g5', 'g4', 'tp', 'discounted', 'warranty', 'oil', 'batteries', 'accessories', 'gift-card'];
const allowedMappings = new Set(catalogCategories.map((c) => c.id));
const allowedStatuses = new Set(['discontinued', 'industrial_only', 'out_of_stock', 'unknown', 'archived_or_missing']);
const noCommerce = new Set(['price', 'currency', 'stock', 'inventory', 'image', 'images', 'media', 'checkout', 'available']);
const expectedOrigin = 'https://www.kingtechturbines.com';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Prevent accidental publication via importing the research module or source
 * manifests into Astro components, pages, layouts or runtime catalog modules.
 * The offline validator lives in scripts/, so it may import the draft schema.
 */
function unsafeReferenceImports(source, importer) {
  const restricted = [];
  const sourceRef = resolve('src/catalog/reference');
  const moduleSpecifiers = /\b(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"`]([^'"`]+)['"`]/g;
  for (const match of source.matchAll(moduleSpecifiers)) {
    const specifier = match[1].split(/[?#]/, 1)[0].replace(/\\/g, '/');
    const withoutExtension = specifier.replace(/\.(?:m?js|cjs|tsx?|json)$/, '');
    const absoluteTarget = specifier.startsWith('.') ? resolve(dirname(importer), withoutExtension) : '';
    if (absoluteTarget === sourceRef ||
        /(?:^|\/)catalog\/reference$/.test(withoutExtension) ||
        /(?:^|\/)(?:source-inventory|reference-overrides)(?:\.json)?$/.test(specifier)) {
      restricted.push(specifier);
    }
  }
  return restricted;
}
function checkRuntimeImportBoundary(root = resolve('src')) {
  const violations = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(filename);
      } else if (!entry.isFile()) {
        violations.push('Unsupported file type under src/: ' + filename);
      } else if (/\.(?:astro|[cm]?js|jsx|tsx?)$/.test(entry.name)) {
        for (const imported of unsafeReferenceImports(readFileSync(filename, 'utf8'), filename)) {
          violations.push('Runtime module ' + filename + ' imports unpublished research data: ' + imported);
        }
      }
    }
  };
  walk(root);
  return violations;
}

function validSourceUrl(str, prefix = null) {
  if (typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.origin === expectedOrigin && url.protocol === 'https:' && !url.username && !url.password &&
      !url.search && !url.hash && (!prefix || url.pathname.startsWith(prefix));
  } catch { return false; }
}
function validCountEvidence(evidence, count) {
  if (evidence === null) return count === null;
  if (!evidence || typeof evidence !== 'object' || typeof evidence.text !== 'string') return false;
  if (evidence.kind === 'result_label') {
    const match = evidence.text.match(/^([0-9][0-9,]*)\s+results?$/i);
    return !!match && Number(match[1].replaceAll(',', '')) === count;
  }
  if (evidence.kind === 'explicit_empty_message') {
    return count === 0 && /^(items aren't available|items are not available|no items available|no products available|nothing found)$/i.test(evidence.text);
  }
  return false;
}
function validate(doc) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['Invalid document'];
  if (doc.schemaVersion !== 1 || doc.sourceSite !== expectedOrigin || doc.purpose !== 'public_repo_reference_not_site_product' || doc.companyStockClaim !== false) {
    fail('Manifest must be review-only schemaVersion 1 and never claim BODICH stock');
  }
  if (!datePattern.test(doc.capturedAt || '') || Number.isNaN(Date.parse(doc.capturedAt + 'T00:00:00Z'))) fail('Invalid capture date');
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
    if ('countEvidence' in section && !validCountEvidence(section.countEvidence, section.reportedCount))
      fail('Invalid count evidence for section ' + section.id);
    for (const sub of section.subcategories || []) {
      if ('countEvidence' in sub && !validCountEvidence(sub.countEvidence, sub.reportedCount))
        fail('Invalid count evidence for subcategory ' + sub.url);
    }
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

/**
 * Issue #27: enforce complete unpublished editorial coverage for every real G5
 * source item, including discontinued and industrial-only references.
 * Other source sections may remain at the unedited research stage.
 */
function g5DraftProblems(inventory, drafts) {
  const errors = [];
  const sourceG5 = inventory.products.filter((p) => p.sourceCategoryIds.includes('g5'));
  const byId = new Map(drafts.map((p) => [p.sourceId, p]));
  const drafted = drafts.filter((p) => p.categoryId === 'g5');
  if (sourceG5.length !== drafted.length)
    errors.push('G5 draft count differs from unique G5 source inventory');
  for (const source of sourceG5) {
    const d = byId.get(source.id);
    if (!d || d.categoryId !== 'g5') {
      errors.push('Missing G5 reference draft: ' + source.id);
      continue;
    }
    // A G5 editorial record is expected at least to be a draft. Future tasks
    // #33–#35 may legitimately add rights-reviewed draft images and advance
    // approval; publication stays gated by confirmedProducts, not this file.
    if (d.approval === 'research') errors.push('Unedited G5 reference: ' + source.id);
    if (!d.model?.trim() || !d.slug.startsWith('kingtech-') || d.source.manufacturer !== 'KingTech')
      errors.push('Unmapped G5 model identity: ' + source.id);
    for (const locale of ['en', 'ro']) {
      const copy = d.copy?.[locale];
      if (!copy || ![copy.name, copy.summary, copy.description].every(
        (s) => typeof s === 'string' && s.trim().length >= 25
      )) errors.push('Incomplete G5 ' + locale + ' draft copy: ' + source.id);
    }
    // GCC and Luxembourg sources disagree on K-180G5 EGT (700 vs 750 °C).
    // Until a signed manufacturer decision is documented and this guard is
    // deliberately revised, a new temperature number would be misleading.
    if (source.id === 'kt-131' && d.specs.some((s) => s.kind === 'temperature'))
      errors.push('Conflicting K-180G5 EGT must remain unrecorded: ' + source.id);
    const kinds = new Set(d.specs.map((s) => s.kind));
    for (const kind of ['thrust', 'mass', 'speed', 'fuel_consumption', 'dimension']) {
      if (!kinds.has(kind)) errors.push('Missing G5 technical kind ' + kind + ': ' + source.id);
    }
    for (const metric of ['diameter', 'length']) {
      if (!d.specs.some((s) => s.kind === 'dimension' && s.metric === metric))
        errors.push('Missing G5 dimension ' + metric + ': ' + source.id);
    }
    if (source.sourceStatus === 'discontinued' &&
        (!/discontinued/i.test(d.copy.en?.name || '') || !/retras/i.test(d.copy.ro?.name || '')))
      errors.push('Historical discontinued status is not labelled in G5 copy: ' + source.id);
    if (source.sourceStatus === 'industrial_only' &&
        (!/industrial/i.test(d.copy.en?.name || '') || !/industriale/i.test(d.copy.ro?.name || '')))
      errors.push('Industrial-only restriction is not labelled in G5 copy: ' + source.id);
  }
  return errors;
}


/**
 * Issue #28: every inventoried G4+ engine must have a separate, unpublished
 * bilingual reference, even when the model has vanished from featured listings.
 * Do not turn incomplete or disputed supplier numbers into precise spec fields.
 */
function g4DraftProblems(inventory, drafts) {
  const errors = [];
  const sourceG4 = inventory.products.filter((p) => p.sourceCategoryIds.includes('g4'));
  const grouped = drafts.filter((d) => d.categoryId === 'g4-plus');
  if (sourceG4.length !== grouped.length)
    errors.push('G4+ category coverage differs from unique G4 source inventory');
  const byId = new Map(drafts.map((d) => [d.sourceId, d]));
  for (const source of sourceG4) {
    const d = byId.get(source.id);
    if (!d || d.categoryId !== 'g4-plus') {
      errors.push('Missing G4+ reference draft: ' + source.id);
      continue;
    }
    const nameModel = source.sourceTitle?.match(/K-(\d+)G4\+/i);
    const expectedModel = nameModel ? 'K-' + nameModel[1] + 'G4+' : null;
    const expectedSlug = nameModel ? 'kingtech-k-' + nameModel[1] + 'g4-plus' : null;
    if (!expectedModel || d.model !== expectedModel || d.slug !== expectedSlug ||
        d.source.manufacturer !== 'KingTech' || d.itemType !== 'turbojet' ||
        d.source.url !== source.canonicalUrl)
      errors.push('Incorrect G4+ model identity/category: ' + source.id);
    if (d.approval === 'research')
      errors.push('Unedited G4+ reference: ' + source.id);
    for (const locale of ['en', 'ro']) {
      const copy = d.copy?.[locale];
      if (!copy || ![copy.name, copy.summary, copy.description].every(
        (s) => typeof s === 'string' && s.replace(/\s+/g, ' ').trim().length >= 25
      )) errors.push('Incomplete G4+ ' + locale + ' draft copy: ' + source.id);
    }
    const kinds = new Set(d.specs.map((s) => s.kind));
    for (const kind of ['mass', 'speed', 'fuel_consumption', 'dimension']) {
      if (!kinds.has(kind)) errors.push('Missing G4+ technical kind ' + kind + ': ' + source.id);
    }
    // The K-30 source gives "3kg+" and no exact nominal thrust.
    if (source.id !== 'kt-1' && !kinds.has('thrust'))
      errors.push('Missing G4+ technical kind thrust: ' + source.id);
    if (source.id === 'kt-1' && kinds.has('thrust'))
      errors.push('Inexact K-30G4+ thrust must not be stored as nominal: ' + source.id);
    for (const metric of ['diameter', 'length']) {
      if (!d.specs.some((s) => s.kind === 'dimension' && s.metric === metric))
        errors.push('Missing G4+ dimension ' + metric + ': ' + source.id);
    }
    // K-142 and K-320 conflicting EGT values across distributors.
    if (['kt-9', 'kt-15'].includes(source.id) && kinds.has('temperature'))
      errors.push('Conflicting G4+ EGT must remain unset: ' + source.id);
    if (source.sourceStatus === 'discontinued' &&
        (!/discontinued/i.test(d.copy?.en?.name || '') ||
         !/retras/i.test(d.copy?.ro?.name || '')))
      errors.push('G4+ discontinued status missing in bilingual names: ' + source.id);
    if (source.sourceStatus === 'industrial_only' &&
        (!/industrial/i.test(d.copy?.en?.name || '') ||
         !/industriale/i.test(d.copy?.ro?.name || '')))
      errors.push('G4+ industrial restriction missing in bilingual names: ' + source.id);
  }
  return errors;
}

const errors = validate(doc);
errors.push(...checkRuntimeImportBoundary());
// The source manifest and editorial overlays stay outside public/ and are never
// imported by the website. Check the derived draft collection alongside source
// continuity; only src/catalog/data.ts's confirmedProducts is publishable.
let draftOverrides;
let drafts;
try {
  draftOverrides = JSON.parse(readFileSync(resolve('docs/catalog/reference-overrides.json'), 'utf8'));
  drafts = buildReferenceDrafts(doc, draftOverrides);
  errors.push(...validateReferenceDrafts(doc, draftOverrides, drafts).map((e) => 'Reference drafts: ' + e));
  errors.push(...g5DraftProblems(doc, drafts).map((e) => 'G5 coverage: ' + e));
  errors.push(...g4DraftProblems(doc, drafts).map((e) => 'G4+ coverage: ' + e));
} catch (error) {
  errors.push('Cannot derive unpublished reference catalog: ' + error.message);
}
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
  // Check every catalog item type, including a synthetic digital-service
  // example (the live Gift Card has no source /product row). Do not fabricate
  // digital or promotional rows in the persisted 132-item inventory.
  if (drafts && draftOverrides) {
    const emptyEdits = { schemaVersion: 1, records: [] };
    const casesBySection = {
      g5: 'turbojet', g4: 'turbojet', tp: 'turboprop',
      accessories: 'accessory', oil: 'oil', batteries: 'battery',
      warranty: 'service', 'gift-card': 'digital',
    };
    for (const [section, type] of Object.entries(casesBySection)) {
      const sample = { ...doc.products[0], id: 'fixture-' + section, sourceCategoryIds: [section] };
      const actual = buildReferenceDrafts({ products: [sample] }, emptyEdits)[0];
      if (actual.itemType !== type || actual.categoryId !== referenceTaxonomy[section].category)
        errors.push('Reference taxonomy classification failed: ' + section);
    }
    const tagged = { ...doc.products[0], id: 'fixture-discounted', sourceCategoryIds: ['g5', 'discounted'] };
    const grouped = buildReferenceDrafts({ products: [tagged] }, emptyEdits)[0];
    if (grouped.itemType !== 'turbojet' || grouped.collectionTags.length !== 1 ||
        grouped.collectionTags[0] !== 'discounted')
      errors.push('Discount category duplicated a SKU instead of tagging it');
    const one = doc.products[0];
    const two = doc.products[1];
    const localized = {
      en: { name: 'Verified English name', summary: 'Original summary', description: 'Original technical description' },
      ro: { name: 'Denumire în română', summary: 'Rezumat original', description: 'Descriere tehnică originală' },
    };
    const candidate = (records) => ({ schemaVersion: 1, records });
    const goodEdit = { sourceId: one.id, slug: 'sample-reviewed-model',
      approval: 'editorial_review', copy: localized,
      specs: [{ kind: 'thrust', value: 100, unit: 'N',
        sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt },
        { kind: 'dimension', metric: 'diameter', value: 101, unit: 'mm',
          sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt },
        { kind: 'fuel_consumption', value: 220, unit: 'g/min',
          sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] };
    const accepted = candidate([goodEdit]);
    if (validateReferenceDrafts(doc, accepted, buildReferenceDrafts(doc, accepted)).length)
      errors.push('Valid localized/provenanced editorial overlay was rejected');
    // Every kind of invalid source metadata or editorial approval must remain rejected.
    // The path is normalized to lowercase for opaque Square source IDs.
    const safeImagePath = 'docs/catalog/draft-assets/' + one.id.toLowerCase() + '/front.webp';
    const sampleImage = (edit = {}) => ({
      path: safeImagePath, kind: 'original_concept', rights: 'pending',
      alt: { en: 'Concept illustration', ro: 'Ilustrație conceptuală' },
      width: 1200, height: 900, ...edit,
    });
    const pendingDraft = candidate([{ sourceId: one.id, approval: 'draft',
      images: [sampleImage()] }]);
    if (validateReferenceDrafts(doc, pendingDraft, buildReferenceDrafts(doc, pendingDraft)).length)
      errors.push('Valid source-ID-scoped unpublished image was rejected');
    const badOverlays = [
      candidate([{ sourceId: one.id, slug: 'Broken_UPPERCASE' }]),
      candidate([{ sourceId: one.id, approval: 'published' }]),
      candidate([{ sourceId: one.id, model: '  ' }]),
      candidate([{ sourceId: one.id, approval: 'company_approved',
        copy: { en: localized.en, ro: null } }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'thrust', value: 0, unit: 'N',
        sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'thrust', value: 1, unit: 'N',
        sourceUrl: one.canonicalUrl.replace('https:', 'http:'), verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'thrust', value: 1, unit: 'N',
        sourceUrl: one.canonicalUrl, verifiedOn: '2026-99-99' }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'thrust', value: 1, unit: 'N',
        sourceUrl: one.canonicalUrl, verifiedOn: '2999-01-01' }] }]),
      candidate([{ sourceId: one.id, images: [sampleImage({
        path: 'docs/catalog/draft-assets/wrong-product/front.webp' })] }]),
      candidate([{ sourceId: one.id, images: [sampleImage({
        alt: { en: 'Only English' } })] }]),
      candidate([{ sourceId: one.id, images: [sampleImage({ width: 1200.5 })] }]),
      candidate([{ sourceId: 'kt-not-in-source' }]),
      candidate([{ sourceId: one.id, unexpectedStock: 10 }]),
      candidate([{ sourceId: one.id }, { sourceId: one.id }]),
      candidate([{ sourceId: one.id, slug: 'same-slug' }, { sourceId: two.id, slug: 'same-slug' }]),
      candidate([{ sourceId: one.id, copy: { en: localized.en } }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'thrust', value: 100,
        unit: 'miles', sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'dimension', value: 100, unit: 'mm',
        sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'dimension', metric: 'height',
        value: 100, unit: 'mm', sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'thrust', metric: 'length',
        value: 10, unit: 'kgf', sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, specs: [{ kind: 'fuel_consumption', value: 220,
        unit: 'kg/h', sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt }] }]),
      candidate([{ sourceId: one.id, images: [{ path: '/images/catalog/unsafe.webp',
        kind: 'original_concept', rights: 'cleared', alt: { en: 'Render', ro: 'Randare' },
        width: 1000, height: 1000 }] }]),
      candidate([{ sourceId: one.id, approval: 'company_approved', copy: localized,
        images: [{ path: safeImagePath,
          kind: 'original_concept', rights: 'pending', alt: { en: 'Concept', ro: 'Concept' },
          width: 1000, height: 1000 }] }]),
    ];
    for (const invalid of badOverlays) {
      const derived = buildReferenceDrafts(doc, invalid);
      if (!validateReferenceDrafts(doc, invalid, derived).length)
        errors.push('Reference negative fixture was accepted: ' + invalid.records[0].sourceId);
    }
    if (!validateReferenceDrafts(doc, draftOverrides, drafts.slice(1)).length)
      errors.push('Partial reference catalog bypassed 100% coverage guard');
    if (!g5DraftProblems(doc, drafts.filter((d) => d.sourceId !== 'kt-126')).length)
      errors.push('Partial G5 editorial coverage bypassed source-ID count check');
    const damagedCopy = drafts.map((d) => d.sourceId === 'kt-127' ?
      { ...d, copy: { ...d.copy, ro: null } } : d);
    if (!g5DraftProblems(doc, damagedCopy).length)
      errors.push('Missing Romanian G5 copy bypassed validation');
    const insufficientText = drafts.map((d) => d.sourceId === 'kt-127' ? {
      ...d, copy: {
        ...d.copy, en: { ...d.copy.en, description: 'KingTech' },
      },
    } : d);
    if (!g5DraftProblems(doc, insufficientText).some((e) => e.includes('Incomplete G5 en draft copy')))
      errors.push('Short KingTech-only G5 text bypassed minimum-length guard');
    const paddedText = drafts.map((d) => d.sourceId === 'kt-127' ? {
      ...d, copy: {
        ...d.copy, ro: { ...d.copy.ro, summary: 'KingTech' + ' '.repeat(40) },
      },
    } : d);
    if (!g5DraftProblems(doc, paddedText).some((e) => e.includes('Incomplete G5 ro draft copy')))
      errors.push('Whitespace-padded G5 translation bypassed minimum-length guard');
    const disputedEgt = drafts.map((d) => d.sourceId === 'kt-131' ? {
      ...d, specs: [...d.specs, {
        kind: 'temperature', value: 700, unit: '°C',
        sourceUrl: d.source.url, verifiedOn: doc.capturedAt,
      }],
    } : d);
    if (!g5DraftProblems(doc, disputedEgt).some((e) => e.includes('Conflicting K-180G5 EGT')))
      errors.push('Disputed K-180G5 EGT bypassed regression guard');

    // Representative G4+ category, archived, industrial-only and conflicting
    // evidence fixtures; all must stay unpublished and source-ID scoped.
    const g4Items = drafts.filter((d) => d.categoryId === 'g4-plus');
    if (g4Items.length !== doc.products.filter((p) => p.sourceCategoryIds.includes('g4')).length ||
        g4Items.some((d) => d.itemType !== 'turbojet' || d.approval === 'research'))
      errors.push('G4+ grouped reference category lost staged product cards');
    if (!g4DraftProblems(doc, drafts.filter((d) => d.sourceId !== 'kt-2'))
        .some((e) => e.includes('Missing G4+ reference')))
      errors.push('Missing archived G4+ reference bypassed parity guard');
    const damagedG4Copy = drafts.map((d) => d.sourceId === 'kt-7' ? {
      ...d, copy: { ...d.copy, ro: { ...d.copy.ro, description: 'KingTech' } },
    } : d);
    if (!g4DraftProblems(doc, damagedG4Copy).some((e) => e.includes('Incomplete G4+ ro')))
      errors.push('Short Romanian G4+ copy bypassed completeness guard');
    const brokenG4Status = drafts.map((d) => d.sourceId === 'kt-120' ? {
      ...d, copy: { ...d.copy, en: {
        ...d.copy.en, name: 'KingTech K-86G4+ — G4+ turbine reference',
      } },
    } : d);
    if (!g4DraftProblems(doc, brokenG4Status).some((e) => e.includes('discontinued status')))
      errors.push('Archived G4+ status lost without a failing regression');
    const brokenIndustrialStatus = drafts.map((d) => d.sourceId === 'kt-16' ? {
      ...d, copy: { ...d.copy, ro: {
        ...d.copy.ro, name: 'KingTech K-450G4+ — fișă de referință G4+',
      } },
    } : d);
    if (!g4DraftProblems(doc, brokenIndustrialStatus).some((e) => e.includes('industrial restriction')))
      errors.push('Industrial-only G4+ restriction lost without a failing regression');
    const fictionalG4Thrust = drafts.map((d) => d.sourceId === 'kt-1' ? {
      ...d, specs: [...d.specs, { kind: 'thrust', value: 3, unit: 'kgf',
        sourceUrl: d.source.url, verifiedOn: doc.capturedAt }],
    } : d);
    if (!g4DraftProblems(doc, fictionalG4Thrust).some((e) => e.includes('Inexact K-30G4+')))
      errors.push('Ambiguous archived G4+ thrust was accepted as exact');
    for (const disputedId of ['kt-9', 'kt-15']) {
      const disputedG4Temp = drafts.map((d) => d.sourceId === disputedId ? {
        ...d, specs: [...d.specs, { kind: 'temperature', value: 700, unit: '°C',
          sourceUrl: d.source.url, verifiedOn: doc.capturedAt }],
      } : d);
      if (!g4DraftProblems(doc, disputedG4Temp).some((e) => e.includes('Conflicting G4+ EGT')))
        errors.push('Disputed G4+ EGT bypassed regression guard: ' + disputedId);
    }

    const importer = resolve('src/catalog/index.ts');
    const forbidden = [
      "export * from './reference';",
      "import('./reference.ts')",
      "import '../../docs/catalog/source-inventory.json'",
      "const source = require('../../docs/catalog/reference-overrides.json')",
    ];
    for (const example of forbidden) {
      if (!unsafeReferenceImports(example, importer).length)
        errors.push('Runtime import boundary fixture was not detected: ' + example);
    }
    if (unsafeReferenceImports("export { confirmedProducts } from './data';", importer).length)
      errors.push('Runtime import boundary rejected a safe public catalog import');
    try {
      buildReferenceDrafts({ products: [{ ...one, sourceCategoryIds: ['discounted'] }] }, emptyEdits);
      errors.push('Discount-only source invented a product taxonomy');
    } catch { /* correct */ }
  }
  const clone = () => structuredClone(doc);
  if (doc.products.length === 0) errors.push('Self-test requires at least one reference product');
  else {
    const cases = [
      (d) => d.products.push(structuredClone(d.products[0])),
      (d) => d.products[0].canonicalUrl = 'https://example.com/evil',
      (d) => d.products[0].sourceCategoryIds = ['unknown-category'],
      (d) => d.products[0].mappedCategoryId = 'not-a-BODICH-category',
      (d) => d.sections[0].discoveredCount++,
      (d) => { d.sections[0].countEvidence = { kind: 'result_label', text: '999 Results' }; },
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
  console.log('Source inventory validated: ' + doc.products.length + ' unique review-only references; ' + doc.sections.length + ' source sections; ' + (drafts?.length ?? 0) + ' unpublished draft mappings' + (process.argv.includes('--self-test') ? '; negative fixtures passed' : '') + '.');
}

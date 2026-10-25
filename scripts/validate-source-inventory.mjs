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
        /(?:^|\/)(?:source-inventory|reference-overrides|g4-withheld-specs)(?:\.json)?$/.test(specifier)) {
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
let g4Withheld;
try {
  g4Withheld = JSON.parse(readFileSync(resolve('docs/catalog/g4-withheld-specs.json'), 'utf8'));
} catch (error) {
  console.error('G4+ quarantine file missing or invalid: ' + error.message);
  process.exit(1);
}

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
/**
 * A single review-controlled source for specs withheld from G4+.
 * Schema checking ensures an accidental typo cannot disable the quarantine.
 */
const g4AllowedFields = new Set([
  'thrust', 'mass', 'speed', 'temperature', 'fuel_consumption',
  'dimension:diameter', 'dimension:length',
]);
function g4QuarantineProblems(inventory, policy) {
  const errors = [];
  if (!policy || policy.schemaVersion !== 1 ||
      policy.purpose !== 'unpublished_g4_conflicting_specs_quarantine' ||
      !Array.isArray(policy.records) ||
      Object.keys(policy).some((k) => !['schemaVersion','purpose','records'].includes(k)))
    return ['Invalid G4+ quarantine policy schema'];
  const known = new Set(inventory.products.filter((p) => p.sourceCategoryIds.includes('g4')).map((p) => p.id));
  const ids = new Set();
  for (const record of policy.records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('Invalid G4+ quarantine entry');
      continue;
    }
    if (Object.keys(record).some((k) => !['sourceId','fields','reason','proseForbidden'].includes(k)) ||
        !record.proseForbidden || typeof record.proseForbidden !== 'object' ||
        Array.isArray(record.proseForbidden) ||
        Object.keys(record.proseForbidden).some((locale) => !['en','ro'].includes(locale)) ||
        !['en','ro'].every((locale) =>
          Array.isArray(record.proseForbidden?.[locale]) &&
          record.proseForbidden[locale].length > 0 &&
          record.proseForbidden[locale].every((token) =>
            typeof token === 'string' && token.trim().length >= 5 && token.trim() === token) &&
          new Set(record.proseForbidden[locale].map((token) => token.toLowerCase())).size ===
            record.proseForbidden[locale].length) ||
        !known.has(record.sourceId) || ids.has(record.sourceId) ||
        typeof record.reason !== 'string' || record.reason.trim().length < 25 ||
        !Array.isArray(record.fields) || record.fields.length === 0 ||
        record.fields.some((field) => !g4AllowedFields.has(field)) ||
        new Set(record.fields).size !== record.fields.length)
      errors.push('Invalid/duplicate G4+ quarantine entry: ' + record.sourceId);
    ids.add(record.sourceId);
  }
  return errors;
}
const g4SpecField = (spec) => spec.kind + (spec.kind === 'dimension' ? ':' + spec.metric : '');
function g4DraftProblems(inventory, drafts, policy = g4Withheld) {
  const errors = [];
  const sourceG4 = inventory.products.filter((p) => p.sourceCategoryIds.includes('g4'));
  const grouped = drafts.filter((d) => d.categoryId === 'g4-plus');
  if (sourceG4.length !== grouped.length)
    errors.push('G4+ category coverage differs from unique G4 source inventory');
  const statusCounts = Object.fromEntries(['discontinued','industrial_only','unknown'].map(
    (status) => [status, sourceG4.filter((p) => p.sourceStatus === status).length]));
  if (statusCounts.discontinued !== 7 || statusCounts.industrial_only !== 1 ||
      statusCounts.unknown !== 9)
    errors.push('G4+ source lifecycle distribution changed; reassess 7/1/9 claims');
  const byId = new Map(drafts.map((d) => [d.sourceId, d]));
  const quarantined = new Map(policy.records.map((entry) => [entry.sourceId, new Set(entry.fields)]));
  for (const source of sourceG4) {
    const d = byId.get(source.id);
    if (!d || d.categoryId !== 'g4-plus') {
      errors.push('Missing G4+ reference draft: ' + source.id);
      continue;
    }
    const sourceModel = source.sourceTitle?.match(/K-(\d+)G4\+/i);
    const expectedModel = sourceModel ? 'K-' + sourceModel[1] + 'G4+' : null;
    const expectedSlug = sourceModel ? 'kingtech-k-' + sourceModel[1] + 'g4-plus' : null;
    if (!expectedModel || d.model !== expectedModel || d.slug !== expectedSlug ||
        d.source.manufacturer !== 'KingTech' || d.itemType !== 'turbojet' ||
        d.source.url !== source.canonicalUrl)
      errors.push('Incorrect G4+ model identity/category: ' + source.id);
    // Tasks #33 (imagery), #34 (copy) and #35 (approvals) must explicitly
    // revise this intake-phase draft/no-image gate after separate company review.
    if (d.approval !== 'draft' || !Array.isArray(d.images) || d.images.length !== 0)
      errors.push('G4+ must remain unpublished draft with no images: ' + source.id);
    for (const locale of ['en','ro']) {
      const copy = d.copy?.[locale];
      if (!copy || ![copy.name,copy.summary,copy.description].every(
        (s) => typeof s === 'string' && s.replace(/\s+/g, ' ').trim().length >= 25
      )) errors.push('Incomplete G4+ ' + locale + ' draft copy: ' + source.id);
      // A quarantine cannot be bypassed by repeating the selected numeric
      // value in prose rather than structured technical fields. The tokens
      // are locale-specific and intentional qualified notes may remain
      // (e.g. K-30 source says 3 kgf+ without asserting exact thrust).
      for (const token of policy.records.find((r) => r.sourceId === source.id)?.proseForbidden?.[locale] ?? []) {
        if ([copy?.name, copy?.summary, copy?.description].some(
          (paragraph) => typeof paragraph === 'string' && paragraph.toLowerCase().includes(token.toLowerCase())
        )) errors.push('Withheld G4+ prose literal ' + locale + ' ' + token + ': ' + source.id);
      }
    }
    const fields = d.specs.map(g4SpecField), present = new Set(fields);
    const withheld = quarantined.get(source.id) ?? new Set();
    if (present.size !== fields.length || fields.some((f) => !g4AllowedFields.has(f)))
      errors.push('Duplicate/unexpected G4+ technical field: ' + source.id);
    for (const field of withheld) {
      if (present.has(field)) errors.push('Withheld G4+ technical field ' + field + ': ' + source.id);
    }
    // A baseline field is mandatory unless its absence is explicitly justified.
    for (const field of ['thrust','mass','speed','fuel_consumption','dimension:diameter','dimension:length']) {
      if (!present.has(field) && !withheld.has(field))
        errors.push('Missing G4+ technical field ' + field + ': ' + source.id);
    }
    const mass = d.specs.filter((s) => s.kind === 'mass');
    if (mass.length !== 1 || !['bare_engine','assembly_with_integrated_hardware','not_stated'].includes(mass[0].scope))
      errors.push('G4+ engine mass requires explicit measurement scope: ' + source.id);
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

/** #29: all TP source IDs are editorial drafts, not published BODICH stock. */
function tpDraftProblems(inventory, drafts) {
  const issues = [];
  const sources = inventory.products.filter((p) => p.sourceCategoryIds.includes('tp'));
  const group = drafts.filter((d) => d.categoryId === 'turboprop');
  if (sources.length !== 4 || group.length !== sources.length)
    issues.push('TP category coverage differs from four manufacturer source SKUs');
  const lookup = new Map(group.map((d) => [d.sourceId, d]));
  const propellerSizes = new Map([
    ['kt-17', ['3:18:12','3:18:16']], ['kt-18', ['3:22:12']],
    ['kt-19', ['3:24:20']], ['kt-20', ['3:26:20']],
  ]);
  if (sources.some((s) => !propellerSizes.has(s.id)))
    issues.push('Unknown TP source ID; verify source inventory before importing another model');
  const slugs = new Set();
  for (const source of sources) {
    const d = lookup.get(source.id);
    if (!d) { issues.push('Missing TP reference: ' + source.id); continue; }
    const number = source.sourceTitle?.match(/^KingTech K-(\d+)TPG4\+$/)?.[1];
    if (!number || d.model !== 'K-' + number + 'TPG4+' ||
        d.slug !== 'kingtech-k-' + number + 'tpg4-plus' ||
        d.itemType !== 'turboprop' || d.source.manufacturer !== 'KingTech' ||
        d.source.url !== source.canonicalUrl || slugs.has(d.slug))
      issues.push('TP identity, taxonomy or unique slug mismatch: ' + source.id);
    slugs.add(d.slug);
    // Approval/imagery #33-35 explicitly revise this intake-phase constraint.
    if (d.approval !== 'draft' || !Array.isArray(d.images) || d.images.length !== 0)
      issues.push('TP must remain unpublished draft without images: ' + source.id);
    for (const locale of ['en','ro']) {
      const c = d.copy?.[locale];
      if (!c || typeof c.name !== 'string' || c.name.trim().length < 25 ||
          typeof c.summary !== 'string' || c.summary.trim().length < 65 ||
          typeof c.description !== 'string' || c.description.trim().length < 150)
        issues.push('Incomplete TP ' + locale + ' copy: ' + source.id);
    }
    const fields = d.specs.map((p) => p.kind + (p.metric ? ':' + p.metric : ''));
    const present = new Set(fields);
    const allowed = ['dimension:length','mass','speed:turbine','fuel_consumption','power','temperature'];
    if (fields.length !== present.size || fields.some((x) => !allowed.includes(x)))
      issues.push('TP jet-only, ambiguous or duplicate technical fields: ' + source.id);
    const required = ['dimension:length','mass','speed:turbine','fuel_consumption',
      ...(source.id === 'kt-17' ? [] : ['power','temperature'])];
    for (const field of required) if (!present.has(field))
      issues.push('Missing TP technical field ' + field + ': ' + source.id);
    if (source.id === 'kt-17' && (present.has('power') || present.has('temperature')))
      issues.push('K-30TP unverified power/EGT must remain unknown');
    if (d.specs.some((p) => p.sourceUrl !== source.canonicalUrl))
      issues.push('TP technical value lacks original item provenance: ' + source.id);
    if (!d.specs.some((p) => p.kind === 'mass' && p.scope === 'not_stated'))
      issues.push('TP mass scope must be explicitly unknown: ' + source.id);
    const tp = d.turboprop;
    if (!tp || tp.sourceUrl !== source.canonicalUrl || !Array.isArray(tp.propellers) ||
        tp.propellers.map((p) => p.blades + ':' + p.diameterInches + ':' + p.pitchInches).sort().join(',') !==
          (propellerSizes.get(source.id) ?? []).slice().sort().join(',') ||
        !Array.isArray(tp.fuelTypes) || tp.fuelTypes.length !== (source.id === 'kt-17' ? 2 : 3) ||
        tp.fuelTypes.some((x) => !(source.id === 'kt-17' ? ['jet_a1','kerosene'] : ['diesel','jet_a1','kerosene']).includes(x)) ||
        (source.id === 'kt-17' ? tp.pumpModel !== 'KP200BL' : tp.pumpModel !== undefined) ||
        tp.gearboxRatio !== undefined || tp.includedComponents !== undefined)
      issues.push('TP verified propeller/fuel/pump or unknown-gearbox mismatch: ' + source.id);
  }
  return issues;
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
  errors.push(...g4QuarantineProblems(doc, g4Withheld).map((e) => 'G4+ policy: ' + e));
  errors.push(...g4DraftProblems(doc, drafts).map((e) => 'G4+ coverage: ' + e));
  errors.push(...tpDraftProblems(doc, drafts).map((e) => 'TP coverage: ' + e));
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
    // Schema-level mass scope validation rejects invalid variants and
    // scope attached to non-mass measurements.
    const illegalScope = [
      candidate([{ sourceId: one.id, specs: [{
        kind: 'mass', value: 500, unit: 'g', scope: 'with_brackets_guess',
        sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt,
      }] }]),
      candidate([{ sourceId: one.id, specs: [{
        kind: 'thrust', value: 5, unit: 'kgf', scope: 'bare_engine',
        sourceUrl: one.canonicalUrl, verifiedOn: doc.capturedAt,
      }] }]),
    ];
    for (const entry of illegalScope) {
      if (!validateReferenceDrafts(doc, entry, buildReferenceDrafts(doc, entry)).length)
        errors.push('Invalid reference mass scope accepted by schema');
    }
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

    // Dedicated TP negative fixtures: lost SKU, missing locale, changed status,
    // jet-thrust leakage, turbine vs propeller speed and propeller dimensions.
    const mutateTp = (id, change) => drafts.map((d) => d.sourceId === id ? change(d) : d);
    const tpCases = [
      [drafts.filter((d) => d.sourceId !== 'kt-17'), 'Missing TP reference'],
      [mutateTp('kt-18', (d) => ({...d,copy:{...d.copy,ro:null}})), 'Incomplete TP ro'],
      [mutateTp('kt-19', (d) => ({...d,approval:'company_approved'})), 'unpublished draft'],
      [mutateTp('kt-20', (d) => ({...d,images:[{fake:true}]})), 'unpublished draft'],
      [mutateTp('kt-18', (d) => ({...d,specs:[...d.specs,{kind:'thrust',value:5,unit:'kgf'}]})), 'jet-only'],
      [mutateTp('kt-20', (d) => ({...d,specs:d.specs.map((p) => p.kind === 'speed' ? {...p,metric:'propeller'} : p)})), 'Missing TP technical field'],
      [mutateTp('kt-17', (d) => ({...d,specs:[...d.specs,{kind:'power',value:8,unit:'kW'}]})), 'unverified power'],
      [mutateTp('kt-19', (d) => ({...d,turboprop:{...d.turboprop,propellers:[{blades:3,diameterInches:25,pitchInches:20}]}})), 'propeller/fuel/pump'],
    ];
    for (const [changed, signature] of tpCases) {
      if (!tpDraftProblems(doc, changed).some((e) => e.includes(signature)))
        errors.push('TP negative fixture escaped: ' + signature);
    }
    const badTp = structuredClone(draftOverrides);
    badTp.records.find((r) => r.sourceId === 'kt-17').turboprop.propellers[0].diameterInches = -18;
    if (!validateReferenceDrafts(doc,badTp,buildReferenceDrafts(doc,badTp))
        .some((e) => e.includes('Invalid or unsourced TP metadata')))
      errors.push('Negative TP propeller size escaped schema validation');
    const wrongCategory = structuredClone(draftOverrides);
    wrongCategory.records.find((r) => r.sourceId === 'kt-127').turboprop =
      structuredClone(drafts.find((d) => d.sourceId === 'kt-17').turboprop);
    if (!validateReferenceDrafts(doc,wrongCategory,buildReferenceDrafts(doc,wrongCategory))
        .some((e) => e.includes('Non-TP record')))
      errors.push('TP metadata illegally accepted on turbojet');
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
    const promoted = drafts.map((d) => d.sourceId === 'kt-2' ?
      { ...d, approval: 'company_approved' } : d);
    if (!g4DraftProblems(doc, promoted).some((e) => e.includes('must remain unpublished')))
      errors.push('G4+ approval promotion bypassed draft-only gate');
    const imaged = drafts.map((d) => d.sourceId === 'kt-2' ?
      { ...d, images: [{ path: 'docs/catalog/draft-assets/kt-2/concept.webp' }] } : d);
    if (!g4DraftProblems(doc, imaged).some((e) => e.includes('must remain unpublished')))
      errors.push('G4+ draft acquired an image without failing gate');
    const massScopeMissing = drafts.map((d) => d.sourceId === 'kt-2' ? {
      ...d, specs: d.specs.map((s) => s.kind === 'mass' ? { ...s, scope: undefined } : s),
    } : d);
    if (!g4DraftProblems(doc, massScopeMissing).some((e) => e.includes('requires explicit measurement scope')))
      errors.push('Unscoped G4+ mass bypassed comparison guard');
    const changedStatus = structuredClone(doc);
    changedStatus.products.find((p) => p.id === 'kt-2').sourceStatus = 'unknown';
    if (!g4DraftProblems(changedStatus, drafts).some((e) => e.includes('distribution changed')))
      errors.push('Changed G4+ lifecycle distribution bypassed status guard');
    for (const invalidPolicy of [
      { ...g4Withheld, schemaVersion: 2 },
      { ...g4Withheld, records: [{ ...g4Withheld.records[0], proseForbidden: { en: ['example'] } }, ...g4Withheld.records.slice(1)] },
      { ...g4Withheld, records: [{ ...g4Withheld.records[0], proseForbidden: { en: ['example'], ro: ['example'], de: ['extra'] } }, ...g4Withheld.records.slice(1)] },
      { ...g4Withheld, records: [...g4Withheld.records, {
        sourceId: 'kt-2', fields: ['dimension:height'], reason: 'Unsupported axis must fail before checking records',
      }] },
      { ...g4Withheld, records: [...g4Withheld.records, g4Withheld.records[0]] },
      { ...g4Withheld, records: [...g4Withheld.records, {
        sourceId: 'fictional-999', fields: ['thrust'], reason: 'Unknown source identity is not allowed in this policy',
      }] },
    ]) {
      if (!g4QuarantineProblems(doc, invalidPolicy).length)
        errors.push('Invalid G4+ quarantine policy passed self-test');
    }

    // Localized negative fixtures prohibit writing a disputed numeric value
    // back into description/summary without restoring the guarded spec.
    for (const entry of g4Withheld.records) {
      for (const locale of ['en', 'ro']) {
        for (const literal of entry.proseForbidden[locale]) {
          const injectedProse = drafts.map((d) => d.sourceId === entry.sourceId ? {
            ...d, copy: { ...d.copy,
              [locale]: { ...d.copy[locale],
                description: d.copy[locale].description + ' ' + literal,
              },
            },
          } : d);
          if (!g4DraftProblems(doc, injectedProse).some((e) =>
            e.includes('Withheld G4+ prose literal ' + locale + ' ' + literal)))
            errors.push('Disputed G4+ localized prose bypassed guard: ' + entry.sourceId + ' ' + locale);
        }
      }
    }
    // Derive every conflict injection from the exact same policy as production.
    const injectedSpec = (field, d) => {
      const [kind, metric] = field.split(':');
      const units = { thrust: 'kgf', mass: 'g', speed: 'rpm',
        temperature: '°C', fuel_consumption: 'g/min', dimension: 'mm' };
      return { kind, ...(metric ? { metric } : {}), value: 100,
        unit: units[kind], sourceUrl: d.source.url, verifiedOn: doc.capturedAt };
    };
    for (const entry of g4Withheld.records) {
      for (const field of entry.fields) {
        const injected = drafts.map((d) => d.sourceId === entry.sourceId ? {
          ...d, specs: [...d.specs, injectedSpec(field, d)],
        } : d);
        if (!g4DraftProblems(doc, injected).some((e) => e.includes('Withheld G4+ technical field ' + field)))
          errors.push('Withheld G4+ field escaped negative fixture: ' + entry.sourceId + ' ' + field);
      }
    }
    const importer = resolve('src/catalog/index.ts');
    const forbidden = [
      "export * from './reference';",
      "import('./reference.ts')",
      "import '../../docs/catalog/source-inventory.json'",
      "import '../../docs/catalog/g4-withheld-specs.json'",
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

/**
 * Issue #35: independent, deterministic release reconciliation.
 * Does NOT publish staged KingTech drafts. Other validators check numeric
 * evidence, raster payloads, and detailed localized copy.
 *
 * node scripts/reconcile-catalog-release.mjs [--check | --self-test | --routes dist]
 * Writes visual-qa/catalog-reconciliation.json for CI review artifacts.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildReferenceDrafts, discountedReferenceDrafts, externalReferenceServices, primaryReferenceSection, referenceTaxonomy } from '../src/catalog/reference.ts';
import { catalogCategories, confirmedProducts } from '../src/catalog/data.ts';

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const inventory = load('docs/catalog/source-inventory.json');
const overlays = load('docs/catalog/reference-overrides.json');
const art = load('docs/catalog/art-manifest.json');
const copyMatrix = load('docs/catalog/copy-review-matrix.json');
const nonempty = (s) => typeof s === 'string' && Boolean(s.trim());
const sorted = (array) => [...array].sort((a, b) => a.localeCompare(b, 'en'));
const counts = (values) => Object.fromEntries(sorted([...new Set(values)]).map((v) => [v, values.filter((w) => w === v).length]));
const output = resolve('visual-qa/catalog-reconciliation.json');

function reconcile({ source, edits, artwork, copy, published, external }) {
  const errors = [];
  const fail = (message) => errors.push(message);
  function unique(rows, key, label) {
    const result = new Map();
    if (!Array.isArray(rows)) { fail(label + ' must be an array'); return result; }
    for (const row of rows) {
      const id = row?.[key];
      if (!nonempty(id) || result.has(id)) fail('Missing/duplicate ' + label + ' identifier: ' + id);
      else result.set(id, row);
    }
    return result;
  }
  const sources = unique(source.products, 'id', 'source SKU');
  const draftEdits = unique(edits.records, 'sourceId', 'editorial draft');
  const artworks = unique(artwork.entries, 'sourceId', 'illustration');
  const reviews = unique(copy.items, 'sourceId', 'copy review');
  const slugs = new Set();
  const assetPaths = new Set();
  const issues = [];
  const rows = [];
  const lifecycle = [];
  const sectionCounts = [];
  const kinds = [];
  let draftCount = 0;
  let specCount = 0;
  let pendingCopyItems = 0;
  let unresolvedCopyItems = 0;
  let unresolvedCopyTags = 0;

  for (const [id, sourceItem] of sources) {
    const edit = draftEdits.get(id), image = artworks.get(id), review = reviews.get(id);
    const section = primaryReferenceSection(sourceItem.sourceCategoryIds);
    if (!section || !Object.hasOwn(referenceTaxonomy, section))
      fail('Unknown/ambiguous primary source category: ' + id);
    if (sourceItem.sourceCategoryIds.includes('discounted') &&
        !['g4', 'g5', 'tp'].includes(section)) fail('Non-engine discounted membership: ' + id);
    if (!edit) fail('Silently missing editorial draft: ' + id);
    if (!image) fail('Silently missing original-art manifest entry: ' + id);
    if (!review) fail('Silently missing EN/RO review matrix row: ' + id);

    if (edit) {
      if (edit.approval !== 'draft' || !Array.isArray(edit.images) || edit.images.length !== 0)
        fail('Non-quarantined editorial reference: ' + id);
      if (!nonempty(edit.slug) || slugs.has(edit.slug))
        fail('Missing/duplicate unique draft slug: ' + id);
      slugs.add(edit.slug);
      for (const lang of ['en', 'ro']) {
        if (!nonempty(edit.copy?.[lang]?.name) ||
            !nonempty(edit.copy?.[lang]?.summary) ||
            !nonempty(edit.copy?.[lang]?.description))
          fail('Missing complete ' + lang + ' draft copy: ' + id);
      }
      if (!Array.isArray(edit.specs)) fail('Missing structured specification array: ' + id);
      else {
        specCount += edit.specs.length;
        for (const spec of edit.specs) {
          if (!nonempty(spec.sourceUrl) || !nonempty(spec.verifiedOn) ||
              !nonempty(spec.unit) || !(typeof spec.value === 'number' && spec.value > 0))
            fail('Unattributed technical quantity: ' + id);
        }
      }
      draftCount++;
    }
    if (image) {
      if (image.sourceTitle !== sourceItem.sourceTitle ||
          image.sourceUrl !== sourceItem.canonicalUrl ||
          image.approved !== false || image.rights !== 'pending' ||
          image.kind !== 'original_diagram' || image.isProductPhoto !== false)
        fail('Wrong source identity or prematurely approved illustration: ' + id);
      for (const lang of ['en', 'ro']) {
        if (!nonempty(image.alt?.[lang]) || !image.alt[lang].includes(id))
          fail('Missing/unattributed ' + lang + ' diagram alt: ' + id);
      }
      const stems = { webp360: 'concept-360.webp', webp600: 'concept-600.webp',
        webp1200: 'concept-1200.webp', png600: 'concept-600.png' };
      if (Object.keys(image.assets ?? {}).sort().join(',') !== Object.keys(stems).sort().join(','))
        fail('Incorrect four-variant WebP/PNG set: ' + id);
      for (const [variant, filename] of Object.entries(stems)) {
        const expected = 'docs/catalog/draft-assets/' + id + '/' + filename;
        const path = image.assets?.[variant];
        if (path !== expected || assetPaths.has(path))
          fail('Non-unique or wrong original-art derivative ' + variant + ': ' + id);
        if (path) assetPaths.add(path);
      }
    }
    if (review) {
      if (review.sourceCategory !== section || review.sourceUrl !== sourceItem.canonicalUrl ||
          review.supplierLifecycle !== sourceItem.sourceStatus ||
          review.structuredSpecCount !== (edit?.specs?.length ?? -1) ||
          !Array.isArray(review.evidenceUrls) || !review.evidenceUrls.includes(sourceItem.canonicalUrl))
        fail('Copy-review source/category/lifecycle/evidence drift: ' + id);
      if (review.humanRomanianReview !== 'pending_prelaunch_native_Romanian_legal_marketing_review')
        fail('Unsupported human proofreading sign-off: ' + id);
      if (!Array.isArray(review.unresolved)) fail('Untracked copy review state: ' + id);
      pendingCopyItems++;
      if (review.unresolved?.length) {
        unresolvedCopyItems++;
        unresolvedCopyTags += review.unresolved.length;
      }
    }
    lifecycle.push(sourceItem.sourceStatus);
    if (section) kinds.push(referenceTaxonomy[section].itemType);
    rows.push({
      sourceId: id,
      sourceCategory: section,
      sourceCategoryIds: sourceItem.sourceCategoryIds,
      sourceUrl: sourceItem.canonicalUrl,
      supplierLifecycle: sourceItem.sourceStatus,
      discovery: sourceItem.sourceDiscovery,
      disposition: edit && image && review ? 'unpublished_draft_pending_approval' : 'unreconciled',
      draftSlug: edit?.slug ?? null,
      structuredSpecCount: edit?.specs?.length ?? 0,
      artStatus: image ? 'original_fallback_unapproved' : 'missing',
      humanCopyReview: review?.humanRomanianReview ?? 'missing',
      unresolvedCopy: review?.unresolved ?? [],
    });
  }
  for (const [label, index] of [['draft', draftEdits], ['art', artworks], ['copy review', reviews]]) {
    for (const id of index.keys()) if (!sources.has(id)) fail('Orphan ' + label + ' not in source inventory: ' + id);
  }
  if (draftEdits.size !== sources.size || artworks.size !== sources.size || reviews.size !== sources.size)
    fail('Source-to-draft-to-art-to-copy cardinality mismatch');
  if (artwork.outputDimensions?.webp360?.join('x') !== '360x270' ||
      artwork.outputDimensions?.webp600?.join('x') !== '600x450' ||
      artwork.outputDimensions?.webp1200?.join('x') !== '1200x900')
    fail('Original fallback WebP optimization profile changed without review');

  const sourceSections = unique(source.sections, 'id', 'source section');
  for (const [id, section] of sourceSections) {
    const members = [...sources.values()].filter((item) => item.sourceCategoryIds.includes(id));
    if (section.discoveredCount !== members.length ||
        section.crossListedCount !== members.filter((p) => p.sourceCategoryIds.length > 1).length)
      fail('Source category or sale cross-listing count mismatch: ' + id);
    if (!['matched', 'external_service_documented'].includes(section.status))
      fail('Source section is not fully reconciled: ' + id);
    if (id === 'discounted' && members.some((x) =>
      !['g4', 'g5', 'tp'].includes(primaryReferenceSection(x.sourceCategoryIds))))
      fail('Discounted section includes a non-engine row');
    sectionCounts.push({
      section: id, reported: section.reportedCount, discovered: members.length,
      crossListed: section.crossListedCount, status: section.status,
      distinctSourceIds: new Set(members.map((p) => p.id)).size,
    });
  }
  if (sourceSections.size !== 9 || !sourceSections.has('discounted') ||
      !sourceSections.has('gift-card')) fail('Missing expected source catalog section');
  if (sectionCounts.find((s) => s.section === 'gift-card')?.discovered !== 0 ||
      external.length !== 1 || external[0]?.sourceSection !== 'gift-card' ||
      external[0]?.approval !== 'draft' || external[0]?.offerStatus !== 'reference_only' ||
      external[0]?.legalApproval !== 'pending')
    fail('External gift-card service must be distinct and unpublished');
  if (!Array.isArray(source.exclusions)) fail('No explicit source exclusion ledger');
  const exceptions = (source.exclusions ?? []).map((item) => ({
    section: item.sectionId,
    reason: item.reason,
    evidenceUrl: item.evidenceUrl,
    count: item.count,
    disposition: 'explicit_source_exclusion_or_hold',
  }));
  for (const item of exceptions) {
    if (!nonempty(item.reason) || !nonempty(item.evidenceUrl) || !sourceSections.has(item.section) &&
        item.section !== 'promotional-items')
      fail('Undocumented source exclusion/hold: ' + item.section);
  }
  if (!exceptions.some((x) => x.section === 'gift-card') ||
      !exceptions.some((x) => x.section === 'promotional-items') ||
      !exceptions.some((x) => x.section === 'batteries'))
    fail('Known external service, out-of-scope category or missing battery exception lost');

  // External research is not a product approval. A future legitimate BODICH
  // product must use the isolated public intake and independent review.
  const sourceUrls = new Set([...sources.values()].map((p) => p.canonicalUrl));
  const sourceSlugs = new Set([...draftEdits.values()].map((p) => p.slug));
  for (const product of published) {
    if (sourceUrls.has(product.verification?.sourceReference) ||
        sourceSlugs.has(product.slug) || sources.has(product.id))
      fail('Unapproved KingTech reference published as BODICH product: ' + product.id);
  }
  let discountedCount = 0;
  try {
    const drafts = buildReferenceDrafts(source, edits);
    const discounted = discountedReferenceDrafts(drafts);
    if (drafts.length !== sources.size || new Set(drafts.map((x) => x.sourceId)).size !== sources.size)
      fail('Reference model lost unique source SKU identities');
    for (const item of discounted)
      if (drafts.find((x) => x.sourceId === item.sourceId) !== item)
        fail('Discount tag cloned a reference SKU: ' + item.sourceId);
    discountedCount = discounted.length;
  } catch (error) { fail('Cannot derive unique draft references: ' + error.message); }

  const report = {
    schemaVersion: 1,
    purpose: 'offline_prelaunch_release_reconciliation_no_commerce',
    sourceSite: source.sourceSite,
    capturedAt: source.capturedAt,
    verdict: errors.length ? 'failed' : 'blocked_pending_company_and_legal_approval',
    totals: {
      sourceUniqueSKUs: sources.size, sourceRows: source.products.length,
      draftedSKUs: draftCount, artManifestEntries: artworks.size,
      editorialMatrixEntries: reviews.size, publicApprovedProducts: published.length,
      externalDigitalReferences: external.length, explicitExclusions: exceptions.length,
      discountedExistingSKUs: discountedCount,
      sourceLinkedStructuredSpecs: specCount,
      pendingRomanianHumanReviews: pendingCopyItems,
      unresolvedEditorialSKUs: unresolvedCopyItems,
      unresolvedEditorialTags: unresolvedCopyTags,
      pendingImageRightsApprovals: [...artworks.values()].filter((x) => !x.approved).length,
    },
    sourceLifecycles: counts(lifecycle),
    itemTypes: counts(kinds),
    sections: sectionCounts,
    exclusionsAndHolds: exceptions,
    sourceRows: rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en')),
    manualApprovalChecklist: [
      'Confirm BODICH legal entity, brand identity, domain, manufacturer attribution and reuse rights.',
      'Approve each SKU independently, including discontinued/industrial-only status and source-linked technical data.',
      'Review original artwork, derivative rights, EN/RO descriptive alt and whether a genuine product photograph is needed.',
      'Obtain native Romanian legal/marketing proofreading and clear every editorial exception.',
      'Define honest BODICH pricing, availability, warranty, shipping and consumer terms before adding any commerce.',
      'Run prelaunch physical-device, Safari/Firefox, production-domain and final legal/SEO/accessibility testing.',
    ],
    errors,
  };
  return { report, errors };
}

function routeProblems(dist, published) {
  const errors = [];
  const root = resolve(dist);
  for (const lang of ['en', 'ro']) {
    for (const category of catalogCategories) {
      const parent = join(root, lang, category.section, category.id);
      const file = join(parent, 'index.html');
      if (!existsSync(file)) { errors.push('Missing category route: ' + file); continue; }
      const html = readFileSync(file, 'utf8');
      const count = [...html.matchAll(/data-product-card="/g)].length;
      const expected = published.filter((p) => p.categoryId === category.id).length;
      if (count !== expected ||
          !html.includes('data-catalog-category="' + category.id + '"') ||
          (expected === 0) !== html.includes('data-catalog-empty-state'))
        errors.push('Wrong localized category/card count or empty state: ' + lang + '/' + category.id);
      if (/KingTech|docs\/catalog\/draft-assets|app\.squareup\.com\/gift/i.test(html))
        errors.push('Private supplier draft/checkout leaked into public category: ' + file);
      if (existsSync(parent)) for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!published.some((p) => p.categoryId === category.id && p.slug === entry.name))
          errors.push('Unexpected product route under ' + lang + '/' + category.id + ': ' + entry.name);
      }
      for (const item of published.filter((p) => p.categoryId === category.id)) {
        const detail = join(parent, item.slug, 'index.html');
        if (!existsSync(detail)) errors.push('Missing product route: ' + detail);
        else if (!readFileSync(detail, 'utf8').includes('data-product-detail="' + item.slug + '"'))
          errors.push('Incorrect product detail identity: ' + detail);
      }
    }
  }
  return errors;
}

function runSelfTest() {
  const original = { source: inventory, edits: overlays, artwork: art, copy: copyMatrix,
    published: confirmedProducts, external: externalReferenceServices };
  const baseline = reconcile(original);
  if (baseline.errors.length) throw new Error('Baseline failed: ' + baseline.errors.join('; '));
  const cases = [
    ['missing SKU draft', (d) => { d.edits.records.pop(); }, 'Silently missing editorial draft'],
    ['duplicate SKU draft', (d) => { d.edits.records.push(d.edits.records[0]); }, 'Duplicate editorial draft'],
    ['orphan illustration', (d) => { d.artwork.entries[0].sourceId = 'phantom'; }, 'Silently missing original-art'],
    ['missing localized alt', (d) => { d.artwork.entries[0].alt.ro = ''; }, 'Missing/unattributed ro'],
    ['shared image derivative', (d) => { d.artwork.entries[1].assets.webp600 = d.artwork.entries[0].assets.webp600; }, 'Non-unique or wrong'],
    ['missing copy review', (d) => { d.copy.items.pop(); }, 'Silently missing EN/RO review'],
    ['sale-listed service', (d) => { const item = d.source.products.find((x) => x.sourceCategoryIds.includes('warranty')); item.sourceCategoryIds.push('discounted'); }, 'Non-engine discounted'],
    ['lost exclusion evidence', (d) => { d.source.exclusions[0].reason = ''; }, 'Undocumented source exclusion'],
    ['premature art rights', (d) => { d.artwork.entries[0].approved = true; }, 'prematurely approved'],
    ['unapproved public source slug', (d) => { d.published.push({ id: 'unsafe', slug: d.edits.records[0].slug }); }, 'published as BODICH'],
  ];
  for (const [label, mutate, expectation] of cases) {
    const data = structuredClone(original);
    mutate(data);
    const actual = reconcile(data).errors;
    if (!actual.some((issue) => issue.includes(expectation)))
      throw new Error('Regression fixture did not reject ' + label + ': ' + actual.join('; '));
  }
  console.log('Catalog reconciliation regression fixtures passed: ' + cases.length);
}

const mode = process.argv[2] ?? '--check';
if (!['--check', '--self-test', '--routes'].includes(mode) ||
    (mode !== '--routes' && process.argv[3]) || (mode === '--routes' && process.argv[4])) {
  console.error('Usage: node scripts/reconcile-catalog-release.mjs [--check | --self-test | --routes dist]');
  process.exit(1);
}
if (mode === '--self-test') runSelfTest();
const { report, errors } = reconcile({
  source: inventory, edits: overlays, artwork: art, copy: copyMatrix,
  published: confirmedProducts, external: externalReferenceServices,
});
if (mode === '--routes') errors.push(...routeProblems(process.argv[3] ?? 'dist', confirmedProducts));
report.errors = errors;
report.verdict = errors.length ? 'failed' : 'blocked_pending_company_and_legal_approval';
mkdirSync(resolve('visual-qa'), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const issue of errors) console.error('Reconciliation: ' + issue);
console.log('Catalog reconciliation: ' + report.totals.sourceUniqueSKUs + ' source IDs, ' +
  report.totals.draftedSKUs + ' drafts, ' + report.totals.artManifestEntries +
  ' artworks, ' + report.totals.explicitExclusions + ' explicit exclusions, ' +
  errors.length + ' errors; verdict ' + report.verdict + '.');
if (errors.length) process.exitCode = 1;

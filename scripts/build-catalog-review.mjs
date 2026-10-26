#!/usr/bin/env node
/**
 * Issue #47: local-only, offline review of frozen KingTech SOURCE REFERENCES.
 * NEVER import this module from Astro pages, layouts, or public catalog code.
 *
 * node scripts/build-catalog-review.mjs [--check | --self-test]
 * Default: generate a standalone review directory in ignored visual-qa/.
 */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReferenceDrafts, primaryReferenceSection } from '../src/catalog/reference.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(root, 'visual-qa/private-catalog-review');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const snapshot = {
  inventory: 'docs/catalog/source-inventory.json',
  overrides: 'docs/catalog/reference-overrides.json',
  art: 'docs/catalog/art-manifest.json',
  review: 'docs/catalog/copy-review-matrix.json',
};
const conceptFiles = [
  'bodich-hero-concept.webp',
  'bodich-card-concept-01.webp',
  'bodich-intake-detail-concept-02.webp',
];
const REVIEW_MARKER = 'BODICH PRIVATE REVIEW - NOT FOR PUBLICATION';
const sourceSections = ['g5', 'g4', 'tp', 'accessories', 'oil', 'batteries', 'warranty'];
const pendingHuman = 'pending_prelaunch_native_Romanian_legal_marketing_review';
const nonempty = (x) => typeof x === 'string' && x.trim().length > 0;
const unique = (items, key, label, expectedCount) => {
  assert.ok(Array.isArray(items), label + ' array missing');
  const out = new Map();
  for (const item of items) {
    assert.ok(item && nonempty(item[key]), label + ' key missing');
    assert.ok(!out.has(item[key]), 'Duplicate ' + label + ': ' + item[key]);
    out.set(item[key], item);
  }
  assert.equal(out.size, expectedCount, label + ' count / coverage drift');
  return out;
};
const safeLink = (url) => {
  assert.ok(nonempty(url), 'Missing evidence URL');
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:', 'Non-HTTPS evidence URL');
  assert.ok(parsed.hostname && !parsed.username && !parsed.password, 'Unsafe evidence URL');
  return url;
};
const safeId = (id) => {
  assert.match(id, /^[a-zA-Z0-9_-]+$/, 'Unsafe source ID');
  return id;
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const exactArtPath = (id) => 'docs/catalog/draft-assets/' + id + '/concept-600.webp';
const allowedAsset = (path, id) => {
  assert.equal(path, exactArtPath(id), 'Unexpected draft asset path for ' + id);
  const full = resolve(root, path);
  assert.ok(full.startsWith(resolve(root, 'docs/catalog/draft-assets') + sep), 'Asset path escaped draft area');
  return full;
};

/**
 * This strictly joins the same four sources as Issue #35 reconciliation.
 * An artwork diagram is never counted as cleared product photography.
 * A missing generated diagram is visible as MISSING, not silently approved.
 */
export function assemble({ inventory, overrides, art, review, hasAsset = existsSync, expectedCount = 132 }) {
  const sources = unique(inventory.products, 'id', 'source', expectedCount);
  const edits = unique(overrides.records, 'sourceId', 'overlay', expectedCount);
  const arts = unique(art.entries, 'sourceId', 'artwork', expectedCount);
  const reviews = unique(review.items, 'sourceId', 'copy matrix', expectedCount);
  const drafts = unique(buildReferenceDrafts(inventory, overrides), 'sourceId', 'derived draft', expectedCount);
  const slugs = new Set();
  const rows = [];

  for (const [id, source] of sources) {
    safeId(id);
    const draft = drafts.get(id), edit = edits.get(id), image = arts.get(id), copyReview = reviews.get(id);
    assert.ok(draft && edit && image && copyReview, 'Incomplete review join: ' + id);
    const section = primaryReferenceSection(source.sourceCategoryIds);
    assert.ok(sourceSections.includes(section), 'Unexpected primary section: ' + id);
    assert.equal(copyReview.sourceCategory, section, 'Copy category drift: ' + id);
    assert.equal(copyReview.sourceUrl, source.canonicalUrl, 'Copy/source URL drift: ' + id);
    assert.equal(copyReview.supplierLifecycle, source.sourceStatus, 'Lifecycle drift: ' + id);
    assert.equal(image.sourceUrl, source.canonicalUrl, 'Artwork/source URL drift: ' + id);
    assert.equal(image.sourceTitle, source.sourceTitle, 'Artwork title drift: ' + id);
    assert.equal(draft.source.url, source.canonicalUrl, 'Derived draft source mismatch: ' + id);
    assert.equal(draft.approval, 'draft', 'A supplier draft must not be marked approved: ' + id);
    assert.deepEqual(draft.images, [], 'Unreviewed draft photo references: ' + id);
    assert.ok(nonempty(draft.slug) && !slugs.has(draft.slug), 'Duplicate / missing draft slug: ' + id);
    slugs.add(draft.slug);
    assert.equal(image.kind, 'original_diagram', 'Non-diagram fallback: ' + id);
    assert.equal(image.isProductPhoto, false, 'Diagram masquerading as product photo: ' + id);
    assert.equal(image.approved, false, 'Premature art approval: ' + id);
    assert.equal(image.rights, 'pending', 'Unexpected rights state: ' + id);
    assert.ok(nonempty(image.family), 'Missing illustration family: ' + id);
    assert.equal(copyReview.humanRomanianReview, pendingHuman, 'Unverified sign-off state: ' + id);
    assert.equal(copyReview.structuredSpecCount, draft.specs.length, 'Spec/review drift: ' + id);
    assert.ok(Array.isArray(copyReview.unresolved), 'Unresolved review flags absent: ' + id);
    for (const lang of ['en', 'ro']) {
      for (const field of ['name', 'summary', 'description']) {
        assert.ok(nonempty(draft.copy[lang]?.[field]), 'Missing ' + lang + ' ' + field + ': ' + id);
      }
      assert.ok(nonempty(image.alt?.[lang]) && image.alt[lang].includes(id),
        'Missing source-specific diagram alt ' + lang + ': ' + id);
    }
    const url = safeLink(source.canonicalUrl);
    assert.ok(copyReview.evidenceUrls?.includes(url), 'Missing canonical review evidence: ' + id);
    const evidence = [...new Set([...source.evidenceUrls, ...copyReview.evidenceUrls,
      ...draft.specs.map((spec) => spec.sourceUrl)])].map(safeLink);
    assert.equal(image.assets?.webp600, exactArtPath(id), 'Artwork/ID mapping drift: ' + id);
    const illustrationAvailable = Boolean(hasAsset(allowedAsset(image.assets.webp600, id)));
    rows.push({
      sourceId: id,
      title: source.sourceTitle || '(untitled supplier reference)',
      sourceUrl: url,
      category: section,
      categoryIds: source.sourceCategoryIds,
      family: image.family,
      lifecycle: source.sourceStatus,
      discovery: source.sourceDiscovery,
      supplierManufacturer: source.manufacturer,
      model: draft.model,
      draftSlug: draft.slug,
      approval: draft.approval,
      copy: draft.copy,
      evidence,
      specCount: draft.specs.length,
      copyStatus: copyReview.copyStatus,
      unresolved: copyReview.unresolved,
      illustrationAvailable,
      illustrationFile: illustrationAvailable ? 'images/' + id + '.webp' : null,
      illustrationAlt: image.alt,
      illustrationKind: image.kind,
      illustrationRights: image.rights,
      // Deliberately blocked: an original generic diagram proves NONE of these.
      gates: {
        modelSpecificPhoto: 'missing',
        modelPhotoRights: 'pending',
        bodichManufacturerIdentity: 'pending',
        nativeRomanianLegalCopy: 'pending',
      },
    });
  }
  return rows;
}

const tr = (en, ro) => '<span data-i18n-en="' + esc(en) +
  '" data-i18n-ro="' + esc(ro) + '">' + esc(en) + '</span>';

function renderRecord(item) {
  // Index source identity and localized copy only, not approval boilerplate.
  const search = [item.sourceId, item.title, item.draftSlug,
    ...['en', 'ro'].flatMap((lang) => ['name', 'summary', 'description'].map(
      (field) => item.copy[lang][field]))].join(' ');
  const link = (url, title) => '<a href="' + esc(url) +
    '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' + esc(title) + '</a>';
  const copy = (lang) => '<section class="localized localized-' + lang + '" lang="' + lang +
    '"><h4>' + esc(item.copy[lang].name) + '</h4><p>' + esc(item.copy[lang].summary) +
    '</p><p>' + esc(item.copy[lang].description) + '</p></section>';
  const image = item.illustrationFile ?
    '<img loading="lazy" width="600" height="450" src="' + esc(item.illustrationFile) +
    '" alt="' + esc(item.illustrationAlt.en) + '" data-alt-en="' + esc(item.illustrationAlt.en) +
    '" data-alt-ro="' + esc(item.illustrationAlt.ro) + '">' :
    '<div class="image-missing" role="img" aria-label="Illustration unavailable / Ilustrație indisponibilă">No generated illustration on disk / Ilustrație negenerată</div>';
  return [
    '<article class="review-record" data-source-id="', esc(item.sourceId),
    '" data-search="', esc(search), '" data-category="', esc(item.category), '" data-visual="',
    item.illustrationAvailable ? 'diagram' : 'missing',
    '" data-editorial="', item.unresolved.length ? 'flags' : 'none',
    '" data-lifecycle="', esc(item.lifecycle), '">',
    '<div class="art-panel">', image,
    '<p class="disclosure">ILLUSTRATIVE STUDY — NOT A PRODUCT PHOTOGRAPH',
    '<span lang="ro">STUDIU ILUSTRATIV — NU ESTE FOTOGRAFIA UNUI PRODUS</span></p>',
    '<p class="muted">', esc(item.family), ' · ', tr('Original diagram', 'Diagramă originală'), ' · ',
    tr('Rights pending', 'Drepturi în așteptare'), ' · ',
    item.illustrationAvailable ? tr('Generated', 'Generată') : tr('Unavailable', 'Indisponibilă'),
    '</p></div>',
    '<div class="record-body"><div class="record-head"><span class="tag">', esc(item.category),
    '</span><span class="tag warning">', tr('Unpublished', 'Nepublicat'), ' · ', esc(item.approval), '</span></div>',
    '<h3>', esc(item.title), '</h3>',
    '<p class="id">', tr('Source ID', 'ID sursă'), ': <code>', esc(item.sourceId), '</code></p>',
    '<p class="id">', tr('Draft slug', 'Identificator de ciornă'), ': <code>', esc(item.draftSlug), '</code></p>',
    '<p class="muted">', tr('Supplier lifecycle', 'Stare furnizor'), ': ', esc(item.lifecycle),
    ' · ', tr('Origin', 'Origine'), ': ', esc(item.discovery),
    ' · ', tr('Supplier manufacturer', 'Producător furnizor'), ': ',
    esc(item.supplierManufacturer || 'not recorded'), '</p>',
    copy('en'), copy('ro'),
    '<details><summary>', tr('Evidence, editorial flags and approval gates',
    'Dovezi, observații editoriale și aprobări'), '</summary>',
    '<p>', tr('Original supplier record', 'Referința originală a furnizorului'),
    ': ', link(item.sourceUrl, item.sourceUrl), '</p>',
    '<p>', tr('Source-backed spec count', 'Număr de specificații cu sursă'),
    ': ', item.specCount, ' · ', tr('Copy QA', 'Verificare text'), ': ', esc(item.copyStatus), '</p>',
    '<h4>', tr('Evidence', 'Dovezi'), '</h4><ul class="evidence">',
    item.evidence.map((url) => '<li>' + link(url, url) + '</li>').join(''),
    '</ul><h4>', tr('Unresolved editorial items', 'Observații editoriale nerezolvate'), '</h4><p>',
    item.unresolved.length ? esc(item.unresolved.join(' · ')) :
      tr('No automated editorial flags; human sign-off is still pending.',
        'Nu există observații automate; aprobarea umană este încă necesară.'),
    '</p><h4>', tr('Approval checklist — all pending', 'Lista aprobărilor — toate în așteptare'), '</h4>',
    '<ul class="gates"><li>',
    tr('Missing: authorized, model-specific product photograph', 'Lipsește: fotografie autorizată pentru modelul exact'),
    '</li><li>', tr('Pending: photographic/illustration rights and usage permission',
      'În așteptare: drepturi și permisiune pentru imagini'),
    '</li><li>', tr('Pending: BODICH model/manufacturer identity verification',
      'În așteptare: confirmarea modelului și producătorului BODICH'),
    '</li><li>', tr('Pending: native Romanian, marketing and legal copy approval',
      'În așteptare: aprobarea textelor de către un vorbitor nativ, marketing și juridic'), '</li></ul>',
    '</details></div></article>',
  ].join('');
}

function renderConcepts(concepts) {
  return concepts.map((concept, i) => [
    '<article class="concept"><div class="concept-image">',
    concept.available ? '<img loading="lazy" src="' + esc(concept.file) +
      '" alt="AI-generated BODICH marketing study ' + (i + 1) + ' — not a product photograph">' :
      '<div class="image-missing">Marketing concept file unavailable</div>',
    '</div><h3>', esc(concept.name), '</h3>',
    '<p>AI-generated BODICH marketing concept. Not a SKU image, not product evidence, not a photograph.</p>',
    '<p lang="ro">Concept de marketing BODICH generat cu IA. Nu este o fotografie de produs și nu confirmă existența unui model.</p>',
    '</article>',
  ].join('')).join('');
}

export function renderHtml(rows, concepts) {
  const categories = [...new Set(rows.map((r) => r.category))].sort();
  const categoryOptions = categories.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    '<meta name="referrer" content="no-referrer">',
    '<title>BODICH — private catalog source review</title>',
    '<link rel="stylesheet" href="review.css"><script src="review.js" defer></script></head>',
    '<body data-bodich-private-review="true" data-locale="en">',
    '<header class="intro"><p class="eyebrow">', REVIEW_MARKER, '</p>',
    '<h1>', tr('Unpublished catalog reference review', 'Revizuirea referințelor de catalog nepublicate'), '</h1>',
    '<p>', tr('External supplier research records, not BODICH products. ' +
    'No prices, orders, stock, approved photos or product offers. All approval gates remain pending.',
    'Referințe externe de cercetare, nu produse BODICH. Fără prețuri, comenzi, stocuri, ' +
    'fotografii aprobate sau oferte. Toate aprobările sunt încă necesare.'), '</p>',
    '<div class="summary"><strong>', rows.length,
    '</strong> ', tr('unique source drafts', 'ciorne unice din surse'), ' · <span id="visible-count">',
    rows.length, '</span> ', tr('visible', 'vizibile'), ' · ',
    tr('0 company-approved', '0 aprobate de companie'), '</div>',
    '<a class="export" href="approval-checklist.csv" download>',
    tr('Export approval checklist (CSV)', 'Exportă lista aprobărilor (CSV)'), '</a>',
    '<a class="export" href="approval-checklist.json" download>',
    tr('Export structured review (JSON)', 'Exportă revizuirea structurată (JSON)'), '</a></header>',
    '<main><div class="filters"><label>', tr('Language', 'Limbă'),
    '<select id="language"><option value="en">English</option><option value="ro">Română</option></select></label>',
    '<label>', tr('Source category', 'Categorie sursă'),
    '<select id="category"><option value="" data-i18n-en="All categories" data-i18n-ro="Toate categoriile">All categories</option>',
    categoryOptions, '</select></label>',
    '<label>', tr('Editorial review', 'Revizuire editorială'),
    '<select id="editorial"><option value="" data-i18n-en="All" data-i18n-ro="Toate">All</option>',
    '<option value="flags" data-i18n-en="Open editorial flags" data-i18n-ro="Observații editoriale deschise">Open editorial flags</option>',
    '<option value="none" data-i18n-en="No automated flags (human review pending)" data-i18n-ro="Fără observații automate (aprobarea umană necesară)">No automated flags (human review pending)</option></select></label>',
    '<label>', tr('Illustration availability', 'Disponibilitatea ilustrației'),
    '<select id="visual"><option value="" data-i18n-en="All" data-i18n-ro="Toate">All</option>',
    '<option value="diagram" data-i18n-en="Generated diagram (unapproved)" data-i18n-ro="Diagramă generată (neaprobată)">Generated diagram (unapproved)</option>',
    '<option value="missing" data-i18n-en="Diagram not generated" data-i18n-ro="Diagramă negenerată">Diagram not generated</option></select></label>',
    '<label>', tr('Supplier lifecycle', 'Stare furnizor'),
    '<select id="lifecycle"><option value="" data-i18n-en="All lifecycle states" data-i18n-ro="Toate stările">All lifecycle states</option>',
    [...new Set(rows.map((r) => r.lifecycle))].sort().map((v) =>
      '<option value="' + esc(v) + '">' + esc(v) + '</option>').join(''),
    '</select></label><label class="search-label">',
    tr('Search source ID, title, slug or EN/RO copy',
      'Caută ID-ul, titlul, identificatorul sau textul EN/RO'),
    '<input type="search" id="search" autocomplete="off" placeholder="Search 132 references"',
    ' data-placeholder-en="Search 132 references" data-placeholder-ro="Caută în 132 de referințe"></label>',
    '</div><p class="muted" id="filter-feedback" role="status" aria-live="polite"></p>',
    '<section class="grid" id="records" aria-label="Unpublished source drafts"',
    ' data-aria-en="Unpublished source drafts" data-aria-ro="Ciorne din surse nepublicate">',
    rows.map(renderRecord).join(''), '</section>',
    '<section class="marketing" aria-labelledby="concept-title"><h2 id="concept-title">',
    tr('Three separate BODICH marketing concepts — not supplier product records',
      'Trei concepte BODICH pentru marketing — nu sunt înregistrări ale furnizorului'), '</h2>',
    '<p>', tr('Concept renderings are not linked to any of the 132 references and cannot count as model photography.',
      'Conceptele nu corespund niciuneia dintre cele 132 de referințe și nu pot fi folosite drept fotografii ale modelelor.'), '</p>',
    '<div class="concept-grid">', renderConcepts(concepts), '</div></section></main>',
    '<footer>', tr('Local/offline review artifact only. Never upload to a public host or Astro public directory. ' +
      'Approval requires human documentation and separate migration to the verified catalog.',
      'Material de revizuire exclusiv local/offline. Nu publicați pe un server sau în directorul Astro public. ' +
      'Aprobarea necesită documente umane și includere separată în catalogul verificat.'), '</footer>',
    '</body></html>',
  ].join('');
}

const csvCell = (value) => {
  let text = String(value ?? '');
  // Avoid formula interpretation when importing user/supplier-derived cells in spreadsheets.
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function renderCsv(rows) {
  const headings = ['sourceId', 'category', 'supplierTitle', 'supplierUrl', 'supplierLifecycle',
    'draftSlug', 'illustrationAvailable', 'illustrationFamily', 'illustrationRights',
    'modelSpecificPhoto', 'modelPhotoRights', 'bodichManufacturerIdentity',
    'nativeRomanianLegalCopy', 'editorialFlags', 'approval'];
  const values = (r) => [r.sourceId, r.category, r.title, r.sourceUrl, r.lifecycle,
    r.draftSlug, r.illustrationAvailable, r.family, r.illustrationRights,
    r.gates.modelSpecificPhoto, r.gates.modelPhotoRights, r.gates.bodichManufacturerIdentity,
    r.gates.nativeRomanianLegalCopy, r.unresolved.join('; '), r.approval];
  return '\uFEFF' + [headings, ...rows.map(values)].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function conceptsFor(rootDir = root) {
  return conceptFiles.map((name) => ({
    name: name.replaceAll('-', ' ').replace('.webp', ''),
    source: resolve(rootDir, 'public/images/turbines', name),
    file: 'concepts/' + name,
    available: existsSync(resolve(rootDir, 'public/images/turbines', name)),
  }));
}

export function publicLeakErrors(projectRoot, outputDir) {
  const violations = [];
  const publicDir = resolve(projectRoot, 'public');
  const distDir = resolve(projectRoot, 'dist');
  const out = resolve(outputDir);
  const privateDir = resolve(projectRoot, 'visual-qa');
  if (!out.startsWith(privateDir + sep)) violations.push('Gallery must remain inside visual-qa/');
  if (out.startsWith(publicDir + sep) || out.startsWith(distDir + sep))
    violations.push('Gallery is inside public output');
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (/private-catalog-review|approval-checklist\.(csv|json)|catalog-review\.css|catalog-review-client\.js/.test(entry.name))
        violations.push('Private gallery file published: ' + relative(projectRoot, full));
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(?:html?|m?js|css|json|csv|xml|txt|svg)$/i.test(entry.name) &&
        readFileSync(full, 'utf8').includes(REVIEW_MARKER))
        violations.push('Private gallery marker published: ' + relative(projectRoot, full));
    }
  };
  walk(publicDir);
  walk(distDir);
  return violations;
}

function validateOutput(rows) {
  // Check exact output parity against the source manifests, not only filenames.
  const concepts = conceptsFor();
  assert.equal(concepts.length, 3, 'Expected three distinct marketing concepts');
  for (const concept of concepts) {
    assert.ok(concept.available, 'Missing original BODICH marketing concept: ' + concept.name);
    assert.ok(existsSync(resolve(outputRoot, concept.file)), 'Missing packaged marketing concept: ' + concept.name);
    assert.ok(readFileSync(resolve(outputRoot, concept.file)).equals(readFileSync(concept.source)),
      'Packaged marketing concept out of sync: ' + concept.name);
  }

  const htmlPath = join(outputRoot, 'index.html');
  assert.ok(existsSync(htmlPath), 'Review HTML missing');
  const html = readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes(REVIEW_MARKER), 'Missing publication warning');
  assert.equal((html.match(/class="review-record"/g) ?? []).length, rows.length, 'Not all cards rendered');
  for (const row of rows) {
    assert.equal(html.split('data-source-id="' + esc(row.sourceId) + '"').length - 1, 1,
      'Missing or duplicate review card: ' + row.sourceId);
  }
  assert.ok(html.includes('ILLUSTRATIVE STUDY — NOT A PRODUCT PHOTOGRAPH'), 'Lost visual disclosure');
  assert.equal(html, renderHtml(rows, concepts), 'Private HTML stale or mismatched against source manifests');

  const csvPath = join(outputRoot, 'approval-checklist.csv');
  const jsonPath = join(outputRoot, 'approval-checklist.json');
  assert.ok(existsSync(csvPath), 'Approval CSV missing');
  assert.ok(existsSync(jsonPath), 'Approval JSON missing');
  const csv = readFileSync(csvPath, 'utf8');
  assert.equal(csv, renderCsv(rows), 'CSV rows or approval gates stale against source manifests');
  assert.equal(csv.split('\r\n').length - 1, rows.length + 1,
    'CSV must contain precisely a header plus one record per source ID');
  const review = JSON.parse(readFileSync(jsonPath, 'utf8'));
  assert.equal(review.schemaVersion, 1, 'Approval JSON schema drift');
  assert.equal(review.privacy, REVIEW_MARKER, 'Approval JSON privacy marker missing');
  assert.equal(review.count, rows.length, 'Approval JSON count drift');
  assert.equal(review.records.length, rows.length, 'Approval JSON records drift');
  assert.deepEqual(review.records, rows, 'Approval JSON stale against source manifests');

  for (const file of ['review.css', 'review.js']) {
    const original = file === 'review.css' ? 'catalog-review.css' : 'catalog-review-client.js';
    assert.ok(existsSync(join(outputRoot, file)), 'Missing offline UI resource: ' + file);
    assert.ok(readFileSync(join(outputRoot, file)).equals(readFileSync(resolve(root, 'scripts', original))),
      'Stale offline UI resource: ' + file);
  }
  const ids = rows.filter((row) => row.illustrationAvailable).map((row) => row.sourceId);
  assert.deepEqual(readdirSync(join(outputRoot, 'images')).sort(),
    ids.map((id) => id + '.webp').sort(), 'Private illustration file inventory out of sync');
  for (const id of ids) {
    const original = allowedAsset(exactArtPath(id), id);
    assert.ok(readFileSync(join(outputRoot, 'images', id + '.webp')).equals(readFileSync(original)),
      'Private illustration bytes differ from generated source: ' + id);
  }
  assert.deepEqual(readdirSync(join(outputRoot, 'concepts')).sort(),
    concepts.map((item) => item.file.split('/').at(-1)).sort(),
    'Marketing concept file inventory mismatch');
}

function makeGallery(rows) {
  assert.deepEqual(publicLeakErrors(root, outputRoot), [], 'Public review leakage detected');
  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(join(outputRoot, 'images'), { recursive: true });
  mkdirSync(join(outputRoot, 'concepts'), { recursive: true });
  // Clear obsolete artifacts so a regenerated gallery cannot retain stale image claims.
  for (const dir of ['images', 'concepts']) {
    rmSync(join(outputRoot, dir), { recursive: true, force: true });
    mkdirSync(join(outputRoot, dir), { recursive: true });
  }
  for (const row of rows) if (row.illustrationAvailable) {
    copyFileSync(allowedAsset(exactArtPath(row.sourceId), row.sourceId),
      join(outputRoot, 'images', row.sourceId + '.webp'));
  }
  const concepts = conceptsFor();
  assert.ok(concepts.every((item) => item.available), 'Three BODICH marketing concepts are required');
  for (const item of concepts) if (item.available)
    copyFileSync(item.source, join(outputRoot, item.file));
  for (const file of ['review.css', 'review.js']) {
    const from = file === 'review.css' ? 'catalog-review.css' : 'catalog-review-client.js';
    copyFileSync(resolve(root, 'scripts', from), join(outputRoot, file));
  }
  writeFileSync(join(outputRoot, 'index.html'), renderHtml(rows, concepts));
  writeFileSync(join(outputRoot, 'approval-checklist.csv'), renderCsv(rows));
  writeFileSync(join(outputRoot, 'approval-checklist.json'),
    JSON.stringify({ schemaVersion: 1, privacy: REVIEW_MARKER, count: rows.length, records: rows }, null, 2) + '\n');
  validateOutput(rows);
  assert.deepEqual(publicLeakErrors(root, outputRoot), [], 'Public review leakage detected');
  console.log('Private BODICH review: ' + rows.length + ' source drafts; ' +
    rows.filter((r) => r.illustrationAvailable).length + ' generated diagrams; ' +
    concepts.filter((c) => c.available).length + ' marketing concepts. Output: ' +
    relative(root, outputRoot) + '/index.html');
}

function fixture() {
  const item = (id) => ({
    id, sourceTitle: 'Source ' + id, canonicalUrl: 'https://example.org/item/' + id,
    sourceCategoryIds: ['g5'], sourceStatus: 'unknown', manufacturer: 'Example vendor',
    sourceDiscovery: 'category_listing', evidenceUrls: ['https://example.org/item/' + id],
  });
  const edit = (id) => ({
    sourceId: id, slug: 'reference-' + id, approval: 'draft', images: [], specs: [],
    copy: Object.fromEntries(['en', 'ro'].map((lang) => [lang, {
      name: lang + ' title', summary: lang + ' summary', description: lang + ' description',
    }])),
  });
  const image = (id) => ({
    sourceId: id, sourceTitle: 'Source ' + id, sourceUrl: 'https://example.org/item/' + id,
    family: 'jet-g5', kind: 'original_diagram', isProductPhoto: false, approved: false,
    rights: 'pending', alt: { en: 'Study ' + id, ro: 'Studiu ' + id },
    assets: { webp600: exactArtPath(id) },
  });
  const review = (id) => ({
    sourceId: id, sourceCategory: 'g5', sourceUrl: 'https://example.org/item/' + id,
    supplierLifecycle: 'unknown', structuredSpecCount: 0,
    evidenceUrls: ['https://example.org/item/' + id], copyStatus: 'automated_consistency_checked_unpublished',
    humanRomanianReview: pendingHuman, unresolved: [],
  });
  return {
    inventory: { products: [item('kt-a'), item('kt-b')] },
    overrides: { records: [edit('kt-a'), edit('kt-b')] },
    art: { entries: [image('kt-a'), image('kt-b')] },
    review: { items: [review('kt-a'), review('kt-b')] },
    expectedCount: 2, hasAsset: (path) => path.includes('kt-a/'),
  };
}
function selfTest() {
  const data = fixture();
  const rows = assemble(data);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.illustrationAvailable).length, 1);
  assert.equal(rows[0].gates.modelSpecificPhoto, 'missing');
  assert.equal(rows[0].gates.nativeRomanianLegalCopy, 'pending');
  const html = renderHtml(rows, []);
  assert.equal((html.match(/class="review-record"/g) ?? []).length, 2);
  assert.ok(html.includes('ILLUSTRATIVE STUDY — NOT A PRODUCT PHOTOGRAPH'));
  assert.ok(html.includes('No generated illustration'));
  assert.ok(html.includes('data-search="kt-a Source kt-a reference-kt-a en title'));
  const firstSearch = html.match(/data-search="([^"]+)"/)?.[1];
  assert.ok(firstSearch && !firstSearch.includes('pending') && !firstSearch.includes('photograph'),
    'Search index must not contain review boilerplate');
  assert.equal(renderCsv(rows).split('\r\n').length, 4);
  const mutateSafe = (change, expected) => {
    const copy = JSON.parse(JSON.stringify({ inventory: data.inventory, overrides: data.overrides,
      art: data.art, review: data.review, expectedCount: data.expectedCount }));
    change(copy);
    assert.throws(() => assemble({ ...copy, hasAsset: data.hasAsset }), expected);
  };
  mutateSafe((x) => { x.inventory.products[1].id = 'kt-a'; }, /Duplicate source: kt-a/);
  mutateSafe((x) => { x.overrides.records[1].slug = 'reference-kt-a'; }, /Duplicate \/ missing draft slug/);
  mutateSafe((x) => { x.overrides.records[0].copy.ro = null; }, /Missing ro name/);
  mutateSafe((x) => { x.art.entries.pop(); }, /artwork count \/ coverage drift/);
  mutateSafe((x) => { x.art.entries[0].approved = true; }, /Premature art approval/);
  mutateSafe((x) => { x.art.entries[0].isProductPhoto = true; }, /Diagram masquerading as product photo/);
  mutateSafe((x) => { x.art.entries[0].assets.webp600 = '../public/photo.webp'; }, /Artwork\/ID mapping drift/);
  mutateSafe((x) => { x.review.items[0].humanRomanianReview = 'approved'; }, /Unverified sign-off state/);
  mutateSafe((x) => { x.review.items[0].sourceUrl = 'https://example.org/other'; }, /Copy\/source URL drift/);
  const testRoot = mkdtempSync(join(tmpdir(), 'bodich-private-review-'));
  try {
    const out = join(testRoot, 'visual-qa', 'private-catalog-review');
    mkdirSync(join(testRoot, 'dist'), { recursive: true });
    assert.deepEqual(publicLeakErrors(testRoot, out), []);
    writeFileSync(join(testRoot, 'dist', 'index.html'), REVIEW_MARKER);
    assert.ok(publicLeakErrors(testRoot, out).length > 0);
    rmSync(join(testRoot, 'dist', 'index.html'));
    mkdirSync(join(testRoot, 'public', 'private-catalog-review'), { recursive: true });
    assert.ok(publicLeakErrors(testRoot, out).length > 0);
    writeFileSync(join(testRoot, 'dist', 'innocent.js'), '/* ' + REVIEW_MARKER + ' */');
    assert.ok(publicLeakErrors(testRoot, out).some((x) => x.includes('innocent.js')));
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
  console.log('Private review self-tests passed: identity, EN/RO, image disclaimers, approvals, source joins and leakage.');
}

function main(args) {
  assert.ok(args.length <= 1 && args.every((x) => ['--check', '--self-test'].includes(x)),
    'Usage: node scripts/build-catalog-review.mjs [--check | --self-test]');
  if (args.includes('--self-test')) {
    selfTest();
  } else {
    const sources = {
      inventory: readJson(snapshot.inventory), overrides: readJson(snapshot.overrides),
      art: readJson(snapshot.art), review: readJson(snapshot.review),
    };
    const rows = assemble(sources);
    assert.deepEqual(publicLeakErrors(root, outputRoot), [], 'Public review leakage detected');
    if (args.includes('--check')) {
      validateOutput(rows);
      console.log('Private review validated: 132 unique drafts, all packaged assets match source manifests, no public leakage.');
    } else makeGallery(rows);
  }
}

// Safe to import without executing the CLI or modifying local files.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

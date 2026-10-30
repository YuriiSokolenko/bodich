/**
 * QA-only generated diagram staging and distribution audit.
 * Neither supplier references nor their diagrams become company-approved stock.
 */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

assert.equal(process.env.BODICH_MEDIA_PROFILE, 'qa_full', 'QA staging/audit is opt-in only');
const mode = process.argv[2];
assert.ok(['--stage', '--verify'].includes(mode), 'Expected --stage or --verify');
const inventory = JSON.parse(readFileSync('docs/catalog/source-inventory.json', 'utf8'));
const overrides = JSON.parse(readFileSync('docs/catalog/reference-overrides.json', 'utf8'));
const manifest = JSON.parse(readFileSync('docs/catalog/art-manifest.json', 'utf8'));
const count = 132;
for (const [name, rows] of [['inventory', inventory.products], ['overrides', overrides.records], ['artwork', manifest.entries]]) {
  assert.equal(rows.length, count, name + ' must contain 132 reference records');
}
const sourceIds = new Set(inventory.products.map((item) => item.id));
const overlayById = new Map(overrides.records.map((item) => [item.sourceId, item]));
assert.equal(sourceIds.size, count);
assert.equal(overlayById.size, count);
assert.equal(new Set(overrides.records.map((item) => item.slug)).size, count);
const seen = new Set();
const artForQa = [];
for (const entry of manifest.entries) {
  const id = entry.sourceId;
  assert.match(id, /^kt-(?:[0-9]+|sq-[A-Z0-9]+)$/);
  assert.ok(sourceIds.has(id) && !seen.has(id), 'Invalid or duplicate artwork source ID: ' + id);
  seen.add(id);
  artForQa.push({ sourceId: id, alt: entry.alt });
  assert.equal(entry.approved, false, 'QA art must remain unapproved');
  assert.equal(entry.isProductPhoto, false, 'QA art must not claim to be product photography');
  assert.equal(entry.kind, 'original_diagram');
  const sourcePath = 'docs/catalog/draft-assets/' + id + '/concept-600.webp';
  assert.equal(entry.assets.webp600, sourcePath, 'Art path must match source ID');
  const row = overlayById.get(id);
  assert.equal(row?.approval, 'draft', 'QA must not promote reference records');
  for (const locale of ['en', 'ro']) {
    assert.ok(row.copy?.[locale]?.name && row.copy?.[locale]?.description,
      'QA requires bilingual research copy for ' + id);
  }
  const source = resolve(sourcePath);
  const destination = resolve(mode === '--stage' ? 'public/qa-art/' + id + '.webp' : 'dist/qa-art/' + id + '.webp');
  if (mode === '--stage') {
    assert.ok(existsSync(source) && lstatSync(source).isFile(), 'Missing generated diagram: ' + sourcePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  } else {
    assert.ok(existsSync(destination) && lstatSync(destination).isFile(), 'Missing QA distribution art for ' + id);
  }
}
if (mode === '--stage') {
  const records = inventory.products.map((source) => {
    const row = overlayById.get(source.id);
    assert.ok(row, 'Missing staged overlay: ' + source.id);
    return {
      sourceId: source.id,
      slug: row.slug,
      copy: row.copy,
      specs: row.specs,
      source: {
        url: source.canonicalUrl,
        sections: source.sourceCategoryIds,
        status: source.sourceStatus,
      },
    };
  });
  // Deliberately replaces the EMPTY source-tree fixture only in the isolated
  // Docker QA builder, after normal checks. Never commit generated research.
  writeFileSync('src/qa/catalog-data.json',
    JSON.stringify({ records, art: artForQa }) + '\n');
}
if (mode === '--verify') {
  for (const locale of ['en', 'ro']) {
    const index = readFileSync(resolve('dist', locale, 'qa', 'index.html'), 'utf8');
    assert.match(index, /data-qa-catalog/, 'QA catalog landing is missing');
    assert.match(index, /noindex, nofollow/, 'QA catalog must not be indexable');
    assert.match(index, /data-media-profile="qa_full"/, 'QA profile must be explicit');
    for (const row of overrides.records) {
      assert.match(row.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      const filename = resolve('dist', locale, 'qa', row.slug, 'index.html');
      assert.ok(existsSync(filename), 'QA product page missing: ' + filename);
      const html = readFileSync(filename, 'utf8');
      assert.ok(html.includes('data-qa-detail="' + row.sourceId + '"'), 'Wrong QA detail identity: ' + row.sourceId);
      assert.match(html, /noindex, nofollow/, 'QA detail must not be indexable');
      assert.match(html, /TESTING ONLY|DOAR PENTRU TESTARE/, 'QA warning is missing');
    }
    const homepage = readFileSync(resolve('dist', locale, 'index.html'), 'utf8');
    assert.match(homepage, /qa_full/, 'QA homepage must identify the profile');
    assert.match(homepage, /qa\//, 'QA catalog must be reachable from main site');
  }
  const robots = readFileSync('dist/robots.txt', 'utf8');
  assert.match(robots, /Disallow: \/\b|Disallow: \/$/m, 'QA robots must disallow crawling');
}
console.log('QA FULL ' + mode + ': ' + count + ' source-linked diagrams and ' +
  (mode === '--verify' ? count * 2 + ' bilingual detail pages verified' : 'artifacts staged'));

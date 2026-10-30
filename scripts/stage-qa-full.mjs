/**
 * Isolated QA-only reference staging / distribution audit.
 * The 132 model-specific diagrams remain offline, never part of QA website output.
 * QA displays one registered, rights-unverified BODICH AI turbine concept.
 */
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

assert.equal(process.env.BODICH_MEDIA_PROFILE, 'qa_full', 'QA staging/audit is opt-in only');
const mode = process.argv[2];
assert.ok(['--stage', '--verify'].includes(mode), 'Expected --stage or --verify');
const inventory = JSON.parse(readFileSync('docs/catalog/source-inventory.json', 'utf8'));
const overrides = JSON.parse(readFileSync('docs/catalog/reference-overrides.json', 'utf8'));
const count = 132;
assert.equal(inventory.products.length, count, 'Inventory must contain 132 source records');
assert.equal(overrides.records.length, count, 'Overrides must contain 132 draft records');
const sourceIds = new Set(inventory.products.map((item) => item.id));
const overlayById = new Map(overrides.records.map((item) => [item.sourceId, item]));
const sourceById = new Map(inventory.products.map((item) => [item.id, item]));
assert.equal(sourceIds.size, count);
assert.equal(overlayById.size, count);
assert.equal(new Set(overrides.records.map((item) => item.slug)).size, count);
for (const row of overrides.records) {
  assert.ok(sourceIds.has(row.sourceId), 'Unknown source ID: ' + row.sourceId);
  assert.match(row.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(row.approval, 'draft', 'QA cannot approve references: ' + row.sourceId);
  for (const locale of ['en', 'ro']) {
    assert.ok(row.copy?.[locale]?.name && row.copy?.[locale]?.description,
      'QA requires bilingual research copy for ' + row.sourceId);
  }
}

const concept = '/images/turbines/bodich-card-concept-01';
const image = concept + '.webp';
const srcset = concept + '-360.webp 360w, ' + concept + '-600.webp 600w';
const variants = [image, concept + '-360.webp', concept + '-600.webp'];
const alts = {
  en: 'BODICH turbine concept art',
  ro: 'Concept ilustrativ de turbină BODICH',
};
const captions = {
  en: 'AI-generated illustrative concept art; not an exact model photograph.',
  ro: 'Imagine conceptuală ilustrativă generată cu IA; nu este o fotografie a modelului exact.',
};
function verifyImages(html, locale, expected, label) {
  assert.doesNotMatch(html, /qa-art\//, 'Schematic art reference in ' + label);
  assert.ok(html.includes(captions[locale]), 'Missing localized AI concept disclosure: ' + label);
  const tags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const selected = tags.filter((tag) => tag.includes('src="' + image + '"'));
  assert.equal(selected.length, expected, 'Wrong AI concept image count: ' + label);
  for (const tag of selected) {
    assert.ok(tag.includes('srcset="' + srcset + '"'), 'Missing responsive concept sources: ' + label);
    assert.ok(tag.includes('alt="' + alts[locale] + '"'), 'Wrong generic concept alt: ' + label);
    assert.ok(tag.includes('width="600"') && tag.includes('height="450"'),
      'Missing concept dimensions: ' + label);
    assert.ok(tag.includes('sizes="'), 'Missing responsive sizes: ' + label);
  }
}
const assetsRoot = mode === '--stage' ? 'public' : 'dist';
for (const path of variants) {
  const filename = resolve(assetsRoot + path);
  assert.ok(existsSync(filename) && lstatSync(filename).isFile(), 'Missing staged QA concept asset: ' + filename);
  const bytes = readFileSync(filename);
  assert.ok(bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP', 'Invalid WebP QA concept asset: ' + filename);
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
  // Replace the checked-in EMPTY fixture only inside the disposable QA builder.
  writeFileSync('src/qa/catalog-data.json', JSON.stringify({ records }) + '\n');
}
if (mode === '--verify') {
  assert.ok(!existsSync('dist/qa-art'), 'Offline schematic images leaked into QA output');
  for (const locale of ['en', 'ro']) {
    const index = readFileSync(resolve('dist', locale, 'qa', 'index.html'), 'utf8');
    assert.match(index, /data-qa-catalog/, 'QA catalog landing is missing');
    assert.match(index, /noindex, nofollow/, 'QA catalog must not be indexable');
    assert.match(index, /data-media-profile="qa_full"/, 'QA profile must be explicit');
    verifyImages(index, locale, count, locale + ' QA catalog');
    for (const row of overrides.records) {
      assert.ok(index.includes('href="/' + locale + '/qa/' + row.slug + '/"'),
        'Catalog reference link missing: ' + row.slug);
      const filename = resolve('dist', locale, 'qa', row.slug, 'index.html');
      assert.ok(existsSync(filename), 'QA product page missing: ' + filename);
      const html = readFileSync(filename, 'utf8');
      assert.ok(html.includes('data-qa-detail="' + row.sourceId + '"'), 'Wrong QA detail identity: ' + row.sourceId);
      assert.match(html, /noindex, nofollow/, 'QA detail must not be indexable');
      assert.match(html, /TESTING ONLY|DOAR PENTRU TESTARE/, 'QA warning is missing');
      const canonical = sourceById.get(row.sourceId)?.canonicalUrl;
      assert.ok(canonical, 'Missing source URL: ' + row.sourceId);
      const expectedHref = canonical.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      assert.ok(html.includes('data-qa-external-source') &&
        html.includes('href="' + expectedHref + '"'),
        'Canonical external reference link missing: ' + row.slug);
      verifyImages(html, locale, 1, locale + '/' + row.slug);
    }
    const homepage = readFileSync(resolve('dist', locale, 'index.html'), 'utf8');
    assert.match(homepage, /qa_full/, 'QA homepage must identify the profile');
    assert.match(homepage, /qa\//, 'QA catalog must be reachable from main site');
    assert.ok(homepage.includes('/images/turbines/bodich-hero-concept.webp'),
      'QA homepage hero visual must remain unchanged');
  }
  const robots = readFileSync('dist/robots.txt', 'utf8');
  assert.match(robots, /Disallow: \/\b|Disallow: \/$/m, 'QA robots must disallow crawling');
}
console.log('QA FULL ' + mode + ': ' + count + ' research references, one shared AI concept with ' +
  variants.length + ' assets' + (mode === '--verify' ? ' and 264 bilingual detail pages verified' : ' staged'));

/**
 * Stage 17: validate human editorial signoffs and rendered bilingual SEO.
 * Run after each production, nested-base and presentation build.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { catalogCategories, confirmedProducts } from '../src/catalog/data.ts';

const pageKeys = ['home', 'products', 'accessories', 'support', 'about', 'contact'];
const locales = ['en', 'ro'];
const gates = ['english', 'romanian', 'technical', 'legal', 'media'];
const reviewLink = /^https:\/\/github\.com\/YuriiSokolenko\/bodich\/(?:issues|pull)\/\d+(?:[\/#?]|$)/;
const loadJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const matrix = loadJson('docs/editorial/review-matrix.json');

function isApproved(row) {
  return Boolean(row && gates.every((key) => row[key] === 'approved')
    && typeof row.reviewedBy === 'string' && row.reviewedBy.trim()
    && typeof row.reviewRecord === 'string' && reviewLink.test(row.reviewRecord));
}
function checkMatrix(data) {
  assert.equal(data.schemaVersion, 1, 'editorial review matrix version mismatch');
  assert.deepEqual(Object.keys(data.pages).sort(), [...pageKeys].sort(), 'review page mismatch');
  for (const [page, row] of Object.entries(data.pages)) {
    assert.deepEqual(Object.keys(row).sort(), [...gates, 'reviewedBy', 'reviewRecord'].sort(), page + ': invalid review fields');
    for (const key of gates) assert(['pending', 'approved', 'rejected'].includes(row[key]), page + ': invalid gate ' + key);
    assert(typeof row.reviewedBy === 'string' && typeof row.reviewRecord === 'string', page + ': review evidence must be strings');
    if (gates.some((key) => row[key] === 'approved')) {
      assert(row.reviewedBy.trim() && reviewLink.test(row.reviewRecord),
        page + ': approved claims need named human reviewer and traceable review URL');
    }
  }
}
checkMatrix(matrix);

if (process.argv.includes('--self-test')) {
  const pending = { english: 'pending', romanian: 'pending', technical: 'pending', legal: 'pending', media: 'pending', reviewedBy: '', reviewRecord: '' };
  assert.equal(isApproved(pending), false);
  const approved = Object.fromEntries(gates.map((gate) => [gate, 'approved']));
  Object.assign(approved, { reviewedBy: 'human-editor', reviewRecord: 'https://github.com/YuriiSokolenko/bodich/pull/123#pullrequestreview-456' });
  assert.equal(isApproved(approved), true);
  for (const gate of gates) assert.equal(isApproved({ ...approved, [gate]: 'pending' }), false);
  assert.equal(isApproved({ ...approved, reviewedBy: '' }), false);
  assert.equal(isApproved({ ...approved, reviewRecord: 'not-evidence' }), false);
  assert.throws(() => checkMatrix({ schemaVersion: 1, pages: { ...matrix.pages, unknown: pending } }));
  console.log('Editorial SEO policy fixture tests passed.');
  process.exit(0);
}
if (!process.argv.includes('--routes')) {
  console.log('Editorial review matrix structurally valid; all approvals are human-supplied only.');
  process.exit(0);
}
const dist = resolve(process.argv[process.argv.indexOf('--routes') + 1] || 'dist');
const base = (process.env.ASTRO_BASE || '/').replace(/\/+$/, '');
const domain = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
const actualUrl = (path) => domain ? new URL(`${base}${path}`, domain).toString() : null;
const load = (...segments) => readFileSync(join(dist, ...segments, 'index.html'), 'utf8');
const approved = pageKeys.filter((key) => isApproved(matrix.pages[key]));
const titles = new Set(), descriptions = new Set();
const expectedPaths = new Set();
const publicRoutes = [];
for (const locale of locales) {
  for (const page of pageKeys) {
    const slug = page === 'home' ? '' : page;
    const urlPath = `/${locale}/${slug ? slug + '/' : ''}`;
    publicRoutes.push({ locale, page, urlPath, html: load(locale, ...(slug ? [slug] : [])) });
    expectedPaths.add(urlPath);
  }
  for (const category of catalogCategories) {
    expectedPaths.add(`/${locale}/${category.section}/${category.id}/`);
  }
}
assert.equal(confirmedProducts.length, 0,
  'Stage 17 cannot approve catalog products or alter the Stage 13/14 gate');
for (const { locale, page, urlPath, html } of publicRoutes) {
  assert(html.includes(`<html lang="${locale}"`), urlPath + ': wrong language');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  assert.equal((main.match(/<h1\b/g) || []).length, 1, urlPath + ': must have one H1');
  assert(main.includes('<h2'), urlPath + ': missing H2');
  assert(main.includes(`data-editorial-page="${page}"`), urlPath + ': educational content missing');
  assert(main.includes('data-editorial-source'), urlPath + ': source label missing');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert(title && description && description.length >= 50 && description.length <= 220,
    urlPath + ': missing or unhelpful SEO metadata');
  assert(!titles.has(title), urlPath + ': duplicate localized title');
  assert(!descriptions.has(description), urlPath + ': duplicate localized description');
  titles.add(title); descriptions.add(description);
  const indexable = Boolean(domain && approved.includes(page));
  assert(html.includes(`<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}"`),
    urlPath + ': incorrect robots meta');
  const canonical = actualUrl(urlPath);
  if (domain) {
    assert(html.includes(`rel="canonical" href="${canonical}"`), urlPath + ': wrong canonical');
    for (const language of locales) {
      const alternate = actualUrl(urlPath.replace(/^\/(?:en|ro)\//, `/${language}/`));
      assert(html.includes(`hreflang="${language}" href="${alternate}"`), urlPath + ': missing hreflang ' + language);
    }
    assert(html.includes(`hreflang="x-default" href="${actualUrl(urlPath.replace(/^\/ro\//, '/en/'))}"`),
      urlPath + ': missing x-default');
  } else {
    assert(!html.includes('rel="canonical"') && !html.includes('hreflang="x-default"'),
      urlPath + ': canonical invented without a domain');
  }
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(schemas.length, indexable ? 1 : 0, urlPath + ': incorrect schema gating');
  for (const [, raw] of schemas) {
    const schema = JSON.parse(raw);
    assert.equal(schema['@type'], 'WebPage', 'must never invent Product or Organization schema');
    assert.equal(schema.inLanguage, locale);
    assert.equal(schema['@id'], canonical);
  }
  assert(!/kingtechturbines|KingTech|source-inventory|review-ledger|reference-overrides|private-catalog-review|catalog-review-audit|docs\/catalog/i.test(html),
    urlPath + ': unpublished supplier / audit data leaked into page');
  assert(!/<form\b|href="mailto:|href="tel:/i.test(page === 'contact' ? main : ''),
    urlPath + ': unapproved contact channel or form');
  for (const link of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = link[1].split('#')[0].split('?')[0];
    if (!href || !href.startsWith('/')) continue;
    assert(href.startsWith(base + '/'), urlPath + ': broken deployment base in link ' + href);
    const relative = href.slice(base.length);
    if (/^\/(en|ro)\//.test(relative)) {
      assert(expectedPaths.has(relative), urlPath + ': unresolved localized link ' + href);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    assert(/\balt="[^"]+"/.test(match[0]), urlPath + ': missing meaningful image alt text');
  }
}
for (const locale of locales) {
  for (const category of catalogCategories) {
    const path = `/${locale}/${category.section}/${category.id}/`;
    const html = load(locale, category.section, category.id);
    assert(html.includes('name="robots" content="noindex, nofollow"'),
      path + ': category must not inherit informational approval');
  }
}
for (const privatePath of ['docs', 'visual-qa', 'private-catalog-review', 'catalog-review-audit.json']) {
  assert(!existsSync(join(dist, privatePath)), 'private review artifact leaked: ' + privatePath);
}
const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
assert(sitemap.includes('<urlset') && sitemap.includes('</urlset>'), 'invalid sitemap root');
const foundUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.equal(foundUrls.length, domain ? approved.length * locales.length : 0, 'incorrect sitemap inclusion');
for (const url of foundUrls) {
  assert([...publicRoutes].some((route) => actualUrl(route.urlPath) === url),
    'sitemap must include only reviewed information pages');
}
assert(robots.includes('User-agent: *\nDisallow: /'), 'robots.txt must fail closed');
if (approved.length && domain) {
  assert(robots.includes('Sitemap: '), 'approved sitemap must be advertised');
  for (const page of approved) for (const locale of locales) {
    assert(robots.includes(`Allow: ${base}/${locale}/${page === 'home' ? '' : page + '/'}$`),
      'robots allowlist missing reviewed page');
  }
} else {
  assert(!robots.includes('Allow:') && !robots.includes('Sitemap:'),
    'no public indexing until a real domain and human editorial evidence are present');
}
console.log(`Editorial SEO passed: ${publicRoutes.length} EN/RO information routes, ${catalogCategories.length * 2} withheld category routes, ${foundUrls.length} reviewed sitemap entries.`);

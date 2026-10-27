/**
 * Stage 17: validate human editorial signoffs and rendered bilingual SEO.
 * Run after each production, nested-base and presentation build.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { catalogCategories, confirmedProducts } from '../src/catalog/data.ts';
import { editorialGates, editorialPageKeys, editorialReviewProblems, eligibleInformationPages, hasHumanEditorialApproval } from '../src/seo/review-approval.ts';

const pageKeys = editorialPageKeys;
const locales = ['en', 'ro'];
const loadJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const matrix = loadJson('docs/editorial/review-matrix.json');
assert.deepEqual(editorialReviewProblems(matrix), [], 'invalid public editorial matrix');

const forbiddenClaimSignals = [
  { label: 'published price', test: /(?:[$€£]\s*\d|\b\d[\d.,]*\s*(?:EUR|USD|RON|lei)\b)/iu },
  { label: 'stock or immediate sales', test: /\b(?:in stock|available now|buy now|shop now|în stoc|disponibil(?:ă|e|i)? acum|cumpără acum)\b/iu },
  { label: 'performance assertion', test: /\b\d[\d.,]*\s*(?:kgf|rpm|kW|lit(?:er|re)s?\/?h|l\/?h|N\s+thrust|newtons?\s+thrust)\b/iu },
  { label: 'certification assertion', test: /\b(?:certified|certificat(?:ă|e)?|omologat(?:ă|e)?|CE\s+certified|ISO\s*\d+)\b/iu },
  { label: 'manufacturer assertion', test: /\b(?:BODICH\s+(?:manufactures|builds|is\s+(?:an?\s+)?(?:authorized\s+)?manufacturer)|BODICH\s+(?:este\s+)?(?:producător|fabrică))\b/iu },
  { label: 'warranty promise', test: /\b(?:\d+[- ]?(?:year|month)\s+warranty|\d+\s*(?:ani|luni)\s+(?:de\s+)?garanție|garanție\s+de\s+\d+\s+(?:ani|luni)|guaranteed\s+warranty)\b/iu },
];
function scanClaimRisks(text) {
  return forbiddenClaimSignals.filter((entry) => entry.test.test(text)).map((entry) => entry.label);
}
function visibleText(main) {
  return main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, ' ');
}

if (process.argv.includes('--self-test')) {
  const pending = Object.fromEntries(editorialGates.map((gate) => [gate, 'pending']));
  Object.assign(pending, { reviewedBy: '', reviewRecord: '' });
  assert.equal(hasHumanEditorialApproval(pending), false);
  const approved = Object.fromEntries(editorialGates.map((gate) => [gate, 'approved']));
  Object.assign(approved, {
    reviewedBy: 'fixture reviewer (never real)',
    reviewRecord: 'https://github.com/YuriiSokolenko/bodich/pull/999999#pullrequestreview-999999',
  });
  assert.equal(hasHumanEditorialApproval(approved), true, 'real production approval function must pass positive fixture');
  for (const gate of editorialGates) {
    assert.equal(hasHumanEditorialApproval({ ...approved, [gate]: 'pending' }), false);
    assert.equal(hasHumanEditorialApproval({ ...approved, [gate]: 'rejected' }), false);
  }
  for (const bad of [{ ...approved, reviewedBy: '' }, { ...approved, reviewRecord: 'https://github.com/YuriiSokolenko/bodich/issues/57' },
    { ...approved, reviewRecord: 'https://github.com/YuriiSokolenko/bodich/pull/999999' },
    { ...approved, reviewedBy: 42 }, null]) assert.equal(hasHumanEditorialApproval(bad), false);
  const fixtureMatrix = structuredClone(matrix);
  fixtureMatrix.pages.home = approved;
  assert.deepEqual(editorialReviewProblems(fixtureMatrix), []);
  assert.deepEqual(eligibleInformationPages(fixtureMatrix), ['home']);
  assert.deepEqual(eligibleInformationPages(matrix), []);
  assert(editorialReviewProblems({ ...matrix, pages: { ...matrix.pages, unknown: pending } }).length > 0);
  assert(editorialReviewProblems({ ...matrix, pages: { ...matrix.pages, home: { ...pending, legal: 'approved' } } }).length > 0);
  const badClaims = [
    'Available now at €299', 'BODICH manufactures certified engines',
    'Measured 110000 RPM', 'In stock', '2 year warranty',
    'Disponibil acum, 1.200 RON', 'BODICH este producător', 'Motor certificat, 90 kgf',
    'Garanție de 24 luni', 'Buy now',
  ];
  for (const claim of badClaims) assert(scanClaimRisks(claim).length, 'unsafe claim escaped: ' + claim);
  for (const safe of ['Manufacturer instructions depend on the model.',
    'No official service desk, warranty terms or manufacturing claims have been confirmed.',
    'Nu au fost confirmate condițiile de garanție.']) {
    assert.deepEqual(scanClaimRisks(safe), [], 'qualified educational copy flagged');
  }
  console.log('Editorial SEO policy regression fixtures passed: positive, partial/rejected gates, approval evidence and EN/RO forbidden claims.');
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
const reviewedPages = eligibleInformationPages(matrix);
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
const profile = publicRoutes[0]?.html.match(/data-media-profile="([^"]+)"/)?.[1];
const approved = profile === 'release_safe' && !base ? reviewedPages : [];
for (const { locale, page, urlPath, html } of publicRoutes) {
  assert(html.includes(`<html lang="${locale}"`), urlPath + ': wrong language');
  assert(html.includes(`data-media-profile="${profile}"`), urlPath + ': mismatched build profile');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  assert.equal((main.match(/<h1\b/g) || []).length, 1, urlPath + ': must have one H1');
  assert(main.includes('<h2'), urlPath + ': missing H2');
  assert(main.includes(`data-editorial-page="${page}"`), urlPath + ': educational content missing');
  assert(main.includes('data-editorial-source'), urlPath + ': source label missing');
  assert.deepEqual(scanClaimRisks(visibleText(main)), [], urlPath + ': unsupported factual/commercial claim');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert(title && description && description.length >= 50 && description.length <= 220,
    urlPath + ': missing or unhelpful SEO metadata');
  assert(!titles.has(title), urlPath + ': duplicate localized title');
  assert(!descriptions.has(description), urlPath + ': duplicate localized description');
  titles.add(title); descriptions.add(description);
  if (approved.includes(page) && domain) assert(title.length >= 25, urlPath + ': approved SEO title too generic');
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
  assert(!/<form\b|href="mailto:|href="tel:/i.test(html),
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
    assert(!html.includes('type="application/ld+json"'), path + ': category cannot inherit corporate schema');
    assert.deepEqual(scanClaimRisks(visibleText(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '')), [], path + ': unsupported category claim');
  }
}
for (const product of confirmedProducts) {
  const category = catalogCategories.find((item) => item.id === product.categoryId);
  assert(category, 'verified product has invalid category');
  for (const locale of locales) {
    const productPath = `/${locale}/${category.section}/${category.id}/${product.slug}/`;
    const html = load(locale, category.section, category.id, product.slug);
    assert(html.includes('name="robots" content="noindex, nofollow"'), productPath + ': product cannot inherit editorial approval');
    assert(!html.includes('type="application/ld+json"'), productPath + ': no corporate WebPage schema on product');
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
  const route = publicRoutes.find((entry) => actualUrl(entry.urlPath) === url);
  assert(route && approved.includes(route.page), 'sitemap must include only approved information pages');
  for (const locale of locales) {
    const counterpart = actualUrl(route.urlPath.replace(/^\/(?:en|ro)\//, `/${locale}/`));
    assert(sitemap.includes(`hreflang="${locale}" href="${counterpart}"`), 'sitemap missing ' + locale + ' alternate');
  }
}
assert(robots.includes('User-agent: *\nDisallow: /'), 'robots.txt must fail closed');
if (approved.length && domain) {
  assert(robots.includes('Sitemap: '), 'approved sitemap must be advertised');
  assert(robots.includes('Allow: /_astro/'), 'crawler must be able to render approved page CSS and JS');
  for (const page of approved) for (const locale of locales) {
    assert(robots.includes(`Allow: ${base}/${locale}/${page === 'home' ? '' : page + '/'}$`),
      'robots allowlist missing reviewed page');
  }
} else {
  assert(!robots.includes('Allow:') && !robots.includes('Sitemap:'),
    'no public indexing until a real domain and human editorial evidence are present');
}
console.log(`Editorial SEO passed: ${publicRoutes.length} EN/RO information routes, ${catalogCategories.length * 2} withheld category routes, ${foundUrls.length} reviewed sitemap entries.`);

#!/usr/bin/env node
/**
 * Issue #70: a closed, audited static Cloudflare Pages release surface.
 * Deliberately independent of robots/noindex (neither is access control).
 * Only the committed route/asset allow-list can widen publication.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const policy = load('config/pages-release-allowlist.json');
const source = load('docs/catalog/source-inventory.json');
const overlays = load('docs/catalog/reference-overrides.json');
const registry = load('docs/catalog/bodich-products.json');
const digest = (value) => createHash('sha256').update(value).digest('hex');

function assertPolicy() {
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.profile, 'release_safe');
  assert.equal(policy.supplierDraftCount, 132);
  assert.equal(source.products.length, policy.supplierDraftCount);
  assert.equal(registry.products.length, 0, 'New BODICH registry products require separate publication approval');
  assert.ok(Array.isArray(policy.routes) && Array.isArray(policy.sitemapUrls));
  assert.deepEqual(policy.sitemapUrls, [], 'Sitemap publication requires a separately approved allow-list update');
  assert.equal(new Set(policy.routes).size, policy.routes.length);
  assert.ok(policy.routes.includes('/') && policy.routes.includes('/sitemap.xml') && policy.routes.includes('/robots.txt'));
  for (const route of policy.routes) {
    assert.ok(/^\/(?:[a-z0-9-]+\/)*$|^\/(?:robots\.txt|sitemap\.xml)$/.test(route),
      'Unsafe release route: ' + route);
  }
  const expected = new Set(['/', '/sitemap.xml', '/robots.txt']);
  for (const locale of ['en', 'ro']) {
    expected.add('/' + locale + '/');
    for (const section of ['products', 'accessories', 'support', 'about', 'contact'])
      expected.add('/' + locale + '/' + section + '/');
  }
  for (const category of [
    ['products', 'turbine-engines'], ['accessories', 'ecu-controls'],
    ['accessories', 'fuel-systems'], ['accessories', 'electrical-components'],
    ['accessories', 'mounting-hardware'],
  ]) for (const locale of ['en', 'ro'])
    expected.add('/' + locale + '/' + category[0] + '/' + category[1] + '/');
  assert.deepEqual([...policy.routes].sort(), [...expected].sort(),
    'Route set must be updated only through an explicit, reviewed publication change');
}

const filesForRoutes = () => new Set(policy.routes.map((path) =>
  path.endsWith('/') ? path.slice(1) + 'index.html' : path.slice(1)));
function permittedFile(file, routes) {
  return routes.has(file) || file === '_headers' ||
    /^_astro\/[a-zA-Z0-9_.-]+\.(?:css|js)$/.test(file);
}

function forbiddenPhrases() {
  const tokens = new Set([
    'kingtechturbines', 'kingtech', 'source-inventory', 'reference-overrides',
    'review-ledger', 'copy-review-matrix', 'catalog-review-audit', 'private-catalog-review',
    'bodich-product-registry-audit', 'restricted:', 'app.squareup.com',
  ]);
  for (const row of source.products) {
    tokens.add(row.id);
    // Only full, distinctive supplier titles; common nouns are not private IDs.
    if (typeof row.sourceTitle === 'string' && row.sourceTitle.length >= 12)
      tokens.add(row.sourceTitle.toLowerCase());
    for (const field of ['slug', 'alias', 'sourceSlug'])
      if (typeof row[field] === 'string' && row[field].length >= 6)
        tokens.add(row[field].toLowerCase());
  }
  for (const row of overlays.records) {
    if (row.slug) tokens.add(row.slug.toLowerCase());
    if (typeof row.model === 'string' && row.model.length >= 7)
      tokens.add(row.model.toLowerCase());
  }
  for (const row of registry.products) {
    for (const item of [row.id, row.slug, ...(row.variants || []).flatMap((v) => [v.id])])
      if (item) tokens.add(String(item).toLowerCase());
  }
  return [...tokens].filter((token) => token.length >= 4).sort((a, b) => b.length - a.length);
}
const phrases = forbiddenPhrases();
function leakProblems(relativePath, bytes) {
  const text = bytes.toString('utf8').toLowerCase();
  const haystack = relativePath.toLowerCase() + '\n' + text;
  // Never print the matched draft identifier or leaked content into CI logs.
  return phrases.some((phrase) => haystack.includes(phrase)) ? ['Private supplier/registry marker in ' + relativePath] : [];
}

function headerProblems(content) {
  const problems = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (lines[0] !== '/*') problems.push('Missing wildcard static Pages header rule');
  const headers = new Map();
  for (const line of lines.slice(1)) {
    if (!/^\s+[^:\s]+:/.test(line)) { problems.push('Unexpected or unsupported header rule'); continue; }
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) { problems.push('Malformed Pages header'); continue; }
    const key = match[1].toLowerCase();
    if (headers.has(key)) problems.push('Duplicate Pages header: ' + key);
    headers.set(key, match[2]);
  }
  for (const [key, expected] of [
    ['x-content-type-options', 'nosniff'], ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['x-frame-options', 'DENY'], ['x-robots-tag', 'noindex'],
  ]) if (headers.get(key) !== expected) problems.push('Missing/unsafe ' + key);
  const csp = headers.get('content-security-policy') || '';
  for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'",
    "base-uri 'self'", "frame-ancestors 'none'", "form-action 'none'"])
    if (!csp.includes(directive)) problems.push('CSP missing ' + directive);
  if (/unsafe-inline|unsafe-eval|https?:/i.test((csp.match(/script-src[^;]*/)?.[0] || '')))
    problems.push('CSP cannot allow inline/eval/remote JavaScript');
  if (headers.has('strict-transport-security')) problems.push('HSTS requires separately authorized production-only domain');
  return problems;
}
function gather(dir, prefix = '') {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    const absolute = join(dir, entry.name);
    const stat = lstatSync(absolute);
    assert.ok(!stat.isSymbolicLink(), 'Symlink cannot be published: ' + name);
    if (stat.isDirectory()) result.push(...gather(absolute, name));
    else {
      assert.ok(stat.isFile(), 'Non-file output: ' + name);
      assert.ok(stat.size <= 12 * 1024 * 1024, 'Oversize asset requires independent review: ' + name);
      result.push({ name, bytes: readFileSync(absolute) });
    }
  }
  return result;
}
function audit(entries) {
  const errors = [];
  const allowed = filesForRoutes();
  const present = new Map(entries.map((item) => [item.name, item.bytes]));
  for (const file of allowed) if (!present.has(file)) errors.push('Missing approved static route: ' + file);
  for (const { name, bytes } of entries) {
    if (!permittedFile(name, allowed)) errors.push('Not on release allow-list: ' + name);
    if (name !== '_headers') errors.push(...leakProblems(name, bytes));
    if (name.endsWith('.html')) {
      const html = bytes.toString('utf8');
      if (name !== 'index.html' && !html.includes('data-media-profile="release_safe"'))
        errors.push('Non-release-safe HTML: ' + name);
      if (/<form\b|href=["'](?:mailto:|tel:)/i.test(html))
        errors.push('Unauthorized commerce/contact surface: ' + name);
    }
  }
  if (!present.has('_headers')) errors.push('Missing Cloudflare Pages _headers');
  else errors.push(...headerProblems(present.get('_headers').toString('utf8')));
  const sitemap = present.get('sitemap.xml')?.toString('utf8') ?? '';
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const alternates = [...sitemap.matchAll(/<xhtml:link\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
  if (new Set(urls).size !== urls.length) errors.push('Sitemap duplicate URLs');
  if (urls.some((url) => !policy.sitemapUrls.includes(url)) ||
      policy.sitemapUrls.some((url) => !urls.includes(url)) ||
      alternates.some((url) => !policy.sitemapUrls.includes(url)))
    errors.push('Sitemap differs from committed, approved URL allow-list');
  const robots = present.get('robots.txt')?.toString('utf8') || '';
  if (!robots.includes('User-agent: *\nDisallow: /') ||
      /^\s*Allow:|^\s*Sitemap:/m.test(robots))
    errors.push('Unapproved crawler indexability');
  return errors;
}

function selfTest() {
  assertPolicy();
  const routeSet = filesForRoutes();
  assert(permittedFile('en/index.html', routeSet));
  assert(permittedFile('_astro/main.ab12cd.js', routeSet));
  assert(!permittedFile('en/products/purchase/index.html', routeSet));
  assert(!permittedFile('_astro/private-drafts.json', routeSet));
  assert(!permittedFile('docs/catalog/review-ledger.json', routeSet));
  assert(leakProblems('_astro/script.js', Buffer.from('id: ' + source.products[0].id)).length);
  assert(leakProblems('_astro/script.js', Buffer.from(overlays.records[0].slug)).length);
  assert(leakProblems('sitemap.xml', Buffer.from('kingtechturbines.com')).length);
  assert.deepEqual(leakProblems('en/index.html', Buffer.from('A bilingual educational BODICH preview')), []);
  const safeHeaders = readFileSync(join(root, 'public/_headers'), 'utf8');
  assert.deepEqual(headerProblems(safeHeaders), []);
  assert(headerProblems(safeHeaders + '\n  Strict-Transport-Security: max-age=31536000\n').length);
  assert(headerProblems(safeHeaders.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).length);
  const testDir = mkdtempSync(join(tmpdir(), 'bodich-pages-test-'));
  try {
    mkdirSync(join(testDir, '_astro'));
    writeFileSync(join(testDir, '_astro', 'safe.js'), 'const ok = true;');
    assert(gather(testDir).some((item) => item.name === '_astro/safe.js'));
    writeFileSync(join(testDir, 'secret.json'), '{}');
    assert(!permittedFile('secret.json', routeSet));
  } finally { rmSync(testDir, { recursive: true, force: true }); }
  console.log('Cloudflare Pages release regression fixtures passed (routes, draft IDs, CSP and HSTS).');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  assertPolicy();
  const folder = resolve(process.argv[2] ?? 'dist');
  assert(existsSync(folder), 'Missing static dist directory');
  const entries = gather(folder).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const failures = audit(entries);
  const report = {
    schemaVersion: 1, kind: 'cloudflare_pages_static_release_gate',
    releaseProfile: policy.profile, routeAllowListCount: policy.routes.length,
    supplierDraftsQuarantined: policy.supplierDraftCount,
    verdict: failures.length ? 'NO_GO' : 'offline_checks_passed_live_owner_approval_pending',
    files: entries.map(({ name, bytes }) => ({ path: name, sha256: digest(bytes), bytes: bytes.length })),
    findings: failures,
  };
  const out = join(root, 'visual-qa/pages-release-evidence.json');
  mkdirSync(join(root, 'visual-qa'), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  for (const error of failures) console.error('Pages release gate: ' + error);
  console.log('Pages static release: ' + entries.length + ' files, ' + failures.length + ' findings; ' + report.verdict);
  if (failures.length) process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * Issue #70: a closed, audited static Cloudflare Pages release surface.
 * Deliberately independent of robots/noindex (neither is access control).
 * Only the committed route/asset allow-list can widen publication.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from 'parse5';
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
// Logs and public Actions artifacts must never echo an unapproved file path.
const pathId = (name) => digest(name).slice(0, 20);
const finding = (message, name) => message + ' [path-sha256-prefix=' + pathId(name) + ']';
function leakProblems(relativePath, bytes) {
  const text = bytes.toString('utf8').toLowerCase();
  const haystack = relativePath.toLowerCase() + '\n' + text;
  return phrases.some((phrase) => haystack.includes(phrase)) ?
    [finding('Private supplier/registry marker', relativePath)] : [];
}

// Closed CSP contract: any additional directive or source needs review.
const expectedCsp = new Map([
  ['default-src', "'self'"],
  ['base-uri', "'self'"],
  ['object-src', "'none'"],
  ['frame-ancestors', "'none'"],
  ['form-action', "'none'"],
  ['script-src', "'self'"],
  ['style-src', "'self' 'unsafe-inline'"],
  ['img-src', "'self' data:"],
  ['font-src', "'self'"],
  ['connect-src', "'self'"],
  ['upgrade-insecure-requests', ''],
]);
const expectedHeaders = new Map([
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['x-frame-options', 'DENY'],
  ['x-robots-tag', 'noindex'],
  ['permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
]);
function headerProblems(content) {
  const problems = [];
  const lines = content.split(/\r?\n/).filter((line) =>
    line.trim() && !line.trim().startsWith('#'));
  if (lines.shift() !== '/*') problems.push('Missing wildcard static Pages header rule');
  const headers = new Map();
  for (const line of lines) {
    if (!/^\s+[^:\s]+:/.test(line)) {
      problems.push('Unapproved Pages header rule or invalid format');
      continue;
    }
    const match = line.trim().match(/^([^:\s]+):\s*(.*)$/);
    if (!match) { problems.push('Malformed Pages header'); continue; }
    const key = match[1].toLowerCase();
    if (headers.has(key)) problems.push('Duplicate Pages header');
    headers.set(key, match[2].trim());
  }
  for (const [key, expected] of expectedHeaders) {
    if (headers.get(key) !== expected) problems.push('Missing or unsafe ' + key);
  }
  for (const key of headers.keys()) {
    if (key !== 'content-security-policy' && !expectedHeaders.has(key))
      problems.push('Unapproved Pages header');
  }
  if (headers.has('strict-transport-security'))
    problems.push('HSTS requires separately authorized production-only domain');
  const csp = headers.get('content-security-policy') ?? '';
  const actualCsp = new Map();
  for (const piece of csp.split(';').map((v) => v.trim()).filter(Boolean)) {
    const [key, ...tokens] = piece.split(/\s+/);
    if (!/^[a-z-]+$/.test(key) || actualCsp.has(key)) {
      problems.push('Malformed or duplicate CSP directive');
      continue;
    }
    actualCsp.set(key, tokens.join(' '));
  }
  for (const [key, expected] of expectedCsp) {
    if (actualCsp.get(key) !== expected) problems.push('Missing or unsafe CSP ' + key);
  }
  for (const key of actualCsp.keys()) {
    if (!expectedCsp.has(key)) problems.push('Unapproved CSP directive');
  }
  return problems;
}

function gather(dir, prefix = '') {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    const absolute = join(dir, entry.name);
    const stat = lstatSync(absolute);
    assert.ok(!stat.isSymbolicLink(), finding('Symlink cannot be published', name));
    if (stat.isDirectory()) result.push(...gather(absolute, name));
    else {
      assert.ok(stat.isFile(), finding('Non-file output', name));
      assert.ok(stat.size <= 12 * 1024 * 1024, finding('Oversize asset requires review', name));
      result.push({ name, bytes: readFileSync(absolute) });
    }
  }
  return result;
}
// parse5 exposes HTML5-tokenized elements and entity-decoded attributes, unlike
// regex tag scans (which misread slash separators, quotes and character references).
const urlAttributes = new Set([
  'href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster',
  'srcset', 'ping', 'background', 'cite', 'longdesc', 'manifest',
]);
function normalizedScheme(value) {
  // URL parsing discards ASCII tabs/LF/CR inside a scheme and strips leading /
  // trailing C0 controls and spaces. parse5 has already decoded HTML entities.
  return value.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
}
function htmlProblems(html, name) {
  const errors = [];
  const base = (process.env.ASTRO_BASE || '/').replace(/\/+$/, '');
  const prefix = base + '/_astro/';
  const report = (message) => errors.push(finding(message, name));
  const walk = (node) => {
    if (node.tagName) {
      const tag = node.tagName.toLowerCase();
      const attrs = node.attrs ?? [];
      const attrName = (attr) => (attr.prefix ? attr.prefix + ':' : '') + attr.name.toLowerCase();
      const getAttr = (key) => attrs.find((attr) => attrName(attr) === key);
      if (tag === 'form') report('Unauthorized commerce/contact surface');
      for (const attr of attrs) {
        const key = attrName(attr);
        if (key.startsWith('on')) report('Inline event handler rejected by CSP');
        if (urlAttributes.has(key) && /^javascript:/i.test(normalizedScheme(attr.value)))
          report('JavaScript URL rejected by CSP');
        if (key === 'href' && /^(?:mailto|tel):/i.test(normalizedScheme(attr.value)))
          report('Unauthorized commerce/contact surface');
        // srcdoc is nested HTML not traversed as ordinary child nodes.
        if (key === 'srcdoc') report('Inline HTML srcdoc rejected by CSP');
      }
      if (tag === 'script') {
        const src = getAttr('src');
        const type = getAttr('type');
        // Only the literal inert JSON-LD type, without even an empty src,
        // is exempt from the external-script rule.
        if (type?.value === 'application/ld+json' && !src) {
          // JSON-LD content remains separately checked by the SEO validator.
        } else if (!src) {
          report('Inline executable script rejected by CSP');
        } else {
          if (!src.value.startsWith(prefix) ||
              !/^[a-zA-Z0-9_.-]+\.js$/.test(src.value.slice(prefix.length)))
            report('Executable script source is outside approved static assets');
          // No inline fallback payload even when the src itself is approved.
          if (node.childNodes?.some((child) => child.nodeName === '#text' && child.value.trim()))
            report('Inline executable script rejected by CSP');
        }
      }
    }
    for (const child of node.childNodes ?? []) walk(child);
    // The contents of HTML <template> live outside its childNodes.
    if (node.content) walk(node.content);
  };
  walk(parse(html));
  return errors;
}

function audit(entries) {
  const errors = [];
  const allowed = filesForRoutes();
  const present = new Map(entries.map((item) => [item.name, item.bytes]));
  for (const file of allowed)
    if (!present.has(file)) errors.push(finding('Missing approved static route', file));
  for (const { name, bytes } of entries) {
    if (!permittedFile(name, allowed)) errors.push(finding('Not on release allow-list', name));
    if (name !== '_headers') errors.push(...leakProblems(name, bytes));
    if (name.endsWith('.html')) {
      const html = bytes.toString('utf8');
      if (name !== 'index.html' && !html.includes('data-media-profile="release_safe"'))
        errors.push(finding('Non-release-safe HTML', name));
      errors.push(...htmlProblems(html, name));
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
  const badHeaders = [
    safeHeaders + '\n  Strict-Transport-Security: max-age=31536000\n',
    safeHeaders.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    safeHeaders.replace("script-src 'self'", "script-src 'self' data:"),
    safeHeaders.replace("script-src 'self'", "script-src 'self' blob:"),
    safeHeaders.replace("script-src 'self'", "script-src 'self' *"),
    safeHeaders.replace("script-src 'self'", "script-src 'self' 'strict-dynamic'"),
    safeHeaders.replace("default-src 'self'", "default-src 'self' *"),
    safeHeaders.replace("img-src 'self' data:", "img-src https:"),
    safeHeaders.replace("font-src 'self'", "font-src *"),
    safeHeaders.replace("connect-src 'self'", "connect-src https:"),
    safeHeaders.replace("script-src 'self'", "script-src 'self'; script-src-elem *"),
    safeHeaders.replace("script-src 'self'", "script-src 'self'; script-src-attr *"),
    safeHeaders.replace("script-src 'self'", "script-src 'self'; script-src 'self'"),
  ];
  for (const [i, bad] of badHeaders.entries())
    assert(headerProblems(bad).length, 'Unsafe CSP fixture accepted: ' + i);
  const valid = new Map([...routeSet].map((name) => [
    name, name === 'robots.txt' ? 'User-agent: *\nDisallow: /\n' :
      name === 'sitemap.xml' ? '<?xml version="1.0"?><urlset></urlset>' :
        name === 'index.html' ? '<html><body>Redirect</body></html>' :
          '<html data-media-profile="release_safe"><main>Safe content</main></html>',
  ]));
  valid.set('_headers', safeHeaders);
  valid.set('_astro/safe.js', 'document.querySelector("main")');
  const run = (items) => audit([...items].map(([name, value]) =>
    ({ name, bytes: Buffer.from(value) })));
  assert.deepEqual(run(valid), [], 'Valid synthetic dist rejected');
  function negative(label, mutation, message) {
    const modified = new Map(valid);
    mutation(modified);
    const results = run(modified);
    assert(results.some((e) => e.includes(message)),
      'Audit did not reject ' + label + ': ' + results.join('; '));
  }
  negative('extra route', (m) => m.set('en/cart/index.html', '<html/>'), 'Not on release allow-list');
  negative('non-empty sitemap', (m) => m.set('sitemap.xml',
    '<urlset><url><loc>https://example.invalid/en/</loc></url></urlset>'), 'Sitemap differs');
  negative('sitemap alternate', (m) => m.set('sitemap.xml',
    '<urlset><xhtml:link href="https://example.invalid/ro/"/></urlset>'), 'Sitemap differs');
  negative('robots allow', (m) => m.set('robots.txt', 'User-agent: *\nDisallow: /\nAllow: /'), 'Unapproved crawler');
  negative('form', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><form></form></html>'), 'Unauthorized commerce');
  negative('mailto link', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><a href="mailto:x@example.org">Send</a></html>'), 'Unauthorized commerce');
  negative('missing headers', (m) => m.delete('_headers'), 'Missing Cloudflare Pages _headers');
  negative('inline executable JavaScript', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><script type="module">alert(1)</script></html>'),
    'Inline executable script');
  negative('data-type cannot impersonate JSON-LD', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><script data-type="application/ld+json">alert(1)</script></html>'),
    'Inline executable script');
  negative('data-src cannot impersonate external script', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><script data-src="/_astro/safe.js">alert(1)</script></html>'),
    'Inline executable script');
  negative('inline event handler', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><button onclick="alert(1)">Open</button></html>'),
    'Inline event handler');
  negative('inline event on image', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><img src="/_astro/example.js" onload=alert(1)></html>'),
    'Inline event handler');
  negative('javascript href', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><a href="javascript:alert(1)">Open</a></html>'),
    'JavaScript URL');
  negative('unquoted javascript href', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><a href=javascript:alert(1)>Open</a></html>'),
    'JavaScript URL');
  negative('javascript form action', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><input formaction="javascript:alert(1)"></html>'),
    'JavaScript URL');
  negative('remote executable JavaScript', (m) => m.set('en/index.html',
    '<html data-media-profile="release_safe"><script src="https://evil.invalid/a.js"></script></html>'),
    'outside approved static assets');
  const htmlFixture = (markup) =>
    '<html data-media-profile="release_safe"><main>' + markup + '</main></html>';
  const confirmedBypasses = [
    ['slash-separated img handler', '<img/src=x/onerror=alert(1)>', 'Inline event handler'],
    ['quoted > before handler', '<a title=">" onclick=alert(1)>x</a>', 'Inline event handler'],
    ['numeric entity javascript protocol', '<a href="&#106;avascript:alert(1)">x</a>', 'JavaScript URL'],
    ['ASCII tab entity in protocol', '<a href="java&#9;script:alert(1)">x</a>', 'JavaScript URL'],
  ];
  for (const [label, markup, message] of confirmedBypasses)
    negative(label, (m) => m.set('en/index.html', htmlFixture(markup)), message);
  for (const [label, markup, message] of [
    ['slash plus quoted attribute', '<a/title=">"/onmouseover=alert(1)>x</a>', 'Inline event handler'],
    ['nested quoted attribute', '<div><a data-note="a > b" ONCLICK=alert(1)>x</a></div>', 'Inline event handler'],
    ['mixed-case handler', '<img src=x OnErRoR=alert(1)>', 'Inline event handler'],
    ['mixed-case protocol', '<a HREF="JaVaScRiPt:alert(1)">x</a>', 'JavaScript URL'],
    ['hexadecimal entity protocol', '<a href="&#x6a;avascript:alert(1)">x</a>', 'JavaScript URL'],
    ['named entity protocol', '<a href="java&Tab;script:alert(1)">x</a>', 'JavaScript URL'],
    ['LF entity protocol', '<a href="java&#10;script:alert(1)">x</a>', 'JavaScript URL'],
    ['CR entity protocol', '<a href="java&#13;script:alert(1)">x</a>', 'JavaScript URL'],
    ['literal newline in protocol', '<a href="java\nscript:alert(1)">x</a>', 'JavaScript URL'],
    ['C0 leading whitespace in protocol', '<a href="&#1; javascript:alert(1)">x</a>', 'JavaScript URL'],
    ['SVG xlink protocol', '<svg><a xlink:href="javascript:alert(1)">x</a></svg>', 'JavaScript URL'],
    ['unquoted slash scheme', '<a/href=javascript:alert(1)>x</a>', 'JavaScript URL'],
    ['encoded contact href', '<a href="&#109;ailto:x@example.org">x</a>', 'Unauthorized commerce'],
    ['HTML5 separated form', '<form/action="/"></form>', 'Unauthorized commerce'],
    ['inline srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>', 'Inline HTML srcdoc'],
    ['JSON-LD with src', '<script type="application/ld+json" src="/_astro/safe.js">{}</script>', 'Inline executable script'],
    ['spoofed JSON-LD with data-type', '<script data-type="application/ld+json">alert(1)</script>', 'Inline executable script'],
    ['spoofed src with data-src', '<script data-src="/_astro/safe.js">alert(1)</script>', 'Inline executable script'],
    ['external script inline fallback', '<script src="/_astro/safe.js">alert(1)</script>', 'Inline executable script'],
  ]) negative(label, (m) => m.set('en/index.html', htmlFixture(markup)), message);
  const withStructuredData = new Map(valid);
  withStructuredData.set('en/index.html',
    '<html data-media-profile="release_safe"><script type="application/ld+json">{"@type":"WebPage"}</script></html>');
  assert.deepEqual(run(withStructuredData), [], 'Safe inert JSON-LD cannot be blocked');
  const withExternalScript = new Map(valid);
  withExternalScript.set('en/index.html',
    '<html data-media-profile="release_safe"><script type="module" src="/_astro/safe.js"></script></html>');
  assert.deepEqual(run(withExternalScript), [], 'Approved external script rejected');
  assert.equal(pathId('en/cart/index.html'), digest('en/cart/index.html').slice(0, 20));
  const leaked = overlays.records[0].slug;
  const secretsInNames = new Map(valid);
  secretsInNames.set('_astro/' + leaked + '.js', 'const x=1;');
  const errors = run(secretsInNames);
  assert(errors.length && errors.every((e) => !e.includes(leaked)),
    'Private filename escaped into a public finding');
  // Exercise the real pages:verify CLI on isolated, fully allow-listed dist
  // fixtures, not merely the in-process audit helper.
  const cliDir = mkdtempSync(join(tmpdir(), 'bodich-pages-cli-'));
  try {
    for (const [file, body] of valid) {
      mkdirSync(join(cliDir, dirname(file)), { recursive: true });
      writeFileSync(join(cliDir, file), body);
    }
    function verifyFixture(markup, base, expectedStatus, message) {
      writeFileSync(join(cliDir, 'en/index.html'), htmlFixture(markup));
      const result = spawnSync(process.execPath,
        [fileURLToPath(import.meta.url), cliDir, '--no-write'], {
          cwd: root, encoding: 'utf8', env: { ...process.env, ASTRO_BASE: base },
        });
      assert.ifError(result.error);
      assert.equal(result.status, expectedStatus, 'Unexpected pages:verify fixture exit');
      if (message) assert(result.stderr.includes(message), 'Missing sanitized CLI finding');
      assert(!result.stderr.includes('en/index.html'), 'CLI exposed a raw filename');
    }
    verifyFixture('<script src="/_astro/safe.js"></script><script type="application/ld+json">{}</script>',
      '/', 0);
    verifyFixture('<script src="/bodich-preview/_astro/safe.js"></script><script type="application/ld+json">{}</script>',
      '/bodich-preview', 0);
    for (const [, markup, message] of confirmedBypasses)
      verifyFixture(markup, '/', 1, message);
  } finally { rmSync(cliDir, { recursive: true, force: true }); }
  const testDir = mkdtempSync(join(tmpdir(), 'bodich-pages-test-'));
  try {
    mkdirSync(join(testDir, '_astro'));
    writeFileSync(join(testDir, '_astro', 'safe.js'), 'const ok = true;');
    assert(gather(testDir).some((item) => item.name === '_astro/safe.js'));
    writeFileSync(join(testDir, 'secret.json'), '{}');
    assert(!permittedFile('secret.json', routeSet));
  } finally { rmSync(testDir, { recursive: true, force: true }); }
  console.log('Cloudflare Pages release regression fixtures passed (HTML5 parser, isolated dist CLI, CSP, metadata, quarantine, HSTS).');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else if (process.argv.includes('--explain')) {
  // Local-only opt-in reverse lookup. Never reveal private names in public CI logs.
  assert(!process.env.CI && !process.env.GITHUB_ACTIONS,
    'Local explanation is forbidden in CI; use the hashed release report');
  const args = process.argv.slice(2);
  assert(args[0] === '--explain' && args.length >= 2 && args.length <= 3,
    'Usage: node scripts/verify-pages-release.mjs --explain <hash-prefix> [dist]');
  const prefix = args[1].toLowerCase();
  assert.match(prefix, /^[a-f0-9]{12,64}$/, 'Expected at least 12 hex digits');
  const folder = resolve(args[2] ?? 'dist');
  const candidates = new Set([...filesForRoutes(), '_headers']);
  if (existsSync(folder)) for (const entry of gather(folder)) candidates.add(entry.name);
  const matches = [...candidates].filter((path) => digest(path).startsWith(prefix));
  assert(matches.length === 1, 'No unique local path for hash prefix');
  console.log('Local path matching hash: ' + matches[0]);
} else {
  assertPolicy();
  const flags = process.argv.slice(2);
  const noWrite = flags.includes('--no-write');
  const positions = flags.filter((value) => value !== '--no-write');
  assert(positions.length <= 1 && !positions.some((value) => value.startsWith('--')),
    'Usage: node scripts/verify-pages-release.mjs [dist] [--no-write]');
  const folder = resolve(positions[0] ?? 'dist');
  assert(existsSync(folder), 'Missing static dist directory');
  const entries = gather(folder).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const failures = audit(entries);
  const report = {
    schemaVersion: 1, kind: 'cloudflare_pages_static_release_gate',
    releaseProfile: policy.profile, routeAllowListCount: policy.routes.length,
    supplierDraftsQuarantined: policy.supplierDraftCount,
    verdict: failures.length ? 'NO_GO' : 'offline_checks_passed_live_owner_approval_pending',
    files: entries.map(({ name, bytes }) => ({ pathSha256: digest(name), sha256: digest(bytes), bytes: bytes.length })),
    findings: failures,
  };
  const out = join(root, 'visual-qa/pages-release-evidence.json');
  if (!noWrite) {
    mkdirSync(join(root, 'visual-qa'), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  }
  for (const error of failures) console.error('Pages release gate: ' + error);
  console.log('Pages static release: ' + entries.length + ' files, ' + failures.length + ' findings; ' + report.verdict);
  if (failures.length) process.exitCode = 1;
}

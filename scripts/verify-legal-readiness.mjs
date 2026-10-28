/**
 * Stage 20B (#67). Static privacy/contact inventory + deny-by-default legal ledger.
 * A passing audit is not a legal opinion, live network trace or authorization to publish.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, lstatSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'docs/qa/issue-67-legal-signoff.json');
const AREA_IDS = ['operator_disclosures', 'privacy_notice', 'contact_processing',
  'cookies_and_storage', 'branding_and_trademarks', 'governing_markets'];
const INVALID = /\b(?:tbd|todo|unknown|placeholder|example|fixture|synthetic|unassigned|pending)\b/i;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ref = (value) => typeof value === 'string' &&
  /^restricted:[a-z0-9][a-z0-9._/-]{7,}$/i.test(value) && !INVALID.test(value.slice(11));
const person = (value) => typeof value === 'string' &&
  value.trim().split(/\s+/u).length >= 2 && value.trim().length >= 5 && !INVALID.test(value);
const filled = (value) => typeof value === 'string' && value.trim().length >= 3 && !INVALID.test(value);
const explanation = (value) => typeof value === 'string' && value.trim().length >= 8;
const validDate = (value) => typeof value === 'string' && DATE.test(value) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value &&
  Date.parse(value + 'T00:00:00Z') <= Date.now();
const normalized = (value) => typeof value === 'string' ?
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
function validateLedger(record, requireGo = false) {
  const errors = [];
  const fail = (id) => errors.push(id);
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['invalid_ledger'];
  if (record.schemaVersion !== 1 || record.scope !== 'informational_only') fail('invalid_scope');
  if (!['NO_GO', 'GO'].includes(record.decision)) fail('invalid_decision');
  if (requireGo && record.decision !== 'GO') fail('human_legal_go_missing');
  if ((record.decision === 'NO_GO' && record.decisionBasis !== 'POLICY_DEFAULT_UNSIGNED') ||
      (record.decision === 'GO' && record.decisionBasis !== 'HUMAN_SIGNED'))
    fail('invalid_decision_basis');
  const op = record.operator ?? {};
  const review = record.legalReview ?? {};
  if (!Array.isArray(record.blockers) || record.blockers.some((b) =>
    !b || !filled(b.id) || !explanation(b.action))) fail('invalid_blocker_list');
  const statuses = review.areas ?? {};
  const locales = review.locales ?? {};
  for (const area of AREA_IDS) {
    if (!['PENDING', 'REJECTED', 'APPROVED'].includes(statuses[area])) fail('invalid_area_' + area);
  }
  for (const lang of ['en', 'ro']) {
    if (!['PENDING', 'REJECTED', 'APPROVED'].includes(locales[lang])) fail('invalid_locale_' + lang);
  }
  if (record.decision === 'GO') {
    if (!filled(op.publicLegalName) || !filled(op.jurisdiction) ||
        !Array.isArray(op.markets) || !op.markets.length ||
        op.markets.some((x) => !filled(x)) ||
        !filled(op.approvedPublicContact) ||
        !ref(op.operatorEvidenceRef) || !ref(op.brandingAuthorityRef) ||
        !ref(op.contactPermissionRef)) fail('unverified_operator_or_contact');
    if (!person(review.counselName) || !filled(review.counselQualification) ||
        !validDate(review.determinationDate) || !ref(review.legalOpinionRef) ||
        !ref(review.browserTraceRef) || !ref(review.enRenderedCopyRef) ||
        !ref(review.roRenderedCopyRef) || !SHA.test(review.gitSha ?? '') ||
        !HASH.test(review.distManifestSha256 ?? '')) fail('missing_qualified_build_bound_legal_review');
    if (normalized(op.approvedBy) === normalized(review.counselName) ||
        !person(op.approvedBy)) fail('missing_independent_legal_reviewer');
    if (AREA_IDS.some((area) => statuses[area] !== 'APPROVED') ||
        locales.en !== 'APPROVED' || locales.ro !== 'APPROVED') fail('unapproved_legal_area_or_locale');
    if (record.blockers.length) fail('unresolved_legal_blockers');
  } else if (!record.blockers?.length) {
    fail('no_go_needs_blockers');
  }
  return errors;
}

const SCRIPT_RISKS = [
  ['browser_storage', /(?:\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bcookieStore\b|\bcaches\s*[.(\[]|\bcacheStorage\b|document\s*(?:\.\s*cookie|\[\s*['"]cookie['"]\s*\]))/i],
  ['network_api', /(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(|\bRTCPeerConnection\s*\()/i],
  ['service_worker', /\bserviceWorker\s*\.\s*register\s*\(/i],
  ['dynamic_remote_import', /\bimport\s*\(\s*['"](?:https?:)?\/\//i],
  ['dynamic_resource_creation', /(?:\bnew\s+Image\s*\(|\bcreateElement\s*\(\s*['"](?:script|iframe|img|image|link)['"])/i],
  ['worker_or_peer', /\b(?:new\s+)?(?:SharedWorker|Worker|RTCPeerConnection)\s*\(/i],
  ['external_url_in_script', /\bhttps?:\/\/[a-z0-9][a-z0-9.-]*/i],
];
const REMOTE = /^(?:https?:)?\/\//i;
const UNTRUSTED = /^(?:https?:)?\/\/|^(?:data|blob|javascript):/i;
const CONTACT_SCHEME = /^(?:mailto|tel|sms|smsto|mms|mmsto|whatsapp|tg|viber|skype):/i;
const CONTACT_HOST = /^(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|t\.me|telegram\.me)$/i;
const AUTOMATIC_LINK = /\b(?:stylesheet|icon|preload|modulepreload|prefetch|preconnect|dns-prefetch|manifest)\b/i;
const RESOURCES = new Set(['script:src', 'img:src', 'source:src', 'video:src',
  'audio:src', 'video:poster', 'track:src', 'image:href', 'use:href',
  'iframe:src', 'embed:src']);
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map((a) => [a.name.toLowerCase(), a.value]));
function normalizedScheme(value) {
  // Match the HTML5 URL normalization used by the Pages security verifier.
  return String(value ?? '').replace(/[\t\n\r]/g, '')
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
}
function sourceUrls(attr) {
  return attr ? attr.split(',').map((candidate) =>
    normalizedScheme(candidate).split(/\s+/u)[0]).filter(Boolean) : [];
}
function isContactHref(value) {
  const href = normalizedScheme(value);
  if (CONTACT_SCHEME.test(href)) return true;
  if (!REMOTE.test(href)) return false;
  try {
    // Protocol-relative links become HTTPS for host comparison.
    return CONTACT_HOST.test(new URL(href.startsWith('//') ? 'https:' + href : href).hostname);
  } catch {
    return true; // malformed absolute URL must not bypass contact policy
  }
}
function jsRisks(js, add) {
  for (const [id, rx] of SCRIPT_RISKS) if (rx.test(js)) add(id);
}
function cssRisks(css, add) {
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    if (UNTRUSTED.test(normalizedScheme(match[1]))) add('remote_css_resource');
  }
  for (const match of css.matchAll(/@import\s+['"]([^'"]+)['"]/gi)) {
    if (UNTRUSTED.test(normalizedScheme(match[1]))) add('remote_css_import');
  }
}
function htmlRisks(html, add, stats) {
  const doc = parse(html, { scriptingEnabled: false });
  function visit(node) {
    const tag = node.tagName?.toLowerCase();
    if (tag) {
      const a = attrs(node);
      if (new Set(['form', 'input', 'textarea', 'select', 'iframe', 'object', 'embed']).has(tag))
        add('unapproved_collection_or_embed');
      if (a.contenteditable === '' || normalizedScheme(a.contenteditable).toLowerCase() === 'true')
        add('editable_visitor_field');
      if (normalizedScheme(a['http-equiv']).replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase() === 'set-cookie')
        add('cookie_header_in_markup');
      if (a.style !== undefined) cssRisks(a.style, add);
      if (tag === 'a' && a.href !== undefined) {
        if (isContactHref(a.href)) add('unapproved_contact_channel');
        else if (REMOTE.test(normalizedScheme(a.href))) stats.externalNavigations++;
      }
      // Anchor ping is a visitor-tracking request even for a relative target.
      if (tag === 'a' && a.ping !== undefined) add('unapproved_link_ping');
      for (const key of ['src', 'poster', 'href', 'xlink:href']) {
        const value = normalizedScheme(a[key]);
        if (RESOURCES.has(tag + ':' + key) && UNTRUSTED.test(value))
          add('remote_or_embedded_resource');
        if (tag === 'link' && key === 'href' &&
            AUTOMATIC_LINK.test(a.rel ?? '') && UNTRUSTED.test(value))
          add('remote_or_embedded_resource');
      }
      for (const key of ['srcset', 'imagesrcset']) {
        for (const value of sourceUrls(a[key])) {
          if (UNTRUSTED.test(value)) add('remote_srcset_resource');
        }
      }
      if (tag === 'script') {
        if (a.src !== undefined) {
          const src = normalizedScheme(a.src);
          // All approved executable scripts are emitted by the Astro bundler.
          const base = (process.env.ASTRO_BASE ?? '/').replace(/^\/|\/$/g, '');
          const prefix = '/' + (base ? base + '/' : '') + '_astro/';
          if (!src.startsWith(prefix) || !/\.m?js(?:\?[^#]*)?$/i.test(src))
            add('unapproved_script_source');
        } else if (normalizedScheme(a.type).toLowerCase() !== 'application/ld+json') {
          const raw = (node.childNodes ?? []).filter((n) => n.nodeName === '#text')
            .map((n) => n.value ?? '').join('');
          jsRisks(raw, add);
        }
      }
      if (tag === 'style') {
        const raw = (node.childNodes ?? []).filter((n) => n.nodeName === '#text')
          .map((n) => n.value ?? '').join('');
        cssRisks(raw, add);
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(doc);
}
function auditDist(dir) {
  const findings = [];
  const counts = { html: 0, javascript: 0, css: 0, externalNavigations: 0 };
  const add = (id, rel) => findings.push({
    code: id, path: rel, pathSha256: createHash('sha256').update(rel).digest('hex'),
  });
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      const rel = relative(dir, abs).replace(/\\/g, '/');
      const st = lstatSync(abs);
      if (st.isDirectory()) { walk(abs); continue; }
      if (!st.isFile()) { add('non_regular_dist_entry', rel); continue; }
      if (!/\.(?:html|js|mjs|css)$/i.test(entry.name)) continue;
      const bytes = readFileSync(abs, 'utf8');
      const flag = (id) => add(id, rel);
      if (/\.html$/i.test(entry.name)) {
        counts.html++;
        htmlRisks(bytes, flag, counts);
      } else if (/\.(?:js|mjs)$/i.test(entry.name)) {
        counts.javascript++;
        jsRisks(bytes, flag);
      } else {
        counts.css++;
        cssRisks(bytes, flag);
      }
    }
  }
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) add('missing_dist_directory', '.');
  else {
    walk(dir);
    if (!existsSync(join(dir, 'index.html')) || counts.html === 0)
      add('missing_root_html', 'index.html');
  }
  return { scope: 'static_release_build_only', counts, findings,
    conclusion: findings.length ? 'TECHNICAL_NO_GO' : 'STATIC_AUDIT_PASSED_HUMAN_NO_GO' };
}
function selfTest() {
  const base = { schemaVersion: 1, scope: 'informational_only',
    decision: 'NO_GO', decisionBasis: 'POLICY_DEFAULT_UNSIGNED',
    operator: {}, legalReview: {
      areas: Object.fromEntries(AREA_IDS.map((k) => [k, 'PENDING'])),
      locales: { en: 'PENDING', ro: 'PENDING' },
    }, blockers: [{ id: 'operator', action: 'Confirm real business owner and authorized contact.' }] };
  const clone = (record) => structuredClone(record);
  const invalid = (record, code) =>
    assert(validateLedger(record).includes(code), 'expected ' + code);
  assert.deepEqual(validateLedger(base), []);
  const explanatory = clone(base);
  explanatory.blockers[0].action = 'Confirm the operator, for example the sole trader.';
  assert.deepEqual(validateLedger(explanatory), []);
  invalid({ ...base, blockers: [] }, 'no_go_needs_blockers');
  invalid({ ...base, decisionBasis: 'HUMAN_SIGNED' }, 'invalid_decision_basis');
  assert(validateLedger(base, true).includes('human_legal_go_missing'));
  // Entirely synthetic, in-memory fixtures: do not write sample identities or
  // pretend they constitute actual operator/counsel approval.
  const go = clone(base);
  go.decision = 'GO';
  go.decisionBasis = 'HUMAN_SIGNED';
  go.blockers = [];
  go.operator = { publicLegalName: 'Illustrative Legal Entity Ltd',
    jurisdiction: 'Romania', markets: ['Romania'],
    approvedPublicContact: 'legal@illustrative.invalid', approvedBy: 'Ada Operator',
    operatorEvidenceRef: 'restricted:legal-operator-001',
    brandingAuthorityRef: 'restricted:brand-permission-001',
    contactPermissionRef: 'restricted:contact-approval-001' };
  go.legalReview = {
    counselName: 'Bela Counsel', counselQualification: 'Qualified legal reviewer',
    determinationDate: '2024-01-01',
    legalOpinionRef: 'restricted:opinion-001',
    browserTraceRef: 'restricted:browser-trace-001',
    enRenderedCopyRef: 'restricted:english-copy-001',
    roRenderedCopyRef: 'restricted:romanian-copy-001',
    gitSha: 'a'.repeat(40), distManifestSha256: 'b'.repeat(64),
    areas: Object.fromEntries(AREA_IDS.map((k) => [k, 'APPROVED'])),
    locales: { en: 'APPROVED', ro: 'APPROVED' },
  };
  assert.deepEqual(validateLedger(go), []);
  assert.deepEqual(validateLedger(go, true), []);
  const negativeGO = (change, code) => {
    const test = clone(go);
    change(test);
    invalid(test, code);
  };
  negativeGO((x) => { x.operator.approvedBy = x.legalReview.counselName; },
    'missing_independent_legal_reviewer');
  negativeGO((x) => { x.legalReview.gitSha = 'bad'; },
    'missing_qualified_build_bound_legal_review');
  negativeGO((x) => { x.legalReview.distManifestSha256 = 'bad'; },
    'missing_qualified_build_bound_legal_review');
  negativeGO((x) => { x.legalReview.determinationDate = '2999-01-01'; },
    'missing_qualified_build_bound_legal_review');
  negativeGO((x) => { x.legalReview.legalOpinionRef = 'https://example.invalid'; },
    'missing_qualified_build_bound_legal_review');
  negativeGO((x) => { x.legalReview.locales.ro = 'PENDING'; },
    'unapproved_legal_area_or_locale');
  negativeGO((x) => { x.legalReview.areas.cookies_and_storage = 'REJECTED'; },
    'unapproved_legal_area_or_locale');
  negativeGO((x) => { x.operator.operatorEvidenceRef = null; },
    'unverified_operator_or_contact');
  negativeGO((x) => { x.decisionBasis = 'POLICY_DEFAULT_UNSIGNED'; },
    'invalid_decision_basis');
  negativeGO((x) => { x.blockers = [{ id: 'new', action: 'Resolve legal issue' }]; },
    'unresolved_legal_blockers');

  const dir = mkdtempSync(join(tmpdir(), 'bodich-legal-test-'));
  try {
    const check = (html, code, extra = {}) => {
      writeFileSync(join(dir, 'index.html'), html);
      for (const [path, value] of Object.entries(extra)) writeFileSync(join(dir, path), value);
      const result = auditDist(dir);
      assert(result.findings.some((f) => f.code === code), 'missing detection ' + code);
      assert(result.findings.some((f) => f.path === 'index.html' || f.path === 'app.js' || f.path === 'styles.css'),
        'findings should print public file paths');
      for (const path of Object.keys(extra)) rmSync(join(dir, path));
    };
    writeFileSync(join(dir, 'index.html'),
      '<!doctype html><html><head><script type="application/ld+json">{"url":"https://schema.org"}</script></head><body><a href="https://example.org">External page</a><script src="/_astro/menu.js"></script></body></html>');
    assert.equal(auditDist(dir).findings.length, 0);
    check('<template><form action="/contact"></form></template>', 'unapproved_collection_or_embed');
    check('<noscript><iframe src="https://tracker.invalid"></iframe></noscript>',
      'unapproved_collection_or_embed');
    for (const value of ['mailto:demo@example.org', ' \tmailto:demo@example.org',
      'tel:12345', 'sms:12345', 'whatsapp:+12345', 'https://wa.me/12345', 'https://t.me/help']) {
      check('<a href="' + value + '">contact</a>', 'unapproved_contact_channel');
    }
    check('<a ping="/collect" href="/en/">navigate</a>', 'unapproved_link_ping');
    check('<script src="https://third-party.invalid/tracker.js"></script>', 'remote_or_embedded_resource');
    check('<script src="/unexpected.js"></script>', 'unapproved_script_source');
    for (const rel of ['preconnect', 'dns-prefetch']) {
      check('<link rel="' + rel + '" href="https://tracker.invalid">', 'remote_or_embedded_resource');
    }
    check('<img srcset="/local.webp 1x, https://third-party.invalid/i.webp 2x">',
      'remote_srcset_resource');
    check('<link rel="preload" as="image" imagesrcset="/ok.webp 1x, https://tracker.invalid/i.webp 2x">',
      'remote_srcset_resource');
    check('<img src="data:image/svg+xml,test">', 'remote_or_embedded_resource');
    check('<meta http-equiv="set-cookie" content="visitor=1">', 'cookie_header_in_markup');
    check('<div contenteditable="true"></div>', 'editable_visitor_field');
    check('<style>.x{background:url(https://tracker.invalid/pixel)}</style>', 'remote_css_resource');
    check('<div style="background:url(https://tracker.invalid/pixel)"></div>', 'remote_css_resource');
    check('<style>@import "https://tracker.invalid/style.css";</style>', 'remote_css_import');
    check('<script>localStorage.setItem("id","1")</script>', 'browser_storage');
    check('<script src="/_astro/app.js"></script>', 'network_api',
      { 'app.js': 'fetch("/collect")' });
    check('<script src="/_astro/app.js"></script>', 'dynamic_remote_import',
      { 'app.js': 'import("https://tracker.invalid/sdk.js")' });
    check('<script src="/_astro/app.js"></script>', 'dynamic_resource_creation',
      { 'app.js': "document.createElement('script')" });
    check('<script src="/_astro/app.js"></script>', 'worker_or_peer',
      { 'app.js': "new Worker('/worker.js')" });
    check('<script src="/_astro/app.js"></script>', 'browser_storage',
      { 'app.js': "caches.open('v1')" });
    check('<link rel="stylesheet" href="/styles.css">', 'remote_css_resource',
      { 'styles.css': '.x{background:url("https://tracker.invalid/pixel")}' });
    check('<link rel="stylesheet" href="/styles.css">', 'remote_css_import',
      { 'styles.css': '@import "https://tracker.invalid/site.css";' });
    writeFileSync(join(dir, 'index.html'), '<main>Safe</main>');
    assert.equal(auditDist(dir).findings.length, 0);
    rmSync(join(dir, 'index.html'));
    assert(auditDist(dir).findings.some((x) => x.code === 'missing_root_html'));
    assert(auditDist(join(dir, 'no-such-build')).findings.some((x) =>
      x.code === 'missing_dist_directory'));
    writeFileSync(join(dir, 'index.html'), '<main>Safe</main>');
    symlinkSync('index.html', join(dir, 'link.js'));
    assert(auditDist(dir).findings.some((x) => x.code === 'non_regular_dist_entry'));
    rmSync(join(dir, 'link.js'));
    // End-to-end CLI regression: --dist=<absolute-path> must actually run
    // the scanner, not merely print the legal ledger.
    const cmd = (...args) => spawnSync(process.execPath,
      [fileURLToPath(import.meta.url), ...args], { encoding: 'utf8' });
    const valid = cmd('--dist=' + dir);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /"html": 1/);
    const missing = cmd('--dist=' + join(dir, 'missing'));
    assert.notEqual(missing.status, 0, 'missing dist CLI must fail');
    assert.match(missing.stdout, /missing_dist_directory/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log('Legal/privacy policy regression fixtures passed (not human approval).');
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
else {
  const decision = args.find((a) => a.startsWith('--ledger='))?.slice(9) ?? LEDGER;
  const record = JSON.parse(readFileSync(decision, 'utf8'));
  const errors = validateLedger(record, args.includes('--require-go'));
  if (errors.length) {
    console.error('Legal ledger invalid:', errors.join(', '));
    process.exitCode = 1;
  } else {
    console.log('Legal ledger structurally valid:', record.decision, '(not a legal sign-off)');
  }
  if (args.some((a) => a === '--dist' || a.startsWith('--dist='))) {
    const dir = resolve(ROOT, args.find((a) => a.startsWith('--dist='))?.slice(7) ?? 'dist');
    const report = auditDist(dir);
    console.log(JSON.stringify(report, null, 2));
    if (report.findings.length) process.exitCode = 1;

  }
}

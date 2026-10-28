/**
 * Stage 20B (#67). Static privacy/contact inventory + deny-by-default legal ledger.
 * A passing audit is not a legal opinion, live network trace or authorization to publish.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, lstatSync, writeFileSync } from 'node:fs';
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
  const op = record.operator ?? {};
  const review = record.legalReview ?? {};
  if (!Array.isArray(record.blockers) || record.blockers.some((b) =>
    !b || !filled(b.id) || !filled(b.action))) fail('invalid_blocker_list');
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
  ['browser_storage', /(?:\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bcookieStore\b|document\s*(?:\.\s*cookie|\[\s*['"]cookie['"]\s*\]))/],
  ['network_api', /(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bWebSocket\s*\(|\bEventSource\s*\()/],
  ['service_worker', /\bserviceWorker\s*\.\s*register\s*\(/],
];
const REMOTE = /^(?:https?:)?\/\//i;
const UNTRUSTED = /^(?:https?:)?\/\/|^(?:data|blob|javascript):/i;
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map((a) => [a.name.toLowerCase(), a.value]));
function sourceUrls(attr) {
  return attr ? attr.split(',').map((candidate) => candidate.trim().split(/\s+/u)[0]).filter(Boolean) : [];
}
function htmlRisks(html, add, stats) {
  const doc = parse(html, { scriptingEnabled: false });
  function visit(node) {
    const tag = node.tagName?.toLowerCase();
    if (tag) {
      const a = attrs(node);
      const blocked = new Set(['form', 'input', 'textarea', 'select', 'iframe', 'object', 'embed']);
      if (blocked.has(tag)) add('unapproved_collection_or_embed');
      if (a.contenteditable === '' || a.contenteditable === 'true') add('editable_visitor_field');
      if (a['http-equiv']?.toLowerCase() === 'set-cookie') add('cookie_header_in_markup');
      if (tag === 'a' && /^(?:mailto|tel):/i.test(a.href ?? '')) add('unapproved_contact_channel');
      if (tag === 'a' && REMOTE.test(a.href ?? '')) stats.externalNavigations++;
      const resourceAttrs = new Set(['script:src', 'img:src', 'source:src', 'video:src',
        'audio:src', 'video:poster', 'track:src', 'image:href', 'use:href']);
      const trackedAttrs = ['src', 'poster', 'href'];
      for (const key of trackedAttrs) {
        const value = a[key];
        if (!value) continue;
        if (resourceAttrs.has(tag + ':' + key) && UNTRUSTED.test(value.trim()))
          add('remote_or_embedded_resource');
        if (tag === 'link' && key === 'href' &&
            /\b(?:stylesheet|icon|preload|modulepreload|prefetch|manifest)\b/i.test(a.rel ?? '') &&
            UNTRUSTED.test(value.trim())) add('remote_or_embedded_resource');
      }
      for (const value of sourceUrls(a.srcset)) {
        if (UNTRUSTED.test(value)) add('remote_srcset_resource');
      }
      if (tag === 'script') {
        if (!a.src && (a.type ?? '').toLowerCase() !== 'application/ld+json') {
          const raw = (node.childNodes ?? []).filter((n) => n.nodeName === '#text')
            .map((n) => n.value ?? '').join('');
          for (const [id, rx] of SCRIPT_RISKS) if (rx.test(raw)) add(id);
        }
        if (a.src && UNTRUSTED.test(a.src.trim())) add('remote_script');
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content); // <template> contents do not live in childNodes.
  }
  visit(doc);
}
function cssRisks(css, add) {
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    if (UNTRUSTED.test(match[1].trim())) add('remote_css_resource');
  }
  for (const match of css.matchAll(/@import\s+['"]([^'"]+)['"]/gi)) {
    if (UNTRUSTED.test(match[1].trim())) add('remote_css_import');
  }
}
function auditDist(dir) {
  const findings = [];
  const counts = { html: 0, javascript: 0, css: 0, externalNavigations: 0 };
  const add = (id, rel) => findings.push({
    code: id, pathSha256: createHash('sha256').update(rel).digest('hex'),
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
        for (const [id, rx] of SCRIPT_RISKS) if (rx.test(bytes)) flag(id);
      } else {
        counts.css++;
        cssRisks(bytes, flag);
      }
    }
  }
  walk(dir);
  return { scope: 'static_release_build_only', counts, findings,
    conclusion: findings.length ? 'TECHNICAL_NO_GO' : 'STATIC_AUDIT_PASSED_HUMAN_NO_GO' };
}
function selfTest() {
  const base = { schemaVersion: 1, scope: 'informational_only', decision: 'NO_GO',
    operator: {}, legalReview: {
      areas: Object.fromEntries(AREA_IDS.map((k) => [k, 'PENDING'])),
      locales: { en: 'PENDING', ro: 'PENDING' },
    }, blockers: [{ id: 'operator', action: 'Confirm real business owner and authorized contact.' }] };
  assert.deepEqual(validateLedger(base), []);
  assert(validateLedger({ ...base, blockers: [] }).includes('no_go_needs_blockers'));
  assert(validateLedger({ ...base, decision: 'GO', blockers: [] }).length > 0);
  assert(validateLedger(base, true).includes('human_legal_go_missing'));
  const dir = mkdtempSync(join(tmpdir(), 'bodich-legal-test-'));
  try {
    const check = (html, code, extra = {}) => {
      writeFileSync(join(dir, 'index.html'), html);
      for (const [path, value] of Object.entries(extra)) writeFileSync(join(dir, path), value);
      const result = auditDist(dir);
      assert(result.findings.some((f) => f.code === code), 'missing detection ' + code);
      for (const path of Object.keys(extra)) rmSync(join(dir, path));
    };
    writeFileSync(join(dir, 'index.html'),
      '<!doctype html><html><head><script type="application/ld+json">{"url":"https://schema.org"}</script></head><body><a href="https://example.org">External page</a><script src="/_astro/menu.js"></script></body></html>');
    assert.equal(auditDist(dir).findings.length, 0);
    check('<template><form action="/contact"></form></template>', 'unapproved_collection_or_embed');
    check('<noscript><iframe src="https://tracker.invalid"></iframe></noscript>', 'unapproved_collection_or_embed');
    check('<a href="mailto:demo@example.org">mail</a>', 'unapproved_contact_channel');
    check('<script src="https://third-party.invalid/tracker.js"></script>', 'remote_or_embedded_resource');
    check('<img srcset="https://third-party.invalid/i.webp 2x">', 'remote_srcset_resource');
    check('<script>localStorage.setItem("id","1")</script>', 'browser_storage');
    check('<script src="/_astro/app.js"></script>', 'network_api',
      { 'app.js': 'fetch("/collect")' });
    check('<link rel="stylesheet" href="/styles.css">', 'remote_css_resource',
      { 'styles.css': '.x{background:url("https://tracker.invalid/pixel")}' });
    writeFileSync(join(dir, 'index.html'), '<main>Safe</main>');
    assert.equal(auditDist(dir).findings.length, 0);
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
  if (args.includes('--dist')) {
    const dir = resolve(ROOT, args.find((a) => a.startsWith('--dist='))?.slice(7) ?? 'dist');
    const report = auditDist(dir);
    console.log(JSON.stringify(report, null, 2));
    if (report.findings.length) process.exitCode = 1;
    if (args.includes('--require-go') && (!record.legalReview?.browserTraceRef ||
      !ref(record.legalReview.browserTraceRef))) process.exitCode = 1;
  }
}

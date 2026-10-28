#!/usr/bin/env node
/**
 * #68: Rendered EN/RO release review package and fail-closed native reviewer ledger.
 * Static checks are NOT Romanian linguistic approval or evidence of browser QA.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(join(ROOT, 'config/pages-release-allowlist.json'), 'utf8'));
const expectedRoutes = policy.routes.filter((route) => /^\/(en|ro)\//.test(route)).sort();
const components = [
  'shared/header', 'shared/desktop-navigation', 'shared/mobile-navigation',
  'shared/language-switcher', 'shared/footer', 'shared/accessibility-copy',
  'shared/seo-metadata', 'shared/contact-privacy-copy', 'shared/root-fallback',
];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const identity = (s) => typeof s === 'string' && s.trim().split(/\s+/).length >= 2 &&
  s.trim().length >= 5 && !/\b(?:fixture|example|unknown|tbd|pending|synthetic)\b/i.test(s);
const evidence = (s) => typeof s === 'string' &&
  (/^restricted:[A-Za-z0-9][A-Za-z0-9._/-]{7,}$/.test(s) ||
   /^https:\/\/github\.com\/YuriiSokolenko\/bodich\/(?:pull|issues|actions)\/\d+\S*$/.test(s)) &&
  !/\b(?:example|fixture|placeholder|pending)\b/i.test(s);
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s && d <= new Date();
}
function validInstant(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.valueOf()) && d.toISOString() === s.replace(/Z$/, '.000Z') && d <= new Date();
}
function issues(record, candidateSha, distDigest) {
  const fail = [];
  if (!record || record.schemaVersion !== 1 || record.scope !== 'informational_only' ||
      !['PENDING', 'APPROVED'].includes(record.status)) return ['invalid_review_record'];
  const approved = record.status === 'APPROVED';
  if (record.candidate?.profile !== 'release_safe') fail.push('wrong_profile');
  const sourceSha = record.candidate?.gitSha;
  const sourceDigest = record.candidate?.distManifestSha256;
  if ((sourceSha != null && !SHA.test(sourceSha)) ||
      (sourceDigest != null && !DIGEST.test(sourceDigest)) ||
      ((sourceSha == null) !== (sourceDigest == null))) fail.push('invalid_candidate_identity');
  if (approved && (!sourceSha || !sourceDigest)) fail.push('approval_missing_candidate');
  if (approved && candidateSha !== undefined && candidateSha !== sourceSha) fail.push('candidate_sha_mismatch');
  if (approved && distDigest !== undefined && distDigest !== sourceDigest) fail.push('candidate_dist_mismatch');
  const reviewer = record.reviewer || {};
  if (approved && (!identity(reviewer.name) || reviewer.nativeRomanianConfirmed !== true ||
      !validInstant(reviewer.signedAt) || !evidence(reviewer.signatureEvidence)))
    fail.push('native_reviewer_signoff_missing');
  if (approved && (!identity(record.editorialLead?.name) || !evidence(record.editorialLead?.evidenceRef)))
    fail.push('editorial_lead_missing');
  const groups = [['routes', expectedRoutes], ['components', components]];
  for (const [group, keys] of groups) {
    const data = record.coverage?.[group];
    if (!data || Array.isArray(data) || typeof data !== 'object' ||
        JSON.stringify(Object.keys(data).sort()) !== JSON.stringify([...keys].sort())) {
      fail.push('incomplete_' + group + '_matrix'); continue;
    }
    for (const key of keys) {
      const row = data[key];
      if (!row || !['PENDING', 'PASS', 'FAIL'].includes(row.status)) {
        fail.push('invalid_row_' + key); continue;
      }
      if (row.status === 'PASS' && (!validDate(row.reviewedAt) || !evidence(row.evidenceRef)))
        fail.push('unsupported_pass_' + key);
      if (approved && row.status !== 'PASS') fail.push('unreviewed_' + key);
      if (approved && row.status === 'PASS' && row.reviewedAt > reviewer.signedAt?.slice(0, 10))
        fail.push('review_after_signoff_' + key);
    }
  }
  if (!Array.isArray(record.findings)) fail.push('invalid_findings');
  else {
    const seen = new Set();
    for (const item of record.findings) {
      if (!item || !/^RO-[0-9]{3,}$/.test(item.id || '') || seen.has(item.id) ||
          ![...expectedRoutes, ...components].includes(item.location) ||
          typeof item.element !== 'string' || !item.element.trim() ||
          !['CRITICAL', 'MAJOR', 'MINOR'].includes(item.severity) ||
          !['OPEN', 'FIXED'].includes(item.status) ||
          typeof item.before !== 'string' || !item.before.trim() ||
          typeof item.after !== 'string' || !item.after.trim()) fail.push('invalid_finding');
      if (item?.id) seen.add(item.id);
      if (item?.status === 'FIXED' &&
          (!/^https:\/\/github\.com\/YuriiSokolenko\/bodich\/pull\/\d+$/.test(item.prRef || '') ||
           !evidence(item.retestRef) || !validDate(item.retestedAt)))
        fail.push('finding_missing_retest');
      if (approved && item?.status === 'OPEN' && ['CRITICAL', 'MAJOR'].includes(item.severity))
        fail.push('open_severe_finding');
    }
  }
  return fail;
}
function nodes(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  for (const child of node.childNodes || []) nodes(child, predicate, result);
  if (node.content) nodes(node.content, predicate, result);
  return result;
}
const attr = (n, key) => n?.attrs?.find((a) => a.name === key)?.value;
const first = (node, tag) => nodes(node, (n) => n.tagName === tag)[0];
function renderedText(node) {
  if (!node || ['script', 'style', 'template', 'svg'].includes(node.tagName)) return '';
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(renderedText).join(' ').replace(/\s+/g, ' ').trim();
}
function meta(doc, key, value) {
  return attr(nodes(doc, (n) => n.tagName === 'meta' && attr(n, key) === value)[0], 'content');
}
function analyze(html, route, base = '') {
  const doc = parse(html);
  const locale = route.split('/')[1], opposite = locale === 'en' ? 'ro' : 'en';
  assert.equal(attr(first(doc, 'html'), 'lang'), locale, route + ': wrong document language');
  const headTitle = renderedText(first(doc, 'title'));
  const description = meta(doc, 'name', 'description');
  const ogTitle = meta(doc, 'property', 'og:title');
  const ogDescription = meta(doc, 'property', 'og:description');
  assert(headTitle && description && ogTitle && ogDescription, route + ': incomplete SEO copy');
  assert.equal(ogDescription, description, route + ': OG/description mismatch');
  assert.equal(meta(doc, 'property', 'og:locale'), locale === 'ro' ? 'ro_RO' : 'en_US',
    route + ': wrong OG locale');
  const counterpart = route.replace(/^\/(en|ro)\//, '/' + opposite + '/');
  const switchLinks = nodes(doc, (n) => n.tagName === 'a' && attr(n, 'hreflang') === opposite);
  assert.equal(switchLinks.length, 2, route + ': desktop and mobile language links required');
  for (const link of switchLinks)
    assert.equal(attr(link, 'href'), base + counterpart, route + ': wrong switch destination');
  const header = first(doc, 'header'), main = first(doc, 'main'), footer = first(doc, 'footer');
  assert(header && main && footer, route + ': shared content region missing');
  assert.equal(nodes(main, (n) => n.tagName === 'h1').length, 1, route + ': missing/duplicate main H1');
  assert(nodes(header, (n) => n.tagName === 'nav').length >= 2, route + ': desktop/mobile nav missing');
  assert(nodes(footer, (n) => n.tagName === 'nav').length >= 1, route + ': footer navigation missing');
  const alternates = nodes(doc, (n) => n.tagName === 'link' && attr(n, 'rel') === 'alternate');
  if (alternates.length) {
    for (const language of ['en', 'ro', 'x-default']) {
      const link = alternates.find((n) => attr(n, 'hreflang') === language);
      assert(link, route + ': missing alternate ' + language);
      const target = route.replace(/^\/(en|ro)\//, '/' + (language === 'x-default' ? 'en' : language) + '/');
      assert.equal(new URL(attr(link, 'href')).pathname, base + target,
        route + ': wrong alternate ' + language);
    }
  }
  return {
    route, locale, counterpart, htmlSha256: sha256(html),
    metadata: { title: headTitle, description, ogTitle, ogDescription,
      ogLocale: meta(doc, 'property', 'og:locale'),
      alternates: alternates.map((n) => ({ locale: attr(n, 'hreflang'), href: attr(n, 'href') })) },
    rendered: { header: renderedText(header),
      desktopAndMobileNavigation: nodes(header, (n) => n.tagName === 'nav').map(renderedText),
      switcher: switchLinks.map(renderedText), main: renderedText(main),
      footer: renderedText(footer),
      accessibilityCopy: nodes(doc, (n) => Boolean(n.attrs)).flatMap((n) =>
        n.attrs.filter((a) => ['aria-label', 'alt', 'title', 'placeholder'].includes(a.name))
          .map((a) => ({ tag: n.tagName, attribute: a.name, value: a.value }))) },
  };
}
function distManifest(dist) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      assert(!entry.isSymbolicLink(), 'dist_contains_symlink');
      if (entry.isDirectory()) walk(path);
      else {
        assert(entry.isFile(), 'dist_contains_special_file');
        const name = relative(dist, path).split('\\').join('/');
        const bytes = readFileSync(path);
        files.push({ name, pathSha256: sha256(name), sha256: sha256(bytes), bytes: bytes.length });
      }
    }
  }
  walk(dist);
  files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return sha256(JSON.stringify(files.map(({ pathSha256, sha256, bytes }) => ({ pathSha256, sha256, bytes }))));
}
function selfTest(base) {
  assert.deepEqual(issues(base), [], 'committed pending register invalid');
  const sha = 'a'.repeat(40), digest = 'b'.repeat(64);
  const approved = structuredClone(base);
  approved.status = 'APPROVED';
  approved.candidate = { profile: 'release_safe', gitSha: sha, distManifestSha256: digest };
  approved.reviewer = { name: 'Taylor Reed', nativeRomanianConfirmed: true,
    signedAt: '2026-10-01T12:00:00Z', signatureEvidence: 'restricted:record-romanian-12345' };
  approved.editorialLead = { name: 'Alex Morgan', evidenceRef: 'restricted:record-editorial-12345' };
  for (const group of ['routes', 'components']) for (const row of Object.values(approved.coverage[group]))
    Object.assign(row, { status: 'PASS', reviewedAt: '2026-10-01', evidenceRef: 'restricted:review-romanian-12345' });
  assert.deepEqual(issues(approved, sha, digest), [], 'synthetic approved fixture invalid');
  const negative = (edit, match) => {
    const copy = structuredClone(approved); edit(copy);
    assert(issues(copy, sha, digest).some((e) => e.includes(match)), match);
  };
  negative((r) => { delete r.coverage.routes['/ro/']; }, 'incomplete_routes');
  negative((r) => { r.coverage.components['shared/footer'].status = 'PENDING'; }, 'unreviewed');
  negative((r) => { r.reviewer.name = 'fixture reviewer'; }, 'native_reviewer');
  negative((r) => { r.reviewer.nativeRomanianConfirmed = false; }, 'native_reviewer');
  negative((r) => { r.candidate.gitSha = 'c'.repeat(40); }, 'candidate_sha_mismatch');
  negative((r) => { r.candidate.distManifestSha256 = 'c'.repeat(64); }, 'candidate_dist_mismatch');
  negative((r) => { r.findings = [{ id: 'RO-001', location: '/ro/', element: 'main',
    severity: 'CRITICAL', before: 'old copy', after: 'corrected copy', status: 'OPEN' }]; }, 'open_severe');
  negative((r) => { r.findings = [{ id: 'RO-001', location: '/ro/', element: 'main',
    severity: 'MAJOR', before: 'old copy', after: 'corrected copy', status: 'FIXED' }]; }, 'finding_missing_retest');
  const html = '<!doctype html><html lang="ro"><head><title>RO | BODICH</title>' +
    '<meta name="description" content="descripție"><meta property="og:title" content="RO">' +
    '<meta property="og:description" content="descripție"><meta property="og:locale" content="ro_RO"></head>' +
    '<body><header><nav></nav><nav></nav><a hreflang="en" href="/en/about/">EN</a>' +
    '<a hreflang="en" href="/en/about/">EN</a></header>' +
    '<main><h1>Titlu</h1></main><footer><nav></nav></footer></body></html>';
  assert.equal(analyze(html, '/ro/about/').counterpart, '/en/about/');
  assert.throws(() => analyze(html.replace('/en/about/', '/en/contact/'), '/ro/about/'), /wrong switch/);
  assert.throws(() => analyze(html.replace('ro_RO', 'en_US'), '/ro/about/'), /wrong OG locale/);
  assert.throws(() => analyze(html.replace('lang="ro"', 'lang="en"'), '/ro/about/'), /wrong document language/);
  assert.deepEqual(analyze(html, '/ro/about/').rendered.switcher, ['EN', 'EN']);
  console.log('Romanian QA self-test: unsigned NO-GO, synthetic approval, coverage/signoff/finding and rendered-link regressions passed.');
}
function main() {
  const args = process.argv.slice(2);
  const allowed = ['--check', '--self-test', '--dist', '--require-pass'];
  for (const arg of args) assert(allowed.includes(arg) ||
    /^(--record|--dist-dir|--report|--candidate-sha)=.+$/.test(arg), 'unknown argument ' + arg);
  const option = (name) => args.find((arg) => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
  const record = JSON.parse(readFileSync(resolve(option('record') || join(ROOT, 'docs/qa/issue-68-romanian-review.json')), 'utf8'));
  if (args.includes('--self-test')) return selfTest(record);
  const requirePass = args.includes('--require-pass');
  assert(!requirePass || args.includes('--dist'), '--require-pass requires --dist');
  const candidateSha = option('candidate-sha');
  assert(!candidateSha || SHA.test(candidateSha), 'invalid --candidate-sha');
  if (requirePass) assert(candidateSha, 'human approval requires explicit candidate SHA');
  const dist = resolve(option('dist-dir') || join(ROOT, 'dist'));
  let digest, pages;
  if (args.includes('--dist')) {
    assert(existsSync(dist), 'missing built dist');
    digest = distManifest(dist);
    const base = (process.env.ASTRO_BASE || '/').replace(/\/+$/, '');
    const fallback = parse(readFileSync(join(dist, 'index.html'), 'utf8'));
    const rootRefresh = nodes(fallback, (n) => n.tagName === 'meta' &&
      attr(n, 'http-equiv')?.toLowerCase() === 'refresh');
    assert.equal(rootRefresh.length, 1, 'root must have exactly one English fallback');
    assert.equal(attr(rootRefresh[0], 'content'), '2;url=' + base + '/en/',
      'root fallback must target localized English homepage');
    pages = expectedRoutes.map((route) => {
      const file = join(dist, route.slice(1), 'index.html');
      assert(existsSync(file), 'missing localized route ' + route);
      return analyze(readFileSync(file, 'utf8'), route, base);
    });
    assert.deepEqual(pages.map((p) => p.route), expectedRoutes);
    if (option('report')) {
      const output = resolve(option('report'));
      assert(!output.startsWith(dist + '/'), 'human review report must not be included in public dist');
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify({ schemaVersion: 1, verdict: 'STATIC_OK_HUMAN_REVIEW_PENDING',
        candidateGitSha: candidateSha || null, distManifestSha256: digest,
        coverageKeys: { routes: expectedRoutes, components },
        rootFallback: { target: base + '/en/', refresh: attr(rootRefresh[0], 'content') }, pages }, null, 2) + '\n');
    }
  }
  const problems = issues(record, candidateSha, digest);
  assert.deepEqual(problems, [], 'Romanian review record invalid');
  if (requirePass) assert.equal(record.status, 'APPROVED', 'NO_GO: native Romanian human review not approved');
  console.log('Romanian QA: ' + (pages ? pages.length + ' rendered EN/RO routes validated; ' : '') +
    'human release sign-off ' + (record.status === 'APPROVED' ? 'recorded (not independently authenticated)' : 'PENDING / NO_GO') + '.');
}
main();

#!/usr/bin/env node
/**
 * Stage 20A / #66. Fail-closed public-build rights and provenance inventory.
 * Machine checks can pass without implying legal clearance or production GO.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { parse, serialize } from 'parse5';
import { fileURLToPath } from 'node:url';
import { collectMedia, registryEntries } from './catalog-media-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = 'config/public-asset-rights.json';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const pathId = (name) => sha(name).slice(0, 20);
const digestRe = /^[a-f0-9]{64}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const mediaExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico',
  '.bmp', '.tif', '.tiff', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm',
  '.mp3', '.ogg', '.wav', '.pdf', '.webmanifest']);
const classifications = new Set(['ai_concept', 'technical_illustration', 'product_photograph',
  'brand_logo', 'ui_icon', 'font', 'social_preview', 'other_media']);
const safeFile = (path) => typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') &&
  path.split('/').every((part) => part && part !== '.' && part !== '..');
const validDate = (value) => dateRe.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

function walk(dir, prefix = '') {
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + item.name : item.name;
    const full = join(dir, item.name);
    // A symlink, socket, submodule-like special file, or recursive escape cannot enter an audit.
    if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile()))
      throw Error('Unsafe release filesystem entry [path-sha256-prefix=' + pathId(name) + ']');
    if (item.isDirectory()) files.push(...walk(full, name));
    else files.push({ name, bytes: readFileSync(full) });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function cleared(entry) {
  return entry.status === 'cleared' && typeof entry.rightsOwner === 'string' &&
    entry.rightsOwner.trim().length > 0 && typeof entry.sourceRef === 'string' &&
    entry.sourceRef.trim().length > 0 && typeof entry.generatorOrProvenance === 'string' &&
    entry.generatorOrProvenance.trim().length > 0 &&
    /^restricted:[A-Za-z0-9._/-]+$/.test(entry.permissionEvidence ?? '') &&
    typeof entry.reviewer === 'string' && entry.reviewer.trim().length > 0 &&
    validDate(entry.reviewDate) && Array.isArray(entry.permittedUses) &&
    entry.permittedUses.includes('public_website') && digestRe.test(entry.sha256 ?? '');
}

function loadPolicy(dir) {
  const data = JSON.parse(readFileSync(resolve(dir, policyPath), 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.profile, 'release_safe');
  assert.equal(data.policy, 'explicit_human_clearance_only');
  assert.equal(data.releaseDecision, 'NO_GO', 'A GO requires independent Stage 20 sign-off (#71)');
  assert.ok(data.accountableRightsOwner === null ||
    (typeof data.accountableRightsOwner === 'string' && data.accountableRightsOwner.trim()),
    'Rights owner must remain unknown or name an actual accountable person');
  assert.ok(Array.isArray(data.assets));
  const unique = new Set();
  for (const a of data.assets) {
    assert.ok(safeFile(a.path), 'Unsafe release rights register path');
    assert.ok(mediaExtensions.has(extname(a.path).toLowerCase()), 'Non-media rights register entry');
    assert.ok(classifications.has(a.classification), 'Unknown rights classification');
    assert.ok(['cleared', 'pending', 'denied', 'unknown'].includes(a.status), 'Unknown rights state');
    assert.ok(!unique.has(a.path), 'Duplicate release asset rights entry');
    unique.add(a.path);
    assert.ok(!a.sha256 || digestRe.test(a.sha256), 'Invalid rights digest');
    if (a.status === 'cleared') assert.ok(cleared(a), 'Clearance requires a named owner, actual reviewer, date, evidence, exact digest and permitted use');
    if (a.classification === 'ai_concept' || a.classification === 'technical_illustration')
      assert.notEqual(a.representation, 'product_photograph', 'Concepts are never exact-product photographs');
    // A raw contract, URL to private storage, or pasted permission is never a public register pointer.
    if (a.permissionEvidence) assert.match(a.permissionEvidence, /^restricted:[A-Za-z0-9._/-]+$/);
  }
  return data;
}

const isMedia = (name) => mediaExtensions.has(extname(name).toLowerCase());
const publicCode = (name) => /^_astro\/[A-Za-z0-9_.-]+\.(?:css|js)$/.test(name);
const knownGenerated = (name) => name.endsWith('.html') || name === '_headers' ||
  name === 'robots.txt' || name === 'sitemap.xml' || publicCode(name);
const typeOf = (name) => isMedia(name) ? 'media' : publicCode(name) ? 'compiled_code' :
  name.endsWith('.html') ? 'generated_page' : 'generated_site_metadata';
const remediation = (type) => type === 'media' ?
  'Remove from dist until an attributable rights owner records exact bytes, permission and human review.' :
  'Tie the exact build digest to the separate human release and code/license review in #71.';

function referencedAsset(value, at, files, base, findings, references, from) {
  if (!value || typeof value !== 'string') return;
  const candidate = value.trim();
  if (!candidate || candidate.startsWith('#')) return;
  if (/^(?:data:|blob:|\/\/|https?:)/i.test(candidate)) {
    // Even a publicly hosted image can change after an audit. Require a local pinned copy.
    findings.push({ kind: 'Unpinned external or embedded resource', id: pathId(at + '|' + from + '|' + candidate) });
    references.push({ originPathSha256: pathId(at), resourceSha256: sha(candidate), kind: 'external_or_embedded',
      status: 'blocked', remediation: 'Self-host an immutable, rights-cleared asset; do not ship a remote/data asset.' });
    return;
  }
  if (/^(?:mailto:|tel:|javascript:|file:|ftp:)/i.test(candidate)) {
    findings.push({ kind: 'Invalid asset URL scheme', id: pathId(at + '|' + from + '|' + candidate) });
    return;
  }
  try {
    const u = new URL(candidate, 'https://release.invalid/' + at);
    if (u.origin !== 'https://release.invalid') throw Error('external');
    let path = decodeURIComponent(u.pathname);
    const prefix = base === '/' ? '' : base.replace(/\/$/, '');
    if (prefix && (path === prefix || path.startsWith(prefix + '/')))
      path = path.slice(prefix.length);
    path = path.replace(/^\/+/, '');
    if (!safeFile(path) || !files.has(path)) {
      findings.push({ kind: 'Missing or unsafe local resource', id: pathId(at + '|' + from + '|' + candidate) });
      return;
    }
    references.push({ originPathSha256: pathId(at), pathSha256: pathId(path),
      kind: 'local', status: 'resolved' });
  } catch {
    findings.push({ kind: 'Malformed asset URL', id: pathId(at + '|' + from + '|' + candidate) });
  }
}

function inspectCss(css, at, files, base, findings, references) {
  // This is a conservative reference locator, NOT a CSS parser or security sanitizer.
  // A release must never rely on regexes as proof that arbitrary CSS is safe.
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi))
    referencedAsset(match[1] ?? match[2] ?? match[3], at, files, base, findings, references, 'css-url');
  for (const match of css.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/gi))
    referencedAsset(match[1] ?? match[2], at, files, base, findings, references, 'css-import');
}

function inspectHtml(html, at, files, base, findings, references, rightsByPath) {
  const document = parse(html, { scriptingEnabled: false });
  function scan(nodes) {
    for (const node of nodes ?? []) {
      const tag = node.tagName?.toLowerCase();
      const attrs = new Map((node.attrs ?? []).map((a) => [a.name.toLowerCase(), a.value]));
      if (tag === 'svg') {
        const id = 'inline-svg:' + sha(serialize(node));
        findings.push({ kind: 'Uncleared inline SVG artwork', id: pathId(at + id) });
        references.push({ originPathSha256: pathId(at), resourceSha256: id.slice('inline-svg:'.length),
          kind: 'inline_svg', status: 'blocked',
          remediation: 'Replace with CSS/text or separately clear and pin this inline artwork.' });
      }
      if (attrs.has('style')) inspectCss(attrs.get('style'), at, files, base, findings, references);
      if (tag === 'style') inspectCss((node.childNodes ?? []).map((v) => v.value ?? '').join(''),
        at, files, base, findings, references);
      const sourceTags = new Set(['img', 'source', 'video', 'audio', 'track', 'embed',
        'object', 'iframe', 'script', 'image', 'use', 'input']);
      if (sourceTags.has(tag)) {
        const field = tag === 'object' ? 'data' : tag === 'video' ? 'poster' :
          tag === 'image' || tag === 'use' ? (attrs.has('href') ? 'href' : 'xlink:href') : 'src';
        if (attrs.has(field)) referencedAsset(attrs.get(field), at, files, base, findings, references, tag + '-' + field);
        if (tag === 'video' && attrs.has('src'))
          referencedAsset(attrs.get('src'), at, files, base, findings, references, 'video-src');
        if (attrs.has('srcset'))
          for (const item of attrs.get('srcset').split(','))
            referencedAsset(item.trim().split(/\s+/)[0], at, files, base, findings, references, 'srcset');
      }
      if (tag === 'link' && /\b(?:stylesheet|icon|preload|modulepreload|apple-touch-icon|mask-icon)\b/i.test(attrs.get('rel') ?? ''))
        referencedAsset(attrs.get('href'), at, files, base, findings, references, 'link');
      if (tag === 'meta' && /^(?:og:image(?::.*)?|twitter:image(?::.*)?)$/i.test(attrs.get('property') ?? attrs.get('name') ?? ''))
        referencedAsset(attrs.get('content'), at, files, base, findings, references, 'social-preview');
      scan(node.childNodes);
      if (node.content) scan(node.content.childNodes);
    }
  }
  scan(document.childNodes);
}

/**
 * Audit exact built bytes. Only unreviewed *non-media generated code/markup*
 * can pass the technical asset check. They remain NO-GO for deployment until
 * an authorized reviewer signs off on the full build in #71.
 */
export function audit(dir, policy, legacy = []) {
  const findings = [];
  const references = [];
  const fileList = walk(dir);
  const files = new Map(fileList.map((file) => [file.name, file]));
  const rightsByPath = new Map(policy.assets.map((a) => [a.path, a]));
  const knownUncleared = new Set(legacy.filter((r) => r.status === 'present' &&
    r.rightsStatus !== 'cleared_with_evidence' && r.sha256).map((r) => r.sha256));
  const base = process.env.ASTRO_BASE?.startsWith('/') ? process.env.ASTRO_BASE.replace(/\/+$/, '') || '/' : '/';
  const records = [];
  for (const { name, bytes } of fileList) {
    const digest = sha(bytes);
    const kind = typeOf(name);
    const entry = rightsByPath.get(name);
    let state = 'human_release_signoff_pending';
    let sourceRef = kind === 'compiled_code' ? 'src/ (Astro/Vite compiled output)' :
      kind === 'generated_page' ? 'src/pages/ and src/components/ (Astro)' :
      'src/pages/ and public/_headers';
    let classification = kind;
    let reviewer = null, reviewDate = null, rightsOwner = null, evidenceRef = null;
    if (kind === 'media') {
      classification = entry?.classification ?? 'unknown';
      state = entry?.status ?? 'unknown';
      sourceRef = entry?.sourceRef ?? null;
      reviewer = entry?.reviewer ?? null;
      reviewDate = entry?.reviewDate ?? null;
      rightsOwner = entry?.rightsOwner ?? null;
      evidenceRef = entry?.permissionEvidence ?? null;
      if (!entry || !cleared(entry) || entry.sha256 !== digest || knownUncleared.has(digest))
        findings.push({ kind: 'Unknown, uncleared, altered or quarantined media asset', id: pathId(name) });
    } else if (!knownGenerated(name)) {
      findings.push({ kind: 'Unclassified release output', id: pathId(name) });
    }
    records.push({ path: kind === 'media' && (!entry || !cleared(entry)) ? null : name, pathSha256: pathId(name),
      sha256: digest, bytes: bytes.length, kind, classification,
      sourceRef, generatorOrProvenance: entry?.generatorOrProvenance ?? (kind === 'media' ? null : 'Astro static build / repository sources'),
      rightsOwner, evidenceRef, reviewer, reviewDate, state, remediation: remediation(kind) });
    if (name.endsWith('.html')) inspectHtml(bytes.toString('utf8'), name, files, base, findings, references, rightsByPath);
    if (name.endsWith('.css')) inspectCss(bytes.toString('utf8'), name, files, base, findings, references);
  }
  // Disallow stale approvals and declared files that the audited distribution omits.
  for (const entry of policy.assets) {
    if (!files.has(entry.path))
      findings.push({ kind: 'Stale or missing rights register asset', id: pathId(entry.path) });
  }
  const quarantined = legacy.map((entry) => ({
    pathSha256: pathId(entry.path), sourceRegistry: 'docs/catalog/media-rights.json (+ art-manifest)',
    sha256: entry.sha256, classification: entry.classification, status: entry.rightsStatus,
    usage: entry.usage, distributed: false, reviewer: null, reviewDate: null,
    remediation: 'Keep out of release-safe dist until attributable, evidence-backed human approval.',
  }));
  return {
    schemaVersion: 1, purpose: 'Stage 20A public build rights inventory',
    profile: 'release_safe', releaseDecision: 'NO_GO',
    accountableRightsOwner: policy.accountableRightsOwner,
    disclaimer: 'An offline technical pass is not legal clearance or deployment authorization.',
    distAssetCount: records.length, quarantinedRegistryCount: quarantined.length,
    verdict: findings.length ? 'TECHNICAL_NO_GO' : 'OFFLINE_AUDIT_PASSED_HUMAN_NO_GO',
    records, quarantinedRegistry: quarantined, references, findings,
  };
}

function selfTest() {
  const workspace = mkdtempSync(join(tmpdir(), 'bodich-rights-'));
  try {
    const dist = join(workspace, 'dist');
    mkdirSync(join(dist, '_astro'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="/_astro/test.css"></head><body></body></html>');
    writeFileSync(join(dist, '_astro/test.css'), 'body{color:red}');
    const policy = { assets: [], releaseDecision: 'NO_GO', accountableRightsOwner: null };
    const run = () => audit(dist, policy);
    assert.equal(run().verdict, 'OFFLINE_AUDIT_PASSED_HUMAN_NO_GO');
    assert.equal(run().records.length, 2);
    assert(run().records.every((r) => digestRe.test(r.sha256) && r.reviewer === null));
    writeFileSync(join(dist, 'favicon.svg'), '<svg></svg>');
    assert(run().findings.some((v) => v.kind.includes('uncleared')));
    const pinned = sha(readFileSync(join(dist, 'favicon.svg')));
    policy.assets.push({ path: 'favicon.svg', classification: 'ui_icon', status: 'pending', sha256: pinned });
    assert(run().findings.some((v) => v.kind.includes('uncleared')));
    const reviewed = { ...policy.assets[0], status: 'cleared', rightsOwner: 'Example rights holder',
      sourceRef: 'src/original.svg', generatorOrProvenance: 'original authored file',
      permissionEvidence: 'restricted:fixture-only', reviewer: 'Synthetic reviewer',
      reviewDate: '2026-10-26', permittedUses: ['public_website'] };
    policy.assets[0] = reviewed;
    assert.equal(run().findings.length, 0);
    assert.equal(run().records.find((v) => v.path === 'favicon.svg').state, 'cleared');
    writeFileSync(join(dist, 'favicon.svg'), '<svg>tampered</svg>');
    assert(run().findings.some((v) => v.kind.includes('altered')));
    writeFileSync(join(dist, 'favicon.svg'), '<svg></svg>');
    assert(audit(dist, policy, [{ path: 'private/original.svg', sha256: pinned, status: 'present',
      rightsStatus: 'unverified' }]).findings.some((v) => v.kind.includes('quarantined')));
    policy.assets[0] = { ...reviewed, status: 'denied' };
    assert(run().findings.length);
    policy.assets[0] = reviewed;
    writeFileSync(join(dist, 'index.html'), '<html><img src="https://example.org/hero.png"></html>');
    assert(run().findings.some((v) => v.kind.includes('Unpinned external')));
    writeFileSync(join(dist, 'index.html'), '<html><template><svg><path d="M0"/></svg></template></html>');
    assert(run().findings.some((v) => v.kind.includes('inline SVG')));
    writeFileSync(join(dist, 'index.html'), '<html><meta property="og:image" content="/missing.png"></html>');
    assert(run().findings.some((v) => v.kind.includes('Missing or unsafe')));
    writeFileSync(join(dist, 'index.html'), '<html><picture><source srcset="https://evil.invalid/x.png 1x"></picture></html>');
    assert(run().findings.some((v) => v.kind.includes('Unpinned external')));
    writeFileSync(join(dist, '_astro/test.css'), 'a{background:url(data:image/png;base64,AAA)}');
    assert(run().findings.some((v) => v.kind.includes('Unpinned external')));
    writeFileSync(join(dist, 'index.html'), '<html></html>');
    writeFileSync(join(dist, '_astro/test.css'), 'body{color:red}');
    writeFileSync(join(dist, 'unlisted.woff2'), 'font');
    assert(run().findings.some((v) => v.kind.includes('uncleared')));
    rmSync(join(dist, 'unlisted.woff2'));
    symlinkSync('favicon.svg', join(dist, 'leak.svg'));
    assert.throws(run, /Unsafe release filesystem entry/);
    rmSync(join(dist, 'leak.svg'));
    const unknown = { ...reviewed, permissionEvidence: null };
    assert.equal(cleared(unknown), false);
    console.log('Public asset rights self-test passed: exact digest, rights, quarantine, inline SVG, external refs, srcset, CSS/data, unknown fonts, symlink and human NO-GO.');
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--self-test') selfTest();
  else {
    assert(process.argv.length <= 4 && (!process.argv[2] || !process.argv[2].startsWith('--') || process.argv[2] === '--no-write'),
      'Usage: node scripts/audit-public-assets.mjs [dist] [--no-write] | --self-test');
    const distArg = process.argv.slice(2).find((a) => a !== '--no-write') ?? 'dist';
    const dist = resolve(root, distArg);
    assert(existsSync(dist) && lstatSync(dist).isDirectory(), 'Missing release candidate dist');
    const policy = loadPolicy(root);
    const legacy = collectMedia(registryEntries(root), root).records;
    const report = audit(dist, policy, legacy);
    if (!process.argv.includes('--no-write')) {
      mkdirSync(join(root, 'visual-qa'), { recursive: true });
      writeFileSync(join(root, 'visual-qa/public-asset-rights-audit.json'), JSON.stringify(report, null, 2) + '\n');
    }
    console.log('Public asset rights: ' + report.distAssetCount + ' distributed files, ' +
      report.quarantinedRegistryCount + ' review-only entries; ' + report.findings.length +
      ' findings; ' + report.verdict);
    for (const f of report.findings.slice(0, 25))
      console.error(f.kind + ' [path-sha256-prefix=' + f.id + ']');
    if (report.findings.length) process.exitCode = 1;
  }
}

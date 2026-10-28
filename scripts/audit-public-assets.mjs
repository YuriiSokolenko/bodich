#!/usr/bin/env node
/**
 * Stage 20A / #66. Fail-closed public-build rights and provenance inventory.
 * Machine checks can pass without implying legal clearance or production GO.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

// Formatting checks are safeguards against obvious fabrications, not identity verification.
const placeholder = /(?:^|[^a-z])(?:tbd|tba|n\/a|unknown|example|synthetic|fixture|todo|placeholder|test[-_ ]?only)(?:$|[^a-z])/i;
const meaningful = (value) => typeof value === 'string' && value.trim().length >= 3 &&
  !placeholder.test(value);
const presentDate = (value) => typeof value === 'string' && validDate(value) &&
  value <= new Date().toISOString().slice(0, 10);

function cleared(entry) {
  return entry.status === 'cleared' && meaningful(entry.rightsOwner) &&
    meaningful(entry.reviewer) &&
    entry.rightsOwner.trim().toLowerCase() !== entry.reviewer.trim().toLowerCase() &&
    meaningful(entry.sourceRef) && meaningful(entry.generatorOrProvenance) &&
    /^restricted:[A-Za-z0-9._/-]{8,}$/.test(entry.permissionEvidence ?? '') &&
    !placeholder.test(entry.permissionEvidence ?? '') &&
    presentDate(entry.reviewDate) && Array.isArray(entry.permittedUses) &&
    entry.permittedUses.includes('public_website') && digestRe.test(entry.sha256 ?? '');
}

function loadPolicy(dir) {
  const data = JSON.parse(readFileSync(resolve(dir, policyPath), 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.profile, 'release_safe');
  assert.equal(data.policy, 'explicit_human_clearance_only');
  assert.equal(data.releaseDecision, 'NO_GO', 'A GO requires independent Stage 20 sign-off (#71)');
  assert.ok(data.accountableRightsOwner === null || meaningful(data.accountableRightsOwner),
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
    if (a.status === 'cleared') {
      assert.ok(data.accountableRightsOwner, 'A cleared asset requires a named accountable rights owner');
      assert.ok(cleared(a), 'Clearance requires distinct named owner/reviewer, nonfuture date, evidence, digest and allowed use');
    }
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
  // CSS image-set accepts bare quoted URLs (without url()). Catch those too.
  for (const fn of css.matchAll(/(?:-webkit-)?image-set\s*\(([^)]*)\)/gi))
    for (const match of fn[1].matchAll(/(?:"([^"]+)"|'([^']+)')/g)) {
      const asset = match[1] ?? match[2];
      if (/^(?:https?:|\/\/|data:|blob:)/i.test(asset) ||
          /\.(?:png|jpe?g|svg|webp|gif|avif|ico)(?:[?#]|$)/i.test(asset))
        referencedAsset(asset, at, files, base, findings, references, 'css-image-set');
    }
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
        // Popular lazy-load conventions cannot silently bypass public rights checks.
        for (const key of ['data-src', 'data-original', 'data-lazy-src', 'data-background',
          'data-bg', 'data-poster', 'data-srcset', 'srcset']) {
          if (!attrs.has(key)) continue;
          const value = attrs.get(key);
          if (key.endsWith('srcset'))
            for (const item of value.split(','))
              referencedAsset(item.trim().split(/\s+/)[0], at, files, base, findings, references, key);
          else referencedAsset(value, at, files, base, findings, references, key);
        }
      }
      if (tag === 'link') {
        const rel = attrs.get('rel') ?? '';
        const href = attrs.get('href') ?? '';
        if (/\b(?:stylesheet|icon|preload|modulepreload|apple-touch-icon|mask-icon|manifest|image_src)\b/i.test(rel) ||
            (/\balternate\b/i.test(rel) &&
              (/^(?:image|audio|video)\//i.test(attrs.get('type') ?? '') ||
                /\.(?:png|jpe?g|svg|webp|gif|avif|ico|mp4|webm|mp3)(?:[?#]|$)/i.test(href))))
          referencedAsset(href, at, files, base, findings, references, 'link');
        if (attrs.has('imagesrcset'))
          for (const item of attrs.get('imagesrcset').split(','))
            referencedAsset(item.trim().split(/\s+/)[0], at, files, base, findings, references, 'imagesrcset');
      }
      if (tag === 'meta' && /^(?:og:(?:image|video|audio)(?::.*)?|twitter:(?:image|player|audio|video)(?::.*)?|msapplication-tileimage|msapplication-square\d+x\d+logo|msapplication-wide\d+x\d+logo)$/i.test(attrs.get('property') ?? attrs.get('name') ?? ''))
        referencedAsset(attrs.get('content'), at, files, base, findings, references, 'social-preview');
      scan(node.childNodes);
      if (node.content) scan(node.content.childNodes);
    }
  }
  scan(document.childNodes);
}

// A narrow, conservative compiled-JS detector. It deliberately does not pretend
// to evaluate all JS expressions, dynamic fetches, string concatenation or obfuscation.
function inspectJs(js, at, findings) {
  const suspect = [
    /data:(?:image|font|audio|video)\//gi,
    /(?:https?:)?\/\/[^\s'"\x60<>]+?\.(?:svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|mp4|webm|mp3|ogg|wav)(?:[?#][^\s'"\x60<>]*)?/gi,
    /<svg(?:\s|>)/gi,
  ];
  for (const expression of suspect) {
    for (const match of js.matchAll(expression)) {
      findings.push({ kind: 'Potential embedded or remote media in compiled JavaScript',
        id: pathId(at + '|js|' + match.index + '|' + match[0]) });
    }
  }
}

function disguisedMedia(bytes) {
  // High-confidence signatures only; the remaining bytes are not a legal/media proof.
  const start = bytes.subarray(0, 16);
  const ascii = start.toString('latin1');
  return start.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    start.subarray(0, 3).equals(Buffer.from([255,216,255])) ||
    /^GIF8[79]a/.test(ascii) || /^%PDF-/.test(ascii) ||
    /^(?:wOFF|wOF2|OTTO|\x00\x01\x00\x00)/.test(ascii) ||
    /^RIFF....WEBP/s.test(ascii) || ascii.slice(4, 8) === 'ftyp' ||
    /^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(bytes.subarray(0, 512).toString('utf8'));
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
  // The caller cannot bypass the accountable owner requirement by calling audit() directly.
  if (!policy.accountableRightsOwner && policy.assets.some((a) => a.status === 'cleared'))
    findings.push({ kind: 'Cleared asset without accountable rights owner', id: pathId('missing-accountable-owner') });
  const distributedDigests = new Set(fileList.map(({ bytes }) => sha(bytes)));
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
    if (knownUncleared.has(digest))
      findings.push({ kind: 'Quarantined media bytes found in release file', id: pathId(name) });
    if (kind !== 'media' && disguisedMedia(bytes))
      findings.push({ kind: 'Media signature hidden behind generated nonmedia extension', id: pathId(name) });
    if (kind === 'media') {
      classification = entry?.classification ?? 'unknown';
      state = entry?.status ?? 'unknown';
      sourceRef = entry?.sourceRef ?? null;
      reviewer = entry?.reviewer ?? null;
      reviewDate = entry?.reviewDate ?? null;
      rightsOwner = entry?.rightsOwner ?? null;
      evidenceRef = entry?.permissionEvidence ?? null;
      if (!entry || !cleared(entry) || !policy.accountableRightsOwner || entry.sha256 !== digest || knownUncleared.has(digest))
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
    if (name.endsWith('.js')) inspectJs(bytes.toString('utf8'), name, findings);
  }
  // Disallow stale approvals and declared files that the audited distribution omits.
  for (const entry of policy.assets) {
    if (!files.has(entry.path))
      findings.push({ kind: 'Stale or missing rights register asset', id: pathId(entry.path) });
  }
  const quarantined = legacy.map((entry) => ({
    pathSha256: pathId(entry.path), sourceRegistry: 'docs/catalog/media-rights.json (+ art-manifest)',
    // Do not expose the private full digest in public CI artifacts.
    sha256Prefix: entry.sha256?.slice(0, 12) ?? null,
    classification: entry.classification, status: entry.rightsStatus,
    usage: entry.usage, distributed: Boolean(entry.sha256 && distributedDigests.has(entry.sha256)),
    reviewer: null, reviewDate: null,
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
    const reviewed = { ...policy.assets[0], status: 'cleared', rightsOwner: 'Alex Morgan',
      sourceRef: 'src/original.svg', generatorOrProvenance: 'original authored file',
      permissionEvidence: 'restricted:case-2026-384201', reviewer: 'Taylor Chen',
      reviewDate: '2026-10-26', permittedUses: ['public_website'] };
    assert(!cleared({ ...reviewed, reviewer: ' ALEX MORGAN ' }));
    assert(!cleared({ ...reviewed, reviewer: 'TBD' }));
    assert(!cleared({ ...reviewed, rightsOwner: 'unknown' }));
    assert(!cleared({ ...reviewed, reviewer: 'Synthetic reviewer' }));
    assert(!cleared({ ...reviewed, reviewer: 'TODO review' }));
    assert(!cleared({ ...reviewed, reviewDate: '2099-01-01' }));
    assert(!cleared({ ...reviewed, permissionEvidence: 'restricted:x' }));
    policy.assets[0] = reviewed;
    assert(run().findings.some((v) => v.kind.includes('without accountable rights owner')));
    policy.accountableRightsOwner = 'Riley Parker';
    assert.equal(run().findings.length, 0);
    assert.equal(run().records.find((v) => v.path === 'favicon.svg').state, 'cleared');
    writeFileSync(join(dist, 'favicon.svg'), '<svg>tampered</svg>');
    assert(run().findings.some((v) => v.kind.includes('altered')));
    writeFileSync(join(dist, 'favicon.svg'), '<svg></svg>');
    const quarantineReport = audit(dist, policy, [{ path: 'private/original.svg',
      sha256: pinned, status: 'present', rightsStatus: 'unverified' }]);
    assert(quarantineReport.findings.some((v) => v.kind.includes('Quarantined media')));
    assert.equal(quarantineReport.quarantinedRegistry[0].distributed, true);
    assert.equal(quarantineReport.quarantinedRegistry[0].sha256Prefix, pinned.slice(0, 12));
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
    const htmlCases = [
      ['OG video', '<meta property="og:video" content="https://example.invalid/clip.mp4">', 'Unpinned external'],
      ['OG audio', '<meta property="og:audio" content="https://example.invalid/music.mp3">', 'Unpinned external'],
      ['MS tile', '<meta name="msapplication-TileImage" content="https://example.invalid/tile.png">', 'Unpinned external'],
      ['Manifest', '<link rel="manifest" href="https://example.invalid/site.webmanifest">', 'Unpinned external'],
      ['Image src link', '<link rel="image_src" href="https://example.invalid/a.jpg">', 'Unpinned external'],
      ['Alternate media', '<link rel="alternate" type="image/png" href="https://example.invalid/a.png">', 'Unpinned external'],
      ['lazy image', '<img data-src="https://example.invalid/lazy.png">', 'Unpinned external'],
      ['lazy image srcset', '<img data-srcset="https://example.invalid/lazy.png 1x">', 'Unpinned external'],
      ['poster', '<video poster="https://example.invalid/poster.jpg"></video>', 'Unpinned external'],
      ['style URL', '<div style="background:url(https://example.invalid/bg.jpg)"></div>', 'Unpinned external'],
      ['icon', '<link rel="icon" href="https://example.invalid/fav.svg">', 'Unpinned external'],
    ];
    for (const [label, html, reason] of htmlCases) {
      writeFileSync(join(dist, 'index.html'), '<html><head>' + html + '</head></html>');
      assert(run().findings.some((v) => v.kind.includes(reason)), label + ' bypassed audit');
    }
    const originalBase = process.env.ASTRO_BASE;
    try {
      process.env.ASTRO_BASE = '/bodich-preview';
      writeFileSync(join(dist, 'index.html'),
        '<html><link rel="stylesheet" href="/bodich-preview/_astro/test.css"></html>');
      assert.equal(run().findings.length, 0, 'Non-root base incorrectly blocked a valid local stylesheet');
      writeFileSync(join(dist, 'index.html'),
        '<html><link rel="stylesheet" href="/bodich-preview/_astro/missing.css"></html>');
      assert(run().findings.some((v) => v.kind.includes('Missing or unsafe')),
        'Missing asset under non-root base must fail');
    } finally {
      if (originalBase === undefined) delete process.env.ASTRO_BASE;
      else process.env.ASTRO_BASE = originalBase;
    }
    writeFileSync(join(dist, 'index.html'), '<html></html>');
    const cssCases = [
      '@import "https://example.invalid/fonts.css";',
      'a{background:image-set("https://example.invalid/bg.png" 1x)}',
      'a{background:-webkit-image-set("https://example.invalid/bg.webp" 1x)}',
    ];
    for (const value of cssCases) {
      writeFileSync(join(dist, '_astro/test.css'), value);
      assert(run().findings.some((v) => v.kind.includes('Unpinned external')),
        'CSS import/image-set was not rejected');
    }
    writeFileSync(join(dist, '_astro/test.css'), 'body{color:red}');
    writeFileSync(join(dist, '_astro/test.js'), 'const fine=true;');
    assert.equal(run().findings.length, 0, 'Plain compiled JavaScript should be permitted');
    for (const value of [
      'new Image().src = "https://example.invalid/secret.png";',
      'const d="data:image/png;base64,AAA";',
      'const d="<svg width=10></svg>";',
    ]) {
      writeFileSync(join(dist, '_astro/test.js'), value);
      assert(run().findings.some((v) => v.kind.includes('compiled JavaScript')),
        'JS media literal bypassed audit');
    }
    rmSync(join(dist, '_astro/test.js'));
    writeFileSync(join(dist, '_astro/test.js'), Buffer.from([137,80,78,71,13,10,26,10,1,2,3]));
    assert(run().findings.some((v) => v.kind.includes('Media signature hidden')),
      'PNG bytes disguised as JavaScript bypassed audit');
    rmSync(join(dist, '_astro/test.js'));
    writeFileSync(join(dist, 'index.html'), Buffer.from([137,80,78,71,13,10,26,10,1,2,3]));
    assert(run().findings.some((v) => v.kind.includes('Media signature hidden')),
      'PNG bytes disguised as HTML bypassed audit');
    writeFileSync(join(dist, 'index.html'), '<html></html>');
    writeFileSync(join(dist, 'unlisted.woff2'), 'font');
    assert(run().findings.some((v) => v.kind.includes('uncleared')));
    rmSync(join(dist, 'unlisted.woff2'));
    symlinkSync('favicon.svg', join(dist, 'leak.svg'));
    assert.throws(run, /Unsafe release filesystem entry/);
    rmSync(join(dist, 'leak.svg'));
    const unknown = { ...reviewed, permissionEvidence: null };
    assert.equal(cleared(unknown), false);
    // End-to-end policy parser negatives, not just direct clearance function tests.
    const policyDir = join(workspace, 'policy');
    mkdirSync(join(policyDir, 'config'), { recursive: true });
    const policyFile = join(policyDir, policyPath);
    const good = { schemaVersion: 1, profile: 'release_safe',
      policy: 'explicit_human_clearance_only', releaseDecision: 'NO_GO',
      accountableRightsOwner: 'Riley Parker', assets: [reviewed] };
    const load = (value) => {
      writeFileSync(policyFile, JSON.stringify(value));
      return loadPolicy(policyDir);
    };
    assert.equal(load(good).assets.length, 1);
    assert.throws(() => load({ ...good, accountableRightsOwner: null }),
      /named accountable rights owner/);
    assert.throws(() => load({ ...good, assets: [{ ...reviewed, reviewer: 'TBD' }] }),
      /Clearance requires/);
    assert.throws(() => load({ ...good, assets: [{ ...reviewed, reviewDate: '2099-01-01' }] }),
      /Clearance requires/);
    assert.throws(() => load({ ...good, assets: [reviewed, reviewed] }),
      /Duplicate release asset rights entry/);
    assert.throws(() => load({ ...good, releaseDecision: 'GO' }),
      /A GO requires independent/);
    assert.equal(load({ ...good, assets: [] }).assets.length, 0);
    // Exercise the real CLI no-write path, without touching any preexisting audit.
    const reportPath = join(root, 'visual-qa/public-asset-rights-audit.json');
    const reportBefore = existsSync(reportPath) ? readFileSync(reportPath) : null;
    const result = spawnSync(process.execPath,
      [fileURLToPath(import.meta.url), dist, '--no-write'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ASTRO_BASE: '/' },
      });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(existsSync(reportPath) ? readFileSync(reportPath) : null, reportBefore,
      '--no-write must leave report untouched');
    console.log('Public asset rights self-test passed: independent/nonfuture rights, policy parser, quarantine, remote HTML/CSS/JS, binary signatures, nonroot base, symlink and no-write CLI.');
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

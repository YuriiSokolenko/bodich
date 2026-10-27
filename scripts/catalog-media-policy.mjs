#!/usr/bin/env node
/**
 * Stage 15 / #55. Read-only deterministic media audit and explicit private staging.
 * No license, creator, exact-model identity, or legal clearance is inferred.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = 'docs/catalog/media-rights.json';
const imageExt = /\.(?:svg|png|webp|jpe?g|avif|gif|ico)$/i;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (dir, name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const safePath = (path) => typeof path === 'string' && !path.startsWith('/') &&
  !path.includes('\\') && !path.split('/').some((part) => !part || part === '..' || part === '.');

export function registryEntries(dir = root) {
  const registry = json(dir, registryPath);
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.policy, 'deny_public_until_human_clearance');
  assert.equal(registry.purpose, 'unverified_bodich_media_review_only');
  assert.ok(Array.isArray(registry.entries) && registry.entries.length >= 11);
  const manifest = json(dir, registry.artManifest);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.entries.length, 132, 'Stage 15 must not change the 132-source intake');
  const declared = [...registry.entries];
  for (const art of manifest.entries) {
    assert.equal(art.isProductPhoto, false, 'An illustrative study must not become a photo');
    assert.equal(art.approved, false, 'A draft diagram must not become approved by this stage');
    assert.equal(art.rights, 'pending', 'Unexpected diagram rights clearance');
    for (const path of Object.values(art.assets)) {
      declared.push({
        path, classification: 'technical_illustration', rightsStatus: 'unverified',
        usage: 'restricted_review', sourceId: art.sourceId,
        purpose: 'Generated 132-source offline reference diagram',
        provenanceRef: 'scripts/generate-catalog-art.mjs', optionalUntilGenerated: true,
      });
    }
  }
  return declared;
}

export function validateEntries(entries) {
  const problems = [];
  const byPath = new Map();
  for (const entry of entries) {
    if (!safePath(entry.path) || !imageExt.test(entry.path)) {
      problems.push('Unsafe image registry path: ' + String(entry.path));
      continue;
    }
    if (byPath.has(entry.path)) problems.push('Duplicate media path: ' + entry.path);
    byPath.set(entry.path, entry);
    if (!['ai_concept', 'technical_illustration', 'verified_product_photo'].includes(entry.classification))
      problems.push('Invalid media classification: ' + entry.path);
    if (!['unverified', 'restricted_review', 'cleared_with_evidence'].includes(entry.rightsStatus))
      problems.push('Invalid rights status: ' + entry.path);
    if (!['restricted_review', 'public_approved'].includes(entry.usage))
      problems.push('Invalid media usage: ' + entry.path);
    if (entry.usage === 'public_approved' || entry.rightsStatus === 'cleared_with_evidence') {
      if (entry.rightsStatus !== 'cleared_with_evidence' || entry.usage !== 'public_approved' ||
          !/^restricted:[a-zA-Z0-9._/-]+$/.test(entry.rightsEvidence ?? '') ||
          !entry.clearanceReviewer || !/^\d{4}-\d{2}-\d{2}$/.test(entry.clearanceDate ?? '') ||
          !entry.permittedUses?.includes('public_website') || !entry.sha256)
        problems.push('Incomplete human clearance evidence: ' + entry.path);
    }
    if (entry.classification === 'ai_concept' && entry.sourceId)
      problems.push('Marketing AI concepts must not be bound to a source SKU: ' + entry.path);
    if (entry.derivedFrom && (!safePath(entry.derivedFrom) || entry.derivedFrom === entry.path))
      problems.push('Invalid parent derivative path: ' + entry.path);
    if (entry.sha256 && !/^[a-f0-9]{64}$/.test(entry.sha256))
      problems.push('Invalid expected sha256: ' + entry.path);
  }
  for (const entry of entries) {
    if (entry.derivedFrom && !byPath.has(entry.derivedFrom))
      problems.push('Missing derivative parent in registry: ' + entry.path);
  }
  return problems;
}

// Versioned review images are permitted in the deliberate, marked demo only.
// Presentation permission is not commercial-rights clearance or photo proof.
function betaPublicPath(entry) {
  const base = 'docs/catalog/review-media/';
  if (!entry.path.startsWith(base)) return null;
  const suffix = entry.path.slice(base.length);
  if (suffix.startsWith('turbines/')) return 'public/images/' + suffix;
  if (suffix === 'ui/favicon.svg') return 'public/favicon.svg';
  return null;
}
function betaAssets(entries) {
  return new Map(entries.map((entry) => [betaPublicPath(entry), entry])
    .filter(([path, entry]) => path && entry.sha256 &&
      ['ai_concept', 'technical_illustration'].includes(entry.classification)));
}

function walk(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isSymbolicLink()) throw Error('Media symlink forbidden: ' + join(dir, d.name));
    const name = prefix ? prefix + '/' + d.name : d.name;
    if (d.isDirectory()) files.push(...walk(join(dir, d.name), name));
    else if (d.isFile() && imageExt.test(name)) files.push(name);
  }
  return files.sort();
}

export function collectMedia(entries, dir = root, { requireGenerated = false, beta = false } = {}) {
  const problems = validateEntries(entries);
  const output = [];
  const known = new Set(entries.map((e) => e.path));
  if (beta) for (const path of betaAssets(entries).keys()) known.add(path);
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    if (!safePath(entry.path)) continue;
    const filename = resolve(dir, entry.path);
    let status = 'missing', digest = null, bytes = null;
    if (existsSync(filename)) {
      if (!lstatSync(filename).isFile()) problems.push('Not a regular media file: ' + entry.path);
      else {
        const buffer = readFileSync(filename);
        digest = sha256(buffer);
        bytes = buffer.length;
        status = 'present';
        if (entry.sha256 && digest !== entry.sha256)
          problems.push('Media digest mismatch: ' + entry.path);
      }
    } else if (!entry.optionalUntilGenerated || requireGenerated) {
      problems.push('Missing registered media: ' + entry.path);
    }
    output.push({ path: entry.path, classification: entry.classification,
      rightsStatus: entry.rightsStatus, usage: entry.usage, sourceId: entry.sourceId ?? null,
      purpose: entry.purpose, provenanceRef: entry.provenanceRef ?? null,
      generationMetadata: entry.generationMetadata ?? null,
      derivedFrom: entry.derivedFrom ?? null, sha256: digest, bytes, status });
  }
  for (const dirName of ['docs/assets', 'docs/catalog/review-media', 'docs/catalog/draft-assets', 'public']) {
    for (const file of walk(resolve(dir, dirName))) {
      const path = dirName + '/' + file;
      if (!known.has(path)) problems.push('Unattributed image in repository: ' + path);
    }
  }
  return { problems, records: output, present: output.filter((x) => x.status === 'present').length,
    missing: output.filter((x) => x.status === 'missing').length };
}

export function publicExposureProblems(dir = root, dist = null, { beta = false, entries = null } = {}) {
  const problems = [];
  const allEntries = entries ?? (existsSync(resolve(dir, registryPath)) ? registryEntries(dir) : []);
  const allow = new Map(allEntries
    .filter((e) => e.usage === 'public_approved' && e.rightsStatus === 'cleared_with_evidence')
    .map((e) => [e.path, e]));
  if (beta) for (const [path, entry] of betaAssets(allEntries)) allow.set(path, entry);
  const verify = (repoPath, physicalPath, label) => {
    const e = allow.get(repoPath);
    if (!e) {
      problems.push('Unverified asset in ' + label + ': ' + repoPath);
      return;
    }
    if (!e.sha256 || sha256(readFileSync(physicalPath)) !== e.sha256)
      problems.push('Cleared asset differs from its approved bytes: ' + repoPath);
  };
  for (const file of walk(resolve(dir, 'public')))
    verify('public/' + file, resolve(dir, 'public', file), 'public/');
  if (dist) {
    for (const file of walk(resolve(dir, dist)))
      verify('public/' + file, resolve(dir, dist, file), 'shippable dist');
    // Check local URL paths, including srcset. Byte-level file walking covers
    // image files included elsewhere in dist; external URLs and inline data:
    // URIs are not authenticated or licensed by this scanner.
    // A future genuinely approved product photo may be referenced, but not a concept.
    const scanHtml = (at) => {
      if (!existsSync(at)) return;
      for (const item of readdirSync(at, { withFileTypes: true })) {
        const name = join(at, item.name);
        if (item.isDirectory()) scanHtml(name);
        else if (item.name.endsWith('.html')) {
          const html = readFileSync(name, 'utf8');
          const refs = [...html.matchAll(/\/(?:images\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpe?g|avif|svg)|favicon\.svg)/g)]
            .map((match) => match[0]);
          for (const imageUrl of refs) {
            const path = 'public' + imageUrl;
            if (!allow.has(path))
              problems.push('Uncleared art referenced in shippable HTML: ' + relative(dir, name) + ' -> ' + imageUrl);
          }
        }
      }
    };
    scanHtml(resolve(dir, dist));
  }
  if (beta && dist) {
    for (const [locale, caption] of [
      ['en', 'AI-generated BODICH presentation visual'],
      ['ro', 'Vizual BODICH generat cu IA pentru prezentare'],
    ]) {
      for (const page of ['', 'products/']) {
        const htmlPath = resolve(dir, dist, locale, page, 'index.html');
        if (!existsSync(htmlPath)) {
          problems.push('Missing beta presentation page: ' + locale + '/' + page);
          continue;
        }
        const html = readFileSync(htmlPath, 'utf8');
        if (!html.includes('data-media-profile="beta_presentation"') ||
            !html.includes('content="noindex, nofollow"') ||
            !html.includes(caption) ||
            !html.includes('/images/turbines/bodich-')) {
          problems.push('Missing labelled beta image / noindex in ' + locale + '/' + page);
        }
      }
    }
  }
  const readme = existsSync(resolve(dir, 'README.md')) ? readFileSync(resolve(dir, 'README.md'), 'utf8') : '';
  if (/<img\b[^>]+src\s*=\s*["'][^"']*(?:bodich-|turbines\/)/i.test(readme) ||
      /!\[[^\]]*\]\([^)]*(?:bodich-|turbines\/)/i.test(readme))
    problems.push('README embeds unverified concept media');
  return problems;
}

// Media *type* and commercial-use clearance are independent: a cleared concept
// remains synthetic and can never become evidence of exact-model photography.
// Keep a per-project snapshot for validators that inspect many catalog records.
// Standalone media:check rehashes fresh on every invocation.
export function mediaDigestSetsFromRecords(records) {
  return {
    uncleared: new Set(records.filter((r) => r.status === 'present' &&
      r.rightsStatus !== 'cleared_with_evidence' && r.sha256).map((r) => r.sha256)),
    nonPhotos: new Set(records.filter((r) => r.status === 'present' &&
      ['ai_concept', 'technical_illustration'].includes(r.classification) && r.sha256)
      .map((r) => r.sha256)),
  };
}
const digestSetsByRoot = new Map();
function mediaDigestSets(dir = root) {
  const projectRoot = resolve(dir);
  if (!digestSetsByRoot.has(projectRoot)) {
    digestSetsByRoot.set(projectRoot,
      mediaDigestSetsFromRecords(collectMedia(registryEntries(projectRoot), projectRoot).records));
  }
  return digestSetsByRoot.get(projectRoot);
}
export function unverifiedMediaDigests(dir = root) {
  return mediaDigestSets(dir).uncleared;
}
export function nonPhotoMediaDigests(dir = root) {
  return mediaDigestSets(dir).nonPhotos;
}

function stagePresentation(dir = root, mode = 'private_review') {
  assert.equal(process.env.BODICH_MEDIA_PROFILE, mode,
    'Media staging requires explicit BODICH_MEDIA_PROFILE=' + mode);
  const entries = registryEntries(dir).filter((e) => e.path.startsWith('docs/catalog/review-media/'));
  for (const entry of entries) {
    const from = resolve(dir, entry.path);
    if (!existsSync(from)) throw Error('Missing original offline media: ' + entry.path);
    if (!entry.sha256 || sha256(readFileSync(from)) !== entry.sha256)
      throw Error('Refusing to stage unpinned / modified presentation image: ' + entry.path);
    const to = resolve(dir, betaPublicPath(entry));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  console.log(mode === 'beta_presentation'
    ? 'BODICH presentation-beta images staged. Output must retain EN/RO AI labels; rights remain unverified.'
    : 'Private preview assets staged. DO NOT deploy or upload public/ or dist/.');
}

function selfTest() {
  const temp = mkdtempSync(join(tmpdir(), 'bodich-media-'));
  try {
    mkdirSync(join(temp, 'docs/catalog/review-media/turbines'), { recursive: true });
    mkdirSync(join(temp, 'public'), { recursive: true });
    const rel = 'docs/catalog/review-media/turbines/study.svg';
    const value = Buffer.from('<svg>synthetic test only</svg>');
    writeFileSync(join(temp, rel), value);
    const example = { path: rel, classification: 'ai_concept', rightsStatus: 'unverified',
      usage: 'restricted_review', purpose: 'fixture', sourceId: null, sha256: sha256(value) };
    assert.deepEqual(collectMedia([example], temp).problems, []);
    assert(collectMedia([{ ...example, sha256: '0'.repeat(64) }], temp).problems
      .some((s) => s.includes('digest mismatch')));
    assert(collectMedia([{ ...example, path: 'docs/catalog/review-media/turbines/missing.svg' }], temp).problems
      .some((s) => s.includes('Missing registered')));
    assert(validateEntries([example, example]).some((s) => s.includes('Duplicate')));
    assert(validateEntries([{ ...example, usage: 'public_approved' }])
      .some((s) => s.includes('Incomplete human clearance')));
    assert(validateEntries([{ ...example, sourceId: 'kt-1' }])
      .some((s) => s.includes('must not be bound')));
    // A genuinely cleared AI concept may become approved *illustrative* art,
    // but can never pass the independent exact-model photographic proof gate.
    const cleared = { ...example, rightsStatus: 'cleared_with_evidence',
      usage: 'public_approved', rightsEvidence: 'restricted:synthetic-ci-proof',
      clearanceReviewer: 'synthetic-reviewer', clearanceDate: '2026-10-26',
      permittedUses: ['public_website'] };
    assert.deepEqual(validateEntries([cleared]), []);
    const clearedRecord = collectMedia([cleared], temp).records[0];
    const digestSets = mediaDigestSetsFromRecords([clearedRecord]);
    assert(!digestSets.uncleared.has(sha256(value)), 'Cleared review asset should not be marked uncleared');
    assert(digestSets.nonPhotos.has(sha256(value)),
      'A cleared concept must remain forbidden as photographic proof');
    assert(!mediaDigestSetsFromRecords([{ ...clearedRecord,
      classification: 'verified_product_photo' }]).nonPhotos.has(sha256(value)));

    mkdirSync(join(temp, 'public/images/turbines'), { recursive: true });
    const staged = join(temp, 'public/images/turbines/study.svg');
    writeFileSync(staged, value);
    assert.deepEqual(collectMedia([example], temp, { beta: true }).problems, []);
    assert.deepEqual(publicExposureProblems(temp, null, { beta: true, entries: [example] }), []);
    assert(publicExposureProblems(temp, null, { entries: [example] }).length > 0,
      'Release-safe profile must still reject identical beta assets');
    writeFileSync(staged, Buffer.from('tampered generated image'));
    assert(publicExposureProblems(temp, null, { beta: true, entries: [example] })
      .some((s) => s.includes('differs from its approved bytes')),
      'Beta must reject a tampered allowlisted image');
    writeFileSync(staged, value);
    writeFileSync(join(temp, 'public', 'unsafe.svg'), value);
    assert(publicExposureProblems(temp).some((s) => s.includes('public/')));
    mkdirSync(join(temp, 'dist'), { recursive: true });
    writeFileSync(join(temp, 'dist/index.html'), '<img src="/images/turbines/bodich-hero-concept.webp">');
    assert(publicExposureProblems(temp, 'dist').some((s) => s.includes('HTML')));
    writeFileSync(join(temp, 'README.md'), '<img src="public/images/turbines/bodich-hero-concept.webp">');
    assert(publicExposureProblems(temp).some((s) => s.includes('README')));
    assert(collectMedia([example], temp).problems.some((s) => s.includes('Unattributed')));
    console.log('Media policy self-test passed: pinned digests, beta allowlist/tamper rejection, strict release isolation, rights schema, photo identity, README and public leak negatives.');
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = process.argv[2] || '--check';
  if (option === '--self-test') selfTest();
  else if (option === '--stage-private') stagePresentation(root, 'private_review');
  else if (option === '--stage-beta') stagePresentation(root, 'beta_presentation');
  else if (['--check', '--require-generated', '--inventory', '--public', '--beta'].includes(option)) {
    if (option === '--beta') assert.equal(process.env.BODICH_MEDIA_PROFILE, 'beta_presentation',
      'Beta audit requires explicit BODICH_MEDIA_PROFILE=beta_presentation');
    const beta = option === '--beta';
    const data = collectMedia(registryEntries(), root,
      { requireGenerated: option === '--require-generated', beta });
    const problems = [...data.problems, ...publicExposureProblems(root,
      ['--public', '--beta'].includes(option) ? (process.argv[3] || 'dist') : null, { beta })];
    const report = { schemaVersion: 1, purpose: 'media_provenance_audit_only',
      warning: 'Public GitHub files/history are not confidential; no use rights are inferred.',
      total: data.records.length, present: data.present, missing: data.missing,
      problems, records: data.records };
    if (option === '--inventory' || option === '--require-generated') {
      mkdirSync(resolve(root, 'visual-qa'), { recursive: true });
      writeFileSync(resolve(root, 'visual-qa/media-inventory.json'), JSON.stringify(report, null, 2) + '\n');
    }
    console.log('Media policy: ' + report.total + ' expected assets, ' + data.present +
      ' present, ' + data.missing + ' absent; ' + problems.length + ' violations');
    if (problems.length) { for (const p of problems.slice(0, 25)) console.error(p); process.exitCode = 1; }
  } else throw Error('Usage: --check | --require-generated | --inventory | --public [dist] | --beta [dist] | --stage-private | --stage-beta | --self-test');
}

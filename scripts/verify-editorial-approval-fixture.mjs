/**
 * Positive SEO route fixture: makes a disposable independent copy and grants
 * one synthetic approval there. The tracked real matrix is never edited.
 */
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { editorialGates } from '../src/seo/review-approval.ts';

const root = resolve('.');
const reviewPath = join(root, 'docs/editorial/review-matrix.json');
const originalMatrix = readFileSync(reviewPath);
const temp = mkdtempSync(join(tmpdir(), 'bodich-seo-approval-'));
const clone = join(temp, 'project');
function run(argv, options = {}) {
  const proc = spawnSync(argv[0], argv.slice(1), {
    cwd: clone,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, SITE_URL: 'https://example.invalid', ASTRO_BASE: '/',
      BODICH_MEDIA_PROFILE: 'release_safe', ...options },
  });
  if (proc.status !== 0 || proc.error) {
    process.stderr.write((proc.stdout || '').slice(-9000));
    process.stderr.write((proc.stderr || '').slice(-5000));
    throw new Error('SEO fixture failed: ' + argv.join(' ') + ', exit=' + proc.status);
  }
  return proc.stdout;
}
try {
  assert(existsSync(join(root, 'node_modules', 'astro')), 'run npm ci first');
  const skip = new Set(['.git', 'node_modules', 'dist', '.astro', 'visual-qa']);
  cpSync(root, clone, {
    recursive: true,
    filter: (source) => {
      const rel = relative(root, source);
      if (!rel) return true;
      const parts = rel.split(sep);
      return !parts.some((part) => skip.has(part)) &&
        !(parts[0] === 'docs' && parts[1] === 'catalog' && parts[2] === 'draft-assets');
    },
  });
  symlinkSync(join(root, 'node_modules'), join(clone, 'node_modules'), 'dir');
  const fixturePath = join(clone, 'docs/editorial/review-matrix.json');
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const syntheticApproval = Object.fromEntries(editorialGates.map((gate) => [gate, 'approved']));
  Object.assign(syntheticApproval, {
    reviewedBy: 'ci-fixture-only-not-a-human',
    reviewRecord: 'https://github.com/YuriiSokolenko/bodich/pull/999999#pullrequestreview-999999',
  });
  data.pages.home = syntheticApproval;
  writeFileSync(fixturePath, JSON.stringify(data, null, 2) + '\n');
  // Production root: exercise the real Astro rendering + robots/sitemap/schema.
  run(['npm', 'run', 'build']);
  run(['npm', 'run', 'seo:routes']);
  const dist = join(clone, 'dist');
  for (const locale of ['en', 'ro']) {
    const html = readFileSync(join(dist, locale, 'index.html'), 'utf8');
    assert(html.includes('name="robots" content="index, follow"'), 'approved home is not indexable');
    assert(html.includes('property="og:url"'), 'approved home missing OG URL');
    assert(html.includes('type="application/ld+json"'), 'approved home missing real WebPage schema');
    const support = readFileSync(join(dist, locale, 'support', 'index.html'), 'utf8');
    assert(support.includes('noindex, nofollow'), 'unapproved support page escaped');
  }
  const robot = readFileSync(join(dist, 'robots.txt'), 'utf8');
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  assert(robot.includes('Allow: /en/$') && robot.includes('Allow: /ro/$'));
  assert(robot.includes('Allow: /_astro/') && robot.includes('Sitemap: https://example.invalid/sitemap.xml'));
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2);
  assert.equal((sitemap.match(/<xhtml:link/g) || []).length, 6);

  // An approved record must still be nonindexable in non-root previews.
  run(['npm', 'run', 'build'], { ASTRO_BASE: '/bodich-preview' });
  run(['npm', 'run', 'seo:routes'], { ASTRO_BASE: '/bodich-preview' });

  // Presentation beta cannot inherit live approvals, even at root.
  run(['npm', 'run', 'build'], { BODICH_MEDIA_PROFILE: 'beta_presentation' });
  run(['npm', 'run', 'seo:routes'], { BODICH_MEDIA_PROFILE: 'beta_presentation' });
  console.log('Positive SEO fixture passed: one synthetic approved page, bilingual sitemap/robots/schema, nested and beta fail-closed.');
} finally {
  assert.deepEqual(readFileSync(reviewPath), originalMatrix, 'tracked editorial approval ledger was changed');
  rmSync(temp, { recursive: true, force: true });
}

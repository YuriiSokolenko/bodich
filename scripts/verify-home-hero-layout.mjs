import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { sha256, collectReleaseFiles, distManifestSha256 } from './lib/release-manifest.mjs';

// Issue #96 regression: the release-safe homepage hero must stay in normal flow.
//
// Release-safe output withholds the concept image and renders a short notice, so the hero copy,
// CTA and notice must size the hero themselves. This check loads the real `npm run build` output
// in Chromium and verifies measured geometry (not CSS assumptions) for EN and RO at the widths in
// the Stage 20D matrix, including 200% / 400% zoom equivalents (the same CSS pixel viewport).
//
// Usage:
//   node scripts/verify-home-hero-layout.mjs [dist]   # default dist; requires a release-safe build
//   node scripts/verify-home-hero-layout.mjs --self-test
//
// The beta presentation build intentionally layers copy over a shaded image and is NOT checked here.
// Set BODICH_QA_CHROMIUM_PATH to use a specific Chromium instead of Playwright's managed browser.

const locales = ['en', 'ro'];
const viewports = [
  { name: '320', width: 320 },
  { name: '390', width: 390 },
  { name: '768', width: 768 },
  { name: '1024', width: 1024 },
  { name: '1280', width: 1280 },
  { name: '1366', width: 1366 },
  { name: '1440', width: 1440 },
  { name: '1920', width: 1920 },
  { name: '200% zoom @1280', width: 640 },
  { name: '400% zoom @1280', width: 320 },
];
const viewportHeight = 900;
const evidenceDir = resolve(process.env.QA_OUTPUT_DIR ?? 'visual-qa/hero-layout');
const screenshotsDir = join(evidenceDir, 'hero-layout-screenshots');
const tolerance = 1;
const minimumSeparation = 16;
const minimumContrast = 4.5;
const minimumRenderedTextRatio = 0.85;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

function startStaticServer(root) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      let file = normalize(join(base, pathname));
      if (file !== base && !file.startsWith(base + sep)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
      if (pathname.endsWith('/')) file = join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === 'EACCES' ? 403 : 404, { 'content-type': 'text/plain' });
      response.end('not found');
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => resolveServer({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

// Runs inside the page. Everything it needs is defined here because it is serialized to the browser.
function collectHeroMetrics() {
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY };
  };
  const parseColor = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  };
  const luminance = ({ r, g, b }) => [r, g, b]
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, index) => sum + [0.2126, 0.7152, 0.0722][index] * v, 0);
  // Composite the element's text colour over every translucent background up the tree.
  const effectiveBackground = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) layers.push(color);
      if (color && color.a >= 1) break;
    }
    let base = { r: 255, g: 255, b: 255 };
    for (const layer of layers.reverse()) {
      base = {
        r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a),
      };
    }
    return base;
  };
  const contrastOf = (el) => {
    const text = parseColor(getComputedStyle(el).color);
    const a = luminance(text);
    const b = luminance(effectiveBackground(el));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const describe = (el) => {
    const attr = ['data-hero-shade', 'data-hero-copy', 'data-media-withheld', 'data-home-explore']
      .find((name) => el.hasAttribute(name));
    return attr ? `[${attr}]` : `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
  };
  const isPaintedOverlay = (el) => {
    const style = getComputedStyle(el);
    if (style.position === 'static') return false;
    const z = style.zIndex === 'auto' ? 0 : Number(style.zIndex);
    if (z < 0) return false; // painted behind content, e.g. the decorative blur
    const bg = parseColor(style.backgroundColor);
    return style.backgroundImage !== 'none' || (bg !== null && bg.a > 0);
  };

  const header = document.querySelector('header');
  const hero = document.querySelector('[data-hero]');
  const copy = document.querySelector('[data-hero-copy]');
  const notice = document.querySelector('[data-media-withheld]');
  const explore = document.querySelector('[data-home-explore]');
  const h2 = document.getElementById('home-explore-heading');
  const cards = [...document.querySelectorAll('[data-home-feature]')];
  const label = hero?.previousElementSibling ?? null;
  const h1s = [...document.querySelectorAll('h1')];
  const cta = copy?.querySelector('a') ?? null;
  const body = copy?.querySelector('p') ?? null;
  const intro = h2?.nextElementSibling ?? null;

  const targets = [
    ['hero label', label],
    ['hero H1', h1s[0] ?? null],
    ['hero body', body],
    ['hero CTA', cta],
    ['withheld-media notice', notice],
    ['explore H2', h2],
    ['explore intro', intro],
    ...cards.map((card, index) => [`feature card ${index + 1}`, card]),
  ];
  const present = targets.filter(([, el]) => el);
  const missing = targets.filter(([, el]) => !el).map(([name]) => name);

  const overlays = [];
  for (const [name, target] of present) {
    const targetRect = target.getBoundingClientRect();
    for (const el of document.querySelectorAll('body *')) {
      if (el === target || el.contains(target) || target.contains(el) || header?.contains(el)) continue;
      if (!isPaintedOverlay(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < targetRect.right - 1 && targetRect.left < r.right - 1
        && r.top < targetRect.bottom - 1 && targetRect.top < r.bottom - 1) {
        overlays.push(`${describe(el)} paints over ${name}`);
      }
    }
  }

  const heroRect = hero ? rectOf(hero) : null;
  const escaped = [];
  if (hero) {
    for (const el of hero.querySelectorAll('*')) {
      if (el.getClientRects().length === 0) continue; // display:none takes no space
      const r = rectOf(el);
      if (r.bottom > heroRect.bottom + 1 || r.left < heroRect.left - 1 || r.right > heroRect.right + 1) {
        escaped.push(describe(el));
      }
    }
  }

  const probes = [['explore H2', h2], ...cards.map((card, index) => [`feature card ${index + 1} title`, card.querySelector('h3')])]
    .filter(([, el]) => el)
    .map(([name, el]) => ({
      name,
      rect: rectOf(el),
      color: parseColor(getComputedStyle(el).color),
      contrast: contrastOf(el),
    }));
  const textContrasts = [
    ['hero H1', h1s[0]], ['hero body', body], ['explore intro', intro],
    ...cards.map((card, index) => [`feature card ${index + 1} description`, card.querySelector('p')]),
  ].filter(([, el]) => el).map(([name, el]) => ({ name, contrast: contrastOf(el) }));

  const shade = hero?.querySelector('[data-hero-shade]');
  return {
    mediaProfile: document.documentElement.getAttribute('data-media-profile'),
    withheldCount: document.querySelectorAll('[data-media-withheld]').length,
    heroImageCount: hero?.querySelectorAll('img').length ?? 0,
    shade: shade ? {
      rect: rectOf(shade),
      position: getComputedStyle(shade).position,
      zIndex: getComputedStyle(shade).zIndex,
      backgroundImage: getComputedStyle(shade).backgroundImage,
    } : null,
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    layout: hero?.getAttribute('data-hero-layout') ?? null,
    shadeCount: document.querySelectorAll('[data-hero-shade]').length,
    copyPosition: copy ? getComputedStyle(copy).position : null,
    h1Count: h1s.length,
    h1InCopy: Boolean(copy && h1s[0] && copy.contains(h1s[0])),
    missing,
    header: header ? rectOf(header) : null,
    hero: heroRect,
    copy: copy ? rectOf(copy) : null,
    blocks: present.map(([name, el]) => ({
      name, rect: rectOf(el),
      position: getComputedStyle(el).position,
      zIndex: getComputedStyle(el).zIndex,
      overflow: getComputedStyle(el).overflow,
    })),
    h2: h2 ? rectOf(h2) : null,
    overlays,
    escaped,
    probes,
    textContrasts,
    clickTargets: [cta, ...cards].filter(Boolean).map((el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const result = { name: el.hasAttribute('data-home-feature') ? `feature card ${el.getAttribute('data-home-feature')}` : 'hero CTA', ok: Boolean(hit && el.contains(hit)), hit: hit ? describe(hit) : 'nothing' };
      return result;
    }),
  };
}

const intersects = (a, b) => a.left < b.right - tolerance && b.left < a.right - tolerance
  && a.top < b.bottom - tolerance && b.top < a.bottom - tolerance;

// Node-side assertions over the measured metrics. Returns human-readable violations.
function findGeometryViolations(m) {
  const problems = [];
  // The beta/private overlay layout is deliberate and must not be certified here. A missing attribute
  // (markup from before the fix) is still measured, so the pre-fix build fails on real geometry.
  if (m.layout === 'overlay') {
    problems.push('hero uses the beta overlay layout; this check validates the release-safe build only (use npm run build)');
    return problems;
  }
  if (m.mediaProfile !== 'release_safe') problems.push('expected data-media-profile=release_safe, got ' + m.mediaProfile);
  if (m.layout !== 'flow') problems.push('expected data-hero-layout=flow, got ' + m.layout);
  if (m.withheldCount !== 1) problems.push('release-safe must have exactly one withheld media notice');
  if (m.heroImageCount !== 0) problems.push('unapproved hero image included in release-safe output');
  if (m.missing.length) problems.push(`missing elements: ${m.missing.join(', ')}`);
  if (m.scrollWidth > m.viewportWidth + tolerance) problems.push(`horizontal scroll: ${m.scrollWidth}px > ${m.viewportWidth}px`);
  if (m.h1Count !== 1) problems.push(`expected exactly one H1, found ${m.h1Count}`);
  if (!m.h1InCopy) problems.push('H1 is not inside [data-hero-copy]');
  if (m.shadeCount !== 0) problems.push('[data-hero-shade] must not be rendered in the release-safe layout');
  if (['absolute', 'fixed'].includes(m.copyPosition)) problems.push(`[data-hero-copy] is ${m.copyPosition}; it must stay in normal flow`);
  for (const overlay of m.overlays) problems.push(`obscured: ${overlay}`);
  for (const name of m.escaped) problems.push(`${name} extends outside the hero container`);
  for (const click of m.clickTargets) {
    if (!click.ok) problems.push(`${click.name} is not clickable at its centre (hit ${click.hit})`);
  }

  const byName = new Map(m.blocks.map((block) => [block.name, block.rect]));
  const label = byName.get('hero label');
  const h1 = byName.get('hero H1');
  if (m.header && label && label.top < m.header.bottom - tolerance) problems.push('hero label starts under the sticky header');
  if (m.header && h1 && h1.top < m.header.bottom - tolerance) problems.push('hero H1 starts under the sticky header');
  if (label && h1 && label.bottom > h1.top + tolerance) problems.push('hero label is not above the H1');
  for (let i = 0; i < m.blocks.length; i += 1) {
    for (let j = i + 1; j < m.blocks.length; j += 1) {
      if (intersects(m.blocks[i].rect, m.blocks[j].rect)) {
        const a = m.blocks[i].rect;
        const b = m.blocks[j].rect;
        const area = Math.round((Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)));
        problems.push(`overlap: ${m.blocks[i].name} x ${m.blocks[j].name}, area=${area}px², rects=${JSON.stringify([a, b])}`);
      }
    }
  }
  if (m.hero) {
    for (const name of ['hero H1', 'hero body', 'hero CTA', 'withheld-media notice']) {
      const rect = byName.get(name);
      if (rect && (rect.top < m.hero.top - tolerance || rect.bottom > m.hero.bottom + tolerance
        || rect.left < m.hero.left - tolerance || rect.right > m.hero.right + tolerance)) {
        problems.push(`${name} is not contained by the hero`);
      }
    }
    const heroContentBottom = Math.max(...['hero CTA', 'withheld-media notice'].map((name) => byName.get(name)?.bottom ?? 0));
    if (m.h2 && m.h2.top - heroContentBottom < minimumSeparation) {
      problems.push(`hero content ends ${Math.round(m.h2.top - heroContentBottom)}px above the explore section (minimum ${minimumSeparation}px)`);
    }
  }
  for (const item of m.textContrasts) {
    if (item.contrast < minimumContrast) problems.push(`${item.name} contrast ${item.contrast.toFixed(2)}:1 is below ${minimumContrast}:1`);
  }
  return problems;
}

// Reads back real pixels: text that another layer darkens will not reach its own CSS colour.
async function findRenderedTextProblems(page, metrics) {
  const problems = [];
  const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const probe of metrics.probes) {
    const width = Math.max(1, Math.ceil(probe.rect.right - probe.rect.left));
    const height = Math.max(1, Math.ceil(probe.rect.bottom - probe.rect.top));
    const png = await page.screenshot({
      fullPage: true,
      clip: { x: Math.floor(probe.rect.left), y: Math.floor(probe.rect.top), width, height },
    });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let brightest = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      brightest = Math.max(brightest, luminance({ r: data[i], g: data[i + 1], b: data[i + 2] }));
    }
    const expected = luminance(probe.color);
    if (expected > 0 && brightest < expected * minimumRenderedTextRatio) {
      problems.push(`${probe.name} renders at ${Math.round((brightest / expected) * 100)}% of its text colour (another layer is darkening it)`);
    }
  }
  return problems;
}

async function inspect(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  const metrics = await page.evaluate(collectHeroMetrics);
  await page.evaluate(() => window.scrollTo(0, 0));
  const problems = findGeometryViolations(metrics);
  if (metrics.layout !== 'overlay') problems.push(...await findRenderedTextProblems(page, metrics));
  return problems;
}

function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: process.env.BODICH_QA_CHROMIUM_PATH || undefined,
  });
}

function currentBuildIdentity() {
  const files = collectReleaseFiles(resolve('dist'));
  return {
    sourceSha: execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim(),
    lockfileSha256: null, // resolved from the pinned root lockfile below
    distManifestSha256: distManifestSha256(files),
    distFileCount: files.length,
  };
}

async function loadBuildIdentity(distDirectory) {
  const identity = currentBuildIdentity();
  identity.lockfileSha256 = sha256(await readFile('package-lock.json'));
  // The release gate explicitly pins dist; a caller cannot substitute untracked HTML.
  assert.equal(resolve(distDirectory), resolve('dist'), 'layout QA must inspect the canonical dist directory');
  if (process.env.QA_REQUIRE_INTEGRITY === '1') {
    const baseline = JSON.parse(await readFile(join(evidenceDir, 'build-integrity.json'), 'utf8'));
    assert.equal(baseline.schemaVersion, 1, 'missing canonical Stage 20D baseline');
    for (const key of ['sourceSha', 'lockfileSha256', 'distManifestSha256', 'distFileCount']) {
      assert.equal(identity[key], baseline[key], 'layout QA build identity drift: ' + key);
    }
    assert.equal(process.env.QA_HEAD_SHA ?? identity.sourceSha, identity.sourceSha,
      'layout QA checkout must use exact PR head');
  }
  return identity;
}

async function run(distDirectory) {
  await mkdir(screenshotsDir, { recursive: true });
  const report = {
    schemaVersion: 1, issue: 97, profile: 'release_safe',
    scope: 'linux_playwright_automated_only', generatedAt: new Date().toISOString(),
    sourceSha: null, distManifestSha256: null, lockfileSha256: null,
    browser: 'chromium', browserVersion: null,
    viewportHeight, locales, viewports, cases: [], failures: [],
    status: 'FAIL', caveat: 'Headless Chromium is not physical Mac Safari, iPhone or Android device QA.',
  };
  let server;
  let browser;
  let baseline;
  try {
    baseline = await loadBuildIdentity(distDirectory);
    Object.assign(report, baseline);
    server = await startStaticServer(distDirectory);
    browser = await launchBrowser();
    report.browserVersion = browser.version();
    const page = await browser.newPage({
      viewport: { width: 1280, height: viewportHeight },
      deviceScaleFactor: 1, reducedMotion: 'reduce',
      locale: 'en-US', timezoneId: 'UTC',
    });
    const errors = [];
    page.on('pageerror', error => errors.push('pageerror: ' + error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push('console.error: ' + message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) errors.push('HTTP ' + response.status() + ': ' + response.url());
    });
    page.on('requestfailed', request => {
      if (!/^(net::ERR_ABORTED)$/.test(request.failure()?.errorText ?? '')) {
        errors.push('requestfailed: ' + request.url() + ': ' + request.failure()?.errorText);
      }
    });
    for (const locale of locales) {
      for (const viewport of viewports) {
        const id = locale + '-' + viewport.name.replace(/[^a-z0-9]+/gi, '_');
        const prefix = id + '-release_safe-chromium-' + baseline.sourceSha.slice(0, 12) +
          '-' + baseline.distManifestSha256.slice(0, 12);
        const testcase = { id, locale, viewport, status: 'FAIL', problems: [],
          metrics: null, screenshots: [], browserErrors: [] };
        errors.length = 0;
        try {
          await page.setViewportSize({ width: viewport.width, height: viewportHeight });
          const response = await page.goto(server.url + '/' + locale + '/', { waitUntil: 'load', timeout: 30000 });
          assert.equal(response?.status(), 200, locale + ' homepage must return 200');
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(img => img.decode()));
          });
          const metrics = await page.evaluate(collectHeroMetrics);
          testcase.metrics = metrics;
          testcase.problems.push(...findGeometryViolations(metrics));
          if (metrics.layout !== 'overlay') {
            testcase.problems.push(...await findRenderedTextProblems(page, metrics));
          }
          testcase.browserErrors = [...errors];
          testcase.problems.push(...errors);
          const screenshot = join(screenshotsDir, prefix + '-full.png');
          await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled', caret: 'hide' });
          testcase.screenshots.push(screenshot);
          // Stable bounded comparison set for manual image review (no automatic baseline writes).
          if ([390, 1366, 1440].includes(viewport.width) && !viewport.name.includes('%')) {
            for (const [kind, selector] of [['hero', '[data-hero]'], ['features', '[data-home-explore]']]) {
              const focus = join(screenshotsDir, prefix + '-' + kind + '.png');
              await page.locator(selector).screenshot({ path: focus, animations: 'disabled', caret: 'hide' });
              testcase.screenshots.push(focus);
            }
          }
          testcase.status = testcase.problems.length ? 'FAIL' : 'PASS';
        } catch (error) {
          testcase.problems.push(String(error?.stack ?? error).slice(0, 2400));
          // Keep evidence when geometry validation itself throws.
          try {
            const failureScreenshot = join(screenshotsDir, prefix + '-failure.png');
            await page.screenshot({ path: failureScreenshot, fullPage: true, timeout: 5000 });
            testcase.screenshots.push(failureScreenshot);
          } catch {}
        }
        report.cases.push(testcase);
        if (testcase.status !== 'PASS') {
          report.failures.push({ id, problems: testcase.problems });
          console.error('FAIL ' + id + ': ' + testcase.problems.join('; '));
        } else {
          console.log('PASS ' + id);
        }
      }
    }
  } catch (error) {
    report.failures.push({ id: 'setup', problems: [String(error?.stack ?? error).slice(0, 2400)] });
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
    if (baseline) {
      try {
        const after = await loadBuildIdentity(distDirectory);
        assert.deepEqual(after, baseline, 'release-safe dist changed during layout QA');
      } catch (error) {
        report.failures.push({ id: 'integrity', problems: [String(error?.message ?? error)] });
      }
    }
    if (report.cases.length !== locales.length * viewports.length) {
      report.failures.push({ id: 'matrix', problems: ['incomplete release-safe viewport matrix'] });
    }
    report.status = report.failures.length ? 'FAIL' : 'PASS_AUTOMATED_ONLY';
    await writeFile(join(evidenceDir, 'hero-layout-summary.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Issue #97 release-safe layout: ' + report.status + ', ' +
      report.cases.filter(c => c.status === 'PASS').length + '/' + (locales.length * viewports.length));
    if (report.failures.length) process.exitCode = 1;
  }
}

// --- self-test: the same assertions must flag the pre-fix layout and accept the fixed one -------

const fixtureStyles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #060a12; color: #f4f6fb; font: 16px/1.5 sans-serif; }
  header { position: sticky; top: 0; height: 80px; background: #0b111b; z-index: 50; }
  main { max-width: 1088px; margin: 0 auto; padding: 0 24px; }
  [data-hero-layout="overlay"] { position: relative; }
  [data-hero-layout="flow"] { display: grid; grid-template-columns: 5fr 7fr; gap: 40px; align-items: center; }
  [data-hero-shade] { position: absolute; left: 0; top: 0; z-index: 1; width: 100%; height: 520px; pointer-events: none;
    background: linear-gradient(to right, rgba(6,10,18,.97), rgba(6,10,18,.9) 60%, rgba(6,10,18,.9)); }
  [data-hero-layout="overlay"] [data-hero-copy] { position: absolute; top: 0; left: 0; width: 32%; z-index: 10; }
  [data-hero-copy] h1 { font-size: 48px; line-height: 1.1; margin: 0; }
  [data-media-withheld] { padding: 32px; border: 1px solid #243044; background: #0f1824; text-align: center; margin-top: 40px; }
  [data-hero-layout="flow"] [data-media-withheld] { margin-top: 0; }
  [data-home-explore] { padding: 40px 0; }
  [data-home-feature] { display: block; padding: 24px; border: 1px solid #243044; background: #0b131f; color: #f4f6fb; text-decoration: none; }
  [data-home-feature] p { color: #c4ccd8; }
  .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
`;

function fixture(layout, locale = 'en') {
  const shade = layout === 'overlay' ? '<div aria-hidden="true" data-hero-shade></div>' : '';
  return `<!doctype html><html lang="${locale}" data-media-profile="release_safe"><head><meta charset="utf-8"><style>${fixtureStyles}</style></head><body>
    <header>site header</header>
    <main>
      <p style="margin:80px 0 24px">WEBSITE PREVIEW</p>
      <div data-hero data-hero-layout="${layout}">
        ${shade}
        <div data-hero-copy>
          <h1>Miniature turbine learning and site preview with a deliberately long translated title</h1>
          <p>Explore how miniature turbines work and browse a bilingual website preview.</p>
          <a href="/products/" style="display:inline-block;padding:12px 20px;background:#ff4f64;color:#111">Explore products</a>
        </div>
        <div data-media-withheld role="status">Concept image withheld — publication rights have not been verified.</div>
      </div>
      <section data-home-explore>
        <h2 id="home-explore-heading">Explore the BODICH preview</h2>
        <p>Discover the proposed site structure.</p>
        <div class="cards">
          <a href="/products/" data-home-feature="products"><h3>Turbine concepts</h3><p>Explore the proposed turbine category.</p></a>
          <a href="/accessories/" data-home-feature="accessories"><h3>Accessory categories</h3><p>Browse planned groups.</p></a>
          <a href="/support/" data-home-feature="support"><h3>Support information</h3><p>Learn which resources are pending.</p></a>
        </div>
      </section>
    </main></body></html>`;
}

async function selfTest() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: viewportHeight }, reducedMotion: 'reduce' });
    for (const locale of locales) {
    await page.setContent(fixture('flow', locale));
    const accepted = await inspect(page);
    assert.deepEqual(accepted, [], `Fixed in-flow hero fixture must pass: ${accepted.join('; ')}`);

    // Pre-fix shape: absolutely positioned copy plus a full-width shade over a short hero.
    // The geometry rules ask for "flow", so reuse them by checking the overlay metrics directly.
    await page.setContent(fixture('overlay', locale));
    const broken = await page.evaluate(collectHeroMetrics);
    assert.equal(broken.layout, 'overlay');
    const asFlow = { ...broken, layout: 'flow' };
    const problems = findGeometryViolations(asFlow);
    assert(problems.some((p) => p.startsWith('overlap:')), `Overlapping blocks must be detected: ${problems.join('; ')}`);
    assert(problems.some((p) => p.startsWith('obscured:')), `A painted shade over content must be detected: ${problems.join('; ')}`);
    assert(problems.some((p) => p.includes('[data-hero-shade]')), 'Rendering the shade in the release-safe layout must be rejected');
    assert(problems.some((p) => p.includes('normal flow')), 'Absolutely positioned hero copy must be rejected');
    assert(problems.some((p) => p.includes('outside the hero container')), 'Content spilling out of the hero must be detected');
    const rendered = await findRenderedTextProblems(page, asFlow);
    assert(rendered.some((p) => p.includes('darkening')), `Pixel read-back must detect darkened text: ${rendered.join('; ')}`);

    // The guard must refuse to certify the beta overlay layout as release-safe output.
    assert(findGeometryViolations(broken)[0].includes('release-safe'), 'Non-flow layouts must not be accepted as release-safe');
    }
  } finally {
    await browser.close();
  }

  // Startup failure: with no usable Chromium the run must exit non-zero promptly instead of
  // hanging on the still-listening static server.
  const emptyDist = await mkdtemp(join(tmpdir(), 'bodich-hero-'));
  try {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), emptyDist], {
      env: { ...process.env, BODICH_QA_CHROMIUM_PATH: join(emptyDist, 'missing-chromium') },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.notEqual(child.error?.code, 'ETIMEDOUT', 'A Chromium launch failure must not leave the process hanging');
    assert.equal(child.status, 1, `A Chromium launch failure must exit with status 1 (got ${child.status})`);
    assert(/executable|chromium|browser/i.test(`${child.stderr}`), `Launch failure must be reported: ${child.stderr}`);
  } finally {
    await rm(emptyDist, { recursive: true, force: true });
  }
  console.log('Hero layout self-test passed: accepts the in-flow fixture and rejects overlap, shade obscuration, absolute copy and darkened text, and exits cleanly when Chromium cannot launch.');
}

const argument = process.argv[2];
try {
  if (argument === '--self-test') await selfTest();
  else await run(argument ?? 'dist');
} catch (error) {
  console.error(error?.message ?? error);
  process.exitCode = 1;
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import os from 'node:os';
import { firefox, webkit } from 'playwright';
import { sha256, collectReleaseFiles, distManifestSha256 } from './lib/release-manifest.mjs';

// Issue #87: bounded automated Linux browser smoke, not physical-device evidence.
const engines = { firefox, webkit };
const locales = ['en', 'ro'];
const routes = ['home', 'products', 'accessories', 'support', 'about', 'contact'];
const viewports = [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const outputDir = resolve(process.env.QA_OUTPUT_DIR ?? 'visual-qa/cross-browser-qa');
const baseUrl = new URL(process.env.CROSS_BROWSER_BASE_URL ?? 'http://127.0.0.1:4321');
if (baseUrl.protocol !== 'http:' || baseUrl.hostname !== '127.0.0.1' ||
    baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password) {
  throw new Error('Cross-browser QA accepts only an HTTP 127.0.0.1 root preview.');
}

function pathFor(locale, route) {
  return '/' + locale + '/' + (route === 'home' ? '' : route + '/');
}

function assertPageEvidence(evidence, locale, route, width) {
  assert.equal(evidence.pathname, pathFor(locale, route), 'incorrect route pathname');
  assert.equal(evidence.lang, locale, 'incorrect html lang');
  assert.equal(evidence.h1Count, 1, 'expected exactly one H1');
  assert.equal(evidence.headerCount, 1, 'expected a single semantic header');
  assert.equal(evidence.footerCount, 1, 'expected a single semantic footer');
  assert.equal(evidence.hasMain, true, 'missing semantic main landmark');
  assert(evidence.scrollWidth <= width + 1, 'horizontal overflow (' + evidence.scrollWidth + ' > ' + width + ')');
}

function runNegativeFixtures() {
  const good = {
    pathname: '/ro/products/', lang: 'ro', h1Count: 1, headerCount: 1,
    footerCount: 1, hasMain: true, scrollWidth: 390,
  };
  assert.doesNotThrow(() => assertPageEvidence(good, 'ro', 'products', 390));
  assert.throws(() => assertPageEvidence({ ...good, lang: 'en' }, 'ro', 'products', 390),
    /incorrect html lang/, 'wrong locale must not PASS');
  assert.throws(() => assertPageEvidence({ ...good, pathname: '/ro/about/' }, 'ro', 'products', 390),
    /incorrect route pathname/, 'wrong route must not PASS');
  assert.throws(() => assertPageEvidence({ ...good, scrollWidth: 400 }, 'ro', 'products', 390),
    /horizontal overflow/, 'overflow must not PASS');
  console.log('PASS negative fixtures: wrong locale, wrong route and overflow fail closed');
}

if (process.argv.includes('--self-test')) {
  runNegativeFixtures();
} else {
  await runSmoke();
}

function currentIdentity() {
  const files = collectReleaseFiles(resolve('dist'));
  return {
    sourceSha: execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim(),
    lockfileSha256: sha256(readFileSync('package-lock.json')),
    distManifestSha256: distManifestSha256(files),
    distFileCount: files.length,
  };
}

function assertIdentity(baseline, current) {
  assert.equal(baseline.schemaVersion, 1, 'missing Stage 20D canonical build baseline');
  for (const key of ['sourceSha', 'lockfileSha256', 'distManifestSha256', 'distFileCount']) {
    assert.equal(current[key], baseline[key], 'build integrity drift: ' + key);
  }
}

async function pageEvidence(page) {
  await page.evaluate(async () => {
    // Ensure same-origin lazy images have actually been requested/decoded.
    await Promise.all([...document.images].map(async (img) => {
      img.loading = 'eager';
      await img.decode();
    }));
    await document.fonts.ready;
  });
  return page.evaluate(() => ({
    pathname: location.pathname,
    lang: document.documentElement.lang,
    h1Count: document.querySelectorAll('h1').length,
    headerCount: document.querySelectorAll('header').length,
    footerCount: document.querySelectorAll('footer').length,
    hasMain: document.querySelectorAll('main').length === 1,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
}

async function loadAndAssert(page, url, locale, route, width) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  assert.equal(response?.status(), 200, 'route must return HTTP 200');
  assertPageEvidence(await pageEvidence(page), locale, route, width);
}

function listenForFailures(page, issues, origin, navigation) {
  page.on('pageerror', (error) => issues.push('uncaught page error: ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push('console.error: ' + message.text());
  });
  page.on('response', (response) => {
    if (new URL(response.url()).origin === origin && response.status() >= 400) {
      issues.push('same-origin HTTP ' + response.status() + ': ' + new URL(response.url()).pathname);
    }
  });
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin !== origin) return;
    const reason = request.failure()?.errorText ?? 'unknown failure';
    // Only an explicitly initiated, interrupted *document* navigation is benign.
    // Never suppress cancelled scripts, styles, images, XHR, or arbitrary failures.
    const cancelled = /^(?:net::ERR_ABORTED|NS_BINDING_ABORTED|Load cancelled|Cancelled)$/i.test(reason);
    if (navigation.active && cancelled && request.isNavigationRequest() &&
        request.resourceType() === 'document' && request.frame() === page.mainFrame()) return;
    issues.push('same-origin request failed: ' + new URL(request.url()).pathname + ': ' + reason);
  });
}

async function runCase(browser, engine, locale, route, viewport, kind) {
  const id = [engine, locale, kind === 'journey' ? 'journey' : route, viewport.name].join('-');
  const result = { id, engine, locale, route: kind === 'journey' ? null : route,
    viewport: viewport.name, width: viewport.width, kind, status: 'FAIL', failures: [], screenshot: null };
  let context;
  let page;
  const navigation = { active: false };
  try {
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce', deviceScaleFactor: 1,
    });
    // Never access an external site, including during a regression.
    await context.route('**/*', (requestRoute) => {
      const url = new URL(requestRoute.request().url());
      if (url.origin !== baseUrl.origin) {
        result.failures.push('blocked off-origin request: ' + url.origin);
        return requestRoute.abort('blockedbyclient');
      }
      return requestRoute.continue();
    });
    page = await context.newPage();
    listenForFailures(page, result.failures, baseUrl.origin, navigation);
    if (kind === 'journey') {
      await runJourney(page, locale, viewport, navigation);
    } else {
      await loadAndAssert(page, new URL(pathFor(locale, route), baseUrl).href, locale, route, viewport.width);
    }
    assert.deepEqual(result.failures, [], 'browser runtime or network failures');
    result.status = 'PASS';
  } catch (error) {
    result.failures.push(String(error?.message ?? error).slice(0, 600));
  } finally {
    if (result.status === 'FAIL' && page && !page.isClosed()) {
      try {
        const name = id + '.png';
        await mkdir(join(outputDir, 'screenshots'), { recursive: true });
        await page.screenshot({ path: join(outputDir, 'screenshots', name), fullPage: true, timeout: 10000 });
        result.screenshot = 'screenshots/' + name;
      } catch (error) {
        result.failures.push('failure screenshot unavailable: ' + String(error?.message ?? error).slice(0, 160));
      }
    }
    if (context) await context.close().catch(() => {});
  }
  console.log(result.status + ' ' + id + (result.status === 'FAIL' ? ': ' + result.failures.join('; ') : ''));
  return result;
}

async function followLink(page, link, expectedPath, navigation) {
  navigation.active = true;
  try {
    const responsePromise = page.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
    await link.click();
    const response = await responsePromise;
    assert.equal(response?.status(), 200, 'navigation HTTP 200');
    assert.equal(new URL(page.url()).pathname, expectedPath, 'navigation destination');
  } finally {
    navigation.active = false;
  }
}

async function runJourney(page, locale, viewport, navigation) {
  await loadAndAssert(page, new URL(pathFor(locale, 'products'), baseUrl).href,
    locale, 'products', viewport.width);
  const mobile = viewport.width < 1024;
  if (mobile) {
    const menu = page.locator('[data-mobile-navigation]');
    const summary = menu.locator('summary');
    assert.equal(await menu.isVisible(), true, 'mobile menu missing');
    await summary.focus();
    await summary.press('Enter');
    assert.equal(await menu.getAttribute('open'), '', 'keyboard Enter must open mobile menu');
    assert.equal(await menu.locator('nav').isVisible(), true, 'mobile navigation not visible');
    await page.locator('footer a').first().focus();
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('open'), null, 'Escape must dismiss mobile menu');
    assert.equal(await summary.evaluate((node) => document.activeElement === node), true,
      'Escape must restore focus to summary');
  } else {
    assert.equal(await page.locator('[data-primary-navigation]').isVisible(), true,
      'desktop primary navigation missing');
  }
  const target = locale === 'en' ? 'ro' : 'en';
  const switchLink = page.locator('header [role="group"]:visible a');
  assert.equal(await switchLink.count(), 1, 'one visible language-switch link required');
  assert.equal(await switchLink.getAttribute('href'), pathFor(target, 'products'),
    'language switch must preserve route');
  await followLink(page, switchLink, pathFor(target, 'products'), navigation);
  assertPageEvidence(await pageEvidence(page), target, 'products', viewport.width);
  const navLink = mobile
    ? page.locator('[data-mobile-navigation] nav a[href="' + pathFor(target, 'support') + '"]')
    : page.locator('[data-primary-navigation] a[href="' + pathFor(target, 'support') + '"]');
  if (mobile) {
    const menu = page.locator('[data-mobile-navigation]');
    await menu.locator('summary').click();
    assert.equal(await menu.locator('nav').isVisible(), true, 'second-route menu must open');
  }
  await followLink(page, navLink, pathFor(target, 'support'), navigation);
  assertPageEvidence(await pageEvidence(page), target, 'support', viewport.width);
}

async function runSmoke() {
  const report = {
    schemaVersion: 1, issue: 87, scope: 'linux_playwright_release_safe_automated_only',
    generatedAt: new Date().toISOString(),
    sourceSha: null, githubEventSha: process.env.GITHUB_SHA ?? null,
    distManifestSha256: null, distManifestSha256AfterQA: null,
    lockfileSha256: null, node: process.version, platform: os.platform(),
    playwrightVersion: null, browserVersions: { firefox: null, webkit: null },
    matrix: [], journeys: [], failures: [], status: 'FAIL',
    caveat: 'Linux WebKit is not Apple Safari; headless Firefox is not a real desktop/manual Firefox session.',
  };
  let baseline;
  await mkdir(outputDir, { recursive: true });
  try {
    baseline = JSON.parse(readFileSync(join(outputDir, 'build-integrity.json'), 'utf8'));
    const installed = JSON.parse(readFileSync(join(outputDir, 'installed-dependency-tree.json'), 'utf8'));
    const identity = currentIdentity();
    assert.match(identity.sourceSha, /^[0-9a-f]{40}$/, 'invalid checkout SHA');
    assert.equal(process.env.QA_HEAD_SHA ?? identity.sourceSha, identity.sourceSha,
      'checkout must be the real PR head, not the synthetic merge commit');
    assertIdentity(baseline, identity);
    assert.equal(installed.schemaVersion, 1, 'missing locked npm dependency inventory');
    assert.equal(installed.lockfileSha256, baseline.lockfileSha256, 'npm lock inventory mismatch');
    assert.equal(installed.installedToolVersions.playwright,
      JSON.parse(readFileSync(resolve('node_modules/playwright/package.json'), 'utf8')).version,
      'installed Playwright differs from locked npm inventory');
    report.sourceSha = identity.sourceSha;
    report.distManifestSha256 = identity.distManifestSha256;
    report.lockfileSha256 = identity.lockfileSha256;
    report.playwrightVersion = installed.installedToolVersions.playwright;
    for (const [engine, browserType] of Object.entries(engines)) {
      let browser;
      try {
        browser = await browserType.launch({ headless: true });
        report.browserVersions[engine] = browser.version();
        for (const locale of locales) {
          for (const route of routes) {
            for (const viewport of viewports) {
              report.matrix.push(await runCase(browser, engine, locale, route, viewport, 'route'));
            }
          }
          for (const viewport of viewports) {
            report.journeys.push(await runCase(browser, engine, locale, null, viewport, 'journey'));
          }
        }
      } catch (error) {
        const message = engine + ' could not launch/run: ' + String(error?.message ?? error).slice(0, 600);
        report.failures.push(message);
        // A missing browser must fail every unexecuted cell rather than silently skip it.
        for (const locale of locales) {
          for (const route of routes) for (const viewport of viewports) {
            if (!report.matrix.some((x) => x.engine === engine && x.locale === locale &&
              x.route === route && x.viewport === viewport.name)) {
              report.matrix.push({ engine, locale, route, viewport: viewport.name, width: viewport.width,
                kind: 'route', status: 'FAIL', failures: [message], screenshot: null });
            }
          }
          for (const viewport of viewports) {
            if (!report.journeys.some((x) => x.engine === engine && x.locale === locale &&
              x.viewport === viewport.name)) {
              report.journeys.push({ engine, locale, route: null, viewport: viewport.name, width: viewport.width,
                kind: 'journey', status: 'FAIL', failures: [message], screenshot: null });
            }
          }
        }
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }
  } catch (error) {
    report.failures.push('QA setup failed: ' + String(error?.message ?? error).slice(0, 600));
  } finally {
    try {
      const after = currentIdentity();
      report.distManifestSha256AfterQA = after.distManifestSha256;
      if (!baseline) throw new Error('build integrity baseline missing');
      assertIdentity(baseline, after);
    } catch (error) {
      report.failures.push('post-test integrity check failed: ' + String(error?.message ?? error).slice(0, 600));
    }
    if (report.matrix.length !== 48 || report.journeys.length !== 8 ||
        report.matrix.some((x) => x.status !== 'PASS') ||
        report.journeys.some((x) => x.status !== 'PASS')) {
      report.failures.push('incomplete/failing 48-cell matrix or eight interactive journeys');
    }
    report.status = report.failures.length ? 'FAIL' : 'PASS_AUTOMATED_ONLY';
    await writeFile(join(outputDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Issue #87: ' + report.status + ' (' +
      report.matrix.filter((x) => x.status === 'PASS').length + '/48 routes, ' +
      report.journeys.filter((x) => x.status === 'PASS').length + '/8 journeys)');
    if (report.status === 'FAIL') process.exitCode = 1;
  }
}

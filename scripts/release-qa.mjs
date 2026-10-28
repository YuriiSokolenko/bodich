import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const execFileAsync = promisify(execFile);
const baseUrl = new URL(process.env.QA_BASE_URL ?? 'http://127.0.0.1:4321');
if (!['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
  throw new Error('Release QA must run against a loopback preview, never a live customer site.');
}
const outputDir = resolve(process.env.QA_OUTPUT_DIR ?? 'visual-qa/release-qa');
const locales = ['en', 'ro'];
const routes = ['', 'products', 'accessories', 'support', 'about', 'contact'];
const labRoutes = ['', 'products'];
const repetitions = 3;
const failures = [];
const report = {
  schemaVersion: 1,
  scope: 'release_safe_informational_preview',
  source: process.env.GITHUB_SHA ?? null,
  generatedAt: new Date().toISOString(),
  environment: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version, runner: process.env.RUNNER_OS ?? null },
  browser: null,
  axeVersion: null,
  axe: [],
  lab: [],
  thresholds: { performance: 90, accessibility: 95, lcpMs: 2500, cls: 0.1, tbtMs: 200 },
  fieldCwv: { status: 'NO_FIELD_DATA', inpP75Ms: null, note: 'INP is a real-user field metric; TBT is not INP.' },
  failures,
};
const urlFor = (locale, route) => new URL('/' + locale + '/' + (route ? route + '/' : ''), baseUrl).href;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function fail(message) {
  failures.push(message);
  console.error('FAIL ' + message);
}
function metricsFromLhr(lhr) {
  const metric = (id) => lhr.audits?.[id]?.numericValue;
  return {
    performance: lhr.categories?.performance?.score == null ? null : lhr.categories.performance.score * 100,
    accessibility: lhr.categories?.accessibility?.score == null ? null : lhr.categories.accessibility.score * 100,
    lcpMs: metric('largest-contentful-paint') ?? null,
    cls: metric('cumulative-layout-shift') ?? null,
    tbtMs: metric('total-blocking-time') ?? null,
  };
}
const thresholds = report.thresholds;

await mkdir(outputDir, { recursive: true });

try {
  const browser = await chromium.launch({ headless: true });
  try {
    report.browser = { engine: 'Chromium', version: browser.version(), simulatedViewport: '390x844', realDevice: false };
    for (const locale of locales) {
      for (const route of routes) {
        const id = locale + '-' + (route || 'home');
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        try {
          const response = await page.goto(urlFor(locale, route), { waitUntil: 'load', timeout: 30000 });
          if (response?.status() !== 200 || (await page.locator('html').getAttribute('lang')) !== locale) {
            fail(id + ': missing HTTP 200 or incorrect document language');
            continue;
          }
          const result = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          report.axeVersion = result.testEngine.version;
          const violations = result.violations.map((v) => ({
            id: v.id, impact: v.impact, description: v.help,
            nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })).slice(0, 20),
          }));
          const severe = violations.filter((v) => ['critical', 'serious'].includes(v.impact));
          if (severe.length) fail(id + ': ' + severe.map((v) => v.id + ' (' + v.impact + ')').join(', '));
          report.axe.push({ id, url: page.url(), violations, severeCount: severe.length, incompleteCount: result.incomplete.length });
          // A separate mobile navigation state is important: collapsed menus are not scanned by axe.
          if (!route) {
            const menu = page.locator('[data-mobile-navigation]');
            await menu.locator('summary').click();
            const open = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
            const severeOpen = open.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
            if (severeOpen.length) fail(id + ': expanded navigation ' + severeOpen.map((v) => v.id).join(', '));
            report.axe.push({
              id: id + '-menu-open', url: page.url(),
              severeCount: severeOpen.length,
              incompleteCount: open.incomplete.length,
              violations: open.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target })).slice(0, 20) })),
            });
          }
          console.log('axe ' + id + ': ' + severe.length + ' serious/critical; ' + result.incomplete.length + ' manual-review items');
        } catch (error) {
          fail('axe ' + id + ': ' + error.message);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  fail('Chromium/axe stage: ' + error.message);
}

// Lighthouse launches its own installed full Chromium for a fresh mobile lab run.
// The default Lighthouse simulated-mobile network/CPU throttling is recorded from each LHR.
const lighthouseBinary = resolve('node_modules/.bin/lighthouse');
for (const locale of locales) {
  for (const route of labRoutes) {
    const id = locale + '-' + (route || 'home');
    const runs = [];
    for (let iteration = 1; iteration <= repetitions; iteration++) {
      const file = resolve(outputDir, 'lighthouse-' + id + '-' + iteration + '.json');
      try {
        await execFileAsync(lighthouseBinary, [
          urlFor(locale, route), '--only-categories=performance,accessibility',
          '--output=json', '--output-path=' + file, '--quiet',
          '--form-factor=mobile', '--screenEmulation.mobile=true',
          '--screenEmulation.width=390', '--screenEmulation.height=844',
          '--screenEmulation.deviceScaleFactor=2.75', '--throttling-method=simulate',
          '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
        ], {
          env: { ...process.env, CHROME_PATH: chromium.executablePath() },
          timeout: 180000, maxBuffer: 8 * 1024 * 1024,
        });
        const lhr = JSON.parse(await readFile(file, 'utf8'));
        const run = {
          iteration, file: 'lighthouse-' + id + '-' + iteration + '.json',
          lighthouseVersion: lhr.lighthouseVersion,
          userAgent: lhr.userAgent, fetchTime: lhr.fetchTime,
          settings: lhr.configSettings,
          metrics: metricsFromLhr(lhr),
          runtimeError: lhr.runtimeError?.message ?? null,
        };
        if (run.runtimeError || Object.values(run.metrics).some((x) => !Number.isFinite(x))) {
          fail(id + ' run ' + iteration + ': missing metrics or Lighthouse runtime error');
        }
        runs.push(run);
        console.log('Lighthouse ' + id + ' run ' + iteration + ': ' + JSON.stringify(run.metrics));
      } catch (error) {
        runs.push({ iteration, error: error.message });
        fail('Lighthouse ' + id + ' run ' + iteration + ': ' + error.message);
      }
    }
    const valid = runs.filter((r) => r.metrics && !r.runtimeError && Object.values(r.metrics).every(Number.isFinite));
    const medians = valid.length === repetitions
      ? Object.fromEntries(Object.keys(thresholds).map((key) => [key, median(valid.map((r) => r.metrics[key]))]))
      : null;
    const passes = !!medians && medians.performance >= thresholds.performance &&
      medians.accessibility >= thresholds.accessibility && medians.lcpMs <= thresholds.lcpMs &&
      medians.cls <= thresholds.cls && medians.tbtMs <= thresholds.tbtMs;
    if (!passes) fail(id + ': missing three valid runs or median mobile Lighthouse budget missed');
    report.lab.push({ id, url: urlFor(locale, route), runs, medians, passes, repeatsRequired: repetitions });
  }
}
report.status = failures.length ? 'FAIL' : 'PASS_AUTOMATED_ONLY';
await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Release QA automated status: ' + report.status + '; physical-device/manual WCAG evidence is always required separately.');
if (failures.length) process.exitCode = 1;

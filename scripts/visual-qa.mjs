import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Executes against the actual Astro production build served by astro preview.
// Screenshots and a machine-readable report are uploaded by GitHub Actions.
// No third-party website, real contact endpoint, or payment system is accessed.
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:4321';
const output = 'visual-qa';
const locales = ['en', 'ro'];
const widths = [320, 390, 768, 1024, 1440];
const pages = ['home', 'products', 'accessories', 'support', 'about', 'contact'];
const expectedLabels = {
  en: { products: 'Products', footer: ['Explore', 'Company'] },
  ro: { products: 'Produse', footer: ['Explorează', 'Companie'] },
};
const heroExpectations = {
  en: { caption: 'Concept rendering', altFragment: 'miniature jet turbine' },
  ro: { caption: 'Vizualizare conceptuală', altFragment: 'turboreactor miniatural' },
};
const failures = [];
const checks = [];
const screenshots = [];

function record(name, error) {
  const ok = !error;
  checks.push({ name, ok, detail: ok ? 'passed' : String(error?.message ?? error) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ': ' + (error?.message ?? error)}`);
  if (!ok) failures.push({ name, detail: String(error?.stack ?? error) });
}

async function verify(name, action) {
  try {
    await action();
    record(name);
  } catch (error) {
    record(name, error);
  }
}

function pathFor(locale, page) {
  return `/${locale}/${page === 'home' ? '' : page + '/'}`;
}

function contrastRatio(first, second) {
  const value = (hex) => {
    const channels = hex.trim().replace('#', '').match(/.{2}/g);
    assert(channels && channels.length === 3, `Expected CSS hex color, got ${hex}`);
    return channels
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, index) => sum + [0.2126, 0.7152, 0.0722][index] * v, 0);
  };
  const values = [value(first), value(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

await mkdir(`${output}/screenshots`, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of locales) {
    for (const width of widths) {
      const name = `${locale}-${width}`;
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(`console.error: ${message.text()}`);
      });
      page.on('requestfailed', (request) => {
        // Browser navigation may intentionally cancel an old document request.
        if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
          browserErrors.push(`requestfailed: ${request.url()} - ${request.failure()?.errorText}`);
        }
      });
      page.on('response', (response) => {
        if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
          browserErrors.push(`HTTP ${response.status()}: ${response.url()}`);
        }
      });

      try {
        await verify(`${name}: localized product page and accessible shell`, async () => {
          const response = await page.goto(`${baseUrl}${pathFor(locale, 'products')}`, {
            waitUntil: 'load',
            timeout: 30000,
          });
          assert.equal(response?.status(), 200);
          assert.equal(await page.locator('html').getAttribute('lang'), locale);
          assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
          assert.equal(await page.locator('header').count(), 1);
          assert.equal(await page.locator('footer').count(), 1);
          assert.equal(await page.locator('footer nav').count(), 2);
          assert.deepEqual(
            await page.locator('footer nav h2').allTextContents().then((x) =>
              x.map((y) => y.trim().split(' — ')[0].trim())
            ),
            expectedLabels[locale].footer,
          );
          const activeFooterLink = page.locator('footer nav a[aria-current="page"]');
          assert.equal(await activeFooterLink.count(), 1);
          assert.equal((await activeFooterLink.textContent())?.trim(), expectedLabels[locale].products);
          const footerNavsNamed = await page.locator('footer nav').evaluateAll((navs) =>
            navs.every((nav) => {
              const id = nav.getAttribute('aria-labelledby');
              return id && nav.querySelector('h2')?.id === id;
            }),
          );
          assert.equal(footerNavsNamed, true, 'Footer navigation must reference its heading');
        });

        await verify(`${name}: no horizontal overflow or clipped brand`, async () => {
          const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          assert(dimensions.scroll <= width + 1, `Overflow: ${dimensions.scroll} > ${width}`);
          const brand = await page.locator('header a').first().boundingBox();
          assert(brand && brand.x >= -1 && brand.x + brand.width <= width + 1);
        });

        await verify(`${name}: responsive navigation and language switch`, async () => {
          const desktopNavigation = page.locator('header [data-primary-navigation]');
          const mobileMenu = page.locator('header [data-mobile-navigation]');
          const mobileVisible = width < 1024;

          assert.equal(await mobileMenu.isVisible(), mobileVisible);
          assert.equal(await desktopNavigation.first().isVisible(), !mobileVisible);

          const switcher = page.locator('header [role="group"]:visible');
          assert.equal(await switcher.count(), 1, 'Exactly one visible language selector');
          const target = locale === 'en' ? 'ro' : 'en';
          const link = switcher.locator('a');
          assert.equal(await link.getAttribute('href'), pathFor(target, 'products'));
          assert.equal(await link.getAttribute('hreflang'), target);
          const box = await link.boundingBox();
          assert(box && box.width >= 40 && box.height >= 40, 'Switcher tap target below 40px');

          if (mobileVisible) {
            const summary = mobileMenu.locator('summary');
            assert.equal(await summary.isVisible(), true);
            await summary.focus();
            await summary.press('Enter');
            assert.equal(await mobileMenu.getAttribute('open'), '', 'Enter should open menu');
            const panel = mobileMenu.locator('nav');
            assert.equal(await panel.isVisible(), true);
            const menuBox = await panel.boundingBox();
            assert(menuBox && menuBox.x >= -1 && menuBox.x + menuBox.width <= width + 1,
              'Mobile menu extends beyond viewport');

            if (width === 320 || width === 768) {
              const shot = `${output}/screenshots/${name}-menu-open.png`;
              await page.screenshot({ path: shot, fullPage: true });
              screenshots.push(shot);
            }

            // Escape must dismiss the menu even when keyboard focus has moved
            // outside <details>, and must restore focus to the toggle.
            await page.locator('footer a').first().focus();
            await page.keyboard.press('Escape');
            assert.equal(await mobileMenu.getAttribute('open'), null, 'Document Escape should dismiss menu');
            assert.equal(
              await page.evaluate(() => document.activeElement?.tagName),
              'SUMMARY',
              'Escape should return focus to the menu summary',
            );
            await summary.press('Enter');
            assert.equal(await mobileMenu.getAttribute('open'), '', 'Enter should reopen menu');

            // Click a stable, explicit element outside the overlay, not a
            // viewport coordinate that may land on different content.
            await page.locator('footer small').first().click();
            assert.equal(await mobileMenu.getAttribute('open'), null, 'Outside click should dismiss menu');
          }

          await link.click();
          assert.equal(new URL(page.url()).pathname, pathFor(target, 'products'));
          assert.equal(await page.locator('html').getAttribute('lang'), target);
        });

        await verify(`${name}: localized turbine hero loads without crop or overflow`, async () => {
          const response = await page.goto(`${baseUrl}${pathFor(locale, 'home')}`, { waitUntil: 'load' });
          assert.equal(response?.status(), 200);

          const figure = page.locator('main figure');
          assert.equal(await figure.count(), 1, 'Home must render one turbine hero figure');
          const image = figure.locator('img');
          assert.equal(await image.getAttribute('src'), '/images/turbines/bodich-hero-concept.webp');
          assert((await image.getAttribute('alt'))?.includes(heroExpectations[locale].altFragment),
            'The hero image must have meaningful localized alt text');
          assert.equal((await figure.locator('figcaption').innerText()).trim(),
            heroExpectations[locale].caption, 'Concept disclosure must be localized and visible');
          assert.equal(await figure.locator('figcaption').isVisible(), true);
          assert.equal(await image.getAttribute('width'), '1672');
          assert.equal(await image.getAttribute('height'), '941');
          assert.equal(await image.getAttribute('loading'), 'eager', 'Hero must not lazy-load');
          assert.equal(await image.getAttribute('fetchpriority'), 'high', 'Hero is LCP-priority');

          const dimensions = await image.evaluate((img) => ({
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          }));
          assert.equal(dimensions.complete, true, 'Hero image request must complete');
          assert.equal(dimensions.naturalWidth, 1672, 'Hero image must decode at source width');
          assert.equal(dimensions.naturalHeight, 941, 'Hero image must decode at source height');

          const box = await image.boundingBox();
          const heading = await page.locator('main h1').boundingBox();
          const caption = await figure.locator('figcaption').boundingBox();
          assert(box && heading && caption, 'Hero, heading and disclosure must be rendered');
          assert(box.x >= -1 && box.x + box.width <= width + 1, 'Hero extends outside viewport');
          assert(box.height > 0 && Math.abs(box.width / box.height - 1672 / 941) < 0.03,
            'Hero must preserve the full uncropped image aspect ratio');
          assert(caption.y >= box.y + box.height - 1, 'Concept disclosure must appear below the image');

          if (width < 1024) {
            assert(heading.y + heading.height <= box.y + 1,
              'Mobile and tablet hero heading must be above, not over, the image');
          } else {
            assert(heading.y >= box.y - 1 && heading.y + heading.height <= box.y + box.height + 1,
              'Desktop hero heading must remain inside the image area');
            assert(heading.x + heading.width <= box.x + box.width * 0.72,
              'Desktop hero headline must stay in the photo’s left negative-space area');
          }

          const productLink = page.locator(`main a[href="${pathFor(locale, 'products')}"]`);
          assert.equal(await productLink.count(), 1, 'Hero must link to the localized products page');
          assert.equal(await productLink.isVisible(), true);
        });

        await verify(`${name}: headings, contrast, screenshot and browser errors`, async () => {
          await page.goto(`${baseUrl}${pathFor(locale, 'home')}`, { waitUntil: 'load' });
          assert.equal(await page.locator('h1').count(), 1);
          const colors = await page.evaluate(() => {
            const s = getComputedStyle(document.documentElement);
            return {
              accent: s.getPropertyValue('--color-bodich-accent').trim(),
              ink: s.getPropertyValue('--color-bodich-accent-ink').trim(),
              canvas: s.getPropertyValue('--color-bodich-canvas').trim(),
              border: s.getPropertyValue('--color-bodich-control-border').trim(),
              text: s.getPropertyValue('--color-bodich-ink').trim(),
              muted: s.getPropertyValue('--color-bodich-muted').trim(),
              dim: s.getPropertyValue('--color-bodich-dim').trim(),
              panel: s.getPropertyValue('--color-bodich-panel').trim(),
              focus: s.getPropertyValue('--color-bodich-accent-hover').trim(),
            };
          });
          assert(contrastRatio(colors.accent, colors.ink) >= 4.5, 'CTA text contrast below WCAG AA');
          assert(contrastRatio(colors.border, colors.canvas) >= 3, 'Control border contrast below WCAG nontext threshold');
          assert(contrastRatio(colors.text, colors.canvas) >= 4.5, 'Body text contrast below WCAG AA');
          assert(contrastRatio(colors.muted, colors.panel) >= 4.5, 'Muted text on panel contrast below WCAG AA');
          assert(contrastRatio(colors.dim, colors.canvas) >= 4.5, 'Dim labels contrast below WCAG AA');
          assert(contrastRatio(colors.accent, colors.canvas) >= 4.5, 'Accent text contrast below WCAG AA');
          assert(contrastRatio(colors.focus, colors.canvas) >= 3, 'Focus outline contrast below WCAG nontext threshold');

          const filename = `${output}/screenshots/${name}-home.png`;
          const shot = await page.screenshot({ path: filename, fullPage: true });
          assert(shot.length > 1000, 'Screenshot was unexpectedly blank');
          screenshots.push(filename);

          const body = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
          }));
          assert(body.scroll <= width + 1, 'Home page horizontal overflow');
          assert.deepEqual(browserErrors, [], 'Unexpected browser runtime errors');
        });

        if (width === 320 || width === 1024 || width === 1440) {
          await verify(`${name}: localized support navigation and keyboard skip link`, async () => {
            await page.goto(`${baseUrl}${pathFor(locale, 'support')}`, { waitUntil: 'load' });
            const firstTab = await page.keyboard.press('Tab').then(async () =>
              page.evaluate(() => document.activeElement?.getAttribute('href'))
            );
            assert.equal(firstTab, '#main-content');
            const switcher = page.locator('header [role="group"]:visible a');
            await switcher.click();
            const target = locale === 'en' ? 'ro' : 'en';
            assert.equal(new URL(page.url()).pathname, pathFor(target, 'support'));
          });
        }
      } finally {
        await page.close();
      }
    }
  }

  for (const locale of locales) {
    await verify(`${locale}: menu works without JavaScript`, async () => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 320, height: 900 },
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(`${baseUrl}${pathFor(locale, 'products')}`, { waitUntil: 'load' });
        assert.equal(response?.status(), 200);
        const mobileMenu = page.locator('[data-mobile-navigation]');
        const summary = mobileMenu.locator('summary');
        await summary.click();
        assert.equal(await mobileMenu.getAttribute('open'), '', 'Native disclosure must open without JS');
        await summary.click();
        assert.equal(await mobileMenu.getAttribute('open'), null, 'Native disclosure must close without JS');
        await summary.click();
        await mobileMenu.getByRole('link', { name: locale === 'en' ? 'Support' : 'Asistență' }).click();
        assert.equal(new URL(page.url()).pathname, pathFor(locale, 'support'));
      } finally {
        await context.close();
      }
    });
  }

  await verify('All six localized sections resolve in both languages', async () => {
    const page = await browser.newPage();
    try {
      for (const locale of locales) {
        for (const section of pages) {
          const response = await page.goto(`${baseUrl}${pathFor(locale, section)}`);
          assert.equal(response?.status(), 200, `${locale}/${section} did not resolve`);
        }
      }
    } finally {
      await page.close();
    }
  });
} finally {
  await browser.close();
}

const passed = checks.filter((check) => check.ok).length;
const total = checks.length;
const report = {
  generatedAt: new Date().toISOString(),
  testedBuildUrl: baseUrl,
  widths,
  locales,
  passed,
  total,
  failures,
  screenshots,
  checks,
};
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n', 'utf8');
const markdown = [
  '# BODICH browser visual QA',
  '',
  `Chromium production-preview tests: **${passed}/${total} passed**.`,
  '',
  'Test matrix: English and Romanian at ' + widths.map((width) => `${width}px`).join(', ') + '.',
  '',
  'Checks cover responsive navigation, document Escape and outside-click dismissal, native no-JS menu behavior,',
  'accessible labels, horizontal overflow, language switching, focus return, sampled contrast, console/network errors, and screenshots.',
  '',
  'These tests are browser-based layout and interaction checks, **not** expert visual or',
  'native Romanian language approval. Screenshots should also be reviewed manually.',
  '',
  '## Screenshots',
  '',
  ...screenshots.map((shot) => `- [${shot}](${shot.replace('visual-qa/', '')})`),
  '',
  '## Failures',
  '',
  ...(failures.length ? failures.map((failure) => `- **${failure.name}**: ${failure.detail.split('\n')[0]}`) : ['None.']),
  '',
].join('\n');
await writeFile(`${output}/report.md`, markdown + '\n', 'utf8');
console.log(`QA SUMMARY: ${passed}/${total} passed, ${screenshots.length} screenshots`);
if (failures.length) process.exitCode = 1;

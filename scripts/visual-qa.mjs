import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

        await verify(`${name}: localized catalog concepts use responsive lazy WebP`, async () => {
          const gallery = page.locator('[data-turbine-concepts]');
          assert.equal(await gallery.count(), 1, 'Products page must contain a concept preview gallery');
          assert.equal(await gallery.locator('h2').count(), 1);
          const expected = [
            {
              key: 'turbine',
              full: 'bodich-card-concept-01.webp',
              candidates: ['bodich-card-concept-01-360.webp', 'bodich-card-concept-01-600.webp', 'bodich-card-concept-01.webp'],
            },
            {
              key: 'intake',
              full: 'bodich-intake-detail-concept-02.webp',
              candidates: ['bodich-intake-detail-concept-02-360.webp', 'bodich-intake-detail-concept-02-600.webp', 'bodich-intake-detail-concept-02.webp'],
            },
          ];
          assert.equal(await gallery.locator('[data-concept-card]').count(), expected.length);
          for (const item of expected) {
            const card = gallery.locator(`[data-concept-card="${item.key}"]`);
            const image = card.locator('figure img');
            assert.equal(await image.getAttribute('src'), `/images/turbines/${item.full}`);
            assert.equal(await image.getAttribute('loading'), 'lazy', 'Catalog images must be lazy loaded');
            assert.equal(await image.getAttribute('fetchpriority'), null, 'Catalog images should not request hero priority');
            assert((await image.getAttribute('srcset'))?.includes('360w'), 'Responsive candidate missing');
            assert((await image.getAttribute('alt'))?.trim(), 'Catalog images need localized alt');
            assert.equal((await card.locator('figcaption').innerText()).trim(), heroExpectations[locale].caption);
            await image.scrollIntoViewIfNeeded();
            const decoded = await image.evaluate(async (img) => {
              await img.decode();
              return {
                current: new URL(img.currentSrc).pathname.split('/').pop(),
                complete: img.complete,
                naturalWidth: img.naturalWidth,
              };
            });
            assert(decoded.complete && decoded.naturalWidth > 0, `${item.key} image did not decode`);
            assert(item.candidates.includes(decoded.current), `${item.key} picked unexpected candidate ${decoded.current}`);
            if (width <= 390) {
              assert(decoded.current.endsWith('-360.webp'), `${item.key} must use compact image on narrow screens`);
            }
            const rect = await image.boundingBox();
            const parent = await card.boundingBox();
            assert(rect && parent && rect.width > 0 && rect.height > 0, 'Catalog image must be visible');
            assert(rect.x >= parent.x - 1 && rect.x + rect.width <= parent.x + parent.width + 1,
              'Catalog image must not be cropped horizontally');
            assert(Math.abs(rect.width / rect.height - 1) < 0.02, 'Square catalog concept must retain its full ratio');
          }
          // After scrolling to decode lazy images, reset to the document top.
          // Otherwise Chromium can paint the sticky header in the middle of
          // a full-page screenshot even though the page layout is correct.
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForFunction(() => window.scrollY === 0);
          const shot = `${output}/screenshots/${name}-products.png`;
          await page.screenshot({ path: shot, fullPage: true });
          screenshots.push(shot);
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

          const hero = page.locator('[data-hero]');
          assert.equal(await hero.count(), 1, 'Home must contain one turbine hero');
          const figure = hero.locator('figure');
          assert.equal(await figure.count(), 1, 'Hero must render one turbine figure');
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

          const dimensions = await image.evaluate(async (img) => {
            await img.decode();
            return {
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              currentFile: new URL(img.currentSrc).pathname,
            };
          });
          assert.equal(dimensions.complete, true, 'Hero image request must complete');
          assert(dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0, 'Hero image must decode');
          assert([
            '/images/turbines/bodich-hero-concept-640.webp',
            '/images/turbines/bodich-hero-concept-960.webp',
            '/images/turbines/bodich-hero-concept.webp',
          ].includes(dimensions.currentFile), 'Hero must use one of the responsive WebP candidates');
          if (width <= 390) {
            assert(dimensions.currentFile.endsWith('-640.webp'), 'Small viewports must use the compact hero candidate');
          }
          assert((await image.getAttribute('srcset'))?.includes('640w'), 'Hero must include width-descriptor srcset');

          const box = await image.boundingBox();
          const copy = hero.locator('[data-hero-copy]');
          const heading = await copy.locator('h1').boundingBox();
          const intro = await copy.locator('p').boundingBox();
          const cta = await copy.locator('a').boundingBox();
          const caption = await figure.locator('figcaption').boundingBox();
          assert(box && heading && intro && cta && caption, 'Hero, copy, CTA and disclosure must be rendered');
          assert(box.x >= -1 && box.x + box.width <= width + 1, 'Hero extends outside viewport');
          assert(box.height > 0 && Math.abs(box.width / box.height - 1672 / 941) < 0.03,
            'Hero must preserve the full uncropped image aspect ratio');
          assert(caption.y >= box.y + box.height - 1, 'Concept disclosure must appear below the image');

          if (width < 1024) {
            for (const [label, element] of [['heading', heading], ['supporting copy', intro], ['CTA', cta]]) {
              assert(element.y + element.height <= box.y + 1,
                `Mobile/tablet ${label} must appear above the image, never over it`);
            }
            assert.equal(await hero.locator('[data-hero-shade]').isVisible(), false);
          } else {
            // The turbine intake starts about one-third into the source image.
            // All copy, including the CTA, must remain inside the same safe area,
            // not merely the paragraph as before. Include vertical bounds to catch
            // overflow from long translated strings at the lg breakpoint.
            const safeRight = box.x + box.width * 0.34;
            const bounds = [['heading', heading], ['supporting copy', intro], ['CTA', cta]];
            for (const [label, element] of bounds) {
              assert(element.x >= box.x - 1 && element.x + element.width <= safeRight + 1,
                `Desktop ${label} intrudes into the turbine intake region`);
              assert(element.y >= box.y - 1 && element.y + element.height <= box.y + box.height + 1,
                `Desktop ${label} overflows the hero image vertically`);
            }
            // An actual gradient is part of the text-on-image contrast treatment.
            // Contrast still needs manual screenshot review against rendered pixels.
            const shade = hero.locator('[data-hero-shade]');
            assert.equal(await shade.isVisible(), true, 'Desktop hero shading must be visible');
            assert((await shade.evaluate((element) => getComputedStyle(element).backgroundImage))
              .includes('gradient'), 'Desktop hero text needs its contrast gradient');
          }

          const productLink = copy.locator(`a[href="${pathFor(locale, 'products')}"]`);
          assert.equal(await productLink.count(), 1, 'Hero CTA must link to the localized products page');
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


  // DPR-2 coverage: on modern phones the browser often selects a larger
  // srcset file than it does at DPR 1, even at the same CSS viewport.
  // The primary 5-width matrix intentionally uses DPR 1 for stable geometry.
  for (const locale of locales) {
    await verify(`${locale}: DPR-2 responsive WebP selection at 390px`, async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 900 },
        deviceScaleFactor: 2,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        await page.goto(`${baseUrl}${pathFor(locale, 'home')}`, { waitUntil: 'load' });
        const hero = page.locator('[data-hero] img');
        const heroResource = await hero.evaluate(async (img) => {
          await img.decode();
          return new URL(img.currentSrc).pathname.split('/').pop();
        });
        assert([
          'bodich-hero-concept-960.webp',
          'bodich-hero-concept.webp',
        ].includes(heroResource),
        `DPR-2 hero should choose >=960px candidate, got ${heroResource}`);

        await page.goto(`${baseUrl}${pathFor(locale, 'products')}`, { waitUntil: 'load' });
        for (const { key, medium, full } of [
          { key: 'turbine', medium: 'bodich-card-concept-01-600.webp', full: 'bodich-card-concept-01.webp' },
          { key: 'intake', medium: 'bodich-intake-detail-concept-02-600.webp', full: 'bodich-intake-detail-concept-02.webp' },
        ]) {
          const img = page.locator(`[data-concept-card="${key}"] img`);
          await img.scrollIntoViewIfNeeded();
          const resource = await img.evaluate(async (image) => {
            await image.decode();
            return new URL(image.currentSrc).pathname.split('/').pop();
          });
          assert([medium, full].includes(resource),
            `DPR-2 ${key} should not choose the low-DPR 360px asset, got ${resource}`);
        }
      } finally {
        await context.close();
      }
    });
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

  await verify('All six responsive turbine WebP assets are available and decodable', async () => {
    const variants = [
      ['bodich-hero-concept-640.webp', 640, 360, 17372, 'eca0c639df9e52b74cb2af0588683355b523b2834e77d0efdb3bb5f388e97ccc'],
      ['bodich-hero-concept-960.webp', 960, 540, 32714, 'a360256a44699acd6e9767172b49fff63ac491370ca559873d269cc4a3cb677d'],
      ['bodich-card-concept-01-360.webp', 360, 360, 17698, '63016d46c5ade7dd5a79acb631b83921bf16d11bfbd7d6001a55848fd37303cf'],
      ['bodich-card-concept-01-600.webp', 600, 600, 41062, '5d3f858c554bef61c56afc45ac3aab51b5a55f40aa8a4a8e03c08da0776daf64'],
      ['bodich-intake-detail-concept-02-360.webp', 360, 360, 24738, '913506c80767b2db6ba674012d2965bf8aa23541e13de5c025e4f0e831a1a1bb'],
      ['bodich-intake-detail-concept-02-600.webp', 600, 600, 57300, '29bf4417cf084d00adf0ce8ddce8e18b50eb427a9979c9de58a12c0478d064e3'],
    ];
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/en/products/`, { waitUntil: 'load' });
      for (const [file, expectedWidth, expectedHeight, expectedBytes, expectedSha256] of variants) {
        const path = `/images/turbines/${file}`;
        const response = await page.request.get(`${baseUrl}${path}`);
        assert.equal(response.status(), 200, `Missing responsive WebP: ${file}`);
        assert.match(response.headers()['content-type'], /^image\/webp/, `Incorrect MIME: ${file}`);
        const bytes = await response.body();
        assert.equal(bytes.length, expectedBytes, `Unexpected asset size: ${file}`);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedSha256,
          `SHA-256 mismatch for ${file}; update the asset and documented hash together`);
        const actual = await page.evaluate(async (url) => {
          const bitmap = await createImageBitmap(await (await fetch(url)).blob());
          const dimensions = [bitmap.width, bitmap.height];
          bitmap.close();
          return dimensions;
        }, path);
        assert.deepEqual(actual, [expectedWidth, expectedHeight], `Corrupt variant: ${file}`);
      }
    } finally {
      await page.close();
    }
  });

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

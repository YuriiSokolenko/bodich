/**
 * Run against the tested, isolated nginx QA container; never launches the public build.
 * All 132 card elements are checked, and representative lazy/eager images must decode.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4321';
const references = JSON.parse(readFileSync('docs/catalog/reference-overrides.json', 'utf8')).records;
assert.equal(references.length, 132);
const concept = '/images/turbines/bodich-card-concept-01';
const primary = concept + '.webp';
const srcset = concept + '-360.webp 360w, ' + concept + '-600.webp 600w';
const sources = [concept + '-360.webp', concept + '-600.webp'];
const alt = {
  en: 'BODICH turbine concept art',
  ro: 'Concept ilustrativ de turbină BODICH',
};
const caption = {
  en: 'AI-generated illustrative concept art; not an exact model photograph.',
  ro: 'Imagine conceptuală ilustrativă generată cu IA; nu este o fotografie a modelului exact.',
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  async function checkImage(locator, locale, loading) {
    const attrs = await locator.evaluate((img) => ({
      src: img.getAttribute('src'), srcset: img.getAttribute('srcset'),
      sizes: img.getAttribute('sizes'), alt: img.getAttribute('alt'),
      loading: img.getAttribute('loading'), width: img.getAttribute('width'),
      height: img.getAttribute('height'),
    }));
    assert.equal(attrs.src, primary);
    assert.equal(attrs.srcset, srcset);
    assert.equal(attrs.alt, alt[locale]);
    assert.equal(attrs.loading, loading);
    assert.ok(attrs.sizes && attrs.width === '600' && attrs.height === '450');
  }
  async function checkLoaded(locator) {
    await locator.scrollIntoViewIfNeeded();
    const handle = await locator.elementHandle();
    assert.ok(handle);
    await page.waitForFunction((img) => img.complete && img.naturalWidth > 0, handle);
    const currentSrc = await locator.evaluate((img) => new URL(img.currentSrc).pathname);
    assert.ok(sources.includes(currentSrc), 'Wrong decoded responsive asset: ' + currentSrc);
  }
  for (const locale of ['en', 'ro']) {
    await page.goto(base + '/' + locale + '/qa/', { waitUntil: 'domcontentloaded' });
    const listing = page.locator('[data-qa-catalog]');
    assert.equal(await listing.count(), 1);
    const cards = listing.locator('ul li img');
    assert.equal(await cards.count(), 132);
    const landingHtml = await page.content();
    assert.ok(landingHtml.includes(caption[locale]));
    assert.ok(!landingHtml.includes('qa-art/'), 'Schematic leaked in ' + locale + ' catalog');
    for (const attrs of await cards.evaluateAll((imgs) => imgs.map((img) => ({
      src: img.getAttribute('src'), srcset: img.getAttribute('srcset'),
      alt: img.getAttribute('alt'), sizes: img.getAttribute('sizes'),
      loading: img.getAttribute('loading'),
    })))) {
      assert.equal(attrs.src, primary);
      assert.equal(attrs.srcset, srcset);
      assert.equal(attrs.alt, alt[locale]);
      assert.ok(attrs.sizes && attrs.loading === 'lazy');
    }
    for (const index of [0, 65, 131]) {
      await checkImage(cards.nth(index), locale, 'lazy');
      await checkLoaded(cards.nth(index));
    }
    for (const index of [0, 65, 131]) {
      const row = references[index];
      await page.goto(base + '/' + locale + '/qa/' + row.slug + '/', { waitUntil: 'domcontentloaded' });
      const detail = page.locator('[data-qa-detail="' + row.sourceId + '"]');
      assert.equal(await detail.count(), 1);
      const html = await page.content();
      assert.ok(html.includes(caption[locale]));
      assert.ok(!html.includes('qa-art/'), 'Schematic leaked in ' + locale + ' detail');
      const img = detail.locator('figure img');
      assert.equal(await img.count(), 1);
      await checkImage(img, locale, 'eager');
      await checkLoaded(img);
    }
  }
  console.log('Full-content QA browser smoke passed: EN/RO, 132 cards each, representative lazy/eager WebP images');
} finally {
  await browser.close();
}

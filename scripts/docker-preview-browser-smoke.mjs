import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://127.0.0.1:4321').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const assetResponses = new Map();
const failures = [];

page.on('requestfailed', (request) => {
  if (['stylesheet', 'script'].includes(request.resourceType())) {
    failures.push(`${request.resourceType()} ${request.url()}: ${request.failure()?.errorText}`);
  }
});
page.on('response', (response) => {
  const request = response.request();
  if (['stylesheet', 'script'].includes(request.resourceType())) {
    assetResponses.set(request.url(), response.status());
  }
});

try {
  for (const locale of ['en', 'ro']) {
    const response = await page.goto(`${base}/${locale}/`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, `/${locale}/ should return HTTP 200`);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);

    const assets = await page.locator('link[rel~="stylesheet"][href], script[src]').evaluateAll((nodes) =>
      nodes.map((node) => node.href || node.src),
    );
    assert(assets.some((url) => url.endsWith('.css')), `/${locale}/ must load a stylesheet`);
    assert(assets.some((url) => url.endsWith('.js')), `/${locale}/ must load a JavaScript asset`);
    for (const url of assets) {
      assert.equal(new URL(url).protocol, 'http:', `asset must stay on HTTP: ${url}`);
      assert.equal(new URL(url).origin, base, `asset must remain same-origin: ${url}`);
      const status = assetResponses.get(url);
      assert(status >= 200 && status < 400, `asset must load successfully: ${url} (${status})`);
    }

    const targetLocale = locale === 'en' ? 'ro' : 'en';
    const switcher = page.locator(`a[hreflang="${targetLocale}"]`).first();
    await switcher.click();
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).protocol, 'http:');
    assert.equal(await page.locator('html').getAttribute('lang'), targetLocale);
    assert(page.url().startsWith(`${base}/${targetLocale}/`), 'locale switch must navigate to the target locale');
  }

  assert.deepEqual(failures, [], `CSS/JS browser requests failed: ${failures.join('; ')}`);
  console.log('Docker browser smoke passed: CSS/JS loaded over HTTP and EN/RO locale navigation stayed HTTP.');
} finally {
  await browser.close();
}

#!/usr/bin/env node
// Review-only KingTech reference inventory. No data from here is shipped by Astro.
// Usage: node scripts/audit-kingtech-source.mjs --write
// Network audit deliberately runs on demand, not during ordinary builds.
// Exit statuses: 0 = no detected gaps; 2 = valid but incomplete; 1 = fatal.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ORIGIN = 'https://www.kingtechturbines.com';
let browser;
let browserPage;
const ROOTS = [
  ['g5', 'Turbine G5', '/shop/turbine-g5/29', 'turbine-engines'],
  ['g4', 'Turbines G4+', '/shop/turbines-g4/2', 'turbine-engines'],
  ['tp', 'Turbines TP', '/shop/turbines-tp/3', 'turbine-engines'],
  ['discounted', 'Discounted Turbines', '/shop/discounted-turbines/4', 'turbine-engines'],
  ['warranty', 'Warranty Purchase', '/shop/warranty-purchase/10', null],
  ['oil', 'Engine Oil', '/shop/engine-oil/8', 'fuel-systems'],
  ['batteries', 'Batteries', '/shop/batteries/7', 'electrical-components'],
  ['accessories', 'Turbine Accessories', '/shop/turbine-accessories/6', null],
  ['gift-card', 'Gift Card', null, null],
];
// Source-proven digital service and valid product pages absent from the current shop listings.
const GIFT_CARD_DESTINATION = 'https://app.squareup.com/gift/CA5XP82NMZYB7/order';
const DIRECT_ONLY_REFERENCES = [
  { url: ORIGIN + '/product/power-cable/32', sectionId: 'accessories' },
  { url: ORIGIN + '/product/g4-g4-data-cable/33', sectionId: 'accessories' },
  { url: ORIGIN + '/product/fuel-solenoid-valve/107', sectionId: 'accessories' },
  { url: ORIGIN + '/product/temp-probe-k30-45g/138', sectionId: 'accessories' },
];
const RESERVED = new Set(ROOTS.map((r) => r[2]).filter(Boolean).map((url) => url.split('/').pop()));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const decode = (s) => String(s || '').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|[0-9]+);/gi, (e) => {
  const simple = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
  if (simple[e.toLowerCase()]) return simple[e.toLowerCase()];
  const n = e[2].toLowerCase() === 'x' ? parseInt(e.slice(3, -1), 16) : parseInt(e.slice(2, -1), 10);
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : e;
});
const plain = (s) => decode(String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').trim());
function anchors(html) {
  const found = [];
  const re = /<a\b([^>]*\bhref\s*=\s*(?:"[^"]*"|'[^']*')[^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const value = m[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const raw = decode(value?.[1] ?? value?.[2] ?? '');
    try {
      const url = new URL(raw, ORIGIN);
      if (url.origin !== ORIGIN) continue;
      url.search = '';
      url.hash = '';
      found.push({ url: url.href, text: plain(m[2]) });
    } catch { /* ignore invalid hrefs */ }
  }
  return found;
}
function itemRef(url) {
  const parsed = new URL(url);
  if (parsed.origin !== ORIGIN) return null;
  const path = parsed.pathname;
  // Square emits older numeric IDs and newer opaque IDs (e.g. 24-character base32).
  const m = path.match(/^\/product\/([^/]+)\/([0-9]+|[A-Z0-9]{16,40})\/?$/i);
  if (!m) return null;
  const numeric = /^[0-9]+$/.test(m[2]);
  return { id: (numeric ? 'kt-' : 'kt-sq-') + m[2],
    numericId: numeric ? m[2] : null, opaqueId: numeric ? null : m[2],
    url: ORIGIN + path.replace(/\/$/, '') };
}
function categoryRef(url) {
  const path = new URL(url).pathname;
  const m = path.match(/^\/shop\/([^/]+)\/([0-9]+)\/?$/i);
  return m ? { numericId: m[2], url: ORIGIN + path.replace(/\/$/, '') } : null;
}
function meta(html, property) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== property) continue;
    return decode(tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]
      ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1] ?? '');
  }
  return '';
}
function productTitle(html) {
  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const name = plain(m[1]);
    if (name && !/^(KingTech Turbines|Shopping Cart|Cart)$/i.test(name)) return name;
  }
  const og = meta(html, 'og:title');
  if (og && !/^KingTech Turbines$/i.test(og)) return og.replace(/\s+\|\s+KingTech Turbines$/i, '');
  return null;
}
function sourceStatus(title, html) {
  if (/discontinued/i.test(title || '')) return 'discontinued';
  if (/industrial purchases only|industrial purposes only/i.test(title || '')) return 'industrial_only';
  const nearTitle = plain(html.match(/<h1\b[^>]*>[\s\S]{0,2500}/i)?.[0] || '');
  if (/\bout of stock\b/i.test(nearTitle)) return 'out_of_stock';
  return 'unknown';
}
function measuredCount(html) {
  const text = plain(html);
  const label = text.match(/\b([0-9][0-9,]*)\s+results?\b/i);
  if (label) return {
    count: Number(label[1].replaceAll(',', '')),
    evidence: { kind: 'result_label', text: label[0] },
  };
  const empty = text.match(/\b(?:items aren't available|items are not available|no items available|no products available|nothing found)\b/i);
  if (empty) return { count: 0, evidence: { kind: 'explicit_empty_message', text: empty[0] } };
  // Child-category links or a successful HTTP response do not prove zero products.
  return { count: null, evidence: null };
}
async function fetchHtml(url) {
  if (browserPage) {
    try {
      const response = await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const isListing = new URL(url).pathname.startsWith('/shop/');
      await browserPage.waitForFunction((listing) => {
        const text = document.body?.innerText || '';
        return listing ? /results?|items aren't available|no items available/i.test(text)
          : [...document.querySelectorAll('h1')].some((element) => (element.textContent || '').trim().length > 0);
      }, isListing, { timeout: 16000 }).catch(() => {});
      await browserPage.waitForTimeout(350);
      return { status: response?.status() ?? 0, url: browserPage.url(), html: await browserPage.content() };
    } catch (error) {
      return { status: 0, url, html: '', error: String(error) };
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 18000);
      let res;
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': 'BODICH-Catalog-Reference-Audit/1.0 (+https://github.com/YuriiSokolenko/bodich)', Accept: 'text/html' },
          signal: ctl.signal,
          redirect: 'follow',
        });
      } finally { clearTimeout(timer); }
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 2) {
        await delay(1500 * (attempt + 1));
        continue;
      }
      const html = res.ok ? await res.text() : '';
      return { status: res.status, url: res.url, html };
    } catch (e) {
      if (attempt === 2) return { status: 0, url, html: '', error: String(e) };
      await delay(1500 * (attempt + 1));
    }
  }
}
async function listCategory(categoryUrl, errors) {
  const ids = new Map();
  const subcategories = new Map();
  let count = null;
  let countEvidence = null;
  let pages = 0;
  for (let page = 1; page <= 30; page++) {
    const url = categoryUrl + '?limit=30&page=' + page + '&sort_by=category_order&sort_order=asc';
    let response;
    if (page > 1 && browserPage) {
      // Square can use a client-side "Load More" / "Next" control and ignore
      // query-string pagination. Prefer the visible control where present.
      const next = browserPage.locator('button[aria-label*="next" i], a[aria-label*="next" i], button:has-text("Load More"), button:has-text("Show More"), a:has-text("Next")').first();
      if (await next.count() && await next.isVisible()) {
        try {
          await next.click({ timeout: 5000 });
          await browserPage.waitForTimeout(900);
          response = { status: 200, url: browserPage.url(), html: await browserPage.content() };
        } catch { /* fallback to a navigated page below */ }
      }
    }
    response ??= await fetchHtml(url);
    await delay(220);
    if (response.status !== 200) {
      // A broken listing fetch is a fatal crawler failure, not a legitimate count gap.
      throw new Error('Listing ' + categoryUrl + ' page ' + page + ' returned HTTP ' + response.status);
    }
    pages++;
    if (page === 1) {
      console.log('Audit source HTML: ' + categoryUrl + ' HTTP ' + response.status + ' bytes=' + response.html.length + ' product-links=' + (response.html.split('/product/').length - 1) + ' sample=' + plain(response.html.slice(0, 600)).slice(0, 220));
      const measured = measuredCount(response.html);
      count = measured.count;
      countEvidence = measured.evidence;
    }
    const list = anchors(response.html);
    for (const a of list) {
      const c = categoryRef(a.url);
      if (c && !RESERVED.has(c.numericId) && c.numericId !== '9') subcategories.set(c.url, c);
    }
    let fresh = 0;
    for (const a of list) {
      const p = itemRef(a.url);
      if (!p) continue;
      if (!ids.has(p.id)) { ids.set(p.id, { ...p, fallbackTitle: a.text }); fresh++; }
    }
    if (!fresh || (count !== null && ids.size >= count)) break;
  }
  const complete = count !== null && ids.size === count;
  if (!complete) errors.push('Count mismatch/unmeasured: ' + categoryUrl + ' reported=' + count + ', extracted=' + ids.size);
  return { products: [...ids.values()], subcategories: [...subcategories.values()], reportedCount: count, countEvidence, pages, complete };
}
const sectionRoots = new Map(ROOTS.map(([id, title, path, mappedCategoryId]) =>
  [id, { id, title, url: path ? ORIGIN + path : null, mappedCategoryId }]));
async function run() {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') {
    const opaque = 'VCEYUYCU5FJF2GZQMXDNZXJO';
    const numeric = itemRef(ORIGIN + '/product/sample/123');
    const square = itemRef(ORIGIN + '/product/sample/' + opaque);
    if (numeric?.id !== 'kt-123' || numeric.numericId !== '123' || numeric.opaqueId !== null ||
        square?.id !== 'kt-sq-' + opaque || square.numericId !== null || square.opaqueId !== opaque ||
        itemRef('https://example.com/product/sample/123') !== null ||
        itemRef(ORIGIN + '/product/sample/short-id') !== null) {
      throw new Error('Square numeric and opaque source-ID parser fixtures failed');
    }
    const validH1 = productTitle('<main><h1>KingTech KP500V+</h1></main>');
    const validOg = productTitle('<meta property="og:title" content="KingTech KP500V+ | KingTech Turbines">');
    const tileOnly = productTitle('<main><a href="/product/sample/123">Listing title only</a></main>');
    const genericH1 = productTitle('<main><h1>KingTech Turbines</h1><p>Listing title</p></main>');
    if (validH1 !== 'KingTech KP500V+' || validOg !== 'KingTech KP500V+' ||
        tileOnly !== null || genericH1 !== null) {
      throw new Error('Product verification must require a page h1 or og:title');
    }
    const countedEmpty = measuredCount('<main>0 Results</main>');
    const explicitEmpty = measuredCount('<main>No items available</main>');
    const childrenOnly = measuredCount('<main><a href="/shop/example/42">Category</a></main>');
    if (countedEmpty.count !== 0 || countedEmpty.evidence?.kind !== 'result_label' ||
        explicitEmpty.count !== 0 || explicitEmpty.evidence?.kind !== 'explicit_empty_message' ||
        childrenOnly.count !== null || childrenOnly.evidence !== null) {
      throw new Error('Source zero-count evidence fixtures failed');
    }
    console.log('Source-ID, product-title and count-evidence fixtures passed.');
    return;
  }
  const useBrowser = process.argv.includes('--browser');
  if (!process.argv.includes('--write') || process.argv.some((a, i) => i > 1 && !['--write', '--browser'].includes(a))) {
    console.error('Usage: node scripts/audit-kingtech-source.mjs --write [--browser]');
    process.exitCode = 1;
    return;
  }
  if (useBrowser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    browserPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  }
  try {
  const capturedAt = new Date().toISOString().slice(0, 10);
  const warnings = [];
  const products = new Map();
  const sections = [];
  const crossListings = {};
  const exclusions = [
    {
      sectionId: 'gift-card', reason: 'Gift Card links from the KingTech navigation directly to a separate Square checkout, not a source /shop or /product entry (verified 2026-10-23).',
      evidenceUrl: ORIGIN + '/', externalDestinationUrl: GIFT_CARD_DESTINATION, count: null,
    },
    {
      sectionId: 'promotional-items', reason: 'Not one of the nine requested source sections; excluded pending scope approval.',
      evidenceUrl: ORIGIN + '/shop/promotional-items/9', count: null,
    },
  ];
  for (const root of sectionRoots.values()) {
    if (!root.url) {
      sections.push({ id: root.id, title: root.title, url: ORIGIN + '/', reportedCount: null,
        discoveredCount: 0, crossListedCount: 0, status: 'external_service_documented', externalDestinationUrl: GIFT_CARD_DESTINATION, subcategories: [] });
      continue;
    }
    const queue = [root.url];
    const seen = new Set();
    const sectionIds = new Set();
    const subcategories = [];
    let reportedCountRoot = null;
    let countEvidenceRoot = null;
    let completed = true;
    while (queue.length && seen.size < 60) {
      const categoryUrl = queue.shift();
      if (seen.has(categoryUrl)) continue;
      seen.add(categoryUrl);
      const listed = await listCategory(categoryUrl, warnings);
      if (categoryUrl === root.url) {
        reportedCountRoot = listed.reportedCount;
        countEvidenceRoot = listed.countEvidence;
      }
      completed &&= listed.complete;
      for (const sub of listed.subcategories) {
        if (root.id === 'accessories' && !seen.has(sub.url) && !queue.includes(sub.url)) queue.push(sub.url);
      }
      if (categoryUrl !== root.url) {
        subcategories.push({ url: categoryUrl, reportedCount: listed.reportedCount, countEvidence: listed.countEvidence,
          discoveredCount: listed.products.length, status: listed.complete ? 'matched' : 'incomplete' });
      }
      for (const p of listed.products) {
        sectionIds.add(p.id);
        const prior = products.get(p.id);
        if (prior) {
          if (!prior.sourceCategoryIds.includes(root.id)) prior.sourceCategoryIds.push(root.id);
          if (categoryUrl !== root.url && !prior.subcategoryUrls.includes(categoryUrl)) prior.subcategoryUrls.push(categoryUrl);
          prior.evidenceUrls = [...new Set([...prior.evidenceUrls, categoryUrl])];
        } else {
          products.set(p.id, { id: p.id, sourceNumericId: p.numericId, ...(p.opaqueId ? { sourceOpaqueId: p.opaqueId } : {}), sourceDiscovery: 'category_listing', sourceTitle: p.fallbackTitle || null,
            canonicalUrl: p.url, sourceCategoryIds: [root.id], subcategoryUrls: categoryUrl === root.url ? [] : [categoryUrl],
            manufacturer: null, sourceStatus: 'unknown', possibleVariants: null,
            mappedCategoryId: root.mappedCategoryId, mappingStatus: root.mappedCategoryId ? 'provisional' : 'unmapped',
            confidence: 'low', reviewStatus: 'needs_human_review',
            capturedAt, urlCheck: 'not_checked', evidenceUrls: [p.url, categoryUrl] });
        }
      }
    }
    if (seen.size >= 60) { completed = false; warnings.push('Subcategory traversal cap hit in ' + root.id); }
    sections.push({ id: root.id, title: root.title, url: root.url, reportedCount: reportedCountRoot,
      countEvidence: countEvidenceRoot, discoveredCount: sectionIds.size, crossListedCount: 0,
      status: completed ? 'matched' : 'incomplete',
      subcategories: subcategories.sort((a,b)=>a.url.localeCompare(b.url)) });
  }
  // Four product pages independently verified by product title and canonical URL,
  // but not currently enumerated by the Square category tiles.
  for (const direct of DIRECT_ONLY_REFERENCES) {
    const ref = itemRef(direct.url);
    if (!ref || products.has(ref.id)) continue;
    const response = await fetchHtml(ref.url);
    const title = response.status === 200 ? productTitle(response.html) : null;
    if (response.status !== 200 || !title || /^(404|page not found)$/i.test(title)) {
      warnings.push('Direct-only source page no longer renders a product: ' + ref.url);
      continue;
    }
    products.set(ref.id, {
      id: ref.id, sourceNumericId: ref.numericId, sourceDiscovery: 'direct_verified_unlisted',
      sourceTitle: title, canonicalUrl: ref.url, sourceCategoryIds: [direct.sectionId],
      subcategoryUrls: [], manufacturer: /KingTech/i.test(title) ? 'KingTech' : null,
      sourceStatus: sourceStatus(title, response.html), possibleVariants: null,
      mappedCategoryId: null, mappingStatus: 'unmapped', confidence: 'medium',
      reviewStatus: 'needs_human_review', capturedAt, urlCheck: 'http_200',
      evidenceUrls: [ref.url],
    });
    const section = sections.find((s) => s.id === direct.sectionId);
    if (section) {
      section.discoveredCount++;
      section.directOnlyCount = (section.directOnlyCount || 0) + 1;
    }
  }
  // Keep an evidence-backed exclusion when a previously indexed candidate
  // disappears from all current category listings. Never silently erase it.
  try {
    const previous = JSON.parse(readFileSync(resolve('docs/catalog/source-inventory.json'), 'utf8'));
    for (const old of previous.products || []) {
      if (products.has(old.id)) continue;
      exclusions.push({
        sectionId: old.sourceCategoryIds?.[0] || 'unknown',
        reason: 'Previously indexed reference not present in the current rendered category listing; requires direct URL and archive-status review.',
        evidenceUrl: old.canonicalUrl,
        count: 1,
      });
      warnings.push('Previously indexed candidate absent from current listing: ' + old.canonicalUrl);
    }
    // Preserve manual review/exclusion evidence even when the current source
    // storefront no longer links to the item.
    for (const legacy of previous.exclusions || []) {
      if (!products.has(itemRef(legacy.evidenceUrl)?.id) && !exclusions.some((entry) => entry.evidenceUrl === legacy.evidenceUrl)) {
        exclusions.push(legacy);
      }
    }
  } catch { /* no previously committed snapshot */ }
  for (const p of products.values()) {
    if (p.sourceDiscovery === 'direct_verified_unlisted' && p.urlCheck === 'http_200') continue;
    const response = await fetchHtml(p.canonicalUrl);
    await delay(220);
    if (response.status === 0 || response.status >= 500 || response.status === 429) {
      throw new Error('Product fetch failed for ' + p.id + ': HTTP ' + response.status);
    }
    if (response.status !== 200) {
      p.urlCheck = 'http_' + response.status;
      p.confidence = 'low';
      p.sourceStatus = response.status === 404 ? 'archived_or_missing' : 'unknown';
      warnings.push('Product ' + p.id + ' returned HTTP ' + response.status + ': ' + p.canonicalUrl);
      continue;
    }
    const verifiedTitle = productTitle(response.html);
    if (!verifiedTitle) {
      p.urlCheck = 'not_checked';
      p.sourceStatus = 'unknown';
      p.confidence = 'low';
      warnings.push('Product page returned HTTP 200 but lacks a verifiable h1/og:title: ' + p.canonicalUrl);
      continue;
    }
    if (/^(404|page not found)$/i.test(verifiedTitle)) {
      p.urlCheck = 'http_404';
      p.sourceStatus = 'archived_or_missing';
      p.confidence = 'low';
      warnings.push('Product URL renders an application-level 404: ' + p.canonicalUrl);
      continue;
    }
    p.urlCheck = 'http_200';
    p.sourceTitle = verifiedTitle;
    p.sourceStatus = sourceStatus(p.sourceTitle, response.html);
    p.manufacturer = /KingTech/i.test(p.sourceTitle || '') ? 'KingTech' : null;
    p.confidence = p.sourceTitle ? 'high' : 'medium';
    const canonicalMatch = response.html.match(/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/i);
    const href = canonicalMatch?.[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) {
      try {
        const c = itemRef(new URL(decode(href), ORIGIN).href);
        if (c?.id === p.id) p.canonicalUrl = c.url;
      } catch { /* ignore bad canonical */ }
    }
    if (!p.mappedCategoryId) {
      const mappings = p.sourceCategoryIds.map((x) => sectionRoots.get(x)?.mappedCategoryId).filter(Boolean);
      if (mappings.length === 1) { p.mappedCategoryId = mappings[0]; p.mappingStatus = 'provisional'; }
    }
    p.evidenceUrls = [...new Set([p.canonicalUrl, ...p.evidenceUrls])];
  }
  for (const section of sections) {
    section.crossListedCount = [...products.values()].filter((p) =>
      p.sourceCategoryIds.includes(section.id) && p.sourceCategoryIds.length > 1).length;
  }
  const result = { schemaVersion: 1, sourceSite: ORIGIN, capturedAt,
    purpose: 'public_repo_reference_not_site_product', companyStockClaim: false,
    sections, products: [...products.values()].sort((a,b) => {
      const aRank = a.sourceNumericId === null ? Infinity : Number(a.sourceNumericId);
      const bRank = b.sourceNumericId === null ? Infinity : Number(b.sourceNumericId);
      return aRank - bRank || a.id.localeCompare(b.id);
    }),
    exclusions, warnings: [...new Set(warnings)] };
  const destination = resolve('docs/catalog/source-inventory.json');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
  console.log('Source audit: ' + result.products.length + ' unique items, ' + result.sections.length + ' sections, ' + result.warnings.length + ' warnings.');
  if (result.warnings.length) {
    for (const w of result.warnings) console.warn('INCOMPLETE: ' + w);
    process.exitCode = 2;
  }
  } finally {
    await browserPage?.close();
    await browser?.close();
  }
}
await run().catch((error) => {
  console.error('FATAL: KingTech source crawler failed:', error);
  process.exitCode = 1;
});

#!/usr/bin/env node
// Review-only KingTech reference inventory. No data from here is shipped by Astro.
// Usage: node scripts/audit-kingtech-source.mjs --write
// Network audit deliberately runs on demand, not during ordinary builds.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ORIGIN = 'https://www.kingtechturbines.com';
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
  const path = new URL(url).pathname;
  const m = path.match(/^\/product\/([^/]+)\/([0-9]+)\/?$/);
  return m ? { id: 'kt-' + m[2], numericId: m[2], url: ORIGIN + path.replace(/\/$/, '') } : null;
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
function productTitle(html, fallback) {
  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const name = plain(m[1]);
    if (name && !/^KingTech Turbines$/i.test(name)) return name;
  }
  const og = meta(html, 'og:title');
  if (og && !/^KingTech Turbines$/i.test(og)) return og.replace(/\s+\|\s+KingTech Turbines$/i, '');
  return fallback || null;
}
function sourceStatus(title, html) {
  if (/discontinued/i.test(title || '')) return 'discontinued';
  if (/industrial purchases only|industrial purposes only/i.test(title || '')) return 'industrial_only';
  const nearTitle = plain(html.match(/<h1\b[^>]*>[\s\S]{0,2500}/i)?.[0] || '');
  if (/\bout of stock\b/i.test(nearTitle)) return 'out_of_stock';
  return 'unknown';
}
function reportedCount(html) {
  const text = plain(html);
  const match = text.match(/\b([0-9][0-9,]*)\s+results?\b/i);
  return match ? Number(match[1].replaceAll(',', '')) : null;
}
async function fetchHtml(url) {
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
  let pages = 0;
  for (let page = 1; page <= 30; page++) {
    const url = categoryUrl + '?limit=30&page=' + page + '&sort_by=category_order&sort_order=asc';
    const response = await fetchHtml(url);
    await delay(220);
    if (response.status !== 200) {
      errors.push('Listing ' + categoryUrl + ' page ' + page + ' returned HTTP ' + response.status);
      break;
    }
    pages++;
    if (page === 1) {
      console.log('Audit source HTML: ' + categoryUrl + ' HTTP ' + response.status + ' bytes=' + response.html.length + ' product-links=' + (response.html.split('/product/').length - 1) + ' sample=' + plain(response.html.slice(0, 600)).slice(0, 220));
      count = reportedCount(response.html);
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
  return { products: [...ids.values()], subcategories: [...subcategories.values()], reportedCount: count, pages, complete };
}
const sectionRoots = new Map(ROOTS.map(([id, title, path, mappedCategoryId]) =>
  [id, { id, title, url: path ? ORIGIN + path : null, mappedCategoryId }]));
async function run() {
  if (process.argv.length !== 3 || process.argv[2] !== '--write') {
    console.error('Usage: node scripts/audit-kingtech-source.mjs --write');
    process.exitCode = 2;
    return;
  }
  const capturedAt = new Date().toISOString().slice(0, 10);
  const warnings = [];
  const products = new Map();
  const sections = [];
  const crossListings = {};
  const exclusions = [
    {
      sectionId: 'gift-card', reason: 'The Gift Card navigation entry is a separate digital checkout flow, not a verified /shop product URL; requires manual verification.',
      evidenceUrl: ORIGIN + '/', count: null,
    },
    {
      sectionId: 'promotional-items', reason: 'Not one of the nine requested source sections; excluded pending scope approval.',
      evidenceUrl: ORIGIN + '/shop/promotional-items/9', count: null,
    },
  ];
  for (const root of sectionRoots.values()) {
    if (!root.url) {
      sections.push({ id: root.id, title: root.title, url: ORIGIN + '/', reportedCount: null,
        discoveredCount: 0, crossListedCount: 0, status: 'manual_review_required', subcategories: [] });
      continue;
    }
    const queue = [root.url];
    const seen = new Set();
    const sectionIds = new Set();
    const subcategories = [];
    let reportedCountRoot = null;
    let completed = true;
    while (queue.length && seen.size < 60) {
      const categoryUrl = queue.shift();
      if (seen.has(categoryUrl)) continue;
      seen.add(categoryUrl);
      const listed = await listCategory(categoryUrl, warnings);
      if (categoryUrl === root.url) reportedCountRoot = listed.reportedCount;
      completed &&= listed.complete;
      for (const sub of listed.subcategories) {
        if (root.id === 'accessories' && !seen.has(sub.url) && !queue.includes(sub.url)) queue.push(sub.url);
      }
      if (categoryUrl !== root.url) {
        subcategories.push({ url: categoryUrl, reportedCount: listed.reportedCount, discoveredCount: listed.products.length,
          status: listed.complete ? 'matched' : 'incomplete' });
      }
      for (const p of listed.products) {
        sectionIds.add(p.id);
        const prior = products.get(p.id);
        if (prior) {
          if (!prior.sourceCategoryIds.includes(root.id)) prior.sourceCategoryIds.push(root.id);
          if (categoryUrl !== root.url && !prior.subcategoryUrls.includes(categoryUrl)) prior.subcategoryUrls.push(categoryUrl);
          prior.evidenceUrls = [...new Set([...prior.evidenceUrls, categoryUrl])];
        } else {
          products.set(p.id, { id: p.id, sourceNumericId: p.numericId, sourceTitle: p.fallbackTitle || null,
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
      discoveredCount: sectionIds.size, crossListedCount: 0,
      status: completed ? 'matched' : 'incomplete',
      subcategories: subcategories.sort((a,b)=>a.url.localeCompare(b.url)) });
  }
  for (const p of products.values()) {
    const response = await fetchHtml(p.canonicalUrl);
    await delay(220);
    if (response.status !== 200) {
      p.urlCheck = 'http_' + response.status;
      p.confidence = 'low';
      p.sourceStatus = response.status === 404 ? 'archived_or_missing' : 'unknown';
      warnings.push('Product ' + p.id + ' returned HTTP ' + response.status + ': ' + p.canonicalUrl);
      continue;
    }
    p.urlCheck = 'http_200';
    p.sourceTitle = productTitle(response.html, p.sourceTitle);
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
    purpose: 'unpublished_reference_only', companyStockClaim: false,
    sections, products: [...products.values()].sort((a,b)=>Number(a.sourceNumericId)-Number(b.sourceNumericId)),
    exclusions, warnings: [...new Set(warnings)] };
  const destination = resolve('docs/catalog/source-inventory.json');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
  console.log('Source audit: ' + result.products.length + ' unique items, ' + result.sections.length + ' sections, ' + result.warnings.length + ' warnings.');
  if (result.warnings.length) {
    for (const w of result.warnings) console.warn('INCOMPLETE: ' + w);
    process.exitCode = 1;
  }
}
await run();

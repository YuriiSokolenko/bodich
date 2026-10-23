import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const load = (...segments) => readFileSync(join(dist, ...segments, 'index.html'), 'utf8');
const checks = [
  {
    file: load('en', 'products', 'turbine-engines'),
    path: 'EN turbine category',
    snippets: [
      'href="/bodich-preview/ro/products/turbine-engines/"',
      'href="/bodich-preview/en/products/"',
      'href="/bodich-preview/favicon.svg"',
      'href="https://example.invalid/bodich-preview/en/products/turbine-engines/"',
      'hreflang="ro" href="https://example.invalid/bodich-preview/ro/products/turbine-engines/"',
    ],
  },
  {
    file: load('ro', 'accessories', 'fuel-systems'),
    path: 'RO accessory category',
    snippets: [
      'href="/bodich-preview/en/accessories/fuel-systems/"',
      'href="/bodich-preview/ro/accessories/"',
    ],
  },
  {
    file: load('en', 'products'),
    path: 'EN products landing',
    snippets: [
      'href="/bodich-preview/en/products/turbine-engines/"',
      '/bodich-preview/images/turbines/bodich-card-concept-01.webp',
      '/bodich-preview/images/turbines/bodich-card-concept-01-360.webp',
    ],
  },
  {
    file: load(),
    path: 'root language redirect',
    snippets: ['/bodich-preview/en/'],
  },
];
for (const page of checks) {
  for (const snippet of page.snippets) {
    assert(page.file.includes(snippet), `${page.path}: expected HTML to contain ${snippet}`);
  }
}
console.log('Non-root base preview passed: locale links, breadcrumbs, canonical/hreflang, concept assets, favicon and redirect.');

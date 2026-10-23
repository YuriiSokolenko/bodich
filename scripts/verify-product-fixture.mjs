import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Verify the first-product workflow without publishing invented models.
 * Inject fixtures in a disposable copy only; leave production data/dist intact.
 */
const root = resolve('.');
const temp = mkdtempSync(join(tmpdir(), 'bodich-catalog-fixture-'));
const copy = (name) => cpSync(join(root, name), join(temp, name), { recursive: true });
const assertContains = (html, text, label) =>
  assert(html.includes(text), label + ' must contain: ' + text);

try {
  for (const name of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json', 'scripts']) {
    copy(name);
  }
  assert(existsSync(join(root, 'node_modules')), 'Run npm ci before the fixture smoke test');
  symlinkSync(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');

  const dataPath = join(temp, 'src/catalog/data.ts');
  const original = readFileSync(dataPath, 'utf8');
  const empty = 'export const confirmedProducts: readonly ConfirmedCatalogProduct[] = [];';
  assert.equal(original.split(empty).length, 2, 'Fixture injection must match the empty production catalog');

  const products = [
    {
      id: 'ci-fixture-engine',
      slug: 'ci-fixture-engine',
      categoryId: 'turbine-engines',
      copy: {
        en: { name: 'CI fixture turbine', summary: 'Test content not for publication.' },
        ro: { name: 'Turbină de test CI', summary: 'Conținut de test, nepublicabil.' },
      },
      image: {
        src: '/favicon.svg',
        alt: { en: 'CI test graphic', ro: 'Grafic de test CI' },
        width: 32,
        height: 32,
      },
      verification: { sourceReference: 'TEST-FIXTURE-NOT-A-REAL-PRODUCT', confirmedOn: '2020-01-01' },
    },
    {
      id: 'ci-fixture-ecu',
      slug: 'ci-fixture-ecu',
      categoryId: 'ecu-controls',
      copy: {
        en: { name: 'CI fixture control', summary: 'Temporary control record for template testing.' },
        ro: { name: 'Control de test CI', summary: 'Înregistrare temporară pentru verificare.' },
      },
      verification: { sourceReference: 'TEST-FIXTURE-NOT-A-REAL-PRODUCT', confirmedOn: '2020-01-01' },
    },
  ];
  const fixture = 'export const confirmedProducts: readonly ConfirmedCatalogProduct[] = '
    + JSON.stringify(products, null, 2) + ';';
  writeFileSync(dataPath, original.replace(empty, fixture));

  const env = { ...process.env, ASTRO_BASE: '/bodich-preview', SITE_URL: 'https://example.invalid' };
  const run = (command, args) => execFileSync(command, args, { cwd: temp, env, stdio: 'pipe', encoding: 'utf8' });
  console.log(run('npm', ['run', 'check']));
  console.log(run('npm', ['run', 'build']));
  console.log(run('node', ['scripts/validate-catalog.mjs', '--routes', 'dist']));

  const html = (...parts) => readFileSync(join(temp, 'dist', ...parts, 'index.html'), 'utf8');
  const engineEn = html('en', 'products', 'turbine-engines', 'ci-fixture-engine');
  const engineRo = html('ro', 'products', 'turbine-engines', 'ci-fixture-engine');
  const ecuEn = html('en', 'accessories', 'ecu-controls', 'ci-fixture-ecu');
  const ecuRo = html('ro', 'accessories', 'ecu-controls', 'ci-fixture-ecu');
  const engineListing = html('en', 'products', 'turbine-engines');
  const controlListing = html('ro', 'accessories', 'ecu-controls');

  assertContains(engineListing, 'data-product-card="ci-fixture-engine"', 'EN engine category');
  assertContains(engineListing, 'href="/bodich-preview/en/products/turbine-engines/ci-fixture-engine/"', 'EN engine link');
  assertContains(controlListing, 'href="/bodich-preview/ro/accessories/ecu-controls/ci-fixture-ecu/"', 'RO control link');

  assertContains(engineEn, 'data-product-detail="ci-fixture-engine"', 'EN product detail');
  assertContains(engineEn, 'CI fixture turbine', 'EN product detail');
  assertContains(engineEn, 'alt="CI test graphic"', 'EN product photo alt');
  assertContains(engineEn, 'src="/bodich-preview/favicon.svg"', 'EN product photo URL');
  assertContains(engineEn, 'href="/bodich-preview/ro/products/turbine-engines/ci-fixture-engine/"', 'EN language switch');
  assertContains(engineEn, 'href="https://example.invalid/bodich-preview/en/products/turbine-engines/ci-fixture-engine/"', 'EN canonical');
  assertContains(engineRo, 'Turbină de test CI', 'RO product detail');
  assertContains(engineRo, 'alt="Grafic de test CI"', 'RO product photo alt');
  assertContains(engineRo, 'href="/bodich-preview/en/products/turbine-engines/ci-fixture-engine/"', 'RO language switch');
  assertContains(ecuEn, 'data-product-no-image', 'EN no-image fallback');
  assertContains(ecuRo, 'data-product-no-image', 'RO no-image fallback');
  assertContains(ecuRo, 'Control de test CI', 'RO control detail');

  assert(!existsSync(join(root, 'dist/en/products/turbine-engines/ci-fixture-engine')),
    'A temporary fixture must never appear in the regular production build');
  assert.equal(readFileSync(join(root, 'src/catalog/data.ts'), 'utf8'), original,
    'Original catalog data was unexpectedly modified');

  console.log('PASS: isolated EN/RO product cards, detail routes, photo/fallback, and nested-base links.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

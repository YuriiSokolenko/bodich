import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Verify the first-product workflow without publishing invented models.
 * Inject fixtures in a disposable copy only; leave production data/dist intact.
 */
const root = resolve('.');
const temp = mkdtempSync(join(tmpdir(), 'bodich-catalog-fixture-'));
const assertContains = (html, text, label) =>
  assert(html.includes(text), label + ' must contain: ' + text);

try {
  // Copy every git-tracked source/config file, including any future build
  // config, instead of maintaining a fragile allowlist. This excludes
  // .git/, node_modules/, dist/, local .env secrets and untracked artifacts.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString('utf8').split('\0').filter(Boolean);
  assert(tracked.includes('src/catalog/data.ts'), 'Expected catalog data in git-tracked files');
  for (const path of tracked) {
    const destination = join(temp, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, path), destination);
  }
  assert(existsSync(join(root, 'node_modules')), 'Run npm ci before the fixture smoke test');
  symlinkSync(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');

  const dataPath = join(temp, 'src/catalog/data.ts');
  const original = readFileSync(dataPath, 'utf8');
  const startMarker = '// BEGIN CONFIRMED PRODUCTS';
  const endMarker = '// END CONFIRMED PRODUCTS';

  function replaceProductRecords(source, replacement) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker);
    assert(start >= 0 && end > start, 'Catalog record markers are missing or out of order');
    assert.equal(source.indexOf(startMarker, start + startMarker.length), -1, 'Duplicate catalog start marker');
    assert.equal(source.indexOf(endMarker, end + endMarker.length), -1, 'Duplicate catalog end marker');
    const bodyStart = start + startMarker.length;
    // Replace only the marked region, regardless of its original contents.
    // String slices also preserve replacement text containing dollar signs.
    return source.slice(0, bodyStart) + '\n' + replacement + '\n' + source.slice(end);
  }

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
  // The second assertion simulates a previously populated catalog and proves
  // this fixture mechanism will not fail when real products are introduced.
  const simulatedPopulated = replaceProductRecords(original,
    'export const confirmedProducts: readonly ConfirmedCatalogProduct[] = [{ id: "existing-model" }];');
  assert.equal(replaceProductRecords(simulatedPopulated, fixture), replaceProductRecords(original, fixture));
  writeFileSync(dataPath, replaceProductRecords(original, fixture));

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

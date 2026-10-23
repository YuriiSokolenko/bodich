import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { catalogCategories, confirmedProducts } from '../src/catalog/data.ts';
import { locales } from '../src/i18n/index.ts';

// This check runs in Node.js 24, whose native TypeScript type stripping allows
// the same typed source data to be consumed without a second JSON list.
const problems = [];
const fail = (message) => problems.push(message);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const validSlug = (value) => nonempty(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  // Reject impossible dates and future claims (UTC date, independent of runner TZ).
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

function validateImage(image, label, report = fail, publicRoot = resolve('public')) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    report(`Product "${label}" has an invalid image object`);
    return;
  }
  for (const locale of locales) {
    if (!nonempty(image.alt?.[locale])) report(`Product "${label}" requires a non-empty ${locale} image alt`);
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isSafeInteger(image[dimension]) || image[dimension] <= 0) {
      report(`Product "${label}" image ${dimension} must be a positive integer`);
    }
  }

  // Require a local, unambiguous public asset. Reject parent traversal,
  // query/hash fragments, protocol-relative paths and backslashes.
  const src = image.src;
  if (!nonempty(src) || !/^\/images\/catalog\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpe?g)$/.test(src) || src.startsWith('//')
      || /[?#\\]/.test(src) || src.split('/').some((part) => part === '..' || part === '.')) {
    report(`Product "${label}" image.src must be a PNG, JPEG or WebP asset under public/images/catalog/`);
    return;
  }
  const root = resolve(publicRoot);
  const destination = resolve(root, '.' + src);
  const relativeFile = relative(root, destination);
  if (!relativeFile || relativeFile.startsWith('..') || isAbsolute(relativeFile)
      || !existsSync(destination) || !statSync(destination).isFile()) {
    report(`Product "${label}" image.src is not an existing file under public/: ${src}`);
  }
}

const categories = new Set();
for (const category of catalogCategories) {
  if (!validSlug(category.id)) fail(`Category ID "${category.id}" must be a URL-safe slug`);
  if (categories.has(category.id)) fail(`Duplicate category ID: ${category.id}`);
  categories.add(category.id);
  if (!['products', 'accessories'].includes(category.section)) {
    fail(`Category "${category.id}" has an unknown section: ${category.section}`);
  }
  for (const locale of locales) {
    if (!nonempty(category.copy?.[locale]?.title) || !nonempty(category.copy?.[locale]?.description)) {
      fail(`Category "${category.id}" is missing ${locale} title or description`);
    }
  }
}


const mode = process.argv[2];
let intakeCandidate;
if (mode === '--intake') {
  const path = process.argv[3];
  if (!path || process.argv[4]) {
    fail('Usage: npm run catalog:intake -- path/to/verified-product.json');
  } else {
    try {
      intakeCandidate = JSON.parse(readFileSync(resolve(path), 'utf8'));
      if (!intakeCandidate || typeof intakeCandidate !== 'object' || Array.isArray(intakeCandidate)) {
        fail('Intake file must contain a single JSON product object');
        intakeCandidate = undefined;
      }
    } catch (error) {
      fail('Cannot read catalog intake JSON: ' + error.message);
    }
  }
}

const ids = new Set();
const slugs = new Set();
for (const product of [...confirmedProducts, ...(intakeCandidate ? [intakeCandidate] : [])]) {
  const label = nonempty(product.id) ? product.id : '(missing id)';
  if (!nonempty(product.id)) fail('A confirmed product has no ID');
  if (ids.has(product.id)) fail(`Duplicate product ID: ${label}`);
  ids.add(product.id);

  if (!validSlug(product.slug)) fail(`Product "${label}" has an invalid slug`);
  if (slugs.has(product.slug)) fail(`Duplicate product slug: ${product.slug}`);
  slugs.add(product.slug);

  if (!categories.has(product.categoryId)) {
    fail(`Product "${label}" references an unknown category: ${product.categoryId}`);
  }
  if (!nonempty(product.verification?.sourceReference)) {
    fail(`Product "${label}" requires a non-empty verification sourceReference`);
  }
  if (!validIsoDate(product.verification?.confirmedOn)) {
    fail(`Product "${label}" requires a real, non-future ISO date in YYYY-MM-DD format`);
  }
  if (product.image !== undefined) validateImage(product.image, label);
  for (const locale of locales) {
    if (!nonempty(product.copy?.[locale]?.name) || !nonempty(product.copy?.[locale]?.summary)) {
      fail(`Product "${label}" requires a ${locale} name and summary`);
    }
  }
}

if (mode && !['--routes', '--self-test', '--intake'].includes(mode)) fail(`Unknown argument: ${mode}`);

// Regression coverage even while confirmedProducts is intentionally empty.
if (mode === '--self-test') {
  // Disposable test raster; no demo images are copied to production public/.
  const folder = mkdtempSync(join(tmpdir(), 'bodich-photo-validation-'));
  try {
    mkdirSync(join(folder, 'images', 'catalog'), { recursive: true });
    writeFileSync(join(folder, 'images', 'catalog', 'fixture.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9qLGkAAAAASUVORK5CYII=',
      'base64',
    ));
    const valid = { src: '/images/catalog/fixture.png', width: 1, height: 1, alt: { en: 'Test', ro: 'Test' } };
    const scenarios = [
      { name: 'missing photo', image: { ...valid, src: '/images/catalog/does-not-exist.png' } },
      { name: 'concept art path', image: { ...valid, src: '/images/turbines/concept.webp' } },
      { name: 'unsafe path', image: { ...valid, src: '/../README.md' } },
      { name: 'missing EN alt', image: { ...valid, alt: { en: '', ro: 'Test' } } },
      { name: 'missing RO alt', image: { ...valid, alt: { en: 'Test', ro: '' } } },
      { name: 'negative width', image: { ...valid, width: -5 } },
      { name: 'zero height', image: { ...valid, height: 0 } },
      { name: 'fractional width', image: { ...valid, width: 1.5 } },
    ];
    const validErrors = [];
    validateImage(valid, 'self-test', message => validErrors.push(message), folder);
    if (validErrors.length) fail('Validator rejects good photo fixture: ' + validErrors.join('; '));
    for (const scenario of scenarios) {
      const errors = [];
      validateImage(scenario.image, 'self-test', message => errors.push(message), folder);
      if (!errors.length) fail('Validator accepted bad photo fixture: ' + scenario.name);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  for (const date of ['2099-01-01', '2026-02-30', '2026-1-01']) {
    if (validIsoDate(date)) fail('Validator accepted invalid or future date: ' + date);
  }
  if (!validIsoDate('2020-01-01')) fail('Validator rejected valid historical date');
}
if (mode === '--routes') {
  const dist = resolve(process.argv[3] ?? 'dist');
  let categoryPages = 0;
  let productPages = 0;
  for (const locale of locales) {
    for (const category of catalogCategories) {
      const file = join(dist, locale, category.section, category.id, 'index.html');
      if (!existsSync(file)) fail(`Missing catalog route: ${file}`);
      categoryPages++;
    }
    for (const product of confirmedProducts) {
      const category = catalogCategories.find((item) => item.id === product.categoryId);
      if (!category) continue; // Already reported by catalog data validation.
      const file = join(dist, locale, category.section, category.id, product.slug, 'index.html');
      if (!existsSync(file)) fail(`Missing confirmed product route: ${file}`);
      productPages++;
    }
  }
  if (categoryPages !== locales.length * catalogCategories.length
      || productPages !== locales.length * confirmedProducts.length) {
    fail('Generated catalog route counts do not match locales x records');
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`Catalog validation: ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Catalog validation passed: ${catalogCategories.length} categories, ${confirmedProducts.length} confirmed products${mode === '--routes' ? ', all localized routes present' : mode === '--self-test' ? ', regression fixtures passed' : mode === '--intake' ? ', candidate structurally valid; company approval is still required' : ''}.`);
}

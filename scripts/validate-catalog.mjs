import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { inspectRaster, MAX_CATALOG_IMAGE_BYTES } from './catalog-image.mjs';
import { runImageSelfTest } from './catalog-image-test.mjs';
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

const IMAGE_PATH = /^\/images\/catalog\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:webp|png|jpe?g)$/;

function validateImage(image, label, report = fail, publicRoot = resolve('public')) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    report('Product "' + label + '" has an invalid image object');
    return;
  }
  for (const locale of locales) {
    if (!nonempty(image.alt?.[locale]))
      report('Product "' + label + '" requires a non-empty ' + locale + ' image alt');
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isSafeInteger(image[dimension]) || image[dimension] <= 0)
      report('Product "' + label + '" image ' + dimension + ' must be a positive integer');
  }
  const src = image.src;
  if (!nonempty(src) || !IMAGE_PATH.test(src)) {
    report('Product "' + label + '" image.src must use a lowercase PNG/JPEG/WebP path under public/images/catalog/ (no dots in names or repeated slashes)');
    return;
  }
  const root = resolve(publicRoot);
  const destination = resolve(root, '.' + src);
  const relativeFile = relative(root, destination);
  if (!relativeFile || relativeFile.startsWith('..') || isAbsolute(relativeFile)
      || !existsSync(destination) || !lstatSync(destination).isFile()) {
    report('Product "' + label + '" image.src is not an existing regular file under public/: ' + src);
    return;
  }
  const info = lstatSync(destination);
  if (info.size > MAX_CATALOG_IMAGE_BYTES) {
    report('Product "' + label + '" photo exceeds 5 MiB: ' + src);
    return;
  }
  const extension = src.slice(src.lastIndexOf('.') + 1);
  const actual = inspectRaster(readFileSync(destination), extension);
  if (!actual || !actual.width || !actual.height) {
    const reason = extension === 'jpg' || extension === 'jpeg'
      ? 'invalid or malformed JPEG (missing EOI, trailing bytes, truncated segment or inconsistent frame dimensions)'
      : 'invalid or malformed ' + extension.toUpperCase() + ' image';
    report('Product "' + label + '" has an ' + reason + ': ' + src);
  } else {
    if (actual.privateMetadata) {
      const reason = extension === 'jpg' || extension === 'jpeg'
        ? 'EXIF/GPS, text, or non-allowlisted JPEG metadata segments'
        : 'EXIF/GPS or text metadata';
      report('Product "' + label + '" image contains ' + reason + ': ' + src);
    }
    if (actual.width !== image.width || actual.height !== image.height)
      report('Product "' + label + '" dimensions do not match actual ' + actual.width + 'x' + actual.height + ': ' + src);
  }
}

/**
 * Astro copies every public/ asset whether referenced by pages or not.
 * Fail a preview build if any catalog file lacks an approved product record.
 */
function checkUnapprovedFiles(publicRoot, allowedPaths, report = fail) {
  const root = resolve(publicRoot, 'images', 'catalog');
  if (!existsSync(root)) return;
  const visit = (directory, relativePath = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const segment = relativePath ? relativePath + '/' + entry.name : entry.name;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file, segment);
      else if (!entry.isFile()) {
        report('Catalog directory contains an unsafe non-file entry: ' + segment);
      } else {
        const url = '/images/catalog/' + segment;
        if (entry.name.startsWith('.')) {
          report('Remove hidden local file ' + url + ' before running catalog checks (Finder .DS_Store and other dotfiles are copied from public/ by Astro).');
        } else if (!allowedPaths.has(url)) {
          report('Catalog contains unreferenced public photo/file: ' + url);
        }
      }
    }
  };
  visit(root);
}

function checkExtraKeys(object, permitted, path) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return;
  for (const key of Object.keys(object)) {
    if (!permitted.includes(key)) fail('Unknown intake field: ' + path + '.' + key);
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

if (intakeCandidate) {
  checkExtraKeys(intakeCandidate, ['id', 'slug', 'categoryId', 'copy', 'image', 'verification'], 'product');
  checkExtraKeys(intakeCandidate.copy, ['en', 'ro'], 'product.copy');
  for (const locale of locales) {
    checkExtraKeys(intakeCandidate.copy?.[locale], ['name', 'summary'], 'product.copy.' + locale);
  }
  checkExtraKeys(intakeCandidate.verification, ['sourceReference', 'confirmedOn'], 'product.verification');
  if (intakeCandidate.image !== undefined) {
    checkExtraKeys(intakeCandidate.image, ['src', 'alt', 'width', 'height'], 'product.image');
    checkExtraKeys(intakeCandidate.image?.alt, ['en', 'ro'], 'product.image.alt');
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

// Intake allows inspection of an uncommitted candidate photo, but ordinary
// check/build must reject the same file until included in confirmedProducts.
const allowedPhotos = new Set(confirmedProducts.map((product) => product.image?.src).filter(Boolean));
if (mode === '--intake' && intakeCandidate?.image?.src) allowedPhotos.add(intakeCandidate.image.src);
checkUnapprovedFiles(resolve('public'), allowedPhotos);

if (mode && !['--routes', '--self-test', '--intake'].includes(mode)) fail(`Unknown argument: ${mode}`);

// Regression coverage even while confirmedProducts is intentionally empty.
if (mode === '--self-test') runImageSelfTest({ fail, validateImage, checkUnapprovedFiles, validIsoDate });
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

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
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
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

const ids = new Set();
const slugs = new Set();
for (const product of confirmedProducts) {
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
    fail(`Product "${label}" requires a real ISO date in YYYY-MM-DD format`);
  }
  for (const locale of locales) {
    if (!nonempty(product.copy?.[locale]?.name) || !nonempty(product.copy?.[locale]?.summary)) {
      fail(`Product "${label}" requires a ${locale} name and summary`);
    }
  }
}

const mode = process.argv[2];
if (mode && mode !== '--routes') fail(`Unknown argument: ${mode}`);
if (mode === '--routes') {
  const dist = resolve(process.argv[3] ?? 'dist');
  let checked = 0;
  for (const locale of locales) {
    for (const category of catalogCategories) {
      const file = join(dist, locale, category.section, category.id, 'index.html');
      if (!existsSync(file)) fail(`Missing catalog route: ${file}`);
      checked++;
    }
  }
  if (checked !== locales.length * catalogCategories.length) {
    fail('Category route count does not match locales x categories');
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`Catalog validation: ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Catalog validation passed: ${catalogCategories.length} categories, ${confirmedProducts.length} confirmed products${mode === '--routes' ? ', all localized routes present' : ''}.`);
}

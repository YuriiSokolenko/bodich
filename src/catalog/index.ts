import { hrefFor, type Locale } from '../i18n';
import {
  catalogCategories,
  confirmedProducts,
  type CatalogCategoryEntry,
  type CatalogSection,
  type ConfirmedCatalogProduct,
} from './data';

export * from './data';

export function categoriesFor(section: CatalogSection): CatalogCategoryEntry[] {
  return catalogCategories.filter((category) => category.section === section);
}

export function categoryHref(locale: Locale, category: CatalogCategoryEntry): string {
  return hrefFor(locale, category.section, category.id);
}

export function productsInCategory(category: CatalogCategoryEntry): ConfirmedCatalogProduct[] {
  return confirmedProducts.filter((product) => product.categoryId === category.id);
}

/** No product path is generated for an unregistered category. */
export function categoryForProduct(product: ConfirmedCatalogProduct): CatalogCategoryEntry {
  const category = catalogCategories.find((item) => item.id === product.categoryId);
  if (!category) throw new Error(`Unknown category for confirmed product: ${product.id}`);
  return category;
}

export function productHref(locale: Locale, product: ConfirmedCatalogProduct): string {
  const category = categoryForProduct(product);
  return hrefFor(locale, category.section, `${category.id}/${product.slug}`);
}

/** Catalog photographs live under public/ and honor the deployment base. */
export function productImageHref(src: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/+$/, '')}${src}`;
}

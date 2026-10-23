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

import type { Locale } from '../i18n';

export type CatalogSection = 'products' | 'accessories';
export type CategoryCopy = { title: string; description: string };
export type CatalogCategory = {
  id: string;
  section: CatalogSection;
  copy: Record<Locale, CategoryCopy>;
};

/** Provisional site taxonomy, NOT a list of confirmed goods or stock. */
export const catalogCategories = [
  {
    "id": "turbine-engines",
    "section": "products",
    "copy": {
      "en": {
        "title": "Turbine engines",
        "description": "A section for confirmed BODICH turbine models."
      },
      "ro": {
        "title": "Motoare cu turbină",
        "description": "Secțiune pentru modelele de turbine BODICH confirmate."
      }
    }
  },
  {
    "id": "ecu-controls",
    "section": "accessories",
    "copy": {
      "en": {
        "title": "ECU and controls",
        "description": "A planned grouping for turbine control components."
      },
      "ro": {
        "title": "ECU și sisteme de control",
        "description": "O categorie planificată pentru componentele de control ale turbinelor."
      }
    }
  },
  {
    "id": "fuel-systems",
    "section": "accessories",
    "copy": {
      "en": {
        "title": "Fuel systems",
        "description": "A planned grouping for fuel-system accessories."
      },
      "ro": {
        "title": "Sisteme de alimentare",
        "description": "O categorie planificată pentru accesorii ale sistemelor de alimentare cu combustibil."
      }
    }
  },
  {
    "id": "electrical-components",
    "section": "accessories",
    "copy": {
      "en": {
        "title": "Electrical components",
        "description": "A planned grouping for electrical accessories."
      },
      "ro": {
        "title": "Componente electrice",
        "description": "O categorie planificată pentru accesorii electrice."
      }
    }
  },
  {
    "id": "mounting-hardware",
    "section": "accessories",
    "copy": {
      "en": {
        "title": "Mounting hardware",
        "description": "A planned grouping for mounting accessories."
      },
      "ro": {
        "title": "Accesorii de montaj",
        "description": "O categorie planificată pentru componente de montaj."
      }
    }
  }
] as const satisfies readonly CatalogCategory[];
export type CatalogCategoryEntry = (typeof catalogCategories)[number];
export type CatalogCategoryId = CatalogCategoryEntry['id'];

/** Only verified real products may enter the published product collection. */
export interface ConfirmedCatalogProduct {
  id: string;
  slug: string;
  categoryId: CatalogCategoryId;
  copy: Record<Locale, { name: string; summary: string }>;
  image?: {
    src: string;
    alt: Record<Locale, string>;
    width: number;
    height: number;
  };
  verification: { sourceReference: string; confirmedOn: string };
}

// Deliberately empty until company-backed verification. Do not insert demo products.
export const confirmedProducts: readonly ConfirmedCatalogProduct[] = [];

export function categoriesFor(section: CatalogSection): CatalogCategoryEntry[] {
  return catalogCategories.filter((category) => category.section === section);
}

export function categoryHref(locale: Locale, category: CatalogCategoryEntry): string {
  return `/${locale}/${category.section}/${category.id}/`;
}

export function categorySubpath(category: CatalogCategoryEntry): string {
  return `${category.section}/${category.id}`;
}

export function productsInCategory(category: CatalogCategoryEntry): ConfirmedCatalogProduct[] {
  return confirmedProducts.filter((product) => product.categoryId === category.id);
}

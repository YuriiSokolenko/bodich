import type { Locale } from '../i18n';

export type CatalogSection = 'products' | 'accessories';
export type CategoryCopy = { title: string; description: string };
export type CatalogCategory = {
  id: string;
  section: CatalogSection;
  copy: Record<Locale, CategoryCopy>;
};

/**
 * Node 24 imports this file directly for CI via TypeScript type stripping.
 * Keep it data-only: erasable TS types/type-only imports are supported;
 * enums, runtime TS transforms, and imports of Vite/Astro runtime helpers
 * (such as hrefFor using import.meta.env.BASE_URL) are not.
 */
/** Provisional taxonomy; category names do not imply confirmed products or stock. */
export const catalogCategories = [
  {
    id: "turbine-engines",
    section: "products",
    copy: {
      en: {
        title: "Turbine engines",
        description: "A section for confirmed BODICH turbine models."
      },
      ro: {
        title: "Motoare cu turbină",
        description: "Secțiune pentru modelele de turbine BODICH confirmate."
      }
    }
  },
  {
    id: "ecu-controls",
    section: "accessories",
    copy: {
      en: {
        title: "ECU and controls",
        description: "A planned grouping for turbine control components."
      },
      ro: {
        title: "ECU și sisteme de control",
        description: "O categorie planificată pentru componentele de control ale turbinelor."
      }
    }
  },
  {
    id: "fuel-systems",
    section: "accessories",
    copy: {
      en: {
        title: "Fuel systems",
        description: "A planned grouping for fuel-system accessories."
      },
      ro: {
        title: "Sisteme de alimentare",
        description: "O categorie planificată pentru accesorii ale sistemelor de alimentare cu combustibil."
      }
    }
  },
  {
    id: "electrical-components",
    section: "accessories",
    copy: {
      en: {
        title: "Electrical components",
        description: "A planned grouping for electrical accessories."
      },
      ro: {
        title: "Componente electrice",
        description: "O categorie planificată pentru accesorii electrice."
      }
    }
  },
  {
    id: "mounting-hardware",
    section: "accessories",
    copy: {
      en: {
        title: "Mounting hardware",
        description: "A planned grouping for mounting accessories."
      },
      ro: {
        title: "Accesorii de montaj",
        description: "O categorie planificată pentru componente de montaj."
      }
    }
  }
] as const satisfies readonly CatalogCategory[];

export type CatalogCategoryEntry = (typeof catalogCategories)[number];
export type CatalogCategoryId = CatalogCategoryEntry['id'];

/**
 * Keep this collection empty until product information is company-verified.
 * Run npm run check before proposing additions: it validates verification
 * references, dates, unique identifiers, translations and category membership.
 */
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

// BEGIN CONFIRMED PRODUCTS
// Add only company-verified models between these markers. The isolated CI
// fixture swaps this region without depending on whether it is empty.
export const confirmedProducts: readonly ConfirmedCatalogProduct[] = [];
// END CONFIRMED PRODUCTS

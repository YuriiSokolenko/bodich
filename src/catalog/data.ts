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
        description: "An overview of miniature gas-turbine engines. The compressor, combustor and turbine form a connected system; no BODICH model or performance value is verified here."
      },
      ro: {
        title: "Motoare cu turbină",
        description: "Prezentare generală a motoarelor cu turbină cu gaze miniaturale. Compresorul, camera de ardere și turbina funcționează împreună; aici nu sunt confirmate modele sau valori de performanță BODICH."
      }
    }
  },
  {
    id: "ecu-controls",
    section: "accessories",
    copy: {
      en: {
        title: "ECU and controls",
        description: "Electronic control units coordinate sensor signals and operating sequences in turbine systems. This is an educational category, not a confirmed BODICH offering."
      },
      ro: {
        title: "ECU și sisteme de control",
        description: "Unitățile electronice de comandă gestionează semnalele senzorilor și secvențele de funcționare. Categoria este informativă, nu o ofertă BODICH confirmată."
      }
    }
  },
  {
    id: "fuel-systems",
    section: "accessories",
    copy: {
      en: {
        title: "Fuel systems",
        description: "Fuel lines, pumps and filtration are examples of system elements; compatibility and safe handling depend on the specific approved equipment."
      },
      ro: {
        title: "Sisteme de alimentare",
        description: "Conductele, pompele și filtrele sunt exemple de componente; compatibilitatea și manipularea sigură depind de echipamentul concret aprobat."
      }
    }
  },
  {
    id: "electrical-components",
    section: "accessories",
    copy: {
      en: {
        title: "Electrical components",
        description: "Wiring, connectors and power supplies are distinct electrical-system topics. Ratings and compatibility must come from verified model documents."
      },
      ro: {
        title: "Componente electrice",
        description: "Cablajele, conectorii și alimentarea electrică sunt teme distincte. Parametrii și compatibilitatea necesită documentație verificată pentru fiecare model."
      }
    }
  },
  {
    id: "mounting-hardware",
    section: "accessories",
    copy: {
      en: {
        title: "Mounting hardware",
        description: "Mounting interfaces and fasteners are installation considerations; no fitment, load rating or accessory availability is asserted."
      },
      ro: {
        title: "Accesorii de montaj",
        description: "Interfețele de fixare și elementele de prindere țin de instalare; nu sunt declarate compatibilități, sarcini admise sau disponibilități."
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
 * See docs/catalog/README.md for manual evidence and image-rights review.
 */
export interface ConfirmedCatalogProduct {
  id: string;
  slug: string;
  categoryId: CatalogCategoryId;
  copy: Record<Locale, { name: string; summary: string }>;
  image?: {
    /** Concept art must have a visible localized disclosure; photography needs identity evidence. */
    kind: 'original_concept' | 'original_diagram' | 'product_photo';
    rights: 'cleared';
    rightsEvidence: string;
    /** Required only when publishing a genuine photograph of a specific product. */
    identityEvidence?: string;
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

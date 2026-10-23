export const locales = ['en', 'ro'] as const;
export type Locale = (typeof locales)[number];

export const pageKeys = [
  'home',
  'products',
  'accessories',
  'support',
  'about',
  'contact',
] as const;
export type PageKey = (typeof pageKeys)[number];
export type SectionKey = Exclude<PageKey, 'home'>;

export const sectionKeys: SectionKey[] = [
  'products',
  'accessories',
  'support',
  'about',
  'contact',
];

type PageText = {
  label: string;
  title: string;
  description: string;
};
type Translations = {
  navigationLabel: string;
  menuLabel: string;
  languageLabel: string;
  brandDescriptor: string;
  currentLanguageLabel: string;
  switchLanguageLabel: string;
  languageNames: Record<Locale, string>;
  skipContentLabel: string;
  previewLabel: string;
  intro: string;
  heroImageAlt: string;
  conceptRenderingLabel: string;
  conceptPreviewTitle: string;
  conceptPreviewIntro: string;
  conceptTurbineTitle: string;
  conceptTurbineAlt: string;
  conceptTurbineDescription: string;
  conceptIntakeTitle: string;
  conceptIntakeAlt: string;
  conceptIntakeDescription: string;
  conceptNotice: string;
  placeholder: string;
  browseProducts: string;
  backHome: string;
  footerNote: string;
  footerIntro: string;
  footerExploreTitle: string;
  footerCompanyTitle: string;
  footerNavigationSuffix: string;
  catalogCategoriesTitle: string;
  catalogCategoriesIntro: string;
  catalogExploreCategory: string;
  catalogPlanningNotice: string;
  catalogBreadcrumbLabel: string;
  catalogEmptyCategory: string;
  catalogVerifiedModelsTitle: string;
  pages: Record<PageKey, PageText>;
};

export const translations: Record<Locale, Translations> = {
  en: {
    navigationLabel: 'Main navigation',
    menuLabel: 'Menu',
    languageLabel: 'Language',
    brandDescriptor: 'Turbine engines',
    currentLanguageLabel: 'Current language',
    switchLanguageLabel: 'Switch language to',
    languageNames: { en: 'English', ro: 'Romanian' },
    skipContentLabel: 'Skip to content',
    previewLabel: 'Website preview',
    intro: 'A new BODICH website is taking shape.',
    heroImageAlt: 'BODICH-branded miniature jet turbine with a red intake, dark metal housing and a bronze-blue heat-tinted exhaust nozzle against a charcoal background.',
    conceptRenderingLabel: 'Concept rendering',
    conceptPreviewTitle: 'Turbine design concepts',
    conceptPreviewIntro: 'Explore the visual direction for BODICH turbines. These are concept images, not listings of confirmed products.',
    conceptTurbineTitle: 'Turbine overview',
    conceptTurbineAlt: 'BODICH-branded miniature jet turbine concept with a red intake and dark metal housing.',
    conceptTurbineDescription: 'A full-engine concept view showing the housing, inlet and heat-tinted exhaust.',
    conceptIntakeTitle: 'Intake detail',
    conceptIntakeAlt: 'Close-up of a conceptual BODICH turbine intake with red housing, protective grille and central cone.',
    conceptIntakeDescription: 'An enlarged design detail of the inlet grille, spinner and fittings.',
    conceptNotice: 'Models, technical specifications and availability will be shown only after they are verified.',
    placeholder: 'Content for this section is being prepared. Product specifications and company contact details will be published when confirmed.',
    browseProducts: 'Explore products',
    backHome: 'Back to home',
    footerNote: 'Website in preparation. No online purchases are available yet.',
    footerIntro: 'The bilingual BODICH product catalog is in development. Models and technical details will be published when confirmed.',
    footerExploreTitle: 'Explore',
    footerCompanyTitle: 'Company',
    footerNavigationSuffix: 'footer navigation',
    catalogCategoriesTitle: 'Catalog categories',
    catalogCategoriesIntro: 'Browse the planned catalog structure. Individual products will be listed only after BODICH confirms them.',
    catalogExploreCategory: 'Explore category',
    catalogPlanningNotice: 'Category names describe the proposed catalog structure, not confirmed stock or available products.',
    catalogBreadcrumbLabel: 'Breadcrumb',
    catalogEmptyCategory: 'No confirmed models have been published in this category yet.',
    catalogVerifiedModelsTitle: 'Confirmed models',
    pages: {
      home: {
        label: 'Home',
        title: 'BODICH — engineered to inspire.',
        description: 'The official BODICH website is in preparation.',
      },
      products: {
        label: 'Products',
        title: 'Turbine products',
        description: 'Explore the future BODICH product catalog.',
      },
      accessories: {
        label: 'Accessories',
        title: 'Accessories',
        description: 'Discover accessories for turbine systems.',
      },
      support: {
        label: 'Support',
        title: 'Technical support',
        description: 'Support resources and documentation for BODICH.',
      },
      about: {
        label: 'About Us',
        title: 'About BODICH',
        description: 'Learn about the BODICH brand.',
      },
      contact: {
        label: 'Contact',
        title: 'Get in touch',
        description: 'BODICH contact information will be available soon.',
      },
    },
  },
  ro: {
    navigationLabel: 'Navigare principală',
    menuLabel: 'Meniu',
    languageLabel: 'Limbă',
    brandDescriptor: 'Motoare cu turbină',
    currentLanguageLabel: 'Limba curentă',
    switchLanguageLabel: 'Schimbă limba în',
    languageNames: { en: 'engleză', ro: 'română' },
    skipContentLabel: 'Sari la conținut',
    previewLabel: 'Previzualizarea site-ului',
    intro: 'Noul site BODICH este în curs de pregătire.',
    heroImageAlt: 'Motor turboreactor miniatural marca BODICH, cu admisie roșie, corp metalic închis la culoare și duză de evacuare cu reflexii de bronz și albastru, pe fundal gri închis.',
    conceptRenderingLabel: 'Vizualizare conceptuală',
    conceptPreviewTitle: 'Concepte vizuale de turbine',
    conceptPreviewIntro: 'Descoperă direcția vizuală a turbinelor BODICH. Imaginile sunt conceptuale și nu reprezintă produse confirmate.',
    conceptTurbineTitle: 'Prezentare generală a turbinei',
    conceptTurbineAlt: 'Concept de turbină cu reacție miniaturală BODICH, cu admisie roșie și carcasă metalică închisă la culoare.',
    conceptTurbineDescription: 'O reprezentare conceptuală a motorului, cu carcasă, admisie și duză cu nuanțe termice.',
    conceptIntakeTitle: 'Detaliu al admisiei',
    conceptIntakeAlt: 'Detaliu al admisiei unei turbine BODICH conceptuale, cu carcasă roșie, grilaj de protecție și con central.',
    conceptIntakeDescription: 'Detaliu vizual al grilajului de admisie, al conului central și al racordurilor.',
    conceptNotice: 'Modelele, specificațiile tehnice și disponibilitatea vor fi prezentate numai după verificare.',
    placeholder: 'Conținutul acestei secțiuni este în curs de pregătire. Specificațiile produselor și datele de contact ale companiei vor fi publicate după confirmare.',
    browseProducts: 'Explorează produsele',
    backHome: 'Înapoi la pagina principală',
    footerNote: 'Site în pregătire. Cumpărăturile online nu sunt încă disponibile.',
    footerIntro: 'Catalogul bilingv de produse BODICH este în pregătire. Modelele și detaliile tehnice vor fi publicate după confirmare.',
    footerExploreTitle: 'Explorează',
    footerCompanyTitle: 'Companie',
    footerNavigationSuffix: 'navigare în subsol',
    catalogCategoriesTitle: 'Categorii de catalog',
    catalogCategoriesIntro: 'Explorează structura planificată a catalogului. Produsele vor fi listate numai după confirmarea lor de către BODICH.',
    catalogExploreCategory: 'Explorează categoria',
    catalogPlanningNotice: 'Denumirile categoriilor descriu structura propusă a catalogului, nu stocuri sau produse disponibile confirmate.',
    catalogBreadcrumbLabel: 'Navigare ierarhică',
    catalogEmptyCategory: 'Nu au fost publicate încă modele confirmate în această categorie.',
    catalogVerifiedModelsTitle: 'Modele confirmate',
    pages: {
      home: {
        label: 'Acasă',
        title: 'BODICH — inginerie care inspiră.',
        description: 'Site-ul oficial BODICH este în pregătire.',
      },
      products: {
        label: 'Produse',
        title: 'Produse cu turbine',
        description: 'Descoperă viitorul catalog de produse BODICH.',
      },
      accessories: {
        label: 'Accesorii',
        title: 'Accesorii',
        description: 'Descoperă accesorii pentru sistemele cu turbine.',
      },
      support: {
        label: 'Asistență',
        title: 'Asistență tehnică',
        description: 'Resurse de asistență și documentație BODICH.',
      },
      about: {
        label: 'Despre noi',
        title: 'Despre BODICH',
        description: 'Descoperă brandul BODICH.',
      },
      contact: {
        label: 'Contact',
        title: 'Contactează-ne',
        description: 'Datele de contact BODICH vor fi disponibile în curând.',
      },
    },
  },
};

/**
 * Single source of truth for locale-aware routes, including nested catalog
 * pages and an optional Astro base path.
 */
export function hrefFor(locale: Locale, page: PageKey, subpath?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const parts: string[] = [locale, ...(page === 'home' ? [] : [page])];
  if (subpath) parts.push(subpath.replace(/^\/+|\/+$/g, ''));
  return `${base}/${parts.join('/')}/`;
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'ro' : 'en';
}

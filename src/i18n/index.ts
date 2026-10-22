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
  placeholder: string;
  browseProducts: string;
  backHome: string;
  footerNote: string;
  footerIntro: string;
  footerExploreTitle: string;
  footerCompanyTitle: string;
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
    placeholder: 'Content for this section is being prepared. Product specifications and company contact details will be published when confirmed.',
    browseProducts: 'Explore products',
    backHome: 'Back to home',
    footerNote: 'Website in preparation. No online purchases are available yet.',
    footerIntro: 'A bilingual turbine catalog in development. Models and technical details will be published when confirmed.',
    footerExploreTitle: 'Explore',
    footerCompanyTitle: 'Company',
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
    placeholder: 'Conținutul acestei secțiuni este în curs de pregătire. Specificațiile produselor și datele de contact ale companiei vor fi publicate după confirmare.',
    browseProducts: 'Explorează produsele',
    backHome: 'Înapoi la pagina principală',
    footerNote: 'Site în pregătire. Cumpărăturile online nu sunt încă disponibile.',
    footerIntro: 'Catalog bilingv de turbine în pregătire. Modelele și detaliile tehnice vor fi publicate după confirmare.',
    footerExploreTitle: 'Explorează',
    footerCompanyTitle: 'Companie',
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

export function hrefFor(locale: Locale, page: PageKey): string {
  return page === 'home' ? `/${locale}/` : `/${locale}/${page}/`;
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'ro' : 'en';
}

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
  mediaWithheldNotice: string;
  conceptPreviewTitle: string;
  conceptPreviewIntro: string;
  conceptTurbineTitle: string;
  conceptTurbineAlt: string;
  conceptTurbineDescription: string;
  conceptIntakeTitle: string;
  conceptIntakeAlt: string;
  conceptIntakeDescription: string;
  conceptNotice: string;
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
  catalogImageUnavailable: string;
  catalogIllustrativeImageNotice: string;
  catalogViewModel: string;
  catalogProductDescriptionTitle: string;
  catalogUnconfirmedDetailsNotice: string;
  catalogBackToCategory: string;
  homeExploreTitle: string;
  homeExploreIntro: string;
  homeFeatures: Record<'products' | 'accessories' | 'support', { title: string; description: string; action: string }>;
  catalogLandingEmptyTitle: string;
  catalogLandingEmptyDescription: string;
  categoryPlannedLabel: string;
  sectionContent: Record<'support' | 'about' | 'contact', {
    lead: string;
    items: { title: string; description: string; link?: SectionKey; linkLabel?: string }[];
    status: string;
  }>;
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
    intro: 'Explore how miniature turbines work and browse a bilingual BODICH website preview. No products are offered for sale.',
    heroImageAlt: 'BODICH-branded miniature jet turbine with a red intake, dark metal housing and a bronze-blue heat-tinted exhaust nozzle against a charcoal background.',
    conceptRenderingLabel: 'AI-generated BODICH presentation visual — beta',
    mediaWithheldNotice: 'Concept image withheld — publication rights have not been verified.',
    conceptPreviewTitle: 'Turbine design concepts',
    conceptPreviewIntro: 'AI-generated turbine concept images appear only in designated presentation previews. They do not confirm product identity, specifications or availability.',
    conceptTurbineTitle: 'Turbine overview',
    conceptTurbineAlt: 'BODICH-branded miniature jet turbine concept with a red intake and dark metal housing.',
    conceptTurbineDescription: 'A full-engine concept view showing the housing, inlet and heat-tinted exhaust.',
    conceptIntakeTitle: 'Intake detail',
    conceptIntakeAlt: 'Close-up of a conceptual BODICH turbine intake with red housing, protective grille and central cone.',
    conceptIntakeDescription: 'An enlarged design detail of the inlet grille, spinner and fittings.',
    conceptNotice: 'Models, technical specifications and availability will be shown only after they are verified.',
    browseProducts: 'Explore products',
    backHome: 'Back to home',
    footerNote: 'Website in preparation. No online purchases are available yet.',
    footerIntro: 'The bilingual BODICH product catalog is in development. Models and technical details will be published when confirmed.',
    footerExploreTitle: 'Explore',
    footerCompanyTitle: 'Company',
    footerNavigationSuffix: 'footer navigation',
    catalogCategoriesTitle: 'Catalog categories',
    catalogCategoriesIntro: 'Browse the catalog categories below. Only products confirmed for publication appear as listings.',
    catalogExploreCategory: 'Explore category',
    catalogPlanningNotice: 'Category names describe the proposed catalog structure, not confirmed stock or available products.',
    catalogBreadcrumbLabel: 'Breadcrumb',
    catalogEmptyCategory: 'No confirmed models have been published in this category yet.',
    catalogVerifiedModelsTitle: 'Confirmed models',
    catalogImageUnavailable: 'Product photograph not yet available',
    catalogIllustrativeImageNotice: 'Illustrative visualization — not an actual product photograph',
    catalogViewModel: 'View model',
    catalogProductDescriptionTitle: 'Model overview',
    catalogUnconfirmedDetailsNotice: 'Additional technical details and prices are not published until confirmed.',
    catalogBackToCategory: 'Back to category',
    homeExploreTitle: 'Explore the BODICH preview',
    homeExploreIntro: 'Discover the proposed site structure. Concept images appear only in designated presentation previews; online sales are unavailable.',
    homeFeatures: {
      products: {
        title: 'Turbine concepts',
        description: 'Explore the proposed turbine category. AI-generated concept images are available only in designated presentation previews.',
        action: 'Explore turbines',
      },
      accessories: {
        title: 'Accessory categories',
        description: 'Browse planned groups for control, fuel, electrical and mounting components.',
        action: 'Browse categories',
      },
      support: {
        title: 'Support information',
        description: 'Learn which resources and contact options are still awaiting confirmation.',
        action: 'View support status',
      },
    },
    catalogLandingEmptyTitle: 'No confirmed products published yet',
    catalogLandingEmptyDescription: 'This section has no confirmed product listings yet. The category links below describe planned navigation, not current stock or purchasing options.',
    categoryPlannedLabel: 'Planned category',
    sectionContent: {
      support: {
        lead: 'Find out what technical resources are planned and which information is not yet available in this presentation beta.',
        items: [
          { title: 'Documentation', description: 'Installation guides, operating manuals and safety documents will appear only after their accuracy and publication rights are confirmed.' },
          { title: 'Product information', description: 'The catalog currently contains navigation categories, not confirmed turbine models or technical specifications.', link: 'products', linkLabel: 'View catalog structure' },
          { title: 'Support channels', description: 'No official service desk, warranty terms or service response time has been confirmed for publication.', link: 'contact', linkLabel: 'See contact status' },
        ],
        status: 'No live support service or document download is provided by this beta.',
      },
      about: {
        lead: 'BODICH is presented here through a bilingual website concept. The preview is not a statement of verified company history, manufacturing capability or product availability.',
        items: [
          { title: 'What this site demonstrates', description: 'A bilingual structure for exploring turbine-related product categories, brand presentation and future resources.' },
          { title: 'How visuals are used', description: 'AI-generated turbine concepts, when displayed in an authorized presentation preview, are illustrations rather than product photographs.' },
          { title: 'Verification before publication', description: 'Model identity, specifications, corporate claims and image usage must be verified independently before release.', link: 'products', linkLabel: 'Explore proposed categories' },
        ],
        status: 'Legal entity details, addresses and manufacturing claims have not been published because they remain unconfirmed.',
      },
      contact: {
        lead: 'Official BODICH contact details have not yet been confirmed for this preview.',
        items: [
          { title: 'Official contact details', description: 'A validated business email address, telephone number and postal address have not been supplied for publication.' },
          { title: 'No message collection', description: 'This is a static presentation site. It does not accept messages, collect form submissions or create support tickets.' },
          { title: 'Where to explore', description: 'You can still browse the proposed catalog structure and the current documentation status.', link: 'support', linkLabel: 'Read support information' },
        ],
        status: 'No inquiry submission, order placement or service request is possible on this beta site.',
      },
    },
    pages: {
      home: {
        label: 'Home',
        title: 'Miniature turbine learning and site preview',
        description: 'Explore introductory turbine information and the English-language BODICH website preview. Product models, imagery and offers are not verified.',
      },
      products: {
        label: 'Products',
        title: 'Turbine categories',
        description: 'Understand miniature turbine categories and browse a planned catalog layout. No product models are approved for publication.',
      },
      accessories: {
        label: 'Accessories',
        title: 'Accessories',
        description: 'Learn how turbine-control, fuel, electrical and mounting components are grouped. These are educational categories, not available stock.',
      },
      support: {
        label: 'Support',
        title: 'Technical support',
        description: 'Read introductory turbine questions and learn which documentation or BODICH support channels still await independent verification.',
      },
      about: {
        label: 'About Us',
        title: 'About BODICH',
        description: 'Understand the editorial scope of this bilingual BODICH preview and what evidence is required before factual company claims can be published.',
      },
      contact: {
        label: 'Contact',
        title: 'Get in touch',
        description: 'Find out which official BODICH contact and inquiry channels have not yet been verified. No messages or orders are accepted.',
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
    intro: 'Descoperă principiile turbinelor miniaturale și structura bilingvă a prezentării BODICH. Nu există produse disponibile pentru vânzare.',
    heroImageAlt: 'Motor turboreactor miniatural marca BODICH, cu admisie roșie, corp metalic închis la culoare și duză de evacuare cu reflexii de bronz și albastru, pe fundal gri închis.',
    conceptRenderingLabel: 'Vizual BODICH generat cu IA pentru prezentare — versiune beta',
    mediaWithheldNotice: 'Imagine conceptuală neafișată — drepturile de publicare nu au fost verificate.',
    conceptPreviewTitle: 'Concepte vizuale de turbine',
    conceptPreviewIntro: 'Imaginile conceptuale de turbine generate cu IA apar doar în versiunile de prezentare desemnate. Acestea nu confirmă identitatea, specificațiile sau disponibilitatea produselor.',
    conceptTurbineTitle: 'Prezentare generală a turbinei',
    conceptTurbineAlt: 'Concept de turbină cu reacție miniaturală BODICH, cu admisie roșie și carcasă metalică închisă la culoare.',
    conceptTurbineDescription: 'O reprezentare conceptuală a motorului, cu carcasă, admisie și duză cu nuanțe termice.',
    conceptIntakeTitle: 'Detaliu al admisiei',
    conceptIntakeAlt: 'Detaliu al admisiei unei turbine BODICH conceptuale, cu carcasă roșie, grilaj de protecție și con central.',
    conceptIntakeDescription: 'Detaliu vizual al grilajului de admisie, al conului central și al racordurilor.',
    conceptNotice: 'Modelele, specificațiile tehnice și disponibilitatea vor fi prezentate numai după verificare.',
    browseProducts: 'Explorează produsele',
    backHome: 'Înapoi la pagina principală',
    footerNote: 'Site în pregătire. Cumpărăturile online nu sunt încă disponibile.',
    footerIntro: 'Catalogul bilingv de produse BODICH este în pregătire. Modelele și detaliile tehnice vor fi publicate după confirmare.',
    footerExploreTitle: 'Explorează',
    footerCompanyTitle: 'Companie',
    footerNavigationSuffix: 'navigare în subsol',
    catalogCategoriesTitle: 'Categorii de catalog',
    catalogCategoriesIntro: 'Explorează categoriile de catalog de mai jos. Numai produsele confirmate pentru publicare apar în liste.',
    catalogExploreCategory: 'Explorează categoria',
    catalogPlanningNotice: 'Denumirile categoriilor descriu structura propusă a catalogului, nu stocuri sau produse disponibile confirmate.',
    catalogBreadcrumbLabel: 'Navigare ierarhică',
    catalogEmptyCategory: 'Nu au fost publicate încă modele confirmate în această categorie.',
    catalogVerifiedModelsTitle: 'Modele confirmate',
    catalogImageUnavailable: 'Fotografia produsului nu este încă disponibilă',
    catalogIllustrativeImageNotice: 'Vizualizare ilustrativă — nu este fotografia produsului real',
    catalogViewModel: 'Vezi modelul',
    catalogProductDescriptionTitle: 'Prezentarea modelului',
    catalogUnconfirmedDetailsNotice: 'Detaliile tehnice suplimentare și prețurile nu sunt publicate înainte de confirmare.',
    catalogBackToCategory: 'Înapoi la categorie',
    homeExploreTitle: 'Explorează prezentarea BODICH',
    homeExploreIntro: 'Descoperă structura propusă a site-ului. Imaginile conceptuale apar doar în versiunile de prezentare desemnate; cumpărăturile online nu sunt disponibile.',
    homeFeatures: {
      products: {
        title: 'Concepte de turbine',
        description: 'Explorează categoria propusă de turbine. Imaginile conceptuale generate cu IA apar doar în versiunile de prezentare desemnate.',
        action: 'Explorează turbinele',
      },
      accessories: {
        title: 'Categorii de accesorii',
        description: 'Explorează grupele planificate pentru sisteme de control, alimentare, componente electrice și montaj.',
        action: 'Vezi categoriile',
      },
      support: {
        title: 'Informații de asistență',
        description: 'Află ce resurse și modalități de contact așteaptă încă o confirmare.',
        action: 'Vezi stadiul asistenței',
      },
    },
    catalogLandingEmptyTitle: 'Nu există încă produse confirmate publicate',
    catalogLandingEmptyDescription: 'Această secțiune nu conține încă produse confirmate. Linkurile către categorii descriu navigarea planificată, nu stocuri sau opțiuni de cumpărare.',
    categoryPlannedLabel: 'Categorie planificată',
    sectionContent: {
      support: {
        lead: 'Află ce resurse tehnice sunt planificate și ce informații nu sunt încă disponibile în această versiune beta de prezentare.',
        items: [
          { title: 'Documentație', description: 'Ghidurile de instalare, manualele de utilizare și documentele de siguranță vor fi publicate numai după confirmarea corectitudinii și a drepturilor de publicare.' },
          { title: 'Informații despre produse', description: 'Catalogul conține momentan categorii de navigare, nu modele sau specificații tehnice confirmate.', link: 'products', linkLabel: 'Vezi structura catalogului' },
          { title: 'Canale de asistență', description: 'Nu au fost confirmate pentru publicare un serviciu oficial de asistență, condiții de garanție sau timpi de răspuns.', link: 'contact', linkLabel: 'Vezi stadiul datelor de contact' },
        ],
        status: 'Această versiune beta nu oferă asistență activă sau descărcarea documentelor.',
      },
      about: {
        lead: 'BODICH este prezentat aici printr-un concept de site bilingv. Previzualizarea nu confirmă istoricul firmei, capacitatea de producție sau disponibilitatea produselor.',
        items: [
          { title: 'Ce prezintă acest site', description: 'O structură bilingvă pentru explorarea categoriilor de produse asociate turbinelor, a imaginii de brand și a resurselor viitoare.' },
          { title: 'Cum sunt folosite imaginile', description: 'Imaginile conceptuale de turbine generate cu IA, atunci când sunt afișate în versiunile de prezentare autorizate, sunt ilustrații, nu fotografii de produse.' },
          { title: 'Verificare înainte de publicare', description: 'Identitatea modelelor, specificațiile, afirmațiile despre companie și drepturile asupra imaginilor trebuie verificate separat.', link: 'products', linkLabel: 'Explorează categoriile propuse' },
        ],
        status: 'Datele juridice, adresele și afirmațiile despre producție nu sunt publicate deoarece nu au fost confirmate.',
      },
      contact: {
        lead: 'Datele oficiale de contact BODICH nu au fost încă confirmate pentru această previzualizare.',
        items: [
          { title: 'Date oficiale de contact', description: 'Nu au fost furnizate pentru publicare o adresă de e-mail profesională, un număr de telefon și o adresă poștală validate.' },
          { title: 'Fără colectare de mesaje', description: 'Acesta este un site static de prezentare. Nu preia mesaje, formulare completate sau solicitări de asistență.' },
          { title: 'Ce poți explora', description: 'Poți explora structura propusă a catalogului și stadiul actual al documentației.', link: 'support', linkLabel: 'Citește informațiile de asistență' },
        ],
        status: 'În această versiune beta nu se pot trimite solicitări, plasa comenzi sau cere servicii.',
      },
    },
    pages: {
      home: {
        label: 'Acasă',
        title: 'Ghid de turbine miniaturale și prezentarea site-ului',
        description: 'Explorează informații introductive despre turbine și versiunea română a site-ului BODICH. Modelele și ofertele nu sunt confirmate.',
      },
      products: {
        label: 'Produse',
        title: 'Categorii de turbine',
        description: 'Află informații generale despre turbine miniaturale și explorează structura propusă a catalogului, fără modele aprobate pentru publicare.',
      },
      accessories: {
        label: 'Accesorii',
        title: 'Accesorii',
        description: 'Descoperă grupele de comandă, alimentare, componente electrice și montaj. Aceste categorii sunt informative, nu stocuri disponibile.',
      },
      support: {
        label: 'Asistență',
        title: 'Asistență tehnică',
        description: 'Citește răspunsuri introductive despre turbine și află ce documente sau canale BODICH de asistență așteaptă verificarea.',
      },
      about: {
        label: 'Despre noi',
        title: 'Despre BODICH',
        description: 'Află scopul editorial al acestei prezentări bilingve BODICH și ce dovezi sunt necesare înainte de publicarea afirmațiilor despre companie.',
      },
      contact: {
        label: 'Contact',
        title: 'Contactează-ne',
        description: 'Află ce canale oficiale de contact BODICH rămân neverificate. Site-ul nu primește mesaje sau comenzi.',
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

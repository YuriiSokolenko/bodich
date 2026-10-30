/**
 * Build-time-only QA view. Research source files are NEVER imported by the website.
 * The Docker QA builder replaces a checked-in empty fixture with audited data
 * after the ordinary release-safe checks have already passed.
 */
import fixture from './catalog-data.json';

export type QaLocale = 'en' | 'ro';
export type QaDraft = {
  sourceId: string;
  slug: string;
  copy: Record<QaLocale, { name: string; summary: string; description: string }>;
  specs: { kind: string; metric?: string; scope?: string; value: number; unit: string; verifiedOn: string }[];
  source: { url: string; sections: string[]; status: string };
};
const data = fixture as unknown as { records: QaDraft[] };
export const qaFull = import.meta.env.BODICH_MEDIA_PROFILE === 'qa_full';
export const qaDrafts: QaDraft[] = qaFull ? data.records : [];
export const qaSections = ['g5', 'g4', 'tp', 'accessories', 'oil', 'batteries', 'warranty'] as const;
export type QaSection = (typeof qaSections)[number];
export const sectionCopy: Record<QaSection, { en: string; ro: string }> = {
  g5: { en: 'G5 turbines', ro: 'Turbine G5' },
  g4: { en: 'G4+ turbines', ro: 'Turbine G4+' },
  tp: { en: 'Turboprops', ro: 'Turbopropulsoare' },
  accessories: { en: 'Accessories', ro: 'Accesorii' },
  oil: { en: 'Engine oil', ro: 'Ulei pentru motoare' },
  batteries: { en: 'Batteries', ro: 'Baterii' },
  warranty: { en: 'External service references', ro: 'Referințe de servicii externe' },
};
export function qaSection(draft: QaDraft): QaSection {
  const section = qaSections.find((item) => draft.source.sections.includes(item));
  if (!section) throw new Error('Unsupported QA section: ' + draft.sourceId);
  return section;
}
export function qaHref(locale: string, slug?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return base + '/' + locale + '/qa/' + (slug ? encodeURIComponent(slug) + '/' : '');
}
/** One generic, non-model-specific AI concept in the isolated full-content QA catalog. */
export function qaImage(): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return base + '/images/turbines/bodich-card-concept-01.webp';
}
export function qaImageSrcset(): string {
  const stem = qaImage().replace(/\.webp$/, '');
  return stem + '-360.webp 360w, ' + stem + '-600.webp 600w';
}
export const qaImageDisclosure: Record<QaLocale, string> = {
  en: 'AI-generated illustrative concept art; not an exact model photograph.',
  ro: 'Imagine conceptuală ilustrativă generată cu IA; nu este o fotografie a modelului exact.',
};
export function qaImageAlt(locale: QaLocale): string {
  return locale === 'ro'
    ? 'Concept BODICH de turbină generat cu IA; nu este o fotografie a modelului exact'
    : 'AI-generated BODICH turbine concept art; not an exact model photograph';
}
if (qaFull) {
  if (qaDrafts.length !== 132 || new Set(qaDrafts.map((item) => item.slug)).size !== 132) throw new Error('QA draft manifest parity failed');
  for (const draft of qaDrafts) {
    for (const locale of ['en', 'ro'] as const) {
      if (!draft.copy[locale]?.name || !draft.copy[locale]?.description) {
        throw new Error('Missing QA translation: ' + draft.sourceId + ' ' + locale);
      }
    }
    qaSection(draft);
  }
}

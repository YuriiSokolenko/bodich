/**
 * Build-time-only supplier research for the isolated qa_full Docker profile.
 * This is NOT the verified BODICH product catalog.
 */
import inventory from '../../docs/catalog/source-inventory.json';
import overrides from '../../docs/catalog/reference-overrides.json';
import artwork from '../../docs/catalog/art-manifest.json';
import {
  buildReferenceDrafts,
  primaryReferenceSection,
  type ReferenceDraft,
  type ReferenceOverrides,
  type SourceInventory,
} from '../catalog/reference';

export const qaFull = import.meta.env.BODICH_MEDIA_PROFILE === 'qa_full';
export const qaDrafts: ReferenceDraft[] = qaFull
  ? buildReferenceDrafts(inventory as unknown as SourceInventory, overrides as unknown as ReferenceOverrides)
  : [];

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
export function qaSection(draft: ReferenceDraft): QaSection {
  const section = primaryReferenceSection(draft.source.sections);
  if (!section || section === 'gift-card') throw new Error('Unsupported QA section: ' + draft.sourceId);
  return section;
}
export function qaHref(locale: string, slug?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return base + '/' + locale + '/qa/' + (slug ? encodeURIComponent(slug) + '/' : '');
}
export function qaImage(sourceId: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return base + '/qa-art/' + sourceId + '.webp';
}
export function qaImageAlt(sourceId: string, locale: 'en' | 'ro'): string {
  const entry = artwork.entries.find((item) => item.sourceId === sourceId);
  if (!entry) throw new Error('Missing QA art entry: ' + sourceId);
  return entry.alt[locale];
}
if (qaFull) {
  if (qaDrafts.length !== 132 || new Set(qaDrafts.map((item) => item.slug)).size !== 132 ||
      artwork.entries.length !== qaDrafts.length) throw new Error('QA draft/art manifest parity failed');
  for (const draft of qaDrafts) {
    for (const locale of ['en', 'ro'] as const) {
      if (!draft.copy[locale]?.name || !draft.copy[locale]?.description) {
        throw new Error('Missing QA translation: ' + draft.sourceId + ' ' + locale);
      }
    }
    qaSection(draft);
  }
}

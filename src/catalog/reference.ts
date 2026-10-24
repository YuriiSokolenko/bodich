/**
 * PRIVATE-TO-THE-WEBSITE reference catalog schema.
 *
 * This module is deliberately NOT re-exported by src/catalog/index.ts, and must
 * never be imported by public Astro pages. Research items are not BODICH stock.
 * Pass the checked-in source inventory plus editorial overrides at build/check
 * time; only confirmedProducts in data.ts can generate public product routes.
 */
import type { Locale } from '../i18n';

export const referenceTaxonomy = {
  g5: { category: 'g5', itemType: 'turbojet' },
  g4: { category: 'g4-plus', itemType: 'turbojet' },
  tp: { category: 'turboprop', itemType: 'turboprop' },
  accessories: { category: 'turbine-accessories', itemType: 'accessory' },
  oil: { category: 'engine-oil', itemType: 'oil' },
  batteries: { category: 'batteries', itemType: 'battery' },
  warranty: { category: 'warranty-service', itemType: 'service' },
  'gift-card': { category: 'digital-gift-card', itemType: 'digital' },
} as const;

export type ReferenceSection = keyof typeof referenceTaxonomy;
export type ReferenceCategory = (typeof referenceTaxonomy)[ReferenceSection]['category'];
export type ReferenceItemType = (typeof referenceTaxonomy)[ReferenceSection]['itemType'];
export type ReferenceApproval = 'research' | 'draft' | 'editorial_review' | 'company_approved';
export type SourceStatus = 'unknown' | 'discontinued' | 'industrial_only' | 'out_of_stock' | 'archived_or_missing';
export type ReferenceCopy = { name: string; summary: string; description: string };
export type ReferenceImage = {
  /** Keep art OUTSIDE public/ until separately approved for actual publication. */
  path: string;
  kind: 'original_concept' | 'original_diagram' | 'product_photo';
  rights: 'pending' | 'cleared' | 'rejected';
  alt: Record<Locale, string>;
  width: number;
  height: number;
};
export const permittedSpecUnits = {
  thrust: ['N', 'kgf'],
  speed: ['rpm'],
  temperature: ['°C'],
  fuel_consumption: ['L/h', 'mL/min'],
  mass: ['g', 'kg'],
  dimension: ['mm', 'cm'],
  voltage: ['V'],
  capacity: ['mAh', 'Ah'],
  volume: ['mL', 'L'],
  power: ['W', 'kW'],
} as const;
export type SpecKind = keyof typeof permittedSpecUnits;
export type ReferenceSpec = {
  kind: SpecKind;
  value: number;
  unit: string;
  /** Provenance must be per specification, not just per product. */
  sourceUrl: string;
  verifiedOn: string;
};

export type SourceInventoryProduct = {
  id: string;
  sourceTitle: string | null;
  sourceCategoryIds: string[];
  canonicalUrl: string;
  manufacturer: string | null;
  sourceStatus: SourceStatus;
  capturedAt: string;
  evidenceUrls: string[];
};
export type SourceInventory = { products: SourceInventoryProduct[] };
export type ReferenceOverride = {
  sourceId: string;
  slug?: string;
  model?: string | null;
  copy?: Record<Locale, ReferenceCopy | null>;
  specs?: ReferenceSpec[];
  images?: ReferenceImage[];
  approval?: ReferenceApproval;
};
export type ReferenceOverrides = {
  schemaVersion: 1;
  records: ReferenceOverride[];
};
export type ReferenceDraft = {
  sourceId: string;
  slug: string;
  itemType: ReferenceItemType;
  categoryId: ReferenceCategory;
  collectionTags: readonly string[];
  model: string | null;
  copy: Record<Locale, ReferenceCopy | null>;
  specs: ReferenceSpec[];
  images: ReferenceImage[];
  approval: ReferenceApproval;
  source: {
    title: string | null;
    url: string;
    sections: readonly string[];
    manufacturer: string | null;
    status: SourceStatus;
    capturedAt: string;
    evidenceUrls: readonly string[];
  };
};

const primarySections: readonly ReferenceSection[] = [
  'g5', 'g4', 'tp', 'oil', 'batteries', 'accessories', 'warranty', 'gift-card',
];
const isKnownSection = (value: string): value is ReferenceSection => Object.hasOwn(referenceTaxonomy, value);

/** Discounted is a collection tag, never a second SKU or a standalone item type. */
export function primaryReferenceSection(sections: readonly string[]): ReferenceSection | null {
  const matches = primarySections.filter((section) => sections.includes(section));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Derive exactly one unpublished record per source ID. All 132 known records
 * exist without hand-copying supplier text, prices, imagery or availability.
 * Per-SKU original copy and images are added via a small, reviewable overlay.
 */
export function buildReferenceDrafts(inventory: SourceInventory, overrides: ReferenceOverrides): ReferenceDraft[] {
  const edits = new Map(overrides.records.map((record) => [record.sourceId, record]));
  return inventory.products.map((product) => {
    const section = primaryReferenceSection(product.sourceCategoryIds);
    if (!section) throw new Error('Unknown/ambiguous reference taxonomy: ' + product.id);
    const taxonomy = referenceTaxonomy[section];
    const edit = edits.get(product.id);
    return {
      sourceId: product.id,
      slug: edit?.slug ?? 'reference-' + product.id.toLowerCase(),
      itemType: taxonomy.itemType,
      categoryId: taxonomy.category,
      collectionTags: product.sourceCategoryIds.includes('discounted') ? ['discounted'] : [],
      model: edit?.model ?? null,
      copy: edit?.copy ?? { en: null, ro: null },
      specs: edit?.specs ?? [],
      images: edit?.images ?? [],
      approval: edit?.approval ?? 'research',
      source: {
        title: product.sourceTitle, url: product.canonicalUrl,
        sections: [...product.sourceCategoryIds], manufacturer: product.manufacturer,
        status: product.sourceStatus, capturedAt: product.capturedAt,
        evidenceUrls: [...product.evidenceUrls],
      },
    };
  });
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const draftAssetPattern = /^docs\/catalog\/draft-assets\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:webp|png|jpe?g)$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function validVerificationDate(value: unknown): value is string {
  if (typeof value !== 'string' || !isoDate.test(value)) return false;
  const actual = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(actual.getTime()) &&
    actual.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}
function validEvidenceUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) &&
      !parsed.username && !parsed.password;
  } catch { return false; }
}
const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const keysOnly = (obj: object, names: readonly string[]) => Object.keys(obj).every((key) => names.includes(key));
const locales = ['en', 'ro'] as const;

/**
 * Report all validation errors for already-derived drafts.
 * buildReferenceDrafts throws immediately for an unclassifiable source row.
 */
export function validateReferenceDrafts(
  inventory: SourceInventory,
  overrides: ReferenceOverrides,
  drafts: readonly ReferenceDraft[],
): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  if (overrides?.schemaVersion !== 1 || !Array.isArray(overrides?.records))
    return ['Reference overrides must be schemaVersion 1 with records array'];
  if (!Array.isArray(inventory?.products)) return ['Source inventory has no products'];
  const sourceIds = new Set(inventory.products.map((p) => p.id));
  if (sourceIds.size !== inventory.products.length) fail('Source inventory has duplicate IDs');
  const edited = new Set<string>();
  for (const edit of overrides.records) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) { fail('Invalid editorial record'); continue; }
    if (!keysOnly(edit, ['sourceId', 'slug', 'model', 'copy', 'specs', 'images', 'approval']))
      fail('Unknown editorial field for ' + edit.sourceId);
    if (!sourceIds.has(edit.sourceId)) fail('Editorial record references unknown source: ' + edit.sourceId);
    if (edited.has(edit.sourceId)) fail('Duplicate editorial override: ' + edit.sourceId);
    edited.add(edit.sourceId);
    if (edit.slug !== undefined && !slugPattern.test(edit.slug)) fail('Invalid editorial slug: ' + edit.sourceId);
    if (edit.model !== undefined && edit.model !== null && !nonempty(edit.model)) fail('Invalid model: ' + edit.sourceId);
    if (edit.approval !== undefined && !['research', 'draft', 'editorial_review', 'company_approved'].includes(edit.approval))
      fail('Unknown approval state: ' + edit.sourceId);
    if (edit.copy !== undefined && (!edit.copy || typeof edit.copy !== 'object' ||
        Array.isArray(edit.copy) || !keysOnly(edit.copy, locales) ||
        !locales.every((locale) => Object.hasOwn(edit.copy!, locale)))) fail('EN/RO copy objects required: ' + edit.sourceId);
    if (edit.specs !== undefined && !Array.isArray(edit.specs)) fail('Specifications must be an array: ' + edit.sourceId);
    if (edit.images !== undefined && !Array.isArray(edit.images)) fail('Images must be an array: ' + edit.sourceId);
  }
  if (drafts.length !== inventory.products.length) fail('Draft/reference coverage lost source rows');
  const ids = new Set<string>(), slugs = new Set<string>();
  for (const draft of drafts) {
    if (ids.has(draft.sourceId)) fail('Duplicate reference source ID: ' + draft.sourceId);
    ids.add(draft.sourceId);
    if (!sourceIds.has(draft.sourceId)) fail('Unknown reference source ID: ' + draft.sourceId);
    if (!slugPattern.test(draft.slug) || slugs.has(draft.slug)) fail('Invalid/duplicate draft slug: ' + draft.slug);
    slugs.add(draft.slug);
    const section = primaryReferenceSection(draft.source.sections);
    if (!section || !isKnownSection(section) || referenceTaxonomy[section].itemType !== draft.itemType ||
        referenceTaxonomy[section].category !== draft.categoryId) fail('Mismatched item type or category: ' + draft.sourceId);
    if (draft.source.sections.some((s) => s !== 'discounted' && !isKnownSection(s)))
      fail('Unknown reference section: ' + draft.sourceId);
    if (draft.collectionTags.includes('discounted') !== draft.source.sections.includes('discounted'))
      fail('Incorrect discount tag: ' + draft.sourceId);
    if (!['research', 'draft', 'editorial_review', 'company_approved'].includes(draft.approval))
      fail('Invalid approval state: ' + draft.sourceId);
    if (!draft.copy || !locales.every((locale) => {
      const text = draft.copy[locale];
      return text === null || (typeof text === 'object' && !Array.isArray(text) &&
        keysOnly(text, ['name', 'summary', 'description']) &&
        nonempty(text.name) && nonempty(text.summary) && nonempty(text.description));
    })) fail('Invalid EN/RO copy: ' + draft.sourceId);
    if (draft.approval === 'company_approved' && !locales.every((locale) => draft.copy?.[locale] !== null))
      fail('Approved draft lacks complete EN/RO copy: ' + draft.sourceId);
    if (!Array.isArray(draft.specs)) { fail('Invalid specs: ' + draft.sourceId); continue; }
    for (const spec of draft.specs) {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
          !keysOnly(spec, ['kind', 'value', 'unit', 'sourceUrl', 'verifiedOn']) ||
          !Object.hasOwn(permittedSpecUnits, spec.kind) ||
          !(permittedSpecUnits[spec.kind as SpecKind] as readonly string[] | undefined)?.includes(spec.unit) ||
          !Number.isFinite(spec.value) || spec.value <= 0 ||
          !validEvidenceUrl(spec.sourceUrl) ||
          !validVerificationDate(spec.verifiedOn)) fail('Invalid specification/unit/provenance: ' + draft.sourceId);
    }
    if (!Array.isArray(draft.images)) { fail('Invalid images: ' + draft.sourceId); continue; }
    for (const img of draft.images) {
      if (!img || typeof img !== 'object' || Array.isArray(img) ||
          !keysOnly(img, ['path', 'kind', 'rights', 'alt', 'width', 'height']) ||
          !draftAssetPattern.test(img.path) ||
          !img.path.startsWith('docs/catalog/draft-assets/' + draft.sourceId.toLowerCase() + '/') ||
          !['original_concept', 'original_diagram', 'product_photo'].includes(img.kind) ||
          !['pending', 'cleared', 'rejected'].includes(img.rights) ||
          !Number.isSafeInteger(img.width) || img.width <= 0 ||
          !Number.isSafeInteger(img.height) || img.height <= 0 ||
          !img.alt || !locales.every((locale) => nonempty(img.alt[locale]))) fail('Unsafe/unlocalized draft asset: ' + draft.sourceId);
      if (draft.approval === 'company_approved' && img?.rights !== 'cleared')
        fail('Uncleared image in approved draft: ' + draft.sourceId);
    }
  }
  if (ids.size !== sourceIds.size || [...sourceIds].some((id) => !ids.has(id)))
    fail('Reference drafts do not cover all source IDs exactly once');
  return errors;
}

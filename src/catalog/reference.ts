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
  fuel_consumption: ['g/min', 'L/h', 'mL/min'],
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
  /** Axes for dimensions and turbine-versus-propeller shaft speeds. */
  metric?: 'diameter' | 'length' | 'turbine' | 'propeller';
  value: number;
  unit: string;
  /** Mass scope prevents misleading comparisons of engine-only and equipped assemblies. */
  scope?: 'bare_engine' | 'assembly_with_integrated_hardware' | 'not_stated';
  /** Provenance must be per specification, not just per product. */
  sourceUrl: string;
  verifiedOn: string;
};

/** TP-only provenance and propeller/fuel recommendations: never jet thrust defaults. */
export type ReferenceTurbopropDetails = {
  sourceUrl: string;
  verifiedOn: string;
  propellers: { blades: number; diameterInches: number; pitchInches: number }[];
  fuelTypes: ('diesel' | 'jet_a1' | 'kerosene')[];
  pumpModel?: string;
  includedComponents?: string[];
  gearboxRatio?: number;
};

/** Unpublished grouping: no public product category or route is created. */
export const referenceAccessoryGroups = [
  'ecu-controls', 'electrical-components', 'fuel-systems',
  'mounting-hardware', 'turbine-protection', 'maintenance-parts',
] as const;
export type ReferenceAccessoryGroup = (typeof referenceAccessoryGroups)[number];
/**
 * Extract one COMPLETE source-title model qualifier (not verified fitment).
 * Model-family shorthand is preserved verbatim; do not expand e.g. K30/45G.
 * A bare numeric code such as 45/70 is a variant hint, not fitment evidence.
 * This deliberately excludes fluid words such as "Fuel" and "Propane".
 */
export function accessoryTitleQualifier(title: string | null): string | null {
  if (!title) return null;
  const qualifier = title.match(/\b(?:K\d{2,3}(?:\/\d{2,3})*(?:TP)?(?:\s*G(?:\d\+?(?:\/G\d\+?)*)?)?(?:\s+and\s+G\d\+?)?|G\d\+?(?:\/G\d\+?)*|E\/F Model|E Model|KT Pump)/i);
  return qualifier?.[0] ?? null;
}

/**
 * Source-title labels are NOT tested fitments. Never expand a title's K/G
 * shorthand into a normalized model list without detailed manufacturer proof.
 */
export type ReferenceAccessoryDetails = {
  groupId: ReferenceAccessoryGroup;
  sourceUrl: string;
  sourceSubcategoryUrls: string[];
  variantLabel: string | null;
  compatibility: {
    status: 'unverified' | 'source_title_only';
    sourceLabel: string | null;
    /** Intentionally empty until original-source technical fitment review. */
    confirmedModels: string[];
  };
  /** Corresponding BODICH-original proposed artwork direction in documentation. */
  artBriefId: ReferenceAccessoryGroup;
};
/** Source-labeled volumes: no unsourced US/imperial or fluid-ounce conversion. */
export type ReferenceOilDetails = {
  sourceUrl: string;
  verifiedOn: string;
  volume: { value: number; unit: 'gallon' | 'oz'; sourceLabel: string };
  /** Number of containers; null until a source confirms the pack configuration. */
  packQuantity: number | null;
  intendedUse: 'turbine_engine_oil';
  blend: 'special_blend' | 'red_dyed_special_blend';
  sourceNotes: string[];
  artBriefId: string;
};
/** LIFE wording does not by itself prove cell count, connector or engine fitment. */
export type ReferenceBatteryDetails = {
  sourceUrl: string;
  verifiedOn: string;
  /** Preserve the manufacturer's exact chemistry wording: LIFE is not a verified 3S/LiFePO₄ specification. */
  chemistry: { sourceLabel: 'LIFE' };
  cellCount: number | null;
  voltage: { value: number; unit: 'V' };
  capacity: { value: number; unit: 'mAh' };
  connector: string | null;
  compatibleApplications: string[];
  sourceNotes: string[];
  artBriefId: string;
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
  subcategoryUrls: string[];
};
export type SourceInventory = { products: SourceInventoryProduct[] };
export type ReferenceOverride = {
  sourceId: string;
  slug?: string;
  model?: string | null;
  copy?: Record<Locale, ReferenceCopy | null>;
  specs?: ReferenceSpec[];
  turboprop?: ReferenceTurbopropDetails;
  accessory?: ReferenceAccessoryDetails;
  oil?: ReferenceOilDetails;
  battery?: ReferenceBatteryDetails;
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
  turboprop: ReferenceTurbopropDetails | null;
  accessory: ReferenceAccessoryDetails | null;
  oil: ReferenceOilDetails | null;
  battery: ReferenceBatteryDetails | null;
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
      turboprop: edit?.turboprop ?? null,
      accessory: edit?.accessory ?? null,
      oil: edit?.oil ?? null,
      battery: edit?.battery ?? null,
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
    if (!keysOnly(edit, ['sourceId', 'slug', 'model', 'copy', 'specs', 'turboprop', 'accessory', 'oil', 'battery', 'images', 'approval']))
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
    if (edit.turboprop !== undefined && (!edit.turboprop || typeof edit.turboprop !== 'object' || Array.isArray(edit.turboprop)))
      fail('Invalid turboprop metadata: ' + edit.sourceId);
    if (edit.accessory !== undefined && (!edit.accessory || typeof edit.accessory !== 'object' ||
        Array.isArray(edit.accessory))) fail('Invalid accessory metadata: ' + edit.sourceId);
    if (edit.oil !== undefined && (!edit.oil || typeof edit.oil !== 'object' || Array.isArray(edit.oil)))
      fail('Invalid oil metadata: ' + edit.sourceId);
    if (edit.battery !== undefined && (!edit.battery || typeof edit.battery !== 'object' || Array.isArray(edit.battery)))
      fail('Invalid battery metadata: ' + edit.sourceId);
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
          !keysOnly(spec, ['kind', 'metric', 'scope', 'value', 'unit', 'sourceUrl', 'verifiedOn']) ||
          (spec.kind === 'mass'
            ? (spec.scope !== undefined && !['bare_engine', 'assembly_with_integrated_hardware', 'not_stated'].includes(spec.scope))
            : spec.scope !== undefined) ||
          (spec.kind === 'dimension'
            ? !['diameter', 'length'].includes(spec.metric as string)
            : spec.kind === 'speed'
              ? (draft.itemType === 'turboprop'
                  ? !['turbine', 'propeller'].includes(spec.metric as string)
                  : spec.metric !== undefined)
              : spec.metric !== undefined) ||
          !Object.hasOwn(permittedSpecUnits, spec.kind) ||
          !(permittedSpecUnits[spec.kind as SpecKind] as readonly string[] | undefined)?.includes(spec.unit) ||
          !Number.isFinite(spec.value) || spec.value <= 0 ||
          !validEvidenceUrl(spec.sourceUrl) ||
          !validVerificationDate(spec.verifiedOn)) fail('Invalid specification/unit/provenance: ' + draft.sourceId);
    }
    const tp = draft.turboprop;
    if (draft.itemType !== 'turboprop' && tp !== null)
      fail('Non-TP record contains turboprop metadata: ' + draft.sourceId);
    if (tp !== null) {
      const source = inventory.products.find((p) => p.id === draft.sourceId);
      if (draft.itemType !== 'turboprop' || !tp || typeof tp !== 'object' || Array.isArray(tp) ||
          !keysOnly(tp, ['sourceUrl', 'verifiedOn', 'propellers', 'fuelTypes', 'pumpModel', 'includedComponents', 'gearboxRatio']) ||
          !source || tp.sourceUrl !== source.canonicalUrl || !validEvidenceUrl(tp.sourceUrl) ||
          !validVerificationDate(tp.verifiedOn) ||
          !Array.isArray(tp.propellers) || tp.propellers.length < 1 ||
          tp.propellers.some((p) => !p || typeof p !== 'object' || Array.isArray(p) ||
            !keysOnly(p, ['blades', 'diameterInches', 'pitchInches']) ||
            !Number.isSafeInteger(p.blades) || p.blades <= 0 ||
            !Number.isFinite(p.diameterInches) || p.diameterInches <= 0 ||
            !Number.isFinite(p.pitchInches) || p.pitchInches <= 0) ||
          new Set(tp.propellers.map((p) => JSON.stringify(p))).size !== tp.propellers.length ||
          !Array.isArray(tp.fuelTypes) || tp.fuelTypes.length === 0 ||
          tp.fuelTypes.some((fuel) => !['diesel', 'jet_a1', 'kerosene'].includes(fuel)) ||
          new Set(tp.fuelTypes).size !== tp.fuelTypes.length ||
          (tp.pumpModel !== undefined && !nonempty(tp.pumpModel)) ||
          (tp.includedComponents !== undefined && (!Array.isArray(tp.includedComponents) ||
            tp.includedComponents.length === 0 || !tp.includedComponents.every(nonempty))) ||
          (tp.gearboxRatio !== undefined && (!Number.isFinite(tp.gearboxRatio) || tp.gearboxRatio <= 0)))
        fail('Invalid or unsourced TP metadata: ' + draft.sourceId);
    }
    const accessory = draft.accessory;
    if (draft.itemType !== 'accessory' && accessory !== null)
      fail('Non-accessory record contains accessory metadata: ' + draft.sourceId);
    if (accessory !== null) {
      const source = inventory.products.find((p) => p.id === draft.sourceId);
      const compatibility = accessory?.compatibility;
      if (draft.itemType !== 'accessory' || !accessory || typeof accessory !== 'object' ||
          Array.isArray(accessory) ||
          !keysOnly(accessory, ['groupId', 'sourceUrl', 'sourceSubcategoryUrls',
            'variantLabel', 'compatibility', 'artBriefId']) ||
          !referenceAccessoryGroups.includes(accessory.groupId) ||
          accessory.artBriefId !== accessory.groupId ||
          !source || accessory.sourceUrl !== source.canonicalUrl ||
          !Array.isArray(accessory.sourceSubcategoryUrls) ||
          accessory.sourceSubcategoryUrls.length !== source.subcategoryUrls.length ||
          accessory.sourceSubcategoryUrls.some((url, i) => url !== source.subcategoryUrls[i]) ||
          !(accessory.variantLabel === null ||
            (nonempty(accessory.variantLabel) && !!source.sourceTitle &&
              source.sourceTitle.includes(accessory.variantLabel) &&
              !/^(fuel|propane|oil|valve|pump|cable|motor)$/i.test(accessory.variantLabel))) ||
          (compatibility?.sourceLabel !== accessoryTitleQualifier(source.sourceTitle)) ||
          !compatibility || typeof compatibility !== 'object' || Array.isArray(compatibility) ||
          !keysOnly(compatibility, ['status', 'sourceLabel', 'confirmedModels']) ||
          !['unverified', 'source_title_only'].includes(compatibility.status) ||
          !Array.isArray(compatibility.confirmedModels) || compatibility.confirmedModels.length !== 0 ||
          (compatibility.status === 'unverified' && compatibility.sourceLabel !== null) ||
          (compatibility.status === 'source_title_only' &&
            (!nonempty(compatibility.sourceLabel) || !source.sourceTitle ||
              compatibility.sourceLabel !== accessoryTitleQualifier(source.sourceTitle))))
        fail('Invalid/unsourced accessory metadata: ' + draft.sourceId);
    }
    const sourceProduct = inventory.products.find((p) => p.id === draft.sourceId);
    if (draft.itemType !== 'oil' && draft.oil !== null)
      fail('Non-oil reference contains oil metadata: ' + draft.sourceId);
    if (draft.itemType !== 'battery' && draft.battery !== null)
      fail('Non-battery reference contains battery metadata: ' + draft.sourceId);
    if (draft.oil !== null) {
      const detail = draft.oil;
      const volumeTitle = sourceProduct?.sourceTitle?.match(/,\s*(\d+)\s*(Gallons?|oz)$/i);
      const correctUnit = volumeTitle?.[2].toLowerCase().startsWith('gallon') ? 'gallon' : 'oz';
      if (draft.itemType !== 'oil' || !sourceProduct || !detail || typeof detail !== 'object' ||
          Array.isArray(detail) ||
          !keysOnly(detail, ['sourceUrl', 'verifiedOn', 'volume', 'packQuantity', 'intendedUse', 'blend', 'sourceNotes', 'artBriefId']) ||
          detail.sourceUrl !== sourceProduct.canonicalUrl || !validEvidenceUrl(detail.sourceUrl) ||
          !validVerificationDate(detail.verifiedOn) ||
          !detail.volume || typeof detail.volume !== 'object' || Array.isArray(detail.volume) ||
          !keysOnly(detail.volume, ['value', 'unit', 'sourceLabel']) ||
          !volumeTitle || detail.volume.value !== Number(volumeTitle[1]) ||
          detail.volume.unit !== correctUnit ||
          detail.volume.sourceLabel !== volumeTitle[0].slice(1).trim() ||
          !(detail.packQuantity === null ||
            (Number.isSafeInteger(detail.packQuantity) && detail.packQuantity > 0)) ||
          detail.intendedUse !== 'turbine_engine_oil' ||
          detail.blend !== (sourceProduct.sourceTitle?.includes('Red Dyed') ? 'red_dyed_special_blend' : 'special_blend') ||
          !Array.isArray(detail.sourceNotes) || !detail.sourceNotes.every(nonempty) ||
          detail.artBriefId !== draft.sourceId)
        fail('Invalid/unsourced oil metadata: ' + draft.sourceId);
    }
    if (draft.battery !== null) {
      const detail = draft.battery;
      const batteryTitle = sourceProduct?.sourceTitle?.match(/^(\d+)mAh-(\d+(?:\.\d+)?)V LIFE Battery$/i);
      if (draft.itemType !== 'battery' || !sourceProduct || !detail || typeof detail !== 'object' ||
          Array.isArray(detail) ||
          !keysOnly(detail, ['sourceUrl', 'verifiedOn', 'chemistry', 'cellCount', 'voltage', 'capacity', 'connector', 'compatibleApplications', 'sourceNotes', 'artBriefId']) ||
          detail.sourceUrl !== sourceProduct.canonicalUrl || !validEvidenceUrl(detail.sourceUrl) ||
          !validVerificationDate(detail.verifiedOn) || !batteryTitle ||
          !detail.chemistry || typeof detail.chemistry !== 'object' ||
          Array.isArray(detail.chemistry) ||
          !keysOnly(detail.chemistry, ['sourceLabel']) ||
          detail.chemistry.sourceLabel !== 'LIFE' ||
          !(detail.cellCount === null ||
            (Number.isSafeInteger(detail.cellCount) && detail.cellCount > 0)) ||
          !(detail.connector === null || nonempty(detail.connector)) ||
          !detail.voltage || typeof detail.voltage !== 'object' || Array.isArray(detail.voltage) ||
          !keysOnly(detail.voltage, ['value', 'unit']) ||
          detail.voltage.value !== Number(batteryTitle[2]) || detail.voltage.unit !== 'V' ||
          !detail.capacity || typeof detail.capacity !== 'object' || Array.isArray(detail.capacity) ||
          !keysOnly(detail.capacity, ['value', 'unit']) ||
          detail.capacity.value !== Number(batteryTitle[1]) || detail.capacity.unit !== 'mAh' ||
          !Array.isArray(detail.compatibleApplications) ||
          !detail.compatibleApplications.every(nonempty) ||
          new Set(detail.compatibleApplications).size !== detail.compatibleApplications.length ||
          !Array.isArray(detail.sourceNotes) || !detail.sourceNotes.every(nonempty) ||
          detail.artBriefId !== draft.sourceId ||
          draft.specs.length !== 2 ||
          !['voltage', 'capacity'].every((kind) => draft.specs.filter((spec) =>
            spec.kind === kind && spec.unit === (kind === 'voltage' ? 'V' : 'mAh') &&
            spec.value === (kind === 'voltage' ? detail.voltage.value : detail.capacity.value) &&
            spec.sourceUrl === sourceProduct.canonicalUrl).length === 1))
        fail('Invalid/unsourced battery metadata: ' + draft.sourceId);
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

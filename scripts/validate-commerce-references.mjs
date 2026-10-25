#!/usr/bin/env node
/**
 * Offline issue #32 guard: discount is a relation, warranty is a service,
 * and the Square gift card is an external-only digital reference.
 * No supplier offers or service terms are published by BODICH.
 */
import { readFileSync } from 'node:fs';
import { confirmedProducts } from '../src/catalog/data.ts';
import {
  buildReferenceDrafts, discountedReferenceDrafts,
  externalReferenceServices, validateReferenceDrafts,
} from '../src/catalog/reference.ts';

const source = JSON.parse(readFileSync('docs/catalog/source-inventory.json', 'utf8'));
const overrides = JSON.parse(readFileSync('docs/catalog/reference-overrides.json', 'utf8'));
const WARRANTY_ID = 'kt-100';
const WARRANTY_URL = 'https://www.kingtechturbines.com/product/warranty-transfer/100';
const HOME_URL = 'https://www.kingtechturbines.com/';
const GIFT_CHECKOUT = 'https://app.squareup.com/gift/CA5XP82NMZYB7/order';
const PROMO_URL = 'https://www.kingtechturbines.com/shop/promotional-items/9';
const MISSING_BATTERY_URL = 'https://www.kingtechturbines.com/product/850mah-9-9v-life-battery/27';
const engineSections = ['g5', 'g4', 'tp'];
const primarySections = [...engineSections, 'oil', 'batteries', 'accessories', 'warranty'];
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const nonempty = (s) => typeof s === 'string' && s.trim().length >= 25;
const isLocaleCopy = (copy, locale) =>
  copy && ['name', 'summary', 'description'].every((field) => nonempty(copy[locale]?.[field]));
const hasForbiddenCommerceFields = (object) =>
  ['price', 'currency', 'discountPrice', 'checkoutUrl', 'buyUrl', 'couponCode',
    'giftCode', 'warrantyMonths', 'validUntil', 'shippingPromise', 'returnPolicy',
    'fulfillmentPromise'].some((field) => own(object, field));

function commerceProblems(inventory, drafts, externals = externalReferenceServices, published = confirmedProducts) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const byId = new Map(drafts.map((d) => [d.sourceId, d]));
  const sourceIds = new Set(inventory.products.map((p) => p.id));
  const discountSource = inventory.products.filter((p) => p.sourceCategoryIds.includes('discounted'));
  const discounted = discountedReferenceDrafts(drafts);
  if (sourceIds.size !== inventory.products.length || byId.size !== drafts.length ||
      drafts.length !== inventory.products.length)
    fail('Duplicate or missing source identities in reference drafts');
  if (discounted.length !== discountSource.length ||
      new Set(discounted.map((d) => d.sourceId)).size !== discounted.length)
    fail('Discount collection does not match source cross-listings');
  for (const p of inventory.products) {
    const primaries = p.sourceCategoryIds.filter((s) => primarySections.includes(s));
    if (primaries.length !== 1)
      fail('Product without exactly one primary section: ' + p.id);
    if (p.sourceCategoryIds.some((s) => !primarySections.includes(s) && s !== 'discounted'))
      fail('Unknown or out-of-scope source category: ' + p.id);
    const draft = byId.get(p.id);
    if (!draft) { fail('Missing reference source: ' + p.id); continue; }
    if (draft.source.url !== p.canonicalUrl ||
        draft.source.status !== p.sourceStatus ||
        draft.source.title !== p.sourceTitle ||
        draft.source.manufacturer !== p.manufacturer)
      fail('Source provenance or historical status was rewritten: ' + p.id);
    if (p.sourceCategoryIds.includes('discounted')) {
      if (!primaries.some((s) => engineSections.includes(s)) ||
          !['turbojet', 'turboprop'].includes(draft.itemType) ||
          !discounted.includes(draft))
        fail('Discount listing creates an invalid or duplicate engine: ' + p.id);
    }
  }
  const discountSection = inventory.sections.find((s) => s.id === 'discounted');
  if (!discountSection || discountSection.discoveredCount !== discountSource.length ||
      discountSection.crossListedCount !== discountSource.length)
    fail('Discounted source section does not reconcile to existing engines');
  if (drafts.some((d) => d.categoryId === 'discounted' || d.itemType === 'discounted'))
    fail('Discounts cannot become a standalone SKU category');

  const warrantySources = inventory.products.filter((p) => p.sourceCategoryIds.includes('warranty'));
  const warrantySection = inventory.sections.find((s) => s.id === 'warranty');
  const w = byId.get(WARRANTY_ID);
  const metadata = w?.warranty;
  if (!warrantySection || warrantySection.discoveredCount !== 1 ||
      warrantySources.length !== 1 || warrantySources[0].id !== WARRANTY_ID ||
      !w || w.itemType !== 'service' || w.categoryId !== 'warranty-service' ||
      w.source.url !== WARRANTY_URL || w.source.title !== 'Warranty Transfer' ||
      w.source.manufacturer !== null || w.source.sections.join(',') !== 'warranty')
    fail('Warranty Transfer must stay one KingTech service, not a turbine');
  if (!metadata || metadata.kind !== 'warranty_transfer' ||
      metadata.sourceUrl !== WARRANTY_URL || metadata.sourceBrand !== 'KingTech Turbines' ||
      metadata.offerStatus !== 'reference_only' || metadata.legalApproval !== 'pending' ||
      metadata.reviewedOn !== '2026-10-25')
    fail('Warranty source-brand/legal reference metadata is missing or changed');
  if (w && (w.approval !== 'draft' || w.images.length || w.specs.length ||
      w.model !== null || w.oil !== null || w.battery !== null ||
      w.accessory !== null || w.turboprop !== null ||
      hasForbiddenCommerceFields(w) || hasForbiddenCommerceFields(metadata || {})))
    fail('Warranty reference was accidentally made commercial or physical');
  if (w && (!isLocaleCopy(w.copy, 'en') || !isLocaleCopy(w.copy, 'ro') ||
      !w.copy.en.description.includes('BODICH makes no') ||
      !w.copy.ro.description.includes('BODICH nu') ||
      !w.copy.en.description.includes('legal approval') ||
      !w.copy.ro.description.includes('aprob') ||
      !w.copy.en.name.includes('reference only') ||
      !w.copy.ro.name.includes('doar referință')))
    fail('Warranty EN/RO information-only disclaimer or copy missing');

  const giftSection = inventory.sections.find((s) => s.id === 'gift-card');
  const giftExclusion = inventory.exclusions.find((e) => e.sectionId === 'gift-card');
  const gift = externals.find((e) => e.sourceSection === 'gift-card');
  if (!giftSection || giftSection.discoveredCount !== 0 ||
      giftSection.status !== 'external_service_documented' ||
      giftSection.externalDestinationUrl !== GIFT_CHECKOUT ||
      inventory.products.some((p) => p.sourceCategoryIds.includes('gift-card')) ||
      !giftExclusion || giftExclusion.externalDestinationUrl !== GIFT_CHECKOUT ||
      giftExclusion.evidenceUrl !== HOME_URL)
    fail('Gift Card is an external checkout exception, never a store SKU');
  if (externals.length !== 1 || !gift ||
      gift.referenceId !== 'kingtech-gift-card-external' ||
      gift.itemType !== 'digital' || gift.sourceBrand !== 'KingTech Turbines' ||
      gift.sourceUrl !== HOME_URL || gift.approval !== 'draft' ||
      gift.offerStatus !== 'reference_only' || gift.legalApproval !== 'pending' ||
      hasForbiddenCommerceFields(gift) ||
      Object.values(gift).some((value) => value === GIFT_CHECKOUT) ||
      sourceIds.has(gift.referenceId))
    fail('Digital gift-card reference must be separate and legally unapproved');
  if (gift && (!isLocaleCopy(gift.copy, 'en') || !isLocaleCopy(gift.copy, 'ro') ||
      !gift.copy.en.name.includes('reference only') ||
      !gift.copy.ro.name.includes('doar referință') ||
      !gift.copy.en.description.includes('BODICH offers no') ||
      !gift.copy.ro.description.includes('BODICH nu') ||
      !gift.copy.en.description.includes('legal approval') ||
      !gift.copy.ro.description.includes('aprob')))
    fail('Gift Card EN/RO information-only text is incomplete');
  if (published.some((p) => p.id === WARRANTY_ID || p.slug === w?.slug ||
      p.id === gift?.referenceId || p.slug === gift?.referenceId))
    fail('Service or digital reference leaked into confirmed public products');

  // Source exception ledger: promotional items are outside nine requested
  // sections; the known missing battery page remains excluded, not a SKU.
  for (const [sectionId, url] of [
    ['promotional-items', PROMO_URL], ['batteries', MISSING_BATTERY_URL],
  ]) {
    if (!inventory.exclusions.some((entry) =>
      entry.sectionId === sectionId && entry.evidenceUrl === url && entry.reason?.trim()))
      fail('Missing out-of-scope or unavailable source exception: ' + sectionId);
  }
  if (inventory.products.some((p) => p.canonicalUrl === MISSING_BATTERY_URL))
    fail('Previously unavailable battery is not an approved source product');
  return errors;
}

const problems = [];
let drafts;
try { drafts = buildReferenceDrafts(source, overrides); }
catch (error) { problems.push('Cannot build source drafts: ' + error.message); }
if (drafts) {
  problems.push(...validateReferenceDrafts(source, overrides, drafts));
  problems.push(...commerceProblems(source, drafts));
}
if (process.argv.includes('--self-test') && drafts) {
  const reject = (description, values, text) => {
    if (!commerceProblems(...values).some((error) => error.toLowerCase().includes(text.toLowerCase())))
      problems.push('Negative fixture accepted: ' + description);
  };
  const warranty = drafts.find((d) => d.sourceId === WARRANTY_ID);
  const replaceWarranty = (change) => drafts.map((d) =>
    d.sourceId === WARRANTY_ID ? change(structuredClone(d)) : d);
  reject('warranty offer enabled',
    [source, replaceWarranty((d) => { d.warranty.legalApproval = 'approved'; return d; })],
    'metadata');
  reject('warranty changed into engine',
    [source, replaceWarranty((d) => { d.itemType = 'turbojet'; return d; })],
    'service');
  reject('missing Romanian disclaimer',
    [source, replaceWarranty((d) => { d.copy.ro.description = 'Serviciu de la KingTech, acum disponibil pentru achiziție fără condiții.'; return d; })],
    'disclaimer');
  reject('gift checkout exposed',
    [source, drafts, [{ ...externalReferenceServices[0], checkoutUrl: GIFT_CHECKOUT }]],
    'digital gift-card');
  reject('gift legal gate bypassed',
    [source, drafts, [{ ...externalReferenceServices[0], legalApproval: 'approved' }]],
    'digital gift-card');
  reject('gift present in confirmed products',
    [source, drafts, externalReferenceServices, [{ id: externalReferenceServices[0].referenceId }]],
    'leaked');
  const noPromo = structuredClone(source);
  noPromo.exclusions = noPromo.exclusions.filter((e) => e.sectionId !== 'promotional-items');
  reject('removed out-of-scope exclusion', [noPromo, drafts], 'exception');
  const duplicate = [...drafts, structuredClone(warranty)];
  reject('duplicated warranty SKU', [source, duplicate], 'Duplicate');
  const fakeDiscount = structuredClone(source);
  fakeDiscount.products.find((p) => p.id === WARRANTY_ID).sourceCategoryIds.push('discounted');
  fakeDiscount.sections.find((s) => s.id === 'discounted').discoveredCount = 1;
  fakeDiscount.sections.find((s) => s.id === 'discounted').crossListedCount = 1;
  reject('discounted non-engine service', [fakeDiscount, drafts], 'Discount');
  const positive = structuredClone(source);
  const existing = positive.products.find((p) => p.sourceCategoryIds.includes('g4'));
  existing.sourceCategoryIds.push('discounted');
  positive.sections.find((s) => s.id === 'discounted').discoveredCount = 1;
  positive.sections.find((s) => s.id === 'discounted').crossListedCount = 1;
  const related = buildReferenceDrafts(positive, overrides);
  const one = discountedReferenceDrafts(related);
  if (one.length !== 1 || one[0] !== related.find((d) => d.sourceId === existing.id) ||
      commerceProblems(positive, related).length)
    problems.push('Cross-listed engine did not stay the same unique reference object');
  const discountOnly = structuredClone(source);
  discountOnly.products[0].sourceCategoryIds = ['discounted'];
  try { buildReferenceDrafts(discountOnly, overrides); problems.push('Discount-only orphan was accepted as SKU'); }
  catch { /* correct: cannot invent the original engine category */ }
}
if (process.argv.some((arg) => arg.startsWith('--') && arg !== '--self-test'))
  problems.push('Unknown argument: expected optional --self-test');
if (problems.length) {
  for (const problem of problems) console.error('Commerce references: ' + problem);
  process.exitCode = 1;
} else {
  console.log('Commerce references validated: discount collection ' +
    discountedReferenceDrafts(drafts).length + ', warranty service 1, external gift reference 1; ' +
    source.products.length + ' distinct source SKUs' +
    (process.argv.includes('--self-test') ? '; negative and cross-list fixtures passed.' : '.'));
}

#!/usr/bin/env node
// Offline QA for unpublished bilingual supplier-reference product copy.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, realpathSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const paths = {
  inventory: 'docs/catalog/source-inventory.json',
  drafts: 'docs/catalog/reference-overrides.json',
  art: 'docs/catalog/art-manifest.json',
  exceptions: 'docs/catalog/copy-claim-evidence.json',
  matrix: 'docs/catalog/copy-review-matrix.json',
};
const languages = ['en', 'ro'], fields = ['name', 'summary', 'description'];
const qaStatus = 'automated_consistency_checked_unpublished';
const humanStatus = 'pending_prelaunch_native_Romanian_legal_marketing_review';
// Space is optional for detection (9.9V must not bypass evidence), but mandatory in approved copy.
const measurementPattern = /(^|[^\p{L}\p{N}])([0-9][0-9.,]*)(\s*)(g\/min|mL\/min|L\/h|km\/h|m\/s|mAh|kgf|rpm|°C|°F|bar|psi|mm|cm|kW|mL|Ah|kg|g|V|W|L|N|%)(?![\p{L}/])/gu;
// Match explicit promotional forms, not neutral mentions of stock, delivery,
// or compatibility. This lexical gate does NOT replace native legal review.
const salesPhrases = {
  en: /(?<![\p{L}])(?:order now|buy now|ships today|free shipping|free delivery|guaranteed delivery|warranty included|guaranteed by BODICH|in stock at BODICH|in stock now|ready to ship|ships within [0-9]+ (?:business )?days?|available for immediate delivery|sale price|special offer)(?![\p{L}])/giu,
  ro: /(?<![\p{L}])(?:comandă acum|cumpără acum|expediere astăzi|expediem astăzi|livrare gratuită|livrare garantată|livrăm în [0-9]+ zile|garanție inclusă|garantat(?:ă|e|i)? de BODICH|în stoc la BODICH|pe stoc|disponibil acum|disponibil(?:ă)? pentru livrare imediată|preț promoțional|ofertă specială)(?![\p{L}])/giu,
};
// Conservative local negation cue immediately preceding a promotional phrase.
// This is an editorial heuristic, NOT a linguistic/legal review or full NLP.
const negationPrefix = {
  en: /(?:^|[^\p{L}])(?:not|no|never|is not|are not|isn't|aren't|cannot|can't)(?:\s+[\p{L}]+){0,3}\s*$/iu,
  ro: /(?:^|[^\p{L}])(?:nu|nici|niciun|nicio|fără)(?:\s+[\p{L}]+){0,3}\s*$/iu,
};
function hasUnapprovedPromotion(copy, lang) {
  for (const field of fields) {
    const value = copy[field];
    for (const match of value.matchAll(salesPhrases[lang])) {
      const before = value.slice(0, match.index);
      const clause = before.split(/[.!?;:\n]/u).at(-1).slice(-80);
      if (!negationPrefix[lang].test(clause)) return true;
    }
  }
  return false;
}
const sortUnique = (xs) => [...new Set(xs)].sort();
const keyFor = (x) => x.sourceId + '/' + x.value + '/' + x.unit;

function parseQuantity(token, lang) {
  const format = lang === 'en'
    ? /^(?:[0-9]+(?:\.[0-9]+)?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)$/
    : /^(?:[0-9]+(?:,[0-9]+)?|[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?)$/;
  if (!format.test(token) || /^[0-9]{5,}$/.test(token)) return null;
  return Number(lang === 'en' ? token.replaceAll(',', '') : token.replaceAll('.', '').replace(',', '.'));
}
function measured(copy, lang) {
  const out = [];
  for (const field of fields) {
    if (typeof copy?.[field] !== 'string') continue;
    for (const m of copy[field].matchAll(measurementPattern))
      out.push({ value: parseQuantity(m[2], lang), unit: m[4], surface: m[2] + m[3] + m[4],
        spaced: m[3].length > 0, field, start: m.index + m[1].length,
        end: m.index + m[0].length });
  }
  return out;
}
function equivalent(a, b) {
  return a.unit === b.unit && a.value !== null && Math.abs(a.value - b.value) < 0.000001;
}
function primaryCategory(source) {
  const category = Array.isArray(source.sourceCategoryIds)
    ? source.sourceCategoryIds.filter((item) => item !== 'discounted') : [];
  if (category.length !== 1 || typeof category[0] !== 'string' || !category[0])
    throw new Error('Missing or ambiguous source category for ' + source.id);
  return category[0];
}
function qualifiedClaim(copy, claim, lang, exception) {
  const original = copy[claim.field];
  return (exception.acceptedPhrases?.[lang] ?? []).some((phrase) => {
    let at = original.indexOf(phrase);
    while (at !== -1) {
      if (at <= claim.start && at + phrase.length >= claim.end) return true;
      at = original.indexOf(phrase, at + 1);
    }
    return false;
  });
}
/** Return first specific mismatched field, not an opaque whole-document error. */
function mismatch(a, b, prefix = '') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== typeof b ||
      typeof a !== 'object') return prefix || '(root)';
  if (Array.isArray(a) !== Array.isArray(b)) return prefix || '(root)';
  const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()].map(String)
    : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key))
      return (prefix ? prefix + '.' : '') + key;
    const field = mismatch(a[key], b[key], (prefix ? prefix + '.' : '') + key);
    if (field) return field;
  }
  return null;
}
export function expectedMatrix(inventory, drafts, exceptions) {
  const edits = new Map(drafts.records.map((d) => [d.sourceId, d]));
  return {
    schemaVersion: 1,
    purpose: 'unpublished_catalog_copy_review',
    requiredHumanProofreading: humanStatus,
    items: inventory.products.map((source) => {
      const draft = edits.get(source.id);
      const extra = exceptions.entries.filter((x) => x.sourceId === source.id);
      return {
        sourceId: source.id,
        sourceCategory: primaryCategory(source),
        sourceUrl: source.canonicalUrl,
        supplierLifecycle: source.sourceStatus,
        structuredSpecCount: draft?.specs?.length ?? 0,
        evidenceUrls: sortUnique([...(source.evidenceUrls ?? []),
          ...(draft?.specs ?? []).map((x) => x.sourceUrl), ...extra.map((x) => x.sourceUrl)]),
        copyStatus: qaStatus,
        humanRomanianReview: humanStatus,
        unresolved: sortUnique([
          ...(source.sourceStatus === 'unknown' ? ['supplier_lifecycle_unverified'] : []),
          ...((draft?.specs?.length ?? 0) === 0 ? ['numeric_specifications_not_verified'] : []),
          ...extra.map((x) => x.reviewTag),
        ]),
      };
    }),
  };
}
export function validate(input, { checkMatrix = true } = {}) {
  const { inventory, drafts, art, exceptions, matrix } = input, errors = [];
  const fail = (msg) => errors.push(msg);
  if (!Array.isArray(inventory?.products) || !Array.isArray(drafts?.records) ||
      !Array.isArray(art?.entries) || (checkMatrix && !Array.isArray(matrix?.items)) ||
      [inventory.products.length, drafts.records.length, art.entries.length].some((n) => n !== 132) ||
      (checkMatrix && matrix.items.length !== 132))
    return ['Frozen inventory, translations, artwork and review matrix must cover 132 records'];
  if (exceptions?.schemaVersion !== 1 ||
      exceptions?.purpose !== 'documented_non_nominal_or_cross_reference_copy_claims' ||
      !Array.isArray(exceptions.entries)) return ['Invalid claim exception ledger'];
  const sources = new Map(inventory.products.map((p) => [p.id, p]));
  const edits = new Map(drafts.records.map((p) => [p.sourceId, p]));
  const artById = new Map(art.entries.map((p) => [p.sourceId, p]));
  if (sources.size !== 132 || edits.size !== 132 || artById.size !== 132)
    fail('Duplicate or missing SKU identities');
  for (const source of inventory.products) {
    try { primaryCategory(source); } catch (error) { fail(error.message); }
  }
  const knownUrls = new Set(inventory.products.map((x) => x.canonicalUrl));
  const exceptionsByKey = new Map();
  for (const e of exceptions.entries) {
    if (!sources.has(e.sourceId) || !Number.isFinite(e.value) || e.value < 0 ||
        !knownUrls.has(e.sourceUrl) || typeof e.note !== 'string' || e.note.length < 45 ||
        !/^[a-z_]+$/.test(e.reviewTag ?? '') || !/^(?:kgf|rpm|g|mAh)$/.test(e.unit) ||
        !e.acceptedPhrases || !languages.every((lang) =>
          Array.isArray(e.acceptedPhrases[lang]) && e.acceptedPhrases[lang].length > 0 &&
          e.acceptedPhrases[lang].every((phrase) =>
            typeof phrase === 'string' && phrase.length >= 5 &&
            measured({ name: phrase }, lang).some((found) => equivalent(found, e)))))
      fail('Invalid, unclear or unsourced claim exception: ' + e.sourceId);
    if (exceptionsByKey.has(keyFor(e))) fail('Duplicate claim exception: ' + keyFor(e));
    exceptionsByKey.set(keyFor(e), e);
  }
  const seenText = new Map(), usedClaims = new Set();
  for (const source of inventory.products) {
    const id = source.id, edit = edits.get(id), image = artById.get(id);
    if (!edit || !image) { fail('No copy or image/alt metadata for ' + id); continue; }
    if (edit.approval !== 'draft' || edit.images?.length !== 0 ||
        image.approved !== false || image.rights !== 'pending' ||
        image.kind !== 'original_diagram' || image.isProductPhoto !== false ||
        image.sourceUrl !== source.canonicalUrl || image.sourceTitle !== source.sourceTitle)
      fail('Unapproved art or unpublished catalog boundary violated: ' + id);
    if (edit.model && !languages.every((lang) => edit.copy?.[lang]?.name?.includes(edit.model)))
      fail('Exact supplier model omitted: ' + id);
    for (const lang of languages) {
      const copy = edit.copy?.[lang], alt = image.alt?.[lang];
      if (!copy || Object.keys(copy).sort().join(',') !== [...fields].sort().join(',') ||
          !fields.every((field) => typeof copy[field] === 'string')) {
        fail('Complete copy.' + lang + ' fields required: ' + id);
        continue;
      }
      const ranges = { name: [25, 150], summary: [90, 260], description: [240, 1250] };
      for (const field of fields) {
        const value = copy[field], [min, max] = ranges[field], normalized = value.trim().normalize('NFC');
        if (normalized !== value || value.length < min || value.length > max ||
            /[\u0000-\u001f\u007f\uFFFD<>]/u.test(value))
          fail('Invalid copy length/format: ' + id + '/' + lang + '/' + field);
        const hash = lang + '/' + field + '/' + normalized.toLowerCase().replace(/\s+/g, ' ');
        if (seenText.has(hash)) fail('Non-unique ' + lang + '.' + field + ': ' + id);
        seenText.set(hash, id);
      }
      if (!fields.some((field) => copy[field].toLowerCase().includes('kingtech')))
        fail('No supplier attribution: ' + id + '/' + lang);
      if (lang === 'ro') {
        for (const field of fields) {
          if (/[şţŞŢ]/u.test(copy[field]))
            fail('Deprecated Romanian cedilla instead of comma-below: ' + id + '/ro/' + field);
          // Some short names (e.g. "Acumulator LIFE") legitimately contain no diacritics.
          if (field !== 'name' && !/[ăâîșț]/iu.test(copy[field]))
            fail('Romanian diacritics missing in ' + id + '/ro/' + field);
        }
      }
      if (hasUnapprovedPromotion(copy, lang))
        fail('Unapproved commercial claims: ' + id + '/' + lang);
      if (typeof alt !== 'string' || alt.length < 85 || alt.length > 260 ||
          !alt.includes(id) || !alt.includes(source.sourceTitle) ||
          !alt.startsWith(lang === 'en' ? 'Illustrative ' : 'Diagramă ilustrativă ') ||
          !alt.includes(lang === 'en' ? 'not an actual product photograph' : 'nu este o imagine a produsului real'))
        fail('Missing/unlocalized image alt: ' + id + '/' + lang);
      for (const claim of measured(copy, lang)) {
        // A supplier's complete literal title is an identifying label, not a
        // dimensional spec. Preserve “Fuel Tubing 4mm”, but forbid a free
        // standing, unevidenced "4 mm diameter" claim elsewhere in the prose.
        const text = copy[claim.field];
        let at = text.indexOf(source.sourceTitle);
        let literalSourceTitle = false;
        while (at !== -1) {
          if (at <= claim.start && at + source.sourceTitle.length >= claim.end)
            literalSourceTitle = true;
          at = text.indexOf(source.sourceTitle, at + 1);
        }
        if (literalSourceTitle) continue;
        if (claim.value === null) {
          fail('Wrong decimal/thousands locale format: ' + id + '/' + lang + '/' + claim.surface);
          continue;
        }
        if (!claim.spaced) fail('Missing space before engineering unit: ' + id + '/' + lang + '/' + claim.surface);
        if ((edit.specs ?? []).some((spec) => equivalent(spec, claim))) continue;
        const key = keyFor({ sourceId: id, ...claim });
        const exception = exceptionsByKey.get(key);
        if (!exception) fail('Numeric copy claim lacks evidence: ' + id + '/' + lang + '/' + claim.surface);
        else if (!qualifiedClaim(copy, claim, lang, exception))
          fail('Qualified numeric claim lost context: ' + id + '/' + lang + '/' + claim.surface);
        else usedClaims.add(key + '/' + lang);
      }
      const propeller = lang === 'en'
        ? /\b([0-9]+)\s*×\s*([0-9]+)\s*inch(?:es)?\b/g
        : /\b([0-9]+)\s*×\s*([0-9]+)\s*țoli\b/g;
      for (const m of (copy.summary + ' ' + copy.description).matchAll(propeller)) {
        if (!(edit.turboprop?.propellers ?? []).some((p) =>
          p.diameterInches === Number(m[1]) && p.pitchInches === Number(m[2])))
          fail('Propeller dimension has no evidence: ' + id + '/' + lang);
      }
    }
    if (fields.some((field) => edit.copy?.en?.[field] === edit.copy?.ro?.[field]) ||
        image.alt?.en === image.alt?.ro) fail('Identical EN and RO text: ' + id);
  }
  for (const exception of exceptions.entries)
    for (const lang of languages)
      if (!usedClaims.has(keyFor(exception) + '/' + lang))
        fail('Unused/unpaired copy evidence exception: ' + exception.sourceId + '/' + lang);
  if (checkMatrix) {
    if (matrix.schemaVersion !== 1 || matrix.purpose !== 'unpublished_catalog_copy_review' ||
        matrix.requiredHumanProofreading !== humanStatus)
      fail('Review matrix metadata missing or human proofreading gate removed');
    // Skip regeneration when malformed source categories would otherwise throw.
    if (!errors.some((error) => error.startsWith('Missing or ambiguous source category'))) {
      const expected = expectedMatrix(inventory, drafts, exceptions);
      for (let index = 0; index < expected.items.length; index++) {
        const a = expected.items[index], b = matrix.items[index];
        const field = mismatch(a, b);
        if (field) {
          fail('Review matrix mismatch for ' + a.sourceId + ' at ' + field +
            ' (actual sourceId: ' + (b?.sourceId ?? '(missing)') + ')');
          break;
        }
      }
    }
  }
  return errors;
}
function selfTest(input) {
  assert.deepEqual(validate(input), [], 'baseline must pass');
  let cases = 0;
  const negative = (label, mutate, phrase, { checkMatrix = true } = {}) => {
    const fixture = structuredClone(input);
    mutate(fixture);
    const errors = validate(fixture, { checkMatrix });
    assert(errors.some((e) => e.includes(phrase)),
      label + ': expected ' + phrase + ', got ' + errors.join('; '));
    cases++;
  };
  const first = (fixture, lang, field, expression) => {
    const record = fixture.drafts.records.find((r) => expression.test(r.copy[lang][field]));
    assert(record, 'No fixture with ' + expression + ' found');
    return record;
  };
  negative('missing RO description', (x) => {
    delete x.drafts.records[0].copy.ro.description;
  }, 'Complete copy.ro');
  negative('identical EN/RO translation', (x) => {
    x.drafts.records[0].copy.ro = { ...x.drafts.records[0].copy.en };
  }, 'Identical EN');
  negative('duplicated English summary', (x) => {
    x.drafts.records[1].copy.en.summary = x.drafts.records[0].copy.en.summary;
  }, 'Non-unique');
  negative('invented claim without evidence', (x) => {
    x.drafts.records[0].copy.en.description += ' Unverified sample force is 98,765 N.';
  }, 'Numeric copy claim');
  negative('wrong Romanian decimal format', (x) => {
    const r = first(x, 'ro', 'summary', /[0-9]+,[0-9]+ kgf/);
    const match = r.copy.ro.summary.match(/[0-9]+,[0-9]+ kgf/);
    r.copy.ro.summary = r.copy.ro.summary.replace(match[0], match[0].replace(',', '.'));
  }, 'decimal/thousands');
  negative('no-space numeric claim must be visible to scanner', (x) => {
    x.drafts.records[0].copy.en.description += ' Invented component pressure 98,765psi.';
  }, 'Numeric copy claim');
  negative('no-space sourced quantity still invalid typography', (x) => {
    const r = first(x, 'en', 'summary', /[0-9][0-9.,]* (?:kgf|mm|V)/);
    const match = r.copy.en.summary.match(/[0-9][0-9.,]* (?:kgf|mm|V)/)[0];
    r.copy.en.summary = r.copy.en.summary.replace(match, match.replace(' ', ''));
  }, 'Missing space');
  negative('qualifier must follow numeric exception', (x) => {
    const e = x.exceptions.entries.find((e) => e.unit === 'kgf' && e.reviewTag.includes('minimum'));
    const r = x.drafts.records.find((r) => r.sourceId === e.sourceId);
    r.copy.en.description += ' The nominal thrust is 3 kgf.';
  }, 'Qualified numeric claim lost context');
  negative('Romanian cedilla must be rejected', (x) => {
    const r = first(x, 'ro', 'description', /ș/);
    r.copy.ro.description = r.copy.ro.description.replace('ș', 'ş');
  }, 'Deprecated Romanian cedilla');
  negative('missing Romanian diacritics from one field', (x) => {
    const r = x.drafts.records[0];
    r.copy.ro.summary = r.copy.ro.summary.replace(/[ăâîșț]/gi, (letter) =>
      ({'ă':'a','â':'a','î':'i','ș':'s','ț':'t'})[letter.toLowerCase()]);
  }, 'Romanian diacritics missing');
  negative('Romanian order now promotion', (x) => {
    x.drafts.records[0].copy.ro.description += ' Cumpără acum.';
  }, 'Unapproved commercial claims');
  negative('English shipping promotion', (x) => {
    x.drafts.records[0].copy.en.description += ' Free shipping available now.';
  }, 'Unapproved commercial claims');
  negative('unlocalized artwork alt', (x) => {
    x.art.entries[0].alt.ro = x.art.entries[0].alt.en;
  }, 'image alt');
  negative('omitted matrix row', (x) => {
    x.matrix.items.pop();
  }, 'cover 132');
  negative('stale evidence entry', (x) => {
    x.exceptions.entries[0].value = 999;
  }, 'claim exception');
  negative('mismatched matrix field pinpoints source ID', (x) => {
    const row = x.matrix.items.find((r) => r.unresolved.length);
    row.unresolved = [];
  }, 'Review matrix mismatch for');
  negative('missing category is not silently undefined', (x) => {
    x.inventory.products[0].sourceCategoryIds = ['discounted'];
  }, 'Missing or ambiguous source category', { checkMatrix: false });
  negative('matrix write preflight detects invalid source draft', (x) => {
    delete x.drafts.records[0].copy.en.description;
  }, 'Complete copy.en', { checkMatrix: false });
  // Exact external product title is an identifier, not independently verified geometry.
  const tubingSource = input.inventory.products.find((p) => /Tubing [0-9]+mm/.test(p.sourceTitle));
  assert(tubingSource, 'Expected at least one unspaced supplier tubing label');
  const tubingRecord = input.drafts.records.find((r) => r.sourceId === tubingSource.id);
  assert(tubingRecord.copy.en.description.includes(tubingSource.sourceTitle),
    'Existing exact supplier title is preserved in the reference prose');
  assert.deepEqual(validate(input), [], 'Literal source-title dimension must remain acceptable');
  negative('same tubing number asserted outside supplier title', (x) => {
    const record = x.drafts.records.find((r) => r.sourceId === tubingSource.id);
    const value = tubingSource.sourceTitle.match(/([0-9]+)mm/)[1];
    record.copy.en.description += ' The independently claimed diameter is ' + value + ' mm.';
  }, 'Numeric copy claim lacks evidence');
  negative('unspaced standalone tubing dimension outside source title', (x) => {
    const record = x.drafts.records.find((r) => r.sourceId === tubingSource.id);
    const value = tubingSource.sourceTitle.match(/([0-9]+)mm/)[1];
    record.copy.en.description += ' Its verified diameter is ' + value + 'mm.';
  }, 'Missing space before engineering unit');
  negative('explicit Romanian inventory promotion', (x) => {
    x.drafts.records[0].copy.ro.description += ' În stoc la BODICH.';
  }, 'Unapproved commercial claims');
  negative('explicit English inventory promotion', (x) => {
    x.drafts.records[0].copy.en.description += ' In stock at BODICH.';
  }, 'Unapproved commercial claims');
  negative('additional English shipping promotion', (x) => {
    x.drafts.records[0].copy.en.description += ' Ready to ship.';
  }, 'Unapproved commercial claims');
  negative('additional English shipping estimate', (x) => {
    x.drafts.records[0].copy.en.description += ' Ships within 2 business days.';
  }, 'Unapproved commercial claims');
  negative('additional Romanian availability promotion', (x) => {
    x.drafts.records[0].copy.ro.description += ' Disponibil acum.';
  }, 'Unapproved commercial claims');
  negative('additional Romanian dispatch promotion', (x) => {
    x.drafts.records[0].copy.ro.description += ' Expediem astăzi.';
  }, 'Unapproved commercial claims');
  // Genuine disclaimers must remain valid even when mentioning stock, delivery and guarantees.
  const disclaimer = structuredClone(input);
  disclaimer.drafts.records[0].copy.en.description +=
    ' No claim is made that the item is in stock or eligible for delivery.';
  disclaimer.drafts.records[0].copy.ro.description +=
    ' Această fișă nu implică o compatibilitate garantată și nu confirmă livrare.';
  assert.deepEqual(validate(disclaimer), [], 'Neutral EN/RO commercial disclaimers must pass');
  const negated = structuredClone(input);
  negated.drafts.records[0].copy.en.description +=
    ' The item is not in stock now and is not ready to ship.';
  negated.drafts.records[0].copy.ro.description +=
    ' Produsul nu este pe stoc și nu este disponibil acum.';
  assert.deepEqual(validate(negated), [],
    'Negated promotions in both languages must remain valid');
  const supplierInventory = structuredClone(input);
  supplierInventory.drafts.records[0].copy.ro.description +=
    ' Situația pe stocul furnizorului este necunoscută.';
  assert.deepEqual(validate(supplierInventory), [],
    'pe stocul must not match pe stoc as an incomplete word');
  // Importing the module must not parse foreign argv, emit output or rewrite the matrix.
  const before = readFileSync(paths.matrix, 'utf8');
  const imported = spawnSync(process.execPath,
    ['--input-type=module', '-e', "await import('./scripts/validate-catalog-copy.mjs')", '--', '--write-matrix'],
    { encoding: 'utf8', cwd: process.cwd() });
  assert.equal(imported.status, 0, 'import-pure: ' + imported.stderr);
  assert.equal(imported.stdout, '', 'import-pure: unexpected CLI output');
  assert.equal(imported.stderr, '', 'import-pure: unexpected error output');
  assert.equal(readFileSync(paths.matrix, 'utf8'), before, 'import-pure: matrix was mutated');
  // The entry point itself must run, even on Node 24.0/24.1 without import.meta.main.
  const cli = spawnSync(process.execPath,
    ['scripts/validate-catalog-copy.mjs', '--not-an-option'], { encoding: 'utf8', cwd: process.cwd() });
  assert.notEqual(cli.status, 0, 'CLI cannot silently exit success for unknown options');
  assert.match(cli.stderr, /Use one of --write-matrix or --self-test/);
  const thisPath = realpathSync(resolve('scripts/validate-catalog-copy.mjs'));
  assert.equal(isEntryPoint(true, thisPath, thisPath), true, 'native entrypoint true');
  assert.equal(isEntryPoint(false, thisPath, thisPath), false, 'native import false');
  assert.equal(isEntryPoint(undefined, thisPath, thisPath), true, 'legacy direct entry');
  assert.equal(isEntryPoint(undefined, thisPath, '/nonexistent/foreign.mjs'), false,
    'legacy import does not run');
  assert.equal(isEntryPoint(undefined, thisPath, undefined), false,
    'legacy no argv does not run');
  assert.equal(canonicalArgvPath('/definitely-not-a-real-bodich-entrypoint.mjs'), undefined,
    'legacy foreign argv should not cause an import-time ENOENT');
  assert.equal(canonicalArgvPath('scripts/validate-catalog-copy.mjs'), thisPath,
    'legacy real file argv canonicalized');
  const tempDir = mkdtempSync(join(tmpdir(), 'bodich-copy-entry-'));
  try {
    const linked = join(tempDir, 'validator.mjs');
    try {
      symlinkSync(thisPath, linked);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
      console.log('Node entrypoint symlink fixture skipped: symlinks are not permitted');
    }
    if (existsSync(linked)) {
      assert.equal(canonicalArgvPath(linked), thisPath,
        'legacy argv symlink resolves to the script realpath');
      assert.equal(isEntryPoint(undefined, thisPath, canonicalArgvPath(linked)), true,
        'legacy direct-entry symlink must run the CLI');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('Copy QA regression fixtures: ' + cases +
    ' expected failures detected, with positive disclaimer/title and module-CLI smoke tests');
}
// Pure predicate: Node 24.0/24.1 lack import.meta.main; canonical paths
// handle symlinked entry scripts. Non-file foreign argv remains import-safe.
export function isEntryPoint(main, modulePath, argvPath) {
  return main ?? (Boolean(argvPath) && modulePath === argvPath);
}
function canonicalArgvPath(argv1) {
  if (!argv1) return undefined;
  const candidate = resolve(argv1);
  return existsSync(candidate) ? realpathSync(candidate) : undefined;
}
const runningDirectly = isEntryPoint(import.meta.main,
  realpathSync(fileURLToPath(import.meta.url)),
  canonicalArgvPath(process.argv[1]));
if (runningDirectly) {
  const options = process.argv.slice(2);
  if (options.some((x) => !['--write-matrix', '--self-test'].includes(x)) ||
      (options.includes('--write-matrix') && options.includes('--self-test')))
    throw new Error('Use one of --write-matrix or --self-test');
  const writing = options.includes('--write-matrix');
  const input = {
    inventory: read(paths.inventory), drafts: read(paths.drafts),
    art: read(paths.art), exceptions: read(paths.exceptions),
    matrix: writing ? null : read(paths.matrix),
  };
  // Validate the original input BEFORE generating or touching the review matrix.
  const errors = validate(input, { checkMatrix: !writing });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else if (writing) {
    const content = JSON.stringify(expectedMatrix(input.inventory, input.drafts, input.exceptions), null, 2) + '\n';
    // Atomic replacement avoids a partially written review ledger if interrupted.
    const temp = paths.matrix + '.tmp-' + process.pid;
    try {
      writeFileSync(temp, content, { flag: 'wx' });
      renameSync(temp, paths.matrix);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
    console.log('Validated review matrix written for 132 unpublished source SKUs');
  } else {
    console.log('Copy QA passed: 132 unpublished EN/RO records, source claims, alt and review rows');
    if (options.includes('--self-test')) selfTest(input);
  }
}

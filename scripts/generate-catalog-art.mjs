/**
 * Unpublished, reproducible BODICH category illustrations for the source catalog.
 * Geometry is authored here; no vendor assets, photo scraping, or generative API.
 * The art is deliberately generic and may not be used as a product photograph.
 *
 * node scripts/generate-catalog-art.mjs --generate
 * node scripts/generate-catalog-art.mjs --check
 * node scripts/generate-catalog-art.mjs --self-test
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, basename } from 'node:path';
import sharp from 'sharp';
import { inspectRaster, MAX_CATALOG_IMAGE_BYTES } from './catalog-image.mjs';

const root = resolve('docs/catalog/draft-assets');
const boardRoot = resolve('visual-qa/catalog-art');
const manifest = JSON.parse(readFileSync('docs/catalog/art-manifest.json', 'utf8'));
const inventory = JSON.parse(readFileSync('docs/catalog/source-inventory.json', 'utf8'));
const overrides = JSON.parse(readFileSync('docs/catalog/reference-overrides.json', 'utf8'));
const allowedFamilies = new Set([
  'jet-g4', 'jet-g5', 'turboprop', 'oil', 'battery', 'service',
  'accessory-ecu-controls', 'accessory-electrical-components',
  'accessory-fuel-systems', 'accessory-mounting-hardware',
  'accessory-turbine-protection', 'accessory-maintenance-parts',
]);
const sizes = { webp360: [360, 270, 'webp'], webp600: [600, 450, 'webp'],
  webp1200: [1200, 900, 'webp'], png600: [600, 450, 'png'] };
const expectedPaths = (id) => {
  const stem = 'docs/catalog/draft-assets/' + id + '/concept';
  return { webp360: stem + '-360.webp', webp600: stem + '-600.webp',
    webp1200: stem + '-1200.webp', png600: stem + '-600.png' };
};
function familyFor(source, draft) {
  const section = source.sourceCategoryIds.filter((id) => id !== 'discounted')[0];
  if (section === 'g4') return 'jet-g4';
  if (section === 'g5') return 'jet-g5';
  if (section === 'tp') return 'turboprop';
  if (section === 'oil') return 'oil';
  if (section === 'batteries') return 'battery';
  if (section === 'warranty') return 'service';
  if (section === 'accessories' && draft.accessory?.groupId) {
    return 'accessory-' + draft.accessory.groupId;
  }
  return '';
}
function problems(data) {
  const errors = [];
  if (data.schemaVersion !== 1 || data.purpose !== 'unpublished_original_diagram_fallbacks' ||
      data.entries?.length !== inventory.products.length) errors.push('Manifest schema or count mismatch');
  const originals = new Map(inventory.products.map((item) => [item.id, item]));
  const drafts = new Map(overrides.records.map((item) => [item.sourceId, item]));
  const seen = new Set(), pathSet = new Set(), visibleIndices = new Set();
  for (const entry of data.entries ?? []) {
    if (!entry || !/^kt-(?:[1-9][0-9]*|sq-[A-Z0-9]+)$/.test(entry.sourceId) ||
        seen.has(entry.sourceId)) { errors.push('Duplicate or invalid art source ID'); continue; }
    seen.add(entry.sourceId);
    const visibleId = displayIndex(entry.sourceId);
    if (visibleIndices.has(visibleId) || visibleId.length > 9)
      errors.push('Unusable or duplicated short visual index: ' + entry.sourceId);
    visibleIndices.add(visibleId);
    // Fail manifest validation before any rasterization if supplier text cannot render.
    const unsupported = [...String(entry.sourceTitle ?? '').toUpperCase()]
      .filter((character) => !glyphs[character]);
    if (unsupported.length)
      errors.push('Unsupported supplier title glyph(s) ' +
        [...new Set(unsupported)].join(', ') + ': ' + entry.sourceId);
    const source = originals.get(entry.sourceId), draft = drafts.get(entry.sourceId);
    if (!source || !draft || entry.sourceTitle !== source.sourceTitle ||
        entry.sourceUrl !== source.canonicalUrl ||
        entry.family !== familyFor(source, draft) || !allowedFamilies.has(entry.family))
      errors.push('Unmatched source, grouping, or editorial ID: ' + entry.sourceId);
    if (entry.status !== 'documented_illustrative_fallback' || entry.rights !== 'pending' ||
        entry.kind !== 'original_diagram' || entry.approved !== false ||
        entry.isProductPhoto !== false || entry.manufacturer !== 'KingTech' ||
        !(typeof entry.brief === 'string' && entry.brief.trim().length >= 25) ||
        !entry.alt?.en?.startsWith('Illustrative') ||
        !entry.alt?.ro?.startsWith('Diagramă ilustrativă') ||
        !entry.alt?.en?.includes('not an actual') ||
        !entry.alt?.ro?.includes('nu este o imagine') ||
        entry.provenance !== 'scripts/generate-catalog-art.mjs')
      errors.push('Art rights, authenticity or bilingual disclosure: ' + entry.sourceId);
    const paths = expectedPaths(entry.sourceId);
    for (const [key, path] of Object.entries(paths)) {
      if (entry.assets?.[key] !== path || pathSet.has(path))
        errors.push('Unsafe or missing art export path: ' + entry.sourceId + '/' + key);
      pathSet.add(path);
    }
    if (entry.assets && Object.keys(entry.assets).sort().join(',') !== Object.keys(sizes).sort().join(','))
      errors.push('Unexpected output size: ' + entry.sourceId);
  }
  if (seen.size !== originals.size || [...originals.keys()].some((id) => !seen.has(id)))
    errors.push('Not all importable source SKUs have an honest fallback');
  return errors;
}

/**
 * Tiny project-authored 5x7 vector alphabet; no system font/librsvg text shaping.
 * Raster output may still differ by libvips build, but glyph shapes do not.
 */
const glyphRows = {
  A:'01110/10001/10001/11111/10001/10001/10001',
  B:'11110/10001/10001/11110/10001/10001/11110',
  C:'01111/10000/10000/10000/10000/10000/01111',
  D:'11110/10001/10001/10001/10001/10001/11110',
  E:'11111/10000/10000/11110/10000/10000/11111',
  F:'11111/10000/10000/11110/10000/10000/10000',
  G:'01111/10000/10000/10111/10001/10001/01110',
  H:'10001/10001/10001/11111/10001/10001/10001',
  I:'11111/00100/00100/00100/00100/00100/11111',
  J:'00111/00010/00010/00010/10010/10010/01100',
  K:'10001/10010/10100/11000/10100/10010/10001',
  L:'10000/10000/10000/10000/10000/10000/11111',
  M:'10001/11011/10101/10101/10001/10001/10001',
  N:'10001/11001/10101/10011/10001/10001/10001',
  O:'01110/10001/10001/10001/10001/10001/01110',
  P:'11110/10001/10001/11110/10000/10000/10000',
  Q:'01110/10001/10001/10001/10101/10010/01101',
  R:'11110/10001/10001/11110/10100/10010/10001',
  S:'01111/10000/10000/01110/00001/00001/11110',
  T:'11111/00100/00100/00100/00100/00100/00100',
  U:'10001/10001/10001/10001/10001/10001/01110',
  V:'10001/10001/10001/10001/10001/01010/00100',
  W:'10001/10001/10001/10101/10101/10101/01010',
  X:'10001/10001/01010/00100/01010/10001/10001',
  Y:'10001/10001/01010/00100/00100/00100/00100',
  Z:'11111/00001/00010/00100/01000/10000/11111',
  '0':'01110/10001/10011/10101/11001/10001/01110',
  '1':'00100/01100/00100/00100/00100/00100/01110',
  '2':'01110/10001/00001/00010/00100/01000/11111',
  '3':'11110/00001/00001/01110/00001/00001/11110',
  '4':'00010/00110/01010/10010/11111/00010/00010',
  '5':'11111/10000/10000/11110/00001/00001/11110',
  '6':'01110/10000/10000/11110/10001/10001/01110',
  '7':'11111/00001/00010/00100/01000/01000/01000',
  '8':'01110/10001/10001/01110/10001/10001/01110',
  '9':'01110/10001/10001/01111/00001/00001/01110',
  '/':'00001/00001/00010/00100/01000/10000/10000',
  '-':'00000/00000/00000/11111/00000/00000/00000',
  '.':'00000/00000/00000/00000/00000/01100/01100',
  ',':'00000/00000/00000/00000/00100/00100/01000',
  '(':'00010/00100/01000/01000/01000/00100/00010',
  ')':'01000/00100/00010/00010/00010/00100/01000',
  '+':'00000/00100/00100/11111/00100/00100/00000',
  '·':'00000/00000/00000/00100/00000/00000/00000',
  ' ':'00000/00000/00000/00000/00000/00000/00000',
};
const glyphs = Object.fromEntries(Object.entries(glyphRows).map(([key, rows]) => [key, rows.split('/')]));
function vectorText(value, x, y, scale, fill = '#e4ecf1') {
  const text = String(value).toUpperCase();
  let path = '';
  for (let i = 0; i < text.length; i++) {
    const rows = glyphs[text[i]];
    if (!rows) throw new Error('Unsupported vector glyph: ' + JSON.stringify(text[i]) +
      ' in ' + JSON.stringify(text));
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (rows[row][col] === '1') {
          const xx = x + (i * 6 + col) * scale, yy = y + row * scale;
          path += 'M' + xx + ' ' + yy + 'h' + scale + 'v' + scale + 'h-' + scale + 'z';
        }
      }
    }
  }
  return '<path fill="' + fill + '" d="' + path + '"/>';
}
/** Preserve the full ID in the manifest; print only an unambiguous short index. */
function displayIndex(id) {
  return id.startsWith('kt-sq-') ? 'SQ-' + id.slice(-6) : id.toUpperCase();
}


const REVIEW_CAPTION_WIDTH = 360;
const REVIEW_CAPTION_HEIGHT = 134;
const REVIEW_CHARS_PER_LINE = 27;
const REVIEW_TITLE_LINES = 3;

/** Wrap without shortening model identifiers or discarding meaningful suffixes. */
function reviewTitleLines(sourceTitle) {
  const normalized = sourceTitle.toUpperCase().trim().replace(/\s+/g, ' ');
  const lines = [];
  for (const word of normalized.split(' ')) {
    if (word.length > REVIEW_CHARS_PER_LINE)
      throw new Error('Unbreakable supplier title fragment: ' + word);
    const current = lines.at(-1);
    if (current && current.length + 1 + word.length <= REVIEW_CHARS_PER_LINE)
      lines[lines.length - 1] += ' ' + word;
    else lines.push(word);
  }
  if (lines.length > REVIEW_TITLE_LINES)
    throw new Error('Source title cannot fit without truncation: ' + sourceTitle);
  return lines;
}
/** Full Square IDs wrap after the prefix, retaining every original character. */
function reviewIdLines(id) {
  const full = id.toUpperCase();
  const lines = full.length <= REVIEW_CHARS_PER_LINE ? [full] :
    full.startsWith('KT-SQ-') ? ['KT-SQ-', full.slice(6)] : [full];
  if (lines.length > 2 || lines.some((line) => line.length > REVIEW_CHARS_PER_LINE) ||
      lines.join('') !== full)
    throw new Error('Full source ID cannot fit caption: ' + full);
  return lines;
}
function contactSheetCaption(entry) {
  const idLines = reviewIdLines(entry.sourceId);
  const titleLines = reviewTitleLines(entry.sourceTitle);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + REVIEW_CAPTION_WIDTH +
    '" height="' + REVIEW_CAPTION_HEIGHT + '">' +
    '<rect width="' + REVIEW_CAPTION_WIDTH + '" height="' + REVIEW_CAPTION_HEIGHT +
    '" fill="#182b39"/>' +
    idLines.map((line, index) => vectorText(line, 12, 8 + index * 21, 2, '#edb082')).join('') +
    titleLines.map((line, index) => vectorText(line, 12, 54 + index * 24, 2, '#deebef')).join('') +
    '</svg>';
}

function seedFor(text) {
  let n = 2166136261;
  for (const char of text) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}
function circle(x, y, r, fill, stroke = '#bed0da', sw = 7) {
  return '<circle cx="' + x + '" cy="' + y + '" r="' + r +
    '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
}
function line(x1, y1, x2, y2, stroke = '#96b8bd', sw = 8) {
  return '<path d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 +
    '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
}
function turbine(kind, seed) {
  let result = '<path d="M575 312 L995 345 L1040 485 L575 525 Z" fill="#354a5c" stroke="#a2b9c5" stroke-width="10"/>' +
    '<path d="M945 350 L1043 365 L1043 468 L945 487" fill="#192c3c" stroke="#d37c4b" stroke-width="11"/>' +
    '<ellipse cx="590" cy="417" rx="108" ry="123" fill="#0b1927" stroke="#c98152" stroke-width="18"/>';
  const spokes = kind === 'jet-g5' ? 12 : 9;
  for (let i = 0; i < spokes; i++) {
    const a = i * 2 * Math.PI / spokes + (seed % 15) / 100;
    result += line(590 + Math.cos(a) * 28, 417 + Math.sin(a) * 30,
      590 + Math.cos(a) * 83, 417 + Math.sin(a) * 94, '#7c9ca9', 10);
  }
  return result + circle(590, 417, 28, '#d17c4f', '#f0c1a2', 6) +
    line(707, 315, 910, 332, '#d37c4b', 12) +
    line(707, 532, 919, 504, '#5c8797', 8);
}
function propeller(seed) {
  let shape = turbine('jet-g4', seed);
  shape += '<path d="M455 395 L520 395 L520 440 L455 440 Z" fill="#a3bbc8"/>';
  for (let i = 0; i < 4; i++) {
    shape += '<path d="M475 417 Q405 349 458 197 Q530 268 488 412 Z" fill="#7daeb3" stroke="#c7d9dd" stroke-width="8" transform="rotate(' +
      (i * 90) + ' 475 417)"/>';
  }
  return shape + circle(475, 417, 34, '#c87948');
}
function boxArt(type) {
  let shape = '<rect x="502" y="272" width="488" height="297" rx="28" fill="#24394b" stroke="#90b6bd" stroke-width="12"/>' +
    '<rect x="528" y="300" width="436" height="239" rx="16" fill="#122535" stroke="#426375" stroke-width="5"/>';
  if (type === 'accessory-fuel-systems') {
    shape += '<ellipse cx="605" cy="417" rx="59" ry="80" fill="#416376" stroke="#d38456" stroke-width="12"/>' +
      '<path d="M670 417 H915 M915 417 V310 M915 417 V527" stroke="#6fb0b1" stroke-width="19" fill="none"/>' +
      circle(916, 417, 25, '#d38456');
  } else if (type === 'accessory-ecu-controls' || type === 'accessory-electrical-components') {
    for (let i = 0; i < 4; i++) {
      shape += '<rect x="' + (552 + i * 97) + '" y="351" width="58" height="84" rx="8" fill="#6c9ca9" stroke="#d08b5e" stroke-width="5"/>';
      shape += line(581 + i * 97, 440, 581 + i * 97, 500, '#507e89', 6);
    }
  } else if (type === 'accessory-mounting-hardware') {
    shape += '<path d="M550 500 V333 H920 V390 H635 V500 Z" fill="#566b79" stroke="#d58961" stroke-width="10"/>' +
      circle(599, 383, 22, '#0d202f') + circle(867, 365, 22, '#0d202f');
  } else if (type === 'accessory-turbine-protection') {
    shape += '<path d="M750 310 L895 369 V443 Q890 513 750 549 Q610 513 605 443 V369 Z" fill="#4b7780" stroke="#daa16d" stroke-width="9"/>';
    for (let y = 380; y < 495; y += 34) shape += line(642, y, 857, y, '#234354', 7);
  } else {
    shape += '<path d="M580 500 L702 374 L750 420 L647 526 Z" fill="#6b9ca6" stroke="#d58d61" stroke-width="12"/>' +
      circle(735, 388, 45, '#1b3442') + line(761, 358, 836, 327, '#a3bbc8', 19);
  }
  return shape;
}
function oil() {
  let shape = '<rect x="575" y="302" width="326" height="298" rx="25" fill="#395569" stroke="#a9c3ce" stroke-width="12"/>' +
    '<path d="M665 298 V254 H820 V300" fill="none" stroke="#d58a57" stroke-width="28"/>' +
    '<rect x="639" y="393" width="208" height="137" rx="9" fill="#122637" stroke="#81b4b6" stroke-width="6"/>' +
    '<path d="M740 417 Q660 482 748 509 Q831 468 740 417 Z" fill="#d38456"/>';
  return shape;
}
function battery() {
  return '<rect x="547" y="300" width="386" height="267" rx="24" fill="#344e61" stroke="#90b4c1" stroke-width="12"/>' +
    '<rect x="657" y="267" width="163" height="40" rx="9" fill="#a2bbc6"/>' +
    '<path d="M756 336 L669 460 H741 L714 536 L833 394 H763 Z" fill="#de9964"/>' +
    line(579, 544, 898, 544, '#70a8a9', 7);
}
function service() {
  return '<rect x="580" y="251" width="329" height="381" rx="17" fill="#304c60" stroke="#bed0d8" stroke-width="11"/>' +
    '<path d="M654 318 H835 M654 365 H835 M654 412 H815" stroke="#89afb9" stroke-width="12"/>' +
    '<path d="M668 515 L724 565 L837 464" fill="none" stroke="#d88b55" stroke-width="24"/>';
}
function svgFor(entry) {
  const seed = seedFor(entry.sourceId + ':' + entry.family);
  const isJet = entry.family.startsWith('jet-');
  const labels = {
    'jet-g4': 'TURBOJET / G4 SERIES', 'jet-g5': 'TURBOJET / G5 SERIES',
    turboprop: 'TURBOPROP / GENERIC', oil: 'TURBINE OIL / GENERIC',
    battery: 'BATTERY / GENERIC', service: 'SERVICE / REFERENCE',
  };
  const label = labels[entry.family] ?? entry.family.replace('accessory-', '').replaceAll('-', ' ').toUpperCase();
  let art = isJet ? turbine(entry.family, seed) : entry.family === 'turboprop' ? propeller(seed) :
    entry.family === 'oil' ? oil(seed) : entry.family === 'battery' ? battery(seed) :
    entry.family === 'service' ? service() : boxArt(entry.family);
  let lines = '';
  for (let i = 0; i < 8; i++) {
    const xx = 95 + ((seed >>> (i * 3 % 25)) % 250);
    lines += line(xx, 260 + i * 61, xx + 45 + i * 10, 260 + i * 61,
      i % 2 ? '#355263' : '#436e75', 3);
  }
  const serial = displayIndex(entry.sourceId);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">' +
    '<rect width="1200" height="900" fill="#0b1422"/>' +
    '<path d="M0 0 H1200 V900 H0 Z" fill="none" stroke="#344959" stroke-width="30"/>' +
    '<path d="M100 187 H1100 M100 698 H1100" stroke="#324c5d" stroke-width="5"/>' +
    '<rect x="100" y="117" width="16" height="35" fill="#d48958"/>' +
    vectorText('BODICH / VISUAL STUDY', 140, 116, 4) +
    vectorText(label, 103, 724, 4) +
    vectorText('ILLUSTRATIVE DIAGRAM · NOT A PRODUCT PHOTO', 103, 787, 3, '#9bb4be') +
    vectorText(serial, 865, 116, 4, '#d68a59') +
    '<g opacity=".75">' + lines + '</g><g>' + art + '</g>' +
    '<path d="M100 845 H1100" stroke="#cd8054" stroke-width="5"/></svg>';
}

/**
 * Publication gate: checking file names alone is insufficient because a draft
 * may be copied or renamed. Match SHA-256 of every generated derivative against
 * files in the real public catalog tree. A future approval needs both approved
 * state and rights clearance in the manifest; this phase permits neither.
 */
function publishedDraftProblems(publicRoot, draftHashes) {
  const errors = [];
  const catalogDir = resolve(publicRoot, 'images/catalog');
  if (!existsSync(catalogDir)) return errors;
  const draftFilenames = new Set(manifest.entries.flatMap(
    (entry) => Object.values(entry.assets).map((path) => basename(path))));
  const walk = (dir) => {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, file.name);
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        errors.push('Public catalog symlink not allowed: ' + path);
      } else if (stats.isDirectory()) {
        walk(path);
      } else if (stats.isFile()) {
        const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
        const matching = draftHashes.get(hash);
        if (matching && (matching.approved !== true || matching.rights !== 'cleared')) {
          errors.push('Unapproved draft asset published by byte match: ' + path +
            ' (source ' + matching.sourceId + ')');
        } else if (draftFilenames.has(file.name) &&
                   manifest.entries.some((item) => !item.approved)) {
          errors.push('Reserved draft-art filename in public catalog: ' + path);
        }
      }
    }
  };
  walk(catalogDir);
  return errors;
}

async function inspectExports() {
  const errors = [];
  const expected = new Set(), draftHashes = new Map();
  for (const entry of manifest.entries) {
    for (const [key, [width, height, ext]] of Object.entries(sizes)) {
      const path = resolve(entry.assets[key]);
      expected.add(path);
      if (!existsSync(path)) { errors.push('Missing raster: ' + entry.sourceId + '/' + key); continue; }
      try {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CATALOG_IMAGE_BYTES) {
          errors.push('Oversized or unsafe raster: ' + path); continue;
        }
        const bytes = readFileSync(path);
        draftHashes.set(createHash('sha256').update(bytes).digest('hex'), entry);
        const result = inspectRaster(bytes, ext);
        const metadata = await sharp(bytes).metadata();
        if (!result || result.privateMetadata || result.width !== width ||
            result.height !== height || metadata.width !== width ||
            metadata.height !== height || metadata.exif || metadata.xmp || metadata.iptc)
          errors.push('Incorrect dimensions or metadata: ' + path);
      } catch (error) { errors.push('Invalid raster: ' + path + ' ' + error.message); }
    }
  }
  if (existsSync(root)) {
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, f.name);
        if (f.isSymbolicLink()) { errors.push('Symlink in draft assets: ' + path); continue; }
        if (f.isDirectory()) walk(path);
        else if (!expected.has(path)) errors.push('Unreferenced or unexpected file: ' + path);
      }
    };
    walk(root);
  }
  errors.push(...publishedDraftProblems(resolve('public'), draftHashes));
  return errors;
}
async function generate() {
  mkdirSync(root, { recursive: true });
  mkdirSync(boardRoot, { recursive: true });
  const byFamily = new Map();
  for (const entry of manifest.entries) {
    const original = Buffer.from(svgFor(entry), 'utf8');
    for (const [key, [width, height, ext]] of Object.entries(sizes)) {
      const target = resolve(entry.assets[key]);
      mkdirSync(dirname(target), { recursive: true });
      const pipe = sharp(original).resize({ width, height, fit: 'fill' });
      if (ext === 'webp') await pipe.webp({ quality: 78, effort: 4 }).toFile(target);
      else await pipe.png({ compressionLevel: 9, palette: true }).toFile(target);
    }
    const items = byFamily.get(entry.family) ?? [];
    items.push(entry);
    byFamily.set(entry.family, items);
  }
  // Visual category review sheets: a human can inspect EVERY reference thumbnail.
  for (const [family, entries] of byFamily) {
    const columns = 4, width = 360, height = 270;
    const rows = Math.ceil(entries.length / columns);
    const cellHeight = height + REVIEW_CAPTION_HEIGHT;
    const images = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i], left = (i % columns) * width;
      const top = Math.floor(i / columns) * cellHeight;
      images.push({ input: readFileSync(entry.assets.webp360), top, left });
      // Contact sheets print FULL source IDs and titles below each category sketch.
      // Only the image header abbreviates long Square IDs.
      const caption = contactSheetCaption(entry);
      images.push({ input: Buffer.from(caption, 'utf8'), top: top + height, left });
    }
    await sharp({ create: { width: columns * width, height: rows * cellHeight,
      channels: 4, background: '#0b1422' } }).composite(images)
      .png({ compressionLevel: 9 }).toFile(resolve(boardRoot, family + '.png'));
  }
  console.log('Generated ' + manifest.entries.length + ' indexed family diagrams, ' +
    (manifest.entries.length * Object.keys(sizes).length) + ' raster derivatives and ' +
    byFamily.size + ' category review sheets.');
}
function selfTest() {
  const clone = () => structuredClone(manifest);
  const cases = [
    (m) => m.entries.pop(),
    (m) => m.entries.push({ ...m.entries[0] }),
    (m) => { m.entries[0].rights = 'cleared'; },
    (m) => { m.entries[0].isProductPhoto = true; },
    (m) => { m.entries[0].assets.webp600 = 'public/images/catalog/unsafe.webp'; },
    (m) => { m.entries[0].family = 'accessory-mounting-hardware'; },
    (m) => { m.entries[0].alt.ro = ''; },
    (m) => { delete m.entries[0].brief; },
    (m) => { m.entries[0].brief = '   '; },
  ];
  for (const mutate of cases) {
    const m = clone();
    mutate(m);
    if (!problems(m).length) throw new Error('Negative artwork fixture escaped');
  }
  // Never silently drop an unknown title character (including punctuation).
  for (const character of ['&', '%', ':', '"', '€']) {
    assert.throws(
      () => vectorText('TEST ' + character, 12, 8, 2),
      (error) => error instanceof Error &&
        error.message.includes('Unsupported vector glyph') &&
        error.message.includes(character),
      'Unsupported vector glyph must reject ' + character,
    );
    assert.throws(
      () => contactSheetCaption({ ...manifest.entries[0],
        sourceTitle: 'Model ' + character + ' suffix' }),
      /Unsupported vector glyph/,
      'Supplier title must not silently lose ' + character,
    );
    const mutated = clone();
    mutated.entries[0].sourceTitle += character;
    assert(problems(mutated).some((error) => error.includes('Unsupported supplier title glyph')),
      'Manifest validation must reject unsupported character ' + character);
  }
  // Supported punctuation and blanks render consistently without throwing.
  assert.doesNotThrow(() => vectorText('MODEL K-30/45 G4+ (REV. 2), A·B', 0, 0, 2));
  for (const entry of manifest.entries) {
    const printed = displayIndex(entry.sourceId);
    if (printed.length > 9 || !svgFor(entry).includes(vectorText(printed, 865, 116, 4, '#d68a59')))
      throw new Error('Visual index overflow / missing vector index: ' + entry.sourceId);
  }
  for (const entry of manifest.entries) {
    const expectedLines = reviewTitleLines(entry.sourceTitle);
    if (expectedLines.join(' ') !== entry.sourceTitle.toUpperCase().trim().replace(/\s+/g, ' '))
      throw new Error('Source title was truncated or reordered in review caption: ' + entry.sourceId);
    const caption = contactSheetCaption(entry);
    if (reviewIdLines(entry.sourceId).join('') !== entry.sourceId.toUpperCase() ||
        reviewIdLines(entry.sourceId).some((line, i) =>
          !caption.includes(vectorText(line, 12, 8 + i * 21, 2, '#edb082'))) ||
        expectedLines.some((line, i) => !caption.includes(
          vectorText(line, 12, 54 + i * 24, 2, '#deebef'))))
      throw new Error('Missing full source ID or title in review caption: ' + entry.sourceId);
  }
  const mounting = manifest.entries.filter((entry) => entry.family === 'accessory-mounting-hardware');
  const captionIdentifiers = new Set(mounting.map((entry) => entry.sourceId));
  if (captionIdentifiers.size !== mounting.length ||
      mounting.some((entry) => reviewIdLines(entry.sourceId).some((line, i) =>
        !contactSheetCaption(entry).includes(
          vectorText(line, 12, 8 + i * 21, 2, '#edb082')))))
    throw new Error('Mounting hardware contact sheets lack distinct full reference IDs');
  const glyphProof = svgFor(manifest.entries[0]);
  if (glyphProof.includes('<text ') ||
      !glyphProof.includes(vectorText('ILLUSTRATIVE DIAGRAM · NOT A PRODUCT PHOTO', 103, 787, 3, '#9bb4be')))
    throw new Error('Mandatory disclaimer is not stable vector geometry');
  const temporary = mkdtempSync(join(tmpdir(), 'bodich-art-approval-test-'));
  try {
    const publicDir = join(temporary, 'images/catalog');
    mkdirSync(publicDir, { recursive: true });
    const fakeArt = Buffer.from('UNAPPROVED-CI-DRAFT-BYTES', 'utf8');
    const digest = createHash('sha256').update(fakeArt).digest('hex');
    const testAsset = join(publicDir, 'renamed.webp');
    writeFileSync(testAsset, fakeArt);
    const map = new Map([[digest, { sourceId: manifest.entries[0].sourceId,
      approved: false, rights: 'pending' }]]);
    if (!publishedDraftProblems(temporary, map).some((issue) =>
      issue.includes('Unapproved draft asset published by byte match')))
      throw new Error('Renamed draft asset bypassed public-image gate');
    map.set(digest, { ...map.get(digest), approved: true, rights: 'cleared' });
    if (publishedDraftProblems(temporary, map).length)
      throw new Error('Cleared fixture asset incorrectly rejected');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log('Artwork manifest, publication gate and vector lettering fixtures passed.');
}
const errors = problems(manifest);
if (errors.length) { console.error(errors.slice(0, 40).join('\n')); process.exit(1); }
if (process.argv.includes('--self-test')) selfTest();
else if (process.argv.includes('--generate')) {
  await generate();
  const result = await inspectExports();
  if (result.length) { console.error(result.slice(0, 40).join('\n')); process.exit(1); }
} else if (process.argv.includes('--check')) {
  const result = await inspectExports();
  if (result.length) { console.error(result.slice(0, 40).join('\n')); process.exit(1); }
  console.log('Artwork export validation passed: ' + manifest.entries.length + ' references.');
} else {
  console.log('Artwork manifest validated: ' + manifest.entries.length +
    ' source references; all artwork unpublished, rights pending.');
}

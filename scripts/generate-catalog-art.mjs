/**
 * Unpublished, reproducible BODICH category illustrations for the source catalog.
 * Geometry is authored here; no vendor assets, photo scraping, or generative API.
 * The art is deliberately generic and may not be used as a product photograph.
 *
 * node scripts/generate-catalog-art.mjs --generate
 * node scripts/generate-catalog-art.mjs --check
 * node scripts/generate-catalog-art.mjs --self-test
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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
  const seen = new Set(), pathSet = new Set();
  for (const entry of data.entries ?? []) {
    if (!entry || !/^kt-(?:[1-9][0-9]*|sq-[A-Z0-9]+)$/.test(entry.sourceId) ||
        seen.has(entry.sourceId)) { errors.push('Duplicate or invalid art source ID'); continue; }
    seen.add(entry.sourceId);
    const source = originals.get(entry.sourceId), draft = drafts.get(entry.sourceId);
    if (!source || !draft || entry.sourceTitle !== source.sourceTitle ||
        entry.sourceUrl !== source.canonicalUrl ||
        entry.family !== familyFor(source, draft) || !allowedFamilies.has(entry.family))
      errors.push('Unmatched source, grouping, or editorial ID: ' + entry.sourceId);
    if (entry.status !== 'documented_illustrative_fallback' || entry.rights !== 'pending' ||
        entry.kind !== 'original_diagram' || entry.approved !== false ||
        entry.isProductPhoto !== false || entry.manufacturer !== 'KingTech' ||
        entry.brief?.length < 25 ||
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
  const serial = entry.sourceId.toUpperCase();
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">' +
    '<rect width="1200" height="900" fill="#0b1422"/>' +
    '<path d="M0 0 H1200 V900 H0 Z" fill="none" stroke="#344959" stroke-width="30"/>' +
    '<path d="M100 187 H1100 M100 698 H1100" stroke="#324c5d" stroke-width="5"/>' +
    '<rect x="100" y="117" width="16" height="35" fill="#d48958"/>' +
    '<g font-family="DejaVu Sans, sans-serif" fill="#e4ecf1">' +
    '<text x="140" y="151" font-size="31" font-weight="bold">BODICH / VISUAL STUDY</text>' +
    '<text x="103" y="754" font-size="31" font-weight="bold">' + label + '</text>' +
    '<text x="103" y="809" font-size="25" fill="#9bb4be">ILLUSTRATIVE DIAGRAM · NOT A PRODUCT PHOTO</text>' +
    '<text x="1018" y="153" text-anchor="end" font-size="30" fill="#d68a59">' + serial + '</text>' +
    '</g><g opacity=".75">' + lines + '</g><g>' + art + '</g>' +
    '<path d="M100 845 H1100" stroke="#cd8054" stroke-width="5"/></svg>';
}
async function inspectExports() {
  const errors = [];
  const expected = new Set();
  for (const entry of manifest.entries) {
    for (const [key, [width, height, ext]] of Object.entries(sizes)) {
      const path = resolve(entry.assets[key]);
      expected.add(path);
      if (!existsSync(path)) { errors.push('Missing raster: ' + entry.sourceId + '/' + key); continue; }
      try {
        const stat = statSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CATALOG_IMAGE_BYTES) {
          errors.push('Oversized or unsafe raster: ' + path); continue;
        }
        const bytes = readFileSync(path);
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
    const columns = 4, width = 300, height = 225, rows = Math.ceil(entries.length / columns);
    const images = [];
    for (let i = 0; i < entries.length; i++) {
      images.push({ input: await sharp(readFileSync(entries[i].assets.webp360))
        .resize({ width, height, fit: 'fill' }).toBuffer(),
        top: Math.floor(i / columns) * height, left: (i % columns) * width });
    }
    await sharp({ create: { width: columns * width, height: rows * height,
      channels: 4, background: '#0b1422' } }).composite(images)
      .png({ compressionLevel: 9 }).toFile(resolve(boardRoot, family + '.png'));
  }
  console.log('Generated ' + manifest.entries.length + ' distinct category diagrams, ' +
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
  ];
  for (const mutate of cases) {
    const m = clone();
    mutate(m);
    if (!problems(m).length) throw new Error('Negative artwork fixture escaped');
  }
  console.log('Artwork manifest negative fixtures passed.');
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

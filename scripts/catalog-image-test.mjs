import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectRaster, MAX_CATALOG_IMAGE_BYTES } from './catalog-image.mjs';
import {
  CI_PNG_BASE64, CI_VP8_WEBP_BASE64, CI_VP8L_WEBP_BASE64, CI_JPEG_BASE64,
} from './catalog-fixtures.mjs';

function webpChunk(type, payload) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, ...(payload.length & 1 ? [Buffer.from([0])] : [])]);
}
function webpFile(...chunks) {
  const payload = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
function pngChunk(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload, Buffer.alloc(4)]);
}

export function runImageSelfTest({ fail, validateImage, checkUnapprovedFiles, validIsoDate }) {
  const original = {
    png: Buffer.from(CI_PNG_BASE64, 'base64'),
    vp8: Buffer.from(CI_VP8_WEBP_BASE64, 'base64'),
    vp8l: Buffer.from(CI_VP8L_WEBP_BASE64, 'base64'),
    jpeg: Buffer.from(CI_JPEG_BASE64, 'base64'),
  };
  const extendedHeader = Buffer.alloc(10); // VP8X canvas 1x1
  const extendedWebp = webpFile(webpChunk('VP8X', extendedHeader), original.vp8.subarray(12));

  const cases = [
    ['PNG', original.png, 'png'],
    ['WebP VP8 lossy', original.vp8, 'webp'],
    ['WebP VP8L lossless', original.vp8l, 'webp'],
    ['WebP VP8X extended', extendedWebp, 'webp'],
    ['JPEG baseline', original.jpeg, 'jpg'],
  ];
  for (const [label, buffer, ext] of cases) {
    const info = inspectRaster(buffer, ext);
    if (!info || info.width !== 1 || info.height !== 1 || info.privateMetadata) {
      fail(label + ' 1x1 fixture should pass raster validation');
    }
    if (inspectRaster(buffer.subarray(0, Math.min(18, buffer.length)), ext)) {
      fail(label + ' truncated file was accepted');
    }
    const corrupt = Buffer.from(buffer);
    corrupt[0] = 0;
    if (inspectRaster(corrupt, ext)) fail(label + ' invalid signature was accepted');
  }
  const withExif = Buffer.concat([
    original.jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1, 0, 8]),
    Buffer.from('Exif\0\0', 'binary'),
    original.jpeg.subarray(2),
  ]);
  if (!inspectRaster(withExif, 'jpeg')?.privateMetadata) fail('JPEG EXIF metadata not detected');
  const withPngText = Buffer.concat([
    original.png.subarray(0, 33),
    pngChunk('tEXt', Buffer.from('GPSInfo\0value', 'binary')),
    original.png.subarray(33),
  ]);
  if (!inspectRaster(withPngText, 'png')?.privateMetadata) fail('PNG text metadata not detected');
  const withWebpExif = webpFile(original.vp8.subarray(12), webpChunk('EXIF', Buffer.from('GPS0')));
  if (!inspectRaster(withWebpExif, 'webp')?.privateMetadata) fail('WebP EXIF metadata not detected');
  const webpFlags = Buffer.from(extendedHeader);
  webpFlags[0] = 0x08;
  if (!inspectRaster(webpFile(webpChunk('VP8X', webpFlags), original.vp8.subarray(12)), 'webp')
    ?.privateMetadata) fail('WebP metadata flag not detected');

  const root = mkdtempSync(join(tmpdir(), 'bodich-catalog-image-check-'));
  try {
    const dir = join(root, 'images', 'catalog');
    mkdirSync(dir, { recursive: true });
    const valid = { src: '/images/catalog/fixture.png', width: 1, height: 1,
      alt: { en: 'Test product photo', ro: 'Fotografie produs test' } };
    writeFileSync(join(dir, 'fixture.png'), original.png);
    for (const [label, buffer, extension] of cases.slice(1)) {
      writeFileSync(join(dir, 'fixture.' + extension), buffer);
    }
    const problems = [];
    const report = (message) => problems.push(message);
    validateImage(valid, 'fixture', report, root);
    if (problems.length) fail('Valid PNG photo rejected: ' + problems.join('; '));

    const invalid = [
      ['missing file', { ...valid, src: '/images/catalog/no-file.png' }],
      ['concept path', { ...valid, src: '/images/turbines/concept.webp' }],
      ['unsafe path', { ...valid, src: '/../README.md' }],
      ['double slash', { ...valid, src: '/images/catalog//fixture.png' }],
      ['upper extension', { ...valid, src: '/images/catalog/fixture.PNG' }],
      ['missing EN alt', { ...valid, alt: { en: '', ro: 'Test' } }],
      ['missing RO alt', { ...valid, alt: { en: 'Test', ro: '' } }],
      ['negative width', { ...valid, width: -5 }],
      ['zero height', { ...valid, height: 0 }],
      ['fractional width', { ...valid, width: 1.5 }],
      ['wrong dimensions', { ...valid, width: 2 }],
    ];
    for (const [name, image] of invalid) {
      const errors = [];
      validateImage(image, 'fixture', message => errors.push(message), root);
      if (!errors.length) fail('Invalid photo accepted: ' + name);
    }
    // Every raster format is tested through the same validation used by intake.
    for (const [name, bytes, ext] of cases.slice(1)) {
      const errors = [];
      validateImage({ ...valid, src: '/images/catalog/fixture.' + ext },
        name, message => errors.push(message), root);
      if (errors.length) fail(name + ' rejected: ' + errors.join('; '));
    }
    writeFileSync(join(dir, 'large.png'), Buffer.alloc(MAX_CATALOG_IMAGE_BYTES + 1));
    const tooLarge = [];
    validateImage({ ...valid, src: '/images/catalog/large.png' },
      'oversize', message => tooLarge.push(message), root);
    if (!tooLarge.some(x => x.includes('5 MiB'))) fail('Oversized catalog file was accepted');

    const metadataCases = [
      ['photo-exif.jpeg', withExif],
      ['photo-text.png', withPngText],
      ['photo-exif.webp', withWebpExif],
    ];
    for (const [filename, bytes] of metadataCases) {
      writeFileSync(join(dir, filename), bytes);
      const issues = [];
      validateImage({ ...valid, src: '/images/catalog/' + filename }, filename,
        message => issues.push(message), root);
      if (!issues.some(x => x.includes('metadata'))) fail('EXIF/GPS guard failed for ' + filename);
    }

    const orphan = [];
    checkUnapprovedFiles(root, new Set(), message => orphan.push(message));
    if (!orphan.some(x => x.includes('unreferenced'))) fail('Unreferenced public photos were accepted');
    const refs = new Set(['fixture.png', 'fixture.webp', 'fixture.jpg', 'large.png',
      'photo-exif.jpeg', 'photo-text.png', 'photo-exif.webp']
      .map(x => '/images/catalog/' + x));
    const clean = [];
    checkUnapprovedFiles(root, refs, message => clean.push(message));
    if (clean.length) fail('Approved-path files incorrectly flagged: ' + clean.join('; '));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  for (const date of ['2099-01-01', '2026-02-30', '2026-1-01']) {
    if (validIsoDate(date)) fail('Invalid or future date accepted: ' + date);
  }
  if (!validIsoDate('2020-01-01')) fail('Valid date rejected');
}

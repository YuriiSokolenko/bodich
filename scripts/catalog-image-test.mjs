import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectRaster, MAX_CATALOG_IMAGE_BYTES } from './catalog-image.mjs';
import {
  CI_PNG_BASE64, CI_VP8_WEBP_BASE64, CI_VP8L_WEBP_BASE64, CI_JPEG_BASE64,
  CI_PROGRESSIVE_JPEG_BASE64,
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
    progressive: Buffer.from(CI_PROGRESSIVE_JPEG_BASE64, 'base64'),
  };
  const extendedHeader = Buffer.alloc(10); // VP8X canvas 1x1
  const extendedWebp = webpFile(webpChunk('VP8X', extendedHeader), original.vp8.subarray(12));

  const cases = [
    ['PNG', original.png, 'png'],
    ['WebP VP8 lossy', original.vp8, 'webp'],
    ['WebP VP8L lossless', original.vp8l, 'webp'],
    ['WebP VP8X extended', extendedWebp, 'webp'],
    ['JPEG baseline', original.jpeg, 'jpg'],
    ['JPEG progressive', original.progressive, 'jpeg'],
  ];
  const namedFiles = cases.slice(1).map(([label, buffer, extension]) => ({
    label, buffer, extension,
    filename: 'fixture-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.' + extension,
  }));
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
  function jpegSegment(marker, contents) {
    const length = contents.length + 2;
    const header = Buffer.alloc(4);
    header[0] = 0xff;
    header[1] = marker;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, contents]);
  }
  const jpegComment = jpegSegment(0xfe, Buffer.from('Owner: Demo Coordinates: 0,0'));
  const beforeSos = original.jpeg.indexOf(Buffer.from([0xff, 0xda]));
  if (beforeSos < 0) fail('Baseline JPEG fixture missing SOS');
  const withComment = Buffer.concat([
    original.jpeg.subarray(0, beforeSos), jpegComment, original.jpeg.subarray(beforeSos),
  ]);
  if (!inspectRaster(withComment, 'jpg')?.privateMetadata) fail('JPEG COM private text was not detected');
  // A synthetic second scan checks entropy byte-stuffing/restarts and APP1 between scans.
  const sosSize = original.jpeg.readUInt16BE(beforeSos + 2);
  const scanHeader = original.jpeg.subarray(beforeSos, beforeSos + 2 + sosSize);
  const twoScans = Buffer.concat([
    original.jpeg.subarray(0, original.jpeg.length - 2),
    jpegSegment(0xe1, Buffer.from('Exif\0\0', 'binary')),
    scanHeader,
    Buffer.from([0x31, 0xff, 0x00, 0x32, 0xff, 0xd0, 0x33]),
    original.jpeg.subarray(original.jpeg.length - 2),
  ]);
  const twoScanInfo = inspectRaster(twoScans, 'jpg');
  if (!twoScanInfo || !twoScanInfo.privateMetadata ||
      twoScanInfo.width !== 1 || twoScanInfo.height !== 1) {
    fail('JPEG metadata between scans or JPEG entropy escape/restart was not detected');
  }
  for (const [label, buffer] of [
    ['trailing bytes after EOI', Buffer.concat([original.jpeg, Buffer.from('secret')])],
    ['truncated EOI', original.jpeg.subarray(0, original.jpeg.length - 2)],
    ['COM without EOI', withComment.subarray(0, withComment.length - 2)],
  ]) {
    if (inspectRaster(buffer, 'jpg')) fail('JPEG accepted ' + label);
  }
  if (!inspectRaster(original.jpeg, 'JPG')) fail('Uppercase inspector extension was rejected');

  // Marker allowlist: regular JFIF is fine; ICC and Adobe profile segments
  // are fine; unfamiliar APPn payloads and JPEG comments are not.
  const applicationSegments = [
    ['APP3 text', 0xe3, 'Private serial'],
    ['APP12 text', 0xec, 'Maker identifier'],
    ['APP0 unexpected payload', 0xe0, 'User info'],
    ['APP2 unexpected payload', 0xe2, 'Camera serial'],
    ['APP14 unexpected payload', 0xee, 'User name'],
  ];
  applicationSegments.push(
    ['JFXX thumbnail', 0xe0, 'JFXX\0embedded-thumbnails'],
    ['JPEG reserved JPG extension', 0xc8, 'Owner note'],
    ['JPEG JPGn extension', 0xf1, 'Serial number'],
  );
  for (const [label, marker, payload] of applicationSegments) {
    const bytes = Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      jpegSegment(marker, Buffer.from(payload)),
      original.jpeg.subarray(beforeSos),
    ]);
    if (!inspectRaster(bytes, 'jpg')?.privateMetadata) fail(label + ' was not flagged as private metadata');
  }
  // JFIF's 14-byte payload has no thumbnail; Adobe's is 12 bytes.
  // ICC is a complete single-chunk profile with 132-byte header/table and
  // recognized 'acsp' signature. The gate is not an ICC metadata scrubber.
  const jfif = Buffer.from([
    ...Buffer.from('JFIF\0', 'ascii'), 1, 1, 0, 0, 1, 0, 1, 0, 0,
  ]);
  const adobe = Buffer.from([
    ...Buffer.from('Adobe', 'ascii'), 0, 100, 0, 0, 0, 0, 1,
  ]);
  const iccBody = Buffer.alloc(132);
  iccBody.writeUInt32BE(132, 0);
  iccBody.write('acsp', 36, 'ascii');
  const icc = Buffer.concat([Buffer.from('ICC_PROFILE\0', 'ascii'),
    Buffer.from([1, 1]), iccBody]);

  // One actual tag whose data starts precisely after its directory.
  // The header and tag table are structural only; the tag contents are
  // intentionally not interpreted as proof of metadata sanitization.
  const taggedIccBody = Buffer.alloc(148);
  taggedIccBody.writeUInt32BE(taggedIccBody.length, 0);
  taggedIccBody.write('acsp', 36, 'ascii');
  taggedIccBody.writeUInt32BE(1, 128);
  taggedIccBody.write('desc', 132, 'ascii');
  taggedIccBody.writeUInt32BE(144, 136);
  taggedIccBody.writeUInt32BE(4, 140);
  taggedIccBody.write('test', 144, 'ascii');
  const taggedIcc = Buffer.concat([
    Buffer.from('ICC_PROFILE\0', 'ascii'), Buffer.from([1, 1]), taggedIccBody,
  ]);

  function paddedIccPayload(profileSize) {
    const profile = Buffer.alloc(profileSize);
    profile.writeUInt32BE(profile.length, 0);
    profile.write('acsp', 36, 'ascii');
    return Buffer.concat([
      Buffer.from('ICC_PROFILE\0', 'ascii'), Buffer.from([1, 1]), profile,
    ]);
  }
  // Both profiles have consistent header-declared sizes and tag counts.
  // Thus only the explicit 32 KiB limit separates their acceptance.
  const iccAtCap = paddedIccPayload(32 * 1024 - 14);
  const iccOverCap = paddedIccPayload(32 * 1024 - 14 + 1);

  for (const [label, marker, payload] of [
    ['JFIF', 0xe0, jfif],
    ['ICC profile', 0xe2, icc],
    ['ICC profile with valid tag', 0xe2, taggedIcc],
    ['ICC profile at 32 KiB limit', 0xe2, iccAtCap],
    ['Adobe', 0xee, adobe],
  ]) {
    // The baseline JPEG already has a JFIF APP0 as its first segment; a
    // second JFIF is intentionally rejected, so test its existing instance.
    const bytes = marker === 0xe0 ? original.jpeg : Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      jpegSegment(marker, payload),
      original.jpeg.subarray(beforeSos),
    ]);
    const result = inspectRaster(bytes, 'jpg');
    if (!result || result.privateMetadata) fail('Allowed ' + label + ' APP segment was rejected');
  }

  for (const [label, marker, payload] of [
    ['second JFIF', 0xe0, jfif],
    ['duplicate Adobe', 0xee, adobe],
    ['duplicate ICC', 0xe2, icc],
  ]) {
    const segments = marker === 0xe0 ? [jpegSegment(marker, payload)] :
      [jpegSegment(marker, payload), jpegSegment(marker, payload)];
    const bytes = Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      ...segments,
      original.jpeg.subarray(beforeSos),
    ]);
    if (!inspectRaster(bytes, 'jpg')?.privateMetadata) {
      fail('Repeated JPEG APP segment bypassed metadata gate: ' + label);
    }
  }

  // An otherwise valid JFIF APP0 cannot be moved after quantization tables.
  if (original.jpeg[2] !== 0xff || original.jpeg[3] !== 0xe0) fail('Expected leading JFIF APP0');
  const firstAppEnd = 4 + original.jpeg.readUInt16BE(4);
  const withoutApp0 = Buffer.concat([
    original.jpeg.subarray(0, 2), original.jpeg.subarray(firstAppEnd),
  ]);
  const laterSos = withoutApp0.indexOf(Buffer.from([0xff, 0xda]));
  if (laterSos < 0) fail('Cannot locate SOS in JFIF-free test image');
  const misplacedJfif = Buffer.concat([
    withoutApp0.subarray(0, laterSos),
    jpegSegment(0xe0, jfif),
    withoutApp0.subarray(laterSos),
  ]);
  if (!inspectRaster(misplacedJfif, 'jpg')?.privateMetadata) {
    fail('Out-of-order JFIF should be flagged');
  }

  // A valid prefix by itself must not exempt arbitrary trailing content.
  const badAppPayloads = [
    ['JFIF with appended text', 0xe0, Buffer.concat([jfif, Buffer.from('Owner: Alice')])],
    ['JFIF thumbnail', 0xe0, Buffer.from([...jfif.subarray(0, 12), 1, 1])],
    ['JFIF short segment', 0xe0, jfif.subarray(0, 12)],
    ['Adobe with appended text', 0xee, Buffer.concat([adobe, Buffer.from('GPS')])],
    ['Adobe short segment', 0xee, adobe.subarray(0, 10)],
    ['ICC with trailing note', 0xe2, Buffer.concat([icc, Buffer.from('Owner')])],
    ['ICC missing acsp signature', 0xe2, (() => {
      const bad = Buffer.from(icc);
      bad.fill(0, 14 + 36, 14 + 40);
      return bad;
    })()],
    ['ICC multi-chunk profile', 0xe2, (() => {
      const bad = Buffer.from(icc);
      bad[13] = 2;
      return bad;
    })()],
    ['ICC over 32 KiB (consistent profile size)', 0xe2, iccOverCap],
    ['ICC tag points inside directory', 0xe2, (() => {
      const bad = Buffer.from(taggedIcc);
      bad.writeUInt32BE(140, 14 + 136);
      return bad;
    })()],
  ];
  for (const [label, marker, payload] of badAppPayloads) {
    const bytes = Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      jpegSegment(marker, payload),
      original.jpeg.subarray(beforeSos),
    ]);
    if (!inspectRaster(bytes, 'jpg')?.privateMetadata) {
      fail('Potential JPEG metadata bypass: ' + label);
    }
  }

  // Known structural markers must follow their internal layouts. A standalone
  // length-prefixed segment containing text must never look like an innocent
  // quantization, Huffman, arithmetic-conditioning, restart or scan segment.
  const injectedText = Buffer.from('Owner: Alice, serial 12345');
  for (const [label, marker] of [
    ['DQT', 0xdb], ['DHT', 0xc4], ['DAC', 0xcc],
    ['DRI', 0xdd], ['DNL', 0xdc], ['SOS', 0xda],
  ]) {
    const bytes = Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      jpegSegment(marker, injectedText),
      original.jpeg.subarray(beforeSos),
    ]);
    const result = inspectRaster(bytes, 'jpg');
    if (result && !result.privateMetadata) fail('JPEG ' + label + ' accepted private text payload');
  }

  // Positive structural cases ensure the hardening does not simply block all
  // legal segments. The existing JPEGs also cover real DQT/DHT/SOS tables.
  const dqtTable = Buffer.from([0, ...Array(64).fill(1)]);
  const dhtTable = Buffer.from([0, 1, ...Array(15).fill(0), 0]);
  const conditioning = Buffer.from([0x00, 0x11]);
  const standardDcConditioning = Buffer.from([0x00, 0x10]);
  for (const [label, marker, payload] of [
    ['DQT', 0xdb, dqtTable],
    ['DHT', 0xc4, dhtTable],
    ['DAC', 0xcc, conditioning],
    ['DAC DC L=0 U=1', 0xcc, standardDcConditioning],
    ['DRI', 0xdd, Buffer.from([0, 0])],
    ['DNL', 0xdc, Buffer.from([0, 1])],
  ]) {
    const bytes = Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      jpegSegment(marker, payload),
      original.jpeg.subarray(beforeSos),
    ]);
    const result = inspectRaster(bytes, 'jpg');
    if (!result || result.privateMetadata) fail('Valid JPEG ' + label + ' structural segment was rejected');

    const smuggled = Buffer.concat([
      original.jpeg.subarray(0, beforeSos),
      jpegSegment(marker, Buffer.concat([payload, injectedText])),
      original.jpeg.subarray(beforeSos),
    ]);
    const badResult = inspectRaster(smuggled, 'jpg');
    if (badResult && !badResult.privateMetadata) {
      fail('JPEG ' + label + ' accepted trailing text after a valid structural table');
    }
  }
  // For DAC DC, the low nibble is L and the high nibble is U.
  // 0x10 (L=0,U=1) is legal; 0x01 (L=1,U=0) must fail closed.
  const reversedConditioning = Buffer.from([0x00, 0x01]);
  const invalidDac = Buffer.concat([
    original.jpeg.subarray(0, beforeSos),
    jpegSegment(0xcc, reversedConditioning),
    original.jpeg.subarray(beforeSos),
  ]);
  if (inspectRaster(invalidDac, 'jpg')) {
    fail('Invalid DAC DC conditioning L>U was accepted');
  }
    const originalSosPayload = original.jpeg.subarray(beforeSos + 4, beforeSos + 2 + sosSize);
  const modifiedSos = Buffer.concat([
    original.jpeg.subarray(0, beforeSos),
    jpegSegment(0xda, Buffer.concat([originalSosPayload, injectedText])),
    original.jpeg.subarray(beforeSos + 2 + sosSize),
  ]);
  if (inspectRaster(modifiedSos, 'jpg')) fail('SOS accepted appended free-form data');

  // A JPEG frame must have consistent dimensions across multiple SOF
  // segments, and a frame without SOS must not pass as a real image.
  const sofAt = original.jpeg.indexOf(Buffer.from([0xff, 0xc0]));
  if (sofAt < 0) fail('Baseline JPEG fixture missing SOF0');
  const sofSize = original.jpeg.readUInt16BE(sofAt + 2);
  const conflictingSof = Buffer.from(original.jpeg.subarray(sofAt, sofAt + 2 + sofSize));
  conflictingSof.writeUInt16BE(2, 7); // SOF width is at marker + 7.
  const contradictoryFrames = Buffer.concat([
    original.jpeg.subarray(0, beforeSos), conflictingSof, original.jpeg.subarray(beforeSos),
  ]);
  if (inspectRaster(contradictoryFrames, 'jpeg')) fail('Conflicting JPEG SOF dimensions accepted');
  const noScan = Buffer.concat([
    original.jpeg.subarray(0, beforeSos), Buffer.from([0xff, 0xd9]),
  ]);
  if (inspectRaster(noScan, 'jpeg')) fail('SOS-less JPEG accepted');

  // JPEG marker fill bytes (FF FF) are allowed before segment markers
  // and between entropy-coded pixels and EOI.
  const filledHeader = Buffer.concat([
    original.jpeg.subarray(0, beforeSos + 1), Buffer.from([0xff]),
    original.jpeg.subarray(beforeSos + 1),
  ]);
  const filledEntropy = Buffer.concat([
    original.jpeg.subarray(0, original.jpeg.length - 2), Buffer.from([0xff]),
    original.jpeg.subarray(original.jpeg.length - 2),
  ]);
  if (!inspectRaster(filledHeader, 'jpg') || !inspectRaster(filledEntropy, 'jpg')) {
    fail('JPEG marker fill bytes were rejected');
  }
  // Count complete SOS segments in the JPEG marker walker, not raw FF DA
  // byte pairs, to keep the fixture regression tied to parser semantics.
  const realProgressive = inspectRaster(original.progressive, 'jpg');
  if (realProgressive?.scans !== 10) {
    fail('Progressive JPEG fixture must contain ten parsed scans, got ' + realProgressive?.scans);
  }
  if (!realProgressive || realProgressive.privateMetadata ||
      realProgressive.width !== 1 || realProgressive.height !== 1) {
    fail('Real multi-scan progressive JPEG fixture was rejected');
  }

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
    // Separate filenames so VP8, VP8L and VP8X are each tested end-to-end.
    for (const { filename, buffer } of namedFiles) {
      writeFileSync(join(dir, filename), buffer);
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
    for (const { label, filename } of namedFiles) {
      const errors = [];
      validateImage({ ...valid, src: '/images/catalog/' + filename },
        label, message => errors.push(message), root);
      if (errors.length) fail(label + ' rejected: ' + errors.join('; '));
    }
    writeFileSync(join(dir, 'large.png'), Buffer.alloc(MAX_CATALOG_IMAGE_BYTES + 1));
    const tooLarge = [];
    validateImage({ ...valid, src: '/images/catalog/large.png' },
      'oversize', message => tooLarge.push(message), root);
    if (!tooLarge.some(x => x.includes('5 MiB'))) fail('Oversized catalog file was accepted');

    const metadataCases = [
      ['photo-exif.jpeg', withExif],
      ['photo-comment.jpg', withComment],
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
    const refs = new Set(['fixture.png', ...namedFiles.map(({ filename }) => filename),
      'large.png', 'photo-exif.jpeg', 'photo-comment.jpg', 'photo-text.png', 'photo-exif.webp']
      .map(x => '/images/catalog/' + x));
    const clean = [];
    checkUnapprovedFiles(root, refs, message => clean.push(message));
    if (clean.length) fail('Approved-path files incorrectly flagged: ' + clean.join('; '));
    writeFileSync(join(dir, '.DS_Store'), Buffer.from('Finder metadata'));
    const hidden = [];
    checkUnapprovedFiles(root, refs, message => hidden.push(message));
    if (!hidden.some(x => x.includes('Remove hidden local file') && x.includes('.DS_Store'))) {
      fail('macOS hidden-file cleanup error was not actionable');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  for (const date of ['2099-01-01', '2026-02-30', '2026-1-01']) {
    if (validIsoDate(date)) fail('Invalid or future date accepted: ' + date);
  }
  if (!validIsoDate('2020-01-01')) fail('Valid date rejected');
}

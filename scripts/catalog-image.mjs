/**
 * Dependency-free raster header and common private-metadata validation.
 * This is a prepublication guard, not a full image decoder or authenticity test.
 */
export const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;

const isPng = (bytes) =>
  bytes.length >= 33 &&
  bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));

function inspectPng(bytes) {
  if (!isPng(bytes)) return null;
  let offset = 8;
  let width = 0, height = 0, privateMetadata = false, sawEnd = false, first = true;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12) return null;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const payload = offset + 8;
    if (first && (type !== 'IHDR' || size !== 13)) return null;
    first = false;
    if (type === 'IHDR') {
      if (size !== 13) return null;
      width = bytes.readUInt32BE(payload);
      height = bytes.readUInt32BE(payload + 4);
    }
    // Reject EXIF and text chunks, which can embed location/identity metadata.
    if (['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(type)) privateMetadata = true;
    offset += size + 12;
    if (type === 'IEND') {
      if (size !== 0 || offset !== bytes.length) return null;
      sawEnd = true;
      break;
    }
  }
  return sawEnd && width && height ? { width, height, privateMetadata } : null;
}

function inspectWebp(bytes) {
  if (bytes.length < 20 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP' ||
      bytes.readUInt32LE(4) !== bytes.length - 8) return null;
  let offset = 12, width = 0, height = 0, privateMetadata = false, sawImage = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const padded = size + (size & 1);
    if (padded > bytes.length - payload) return null;
    if (type === 'EXIF' || type === 'XMP ') privateMetadata = true;
    if (type === 'VP8X') {
      if (size < 10) return null;
      if (bytes[payload] & 0x0c) privateMetadata = true;
      width = 1 + bytes.readUIntLE(payload + 4, 3);
      height = 1 + bytes.readUIntLE(payload + 7, 3);
    } else if (type === 'VP8L') {
      if (size < 5 || bytes[payload] !== 0x2f) return null;
      width = 1 + (bytes[payload + 1] | ((bytes[payload + 2] & 0x3f) << 8));
      height = 1 + (((bytes[payload + 2] & 0xc0) >> 6) |
        (bytes[payload + 3] << 2) | ((bytes[payload + 4] & 0x0f) << 10));
      sawImage = true;
    } else if (type === 'VP8 ') {
      if (size < 10 || bytes[payload + 3] !== 0x9d ||
          bytes[payload + 4] !== 0x01 || bytes[payload + 5] !== 0x2a) return null;
      width = width || (bytes.readUInt16LE(payload + 6) & 0x3fff);
      height = height || (bytes.readUInt16LE(payload + 8) & 0x3fff);
      sawImage = true;
    } else if (type === 'ANIM' || type === 'ANMF') {
      // Reject animations for product photographs.
      return null;
    }
    offset = payload + padded;
  }
  return offset === bytes.length && sawImage && width && height
    ? { width, height, privateMetadata } : null;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_STRUCTURAL_MARKERS = new Set([
  0xc4, // DHT
  0xcc, // DAC
  0xda, // SOS
  0xdb, // DQT
  0xdc, // DNL
  0xdd, // DRI
]);

/**
 * Validate entire JPEG structural payloads, not only their marker IDs.
 * A free-form text segment must not be laundered through DHT/DQT/DAC/etc.
 * Pixel/entropy correctness remains the image exporter's responsibility.
 */
function validJpegStructuralSegment(marker, payload) {
  if (marker === 0xdd) return payload.length === 2; // DRI, 16-bit interval.
  if (marker === 0xdc) return payload.length === 2 && payload.readUInt16BE(0) !== 0; // DNL.

  if (marker === 0xda) { // SOS: Ns + 2*Ns selectors + Ss/Se/AhAl.
    if (payload.length < 6) return false;
    const components = payload[0];
    if (components < 1 || components > 4 || payload.length !== 1 + components * 2 + 3) return false;
    for (let i = 0; i < components; i++) {
      const tables = payload[2 + i * 2];
      if ((tables >> 4) > 3 || (tables & 0x0f) > 3) return false;
    }
    const ss = payload[1 + components * 2];
    const se = payload[2 + components * 2];
    const ahAl = payload[3 + components * 2];
    return ss <= se && se <= 63 && (ahAl >> 4) <= 13 && (ahAl & 0x0f) <= 13;
  }

  let offset = 0;
  if (!payload.length) return false;

  if (marker === 0xdb) { // DQT: Pq/Tq followed by 64 quantizers.
    while (offset < payload.length) {
      const spec = payload[offset++];
      const precision = spec >> 4;
      if (precision > 1 || (spec & 0x0f) > 3) return false;
      const size = precision ? 128 : 64;
      if (size > payload.length - offset) return false;
      offset += size;
    }
    return offset === payload.length;
  }

  if (marker === 0xc4) { // DHT: Tc/Th, 16 code-length counts, then symbols.
    while (offset < payload.length) {
      if (payload.length - offset < 17) return false;
      const spec = payload[offset++];
      if ((spec >> 4) > 1 || (spec & 0x0f) > 3) return false;
      let symbols = 0;
      let availableCodes = 1;
      for (let i = 0; i < 16; i++) {
        const count = payload[offset++];
        symbols += count;
        availableCodes = availableCodes * 2 - count;
        if (availableCodes < 0) return false;
      }
      if (symbols < 1 || symbols > 256 || symbols > payload.length - offset) return false;
      offset += symbols;
    }
    return offset === payload.length;
  }

  if (marker === 0xcc) { // DAC: one or more two-byte Tc/Th, conditioning pairs.
    if (payload.length % 2 !== 0) return false;
    for (let i = 0; i < payload.length; i += 2) {
      const spec = payload[i];
      const conditioner = payload[i + 1];
      if ((spec >> 4) > 1 || (spec & 0x0f) > 3) return false;
      if (spec >> 4) {
        if (conditioner > 63) return false;
      } else if ((conditioner >> 4) > (conditioner & 0x0f)) return false;
    }
    return true;
  }

  return false;
}
const MAX_ICC_JPEG_SEGMENT_BYTES = 32 * 1024;

/**
 * Only bounded, recognizable exchange/profile blocks bypass the metadata
 * warning. Prefix-only acceptance is unsafe: APP0/JFXX may include a
 * thumbnail, and APPn blocks can embed arbitrary text or serial numbers.
 *
 * This is defense-in-depth, not a proof that an ICC profile is free of
 * identifying content. All public images still require manual approval.
 */
function allowedJpegAppSegment(marker, payload) {
  if (marker === 0xe0) {
    const isJfif = payload.subarray(0, 5).equals(Buffer.from('JFIF\0', 'ascii'));
    // JPEG length field = 16, payload = 14 bytes. Last two are thumbnail
    // width and height: both must be zero.
    return isJfif && payload.length === 14 && payload[12] === 0 && payload[13] === 0;
  }
  if (marker === 0xee) {
    // Adobe APP14: marker length field = 14, payload = 12 bytes.
    return payload.length === 12 && payload.subarray(0, 5).equals(Buffer.from('Adobe', 'ascii'));
  }
  if (marker === 0xe2) {
    const prefix = Buffer.from('ICC_PROFILE\0', 'ascii');
    if (payload.length < 14 + 132 || payload.length > MAX_ICC_JPEG_SEGMENT_BYTES
        || !payload.subarray(0, prefix.length).equals(prefix)) return false;
    // One complete, plausibly structured ICC profile. Multi-part profiles
    // must be re-exported as a clean sRGB image before publication.
    if (payload[12] !== 1 || payload[13] !== 1) return false;
    const profile = payload.subarray(14);
    if (profile.readUInt32BE(0) !== profile.length ||
        profile.toString('ascii', 36, 40) !== 'acsp') return false;
    const tagCount = profile.readUInt32BE(128);
    if (132 + tagCount * 12 > profile.length) return false;
    // Reject malformed tag offsets/lengths; do not attempt full ICC decoding.
    for (let i = 0; i < tagCount; i++) {
      const table = 132 + i * 12;
      const start = profile.readUInt32BE(table + 4);
      const length = profile.readUInt32BE(table + 8);
      if (start < 128 || length > profile.length - start) return false;
    }
    return true;
  }
  // JFXX and all other APPn blocks may contain embedded photos or metadata.
  return false;
}

/**
 * Scan JPEG markers, including all entropy-coded scan segments.
 *
 * Marker bytes inside compressed data can be escaped as FF 00; restart
 * markers (FF D0...D7) are part of that stream. An actual marker after SOS
 * can begin another scan, a metadata/comment segment, or terminate in EOI.
 * Reject missing EOI, trailing bytes, and truncated marker segments.
 *
 * This inspects structure + common metadata but is not a pixel decoder.
 */
function inspectJpeg(bytes) {
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let width = 0, height = 0, privateMetadata = false, scans = 0;
  const seenAppMarkers = new Set();
  let seenHeaderMarker = false;

  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];

    if (marker === 0xd9) {
      // Reject appended payloads as well as headers that never reached a scan.
      return offset === bytes.length && width > 0 && height > 0 && scans > 0
        ? { width, height, privateMetadata, scans } : null;
    }
    // SOI, stuffed zero, and restart markers are never stand-alone headers.
    if (marker === 0xd8 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) return null;
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || length > bytes.length - offset) return null;

    const payload = bytes.subarray(offset + 2, offset + length);
    if (marker === 0xfe) privateMetadata = true; // JPEG COM text.
    else if (marker >= 0xe0 && marker <= 0xef) {
      // Only one JFIF, Adobe or complete ICC profile of each type.
      // JFIF is conventionally the first marker following SOI.
      if (seenAppMarkers.has(marker) || (marker === 0xe0 && seenHeaderMarker) ||
          !allowedJpegAppSegment(marker, payload)) privateMetadata = true;
      seenAppMarkers.add(marker);
    } else if (JPEG_STRUCTURAL_MARKERS.has(marker)) {
      if (!validJpegStructuralSegment(marker, payload)) return null;
    } else if (!JPEG_SOF_MARKERS.has(marker)) {
      // Reserved JPG/JPGn and otherwise unknown length-prefixed segments
      // can also carry free-form text or identifiers.
      privateMetadata = true;
    }
    seenHeaderMarker = true;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const nextHeight = bytes.readUInt16BE(offset + 3);
      const nextWidth = bytes.readUInt16BE(offset + 5);
      if (!nextWidth || !nextHeight || (width && (width !== nextWidth || height !== nextHeight))) return null;
      width = nextWidth;
      height = nextHeight;
    }

    offset += length;
    if (marker !== 0xda) continue;

    // Continue beyond SOS through the entropy-coded bytes instead of
    // stopping at the first scan (progressive JPEG may use several).
    scans++;
    let nextMarker = false;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) continue;
      const markerStart = offset - 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return null;
      const escaped = bytes[offset];
      if (escaped === 0x00 || (escaped >= 0xd0 && escaped <= 0xd7)) {
        offset++;
        continue;
      }
      offset = markerStart;
      nextMarker = true;
      break;
    }
    if (!nextMarker) return null;
  }
  return null;
}

export function inspectRaster(bytes, extension) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_CATALOG_IMAGE_BYTES) return null;
  // The production path convention is lowercase, but the reusable inspector
  // accepts case-insensitive extensions.
  extension = typeof extension === 'string' ? extension.toLowerCase() : '';
  if (extension === 'png') return inspectPng(bytes);
  if (extension === 'webp') return inspectWebp(bytes);
  if (extension === 'jpg' || extension === 'jpeg') return inspectJpeg(bytes);
  return null;
}

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

function inspectJpeg(bytes) {
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2, width = 0, height = 0, privateMetadata = false;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || length > bytes.length - offset) return null;
    if (marker === 0xe1 || marker === 0xed) privateMetadata = true;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
         0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      height = bytes.readUInt16BE(offset + 3);
      width = bytes.readUInt16BE(offset + 5);
    }
    // SOS marks the start of compressed pixels. Metadata in APP segments
    // has already been inspected; no need to decode entropy-coded data.
    if (marker === 0xda) return width && height ? { width, height, privateMetadata } : null;
    offset += length;
  }
  return null;
}

export function inspectRaster(bytes, extension) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_CATALOG_IMAGE_BYTES) return null;
  if (extension === 'png') return inspectPng(bytes);
  if (extension === 'webp') return inspectWebp(bytes);
  if (extension === 'jpg' || extension === 'jpeg') return inspectJpeg(bytes);
  return null;
}

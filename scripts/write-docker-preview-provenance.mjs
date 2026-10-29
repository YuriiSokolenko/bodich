import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { collectReleaseFiles, distManifestSha256 } from './lib/release-manifest.mjs';

const sourceSha = process.env.BODICH_GIT_SHA || 'UNKNOWN';
const sourceState = process.env.BODICH_SOURCE_STATE || 'UNKNOWN';
assert(sourceSha === 'UNKNOWN' || /^[0-9a-f]{40}$/.test(sourceSha), 'BODICH_GIT_SHA must be a full Git SHA or UNKNOWN');
assert(['clean', 'dirty', 'UNKNOWN'].includes(sourceState), 'BODICH_SOURCE_STATE must be clean, dirty, or UNKNOWN');
const files = collectReleaseFiles(resolve('dist'));
assert(files.length > 0, 'Release-safe dist is empty');
const provenance = {
  schemaVersion: 1,
  profile: 'release_safe',
  sourceSha,
  sourceState,
  distManifestSha256: distManifestSha256(files),
  distFileCount: files.length,
};
const destination = '/tmp/bodich-build-provenance.json';
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(provenance, null, 2) + '\n');
console.log('BODICH Docker build provenance: ' + JSON.stringify(provenance));

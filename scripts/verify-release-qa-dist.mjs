import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256, collectReleaseFiles, distManifestSha256 } from './lib/release-manifest.mjs';

const args = process.argv.slice(2);
const outputDir = resolve(process.env.QA_OUTPUT_DIR ?? 'visual-qa/release-qa');
const markerFile = join(outputDir, 'build-integrity.json');
const files = collectReleaseFiles(resolve('dist'));
const current = {
  sourceSha: execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim(),
  lockfileSha256: sha256(readFileSync('package-lock.json')),
  distManifestSha256: distManifestSha256(files),
  distFileCount: files.length,
};
if (args.includes('--record')) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(markerFile, JSON.stringify({ schemaVersion: 1, ...current }, null, 2) + '\n');
  console.log('Recorded Stage 20D canonical dist digest: ' + current.distManifestSha256);
} else if (args.includes('--verify')) {
  const baseline = JSON.parse(readFileSync(markerFile, 'utf8'));
  assert.equal(baseline.schemaVersion, 1, 'Unrecognized build integrity record');
  for (const [key, value] of Object.entries(current)) {
    assert.equal(value, baseline[key], 'Stage 20D build integrity drift: ' + key);
  }
  console.log('Stage 20D release-safe dist is unchanged: ' + current.distManifestSha256);
} else {
  throw new Error('Expected --record or --verify');
}

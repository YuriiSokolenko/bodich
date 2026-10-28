/**
 * Canonical Stage 20F / 20C release manifest.
 * Both gates hash the same sorted file projection.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function collectReleaseFiles(dist) {
  assert(existsSync(dist) && lstatSync(dist).isDirectory(), 'missing_dist');
  const files = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      assert(!entry.isSymbolicLink(), 'symlink_in_release');
      if (entry.isDirectory()) walk(absolute);
      else {
        assert(entry.isFile(), 'special_file_in_release');
        const name = relative(dist, absolute).split('\\').join('/');
        const bytes = readFileSync(absolute);
        files.push({ name, pathSha256: sha256(name), sha256: sha256(bytes), bytes: bytes.length });
      }
    }
  }
  walk(dist);
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function distManifestSha256(files) {
  return sha256(JSON.stringify(files.map(({ pathSha256, sha256, bytes }) =>
    ({ pathSha256, sha256, bytes }))));
}

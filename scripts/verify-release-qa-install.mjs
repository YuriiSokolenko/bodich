import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// package.json is the only source of truth for direct QA tool versions.
const qaTools = ['@axe-core/playwright', 'lighthouse', 'playwright'];
const permittedBundledPaths = new Set([
  'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/core',
  'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/runtime',
  'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/wasi-threads',
  'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@napi-rs/wasm-runtime',
  'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@tybys/wasm-util',
  'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/tslib',
]);
const pkgBytes = readFileSync('package.json');
const lockBytes = readFileSync('package-lock.json');
const pkg = JSON.parse(pkgBytes);
const lock = JSON.parse(lockBytes);
const versions = Object.fromEntries(qaTools.map((name) => {
  const version = pkg.devDependencies?.[name];
  assert.match(version ?? '', /^\d+\.\d+\.\d+$/,
    name + ' must have an exact stable semver pin in package.json');
  return [name, version];
}));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);

assert.equal(lock.lockfileVersion, 3, 'npm lockfile v3 is required');
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies,
  'Root manifest and committed lockfile dev dependencies differ');
for (const [name, version] of Object.entries(versions)) {
  assert.equal(lock.packages['node_modules/' + name]?.version, version,
    name + ' must be resolved in the committed lockfile');
}

function verifyLockEntries(packages) {
  let count = 0;
  for (const [path, entry] of Object.entries(packages)) {
    if (!path) continue;
    assert.match(entry.version ?? '', /^\d+\.\d+\.\d+/,
      path + ' is missing a resolved version');
    if (entry.resolved === undefined) {
      // npm embeds these six optional wasm dependencies inside the integrity-
      // checked @tailwindcss/oxide-wasm32-wasi tarball (inBundle: true).
      assert(entry.inBundle === true && permittedBundledPaths.has(path),
        path + ' has no registry source and is not an approved bundled package');
      continue;
    }
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//,
      path + ' must resolve only from the approved npm registry');
    assert.match(entry.integrity ?? '', /^sha(?:1|256|384|512)-/,
      path + ' is missing its npm integrity checksum');
    count++;
  }
  assert(count > 0, 'No resolved npm registry dependencies in lockfile');
  return count;
}
const registryPackages = verifyLockEntries(lock.packages);

if (args.includes('--self-test')) {
  const dir = mkdtempSync(join(tmpdir(), 'bodich-qa-lock-'));
  try {
    const changed = structuredClone(pkg);
    // Both candidates are real published releases; pick one different from
    // the current pin so the probe survives future approved upgrades.
    changed.devDependencies.playwright = versions.playwright === '1.63.0' ? '1.64.1' : '1.63.0';
    writeFileSync(join(dir, 'package.json'), JSON.stringify(changed, null, 2) + '\n');
    writeFileSync(join(dir, 'package-lock.json'), lockBytes);
    const result = spawnSync('npm',
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: dir, encoding: 'utf8', timeout: 30000 });
    const output = (result.stdout ?? '') + '\n' + (result.stderr ?? '');
    assert.notEqual(result.status, 0, 'npm ci must reject an out-of-sync QA manifest');
    assert.match(output, /(?:EUSAGE|Invalid:|Missing:|in sync)/i,
      'Mismatch must fail due to npm lock validation, not a network error');
    assert.equal(digest(readFileSync(join(dir, 'package-lock.json'))), digest(lockBytes),
      'Rejected npm ci must not rewrite the committed lockfile');
    console.log('QA lockfile negative probe passed: mismatched manifest fails closed without rewriting the lock.');
    const hostileSource = structuredClone(lock.packages);
    hostileSource['node_modules/playwright'].resolved = 'git+ssh://example.invalid/unpinned.git';
    assert.throws(() => verifyLockEntries(hostileSource), /approved npm registry/,
      'Unpinned git/tarball source must fail closed');
    const missingIntegrity = structuredClone(lock.packages);
    delete missingIntegrity['node_modules/playwright'].integrity;
    assert.throws(() => verifyLockEntries(missingIntegrity), /integrity checksum/,
      'A registry package without integrity must fail closed');
    const unapprovedBundle = structuredClone(lock.packages);
    unapprovedBundle['node_modules/playwright'].inBundle = true;
    delete unapprovedBundle['node_modules/playwright'].resolved;
    assert.throws(() => verifyLockEntries(unapprovedBundle), /approved bundled package/,
      'Unapproved inBundle paths must fail closed');
    console.log('QA lockfile integrity negative fixtures passed.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else if (args.includes('--check')) {
  const installedVersions = {};
  for (const [name, version] of Object.entries(versions)) {
    const installed = JSON.parse(readFileSync(resolve('node_modules', name, 'package.json')));
    assert.equal(installed.version, version, name + ' installed version differs from lock');
    installedVersions[name] = installed.version;
  }
  // npm verifies the actual complete installed tree (including nested dependencies),
  // while the committed lockfile records the resolved versions and integrity hashes.
  const rawTree = execFileSync('npm', ['ls', '--all', '--json'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const tree = JSON.parse(rawTree);
  for (const [name, version] of Object.entries(versions)) {
    assert.equal(tree.dependencies?.[name]?.version, version,
      name + ' not present at expected version in npm installed tree');
  }
  const outputDir = resolve(process.env.QA_OUTPUT_DIR ?? 'visual-qa/release-qa');
  mkdirSync(outputDir, { recursive: true });
  const meta = {
    schemaVersion: 1,
    lockfileSha256: digest(lockBytes),
    registryPackages,
    installedToolVersions: installedVersions,
    node: process.version,
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  };
  writeFileSync(join(outputDir, 'installed-dependency-tree.json'),
    JSON.stringify({ ...meta, tree }, null, 2) + '\n');
  console.log('QA locked dependency tree verified: ' + registryPackages +
    ' registry entries; lock SHA-256 ' + meta.lockfileSha256);
} else {
  throw new Error('Expected --check or --self-test');
}

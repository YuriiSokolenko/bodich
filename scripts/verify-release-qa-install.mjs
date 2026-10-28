import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const versions = {
  '@axe-core/playwright': '4.14.0',
  lighthouse: '13.5.0',
  playwright: '1.64.1',
};
const pkgBytes = readFileSync('package.json');
const lockBytes = readFileSync('package-lock.json');
const pkg = JSON.parse(pkgBytes);
const lock = JSON.parse(lockBytes);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);

assert.equal(lock.lockfileVersion, 3, 'npm lockfile v3 is required');
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies,
  'Root manifest and committed lockfile dev dependencies differ');
for (const [name, version] of Object.entries(versions)) {
  assert.equal(pkg.devDependencies[name], version, name + ' must have an exact pinned version');
  assert.equal(lock.packages['node_modules/' + name]?.version, version,
    name + ' must be resolved in the committed lockfile');
}
let registryPackages = 0;
for (const [path, entry] of Object.entries(lock.packages)) {
  if (path && entry.resolved?.startsWith('https://registry.npmjs.org/')) {
    registryPackages++;
    assert.match(entry.integrity ?? '', /^sha(?:1|256|384|512)-/,
      path + ' is missing its npm integrity checksum');
    assert.match(entry.version ?? '', /^\d+\.\d+\.\d+/,
      path + ' is missing a resolved version');
  }
}
assert(registryPackages > 0, 'No resolved npm registry dependencies in lockfile');

if (args.includes('--self-test')) {
  const dir = mkdtempSync(join(tmpdir(), 'bodich-qa-lock-'));
  try {
    const changed = structuredClone(pkg);
    changed.devDependencies.playwright = '1.63.0'; // Valid release, deliberately not the locked 1.64.1
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

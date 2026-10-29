import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  RELEASE_GATES,
  advertisedUrls,
  bootstrapLanPreview,
  createLanPreviewEnvironment,
  findLanIpv4Addresses,
  installSignalHandlers,
  parsePreviewArgs,
} from './lib/lan-qa-preview.mjs';

function dependencies(overrides = {}) {
  const calls = [];
  const deps = {
    assertRuntime: () => calls.push('runtime'),
    assertInstall: () => calls.push('install'),
    readPackageScripts: () => Object.fromEntries(RELEASE_GATES.map((gate) => [gate, 'configured'])),
    readHeadSha: () => 'a'.repeat(40),
    isDirty: () => false,
    removeDist: () => calls.push('remove-dist'),
    runNpmScript: (script) => calls.push(`gate:${script}`),
    readDistDigest: () => 'b'.repeat(64),
    findLanAddresses: () => [{ interfaceName: 'en0', address: '192.168.1.24' }],
    startPreview: (options) => {
      calls.push(`start:${options.host}:${options.port}`);
      return Object.assign(new EventEmitter(), { pid: 54321, exitCode: null, killed: false, kill() {} });
    },
    log: (message) => calls.push(`log:${message}`),
    ...overrides,
  };
  return { deps, calls };
}

test('validates bind address and port and parses explicit selection', () => {
  assert.deepEqual(parsePreviewArgs(['--host', '192.168.1.24', '--port', '4432']), {
    host: '192.168.1.24', port: 4432,
  });
  assert.throws(() => parsePreviewArgs(['--port', '0']), /1 to 65535/);
  assert.throws(() => parsePreviewArgs(['--host', 'localhost']), /IPv4 or IPv6/);
  assert.throws(() => parsePreviewArgs(['--port', '4321', '--oops']), /Unknown option/);
});

test('reports one LAN adapter and falls back without exposing ambiguous adapter addresses', () => {
  const addresses = findLanIpv4Addresses({
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    en0: [{ address: '192.168.1.24', family: 'IPv4', internal: false }],
    en7: [{ address: '10.0.0.3', family: 'IPv4', internal: false }],
    en8: [{ address: '169.254.10.2', family: 'IPv4', internal: false }],
  });
  assert.deepEqual(addresses, [
    { interfaceName: 'en0', address: '192.168.1.24' },
    { interfaceName: 'en7', address: '10.0.0.3' },
  ]);
  const result = advertisedUrls('0.0.0.0', 4321, addresses);
  assert.deepEqual(result.urls, []);
  assert.match(result.fallback, /networksetup -listallhardwareports/);
  assert.doesNotMatch(result.fallback, /192\.168\.1\.24|10\.0\.0\.3/);
  assert.deepEqual(advertisedUrls('192.168.1.24', 4321, addresses).urls, [
    'http://192.168.1.24:4321/en/',
    'http://192.168.1.24:4321/ro/',
  ]);
});

test('loopback binds advertise only local URLs even when LAN adapters exist', () => {
  const adapters = [{ interfaceName: 'en0', address: '192.168.1.24' }];
  const ipv4 = advertisedUrls('127.0.0.1', 4321, adapters);
  assert.deepEqual(ipv4.urls, [
    'http://127.0.0.1:4321/en/',
    'http://127.0.0.1:4321/ro/',
  ]);
  assert.equal(ipv4.localOnly, true);
  assert.equal(ipv4.fallback, null);

  const ipv6 = advertisedUrls('::1', 4321, adapters);
  assert.deepEqual(ipv6.urls, [
    'http://[::1]:4321/en/',
    'http://[::1]:4321/ro/',
  ]);
  assert.equal(ipv6.localOnly, true);
});

test('clears inherited beta and deployment URL/base variables for every subprocess', () => {
  const env = createLanPreviewEnvironment({
    PATH: '/usr/bin',
    BODICH_MEDIA_PROFILE: 'beta_presentation',
    ASTRO_BASE: '/bodich-preview',
    SITE_URL: 'https://example.invalid',
    OTHER_SETTING: 'preserved',
  });
  assert.deepEqual(env, { PATH: '/usr/bin', OTHER_SETTING: 'preserved' });
});

test('runs every release gate before starting Astro preview', async () => {
  const { deps, calls } = dependencies();
  const result = await bootstrapLanPreview({ host: '0.0.0.0', port: 4321 }, deps);
  assert.equal(result.sourceSha, 'a'.repeat(40));
  assert.equal(result.digest, 'b'.repeat(64));
  assert.equal(result.child.pid, 54321);
  assert.equal(calls.filter((call) => call.startsWith('gate:')).length, RELEASE_GATES.length);
  assert.ok(calls.indexOf('remove-dist') < calls.indexOf('gate:check'));
  assert.ok(calls.indexOf('gate:release:decision:verify') < calls.indexOf('start:0.0.0.0:4321'));
  assert.equal(calls.filter((call) => call.startsWith('gate:')).length, RELEASE_GATES.length);
});

test('fails closed before bind when a validation gate fails', async () => {
  const { deps, calls } = dependencies({
    runNpmScript(script) {
      calls.push(`gate:${script}`);
      if (script === 'media:public') throw new Error('fixture gate failure');
    },
  });
  await assert.rejects(bootstrapLanPreview({ host: '127.0.0.1', port: 4321 }, deps), /fixture gate failure/);
  assert.equal(calls.some((call) => call.startsWith('start:')), false);
});

test('does not start when a required validation command is missing', async () => {
  const { deps, calls } = dependencies({ readPackageScripts: () => ({ check: 'configured' }) });
  await assert.rejects(bootstrapLanPreview({ host: '127.0.0.1', port: 4321 }, deps), /Required release validation is missing/);
  assert.equal(calls.some((call) => call === 'remove-dist'), false);
  assert.equal(calls.some((call) => call.startsWith('start:')), false);
});

test('forwards termination signals to the preview process and removes handlers', () => {
  const processMock = new EventEmitter();
  const calls = [];
  const child = { exitCode: null, killed: false, kill: (signal) => calls.push(signal) };
  const removeHandlers = installSignalHandlers(child, processMock, (message) => calls.push(message));
  processMock.emit('SIGTERM');
  processMock.emit('SIGTERM');
  assert.deepEqual(calls, ['Received SIGTERM; stopping LAN preview.', 'SIGTERM']);
  removeHandlers();
  assert.equal(processMock.listenerCount('SIGINT'), 0);
  assert.equal(processMock.listenerCount('SIGTERM'), 0);
});

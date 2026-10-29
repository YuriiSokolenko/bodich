import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { collectReleaseFiles, distManifestSha256 } from './release-manifest.mjs';

export const RELEASE_GATES = [
  'check',
  'qa:lock:check',
  'build',
  'pages:verify',
  'catalog:products:dist',
  'seo:routes',
  'romanian:dist:preview',
  'media:public',
  'legal:dist',
  'assets:release',
  'release:decision:verify',
];

export function parsePreviewArgs(args) {
  const options = { host: '0.0.0.0', port: 4321 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--host' || arg === '--port') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === '--host') options.host = value;
      else options.port = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return validatePreviewOptions(options);
}

export function validatePreviewOptions(options) {
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${options.port}". Choose an integer from 1 to 65535.`);
  }
  if (typeof options.host !== 'string' || !isIP(options.host)) {
    throw new Error(`Invalid bind address "${options.host}". Use an IPv4 or IPv6 address.`);
  }
  return { host: options.host, port };
}

export function findLanIpv4Addresses(networkInterfaces) {
  const found = [];
  for (const [interfaceName, entries] of Object.entries(networkInterfaces ?? {})) {
    for (const entry of entries ?? []) {
      const address = entry.address;
      if (entry.internal || entry.family !== 'IPv4' || isIP(address) !== 4) continue;
      if (address.startsWith('127.') || address.startsWith('169.254.')) continue;
      if (!found.some((item) => item.address === address)) found.push({ interfaceName, address });
    }
  }
  return found;
}

export function advertisedUrls(host, port, addresses) {
  let address;
  if (host !== '0.0.0.0' && host !== '::' && isIP(host) === 4 && !host.startsWith('127.')) address = host;
  else if (addresses.length === 1) address = addresses[0].address;
  if (!address || isIP(address) !== 4) {
    return {
      urls: [],
      fallback: 'LAN address is unavailable or ambiguous. On macOS, run `networksetup -listallhardwareports`, find the Wi-Fi Device, then run `ipconfig getifaddr <device>`. Restart with `npm run qa:lan:preview -- --host <IPv4>` using that address.',
    };
  }
  return {
    urls: [`http://${address}:${port}/en/`, `http://${address}:${port}/ro/`],
    fallback: null,
  };
}

export async function bootstrapLanPreview(options, deps) {
  const normalized = validatePreviewOptions(options);
  deps.assertRuntime();
  deps.assertInstall();
  const scripts = deps.readPackageScripts();
  for (const gate of RELEASE_GATES) {
    if (!scripts[gate]) throw new Error(`Required release validation is missing: npm run ${gate}`);
  }

  const sourceSha = deps.readHeadSha();
  const dirty = deps.isDirty();
  deps.log(`Git HEAD: ${sourceSha}`);
  deps.log(dirty
    ? 'Source tree: DIRTY. The build includes local changes; this run is not a release candidate.'
    : 'Source tree: clean at startup.');

  // Remove any stale or beta output before a release-safe build is attempted.
  deps.removeDist();
  for (const gate of RELEASE_GATES) {
    deps.log(`Running npm run ${gate}`);
    deps.runNpmScript(gate, { clearBetaProfile: true });
  }

  const digest = deps.readDistDigest();
  deps.log(`Public dist manifest SHA-256: ${digest}`);
  const addresses = deps.findLanAddresses();
  const advertised = advertisedUrls(normalized.host, normalized.port, addresses);
  deps.log(`Binding Astro preview to ${normalized.host}:${normalized.port}`);
  if (advertised.urls.length) {
    deps.log(`English: ${advertised.urls[0]}`);
    deps.log(`Romanian: ${advertised.urls[1]}`);
  } else {
    deps.log(advertised.fallback);
  }

  const child = deps.startPreview(normalized);
  if (!child) throw new Error('Astro preview process did not start.');
  deps.log(`Preview PID: ${child.pid ?? 'unknown'}`);
  return { child, sourceSha, dirty, digest, ...normalized, ...advertised };
}

export function installSignalHandlers(child, processObject = process, log = console.log) {
  let stopping = false;
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      if (stopping) return;
      stopping = true;
      log(`Received ${signal}; stopping LAN preview.`);
      if (child.exitCode === null && !child.killed) child.kill(signal);
    };
    handlers.set(signal, handler);
    processObject.on(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) processObject.removeListener(signal, handler);
  };
}

export function digestDist(distPath) {
  const files = collectReleaseFiles(distPath);
  assert(files.length > 0, 'The release-safe dist is empty.');
  return distManifestSha256(files);
}

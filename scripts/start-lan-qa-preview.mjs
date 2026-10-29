import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapLanPreview,
  createLanPreviewEnvironment,
  digestDist,
  findLanIpv4Addresses,
  installSignalHandlers,
  parsePreviewArgs,
} from './lib/lan-qa-preview.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function createDependencies() {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return {
    assertRuntime() {
      const major = Number(process.versions.node.split('.')[0]);
      if (major !== 24) {
        throw new Error(`Node 24 is required (found ${process.versions.node}). Run nvm use and retry.`);
      }
    },
    assertInstall() {
      if (!existsSync(resolve(root, 'package-lock.json'))) {
        throw new Error('package-lock.json is missing. Restore the committed lockfile, then run `npm ci`.');
      }
      if (!existsSync(resolve(root, 'node_modules/.package-lock.json')) || !existsSync(resolve(root, 'node_modules/.bin/astro'))) {
        throw new Error('Locked dependencies are not installed. Run `nvm use` and `npm ci` before starting the preview.');
      }
    },
    readPackageScripts() {
      return packageJson.scripts ?? {};
    },
    readHeadSha() {
      const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Cannot read Git HEAD: ${result.stderr || 'not a Git checkout'}`);
      return result.stdout.trim();
    },
    isDirty() {
      const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Cannot inspect source status: ${result.stderr}`);
      return result.stdout.trim().length > 0;
    },
    removeDist() {
      rmSync(resolve(root, 'dist'), { recursive: true, force: true });
    },
    runNpmScript(script) {
      const env = createLanPreviewEnvironment(process.env);
      const result = spawnSync('npm', ['run', script], { cwd: root, env, stdio: 'inherit' });
      if (result.error) throw new Error(`Could not run npm run ${script}: ${result.error.message}`);
      if (result.status !== 0) throw new Error(`Validation failed: npm run ${script} (exit ${result.status ?? 'unknown'}). LAN preview was not started.`);
    },
    readDistDigest() {
      return digestDist(resolve(root, 'dist'));
    },
    findLanAddresses() {
      return findLanIpv4Addresses(networkInterfaces());
    },
    startPreview({ host, port }) {
      const env = createLanPreviewEnvironment(process.env);
      // Astro auto-backgrounds preview servers inside agent sessions; keep the
      // server attached so Ctrl-C/SIGTERM always reaches this command.
      env.ASTRO_PREVIEW_BACKGROUND = 'foreground';
      return spawn(process.execPath, [resolve(root, 'node_modules/astro/bin/astro.mjs'), 'preview', '--host', host, '--port', String(port)], {
        cwd: root,
        stdio: 'inherit',
        env,
      });
    },
    log(message) {
      console.log(message);
    },
  };
}

async function main() {
  const options = parsePreviewArgs(process.argv.slice(2));
  const result = await bootstrapLanPreview(options, createDependencies());
  const removeSignalHandlers = installSignalHandlers(result.child);
  await new Promise((resolvePromise, rejectPromise) => {
    result.child.once('error', (error) => rejectPromise(new Error(`Astro preview failed to start: ${error.message}`)));
    result.child.once('exit', (code, signal) => {
      removeSignalHandlers();
      if (code !== 0 && code !== null) process.exitCode = code;
      else if (signal && signal !== 'SIGINT' && signal !== 'SIGTERM') process.exitCode = 1;
      resolvePromise();
    });
  });
}

main().catch((error) => {
  console.error(`LAN QA preview: ${error.message}`);
  process.exitCode = 1;
});

# Docker-first LAN QA preview

This is an opt-in, release-safe static preview for manual QA on a trusted local network. It does not deploy to Cloudflare, provide authentication, certify HTTPS, or change the NO-GO state of [Issue #69](issue-69-accessibility-performance.md) or [Issue #71](issue-71-release-decision.md).

## Requirements and architecture

- Docker Desktop with Docker Compose v2 on macOS, or Docker Engine with Compose v2 on Linux.
- A Wi-Fi/LAN that allows devices to connect to the MacBook. Android, iPad, and MacBook should use the same trusted network.
- No host Node.js, npm, or nvm. Node.js 24 and `npm ci` run in the Linux build stage. The runtime is an unprivileged, digest-pinned Nginx image with only the audited `dist`, Nginx configuration, and a small provenance record. The Node image and Nginx image are official multi-platform images pinned by immutable manifest digest.
- Docker builds for the host architecture automatically: `linux/arm64` on Apple Silicon and `linux/amd64` on Intel. `sharp` and any other native modules are installed in the builder for the selected Linux architecture. No host `node_modules` or native binaries are copied into the image, and no Node/npm runtime is shipped.

The default host bind address is `0.0.0.0`, so other devices on the LAN can connect. Port `4321` and the bind address are configurable. This is intentional LAN exposure: use a trusted Wi-Fi, check firewall prompts and AP/client isolation, and do not use an untrusted guest network.

## Build and start

From the repository root:

```sh
docker compose config
docker compose up --build -d
docker compose ps
docker compose logs -f bodich-preview
```

Open `http://localhost:4321/en/` or `http://localhost:4321/ro/` on the MacBook. Find the MacBook's actual Wi-Fi IPv4 in macOS System Settings → Wi-Fi → Details → TCP/IP, then open the same routes from Android Chrome or iPad Safari using that address, for example `http://<actual-macbook-wifi-ip>:4321/en/` and `http://<actual-macbook-wifi-ip>:4321/ro/`. The example is a placeholder; do not type the angle brackets or assume an address before checking the MacBook.

For MacBook-only access, bind the published port to loopback:

```sh
BODICH_BIND_IP=127.0.0.1 docker compose up --build -d
```

To choose another host port, set `BODICH_PORT`, for example `BODICH_PORT=4322 docker compose up --build -d`; the container still listens on port 8080.

The default command labels source provenance as `UNKNOWN` because Compose cannot infer the Git state. When you want to record the local checkout, pass Git metadata explicitly; a dirty state is retained as dirty and is not described as a reproducible release candidate:

```sh
BODICH_GIT_SHA="$(git rev-parse HEAD)" \
BODICH_SOURCE_STATE="$(if test -z "$(git status --porcelain --untracked-files=all)"; then printf clean; else printf dirty; fi)" \
docker compose up --build -d
```

The build logs and `/usr/share/bodich/build-provenance.json` inside the container record the release profile, source SHA/state, exact canonical `distManifestSha256`, and file count. This is build metadata, not a human release sign-off.

## Run a published image (no checkout, no build)

The `Docker LAN preview` workflow publishes the release-safe preview image to GitHub Container Registry as `ghcr.io/yuriisokolenko/bodich-lan-preview` (`linux/amd64` and `linux/arm64`), so a reviewer can run `main` or a pull request without a source checkout, host Node.js, or a local build. This is a convenience for local/trusted-LAN QA only: it is not a production deployment and changes no release gate. #69 and #71 stay NO-GO.

### One command

`compose.ghcr.yaml` is an opt-in override of [`compose.yaml`](../../compose.yaml). It swaps the locally built image for the published one and keeps all runtime hardening from `compose.yaml` (read-only root, dropped capabilities, `no-new-privileges`, resource limits, `/tmp` tmpfs). Without a checkout, download the two small files once, then pull and start:

```sh
mkdir bodich-preview && cd bodich-preview
curl -fsSLO https://raw.githubusercontent.com/YuriiSokolenko/bodich/main/compose.yaml
curl -fsSLO https://raw.githubusercontent.com/YuriiSokolenko/bodich/main/compose.ghcr.yaml
export COMPOSE_FILE=compose.yaml:compose.ghcr.yaml

docker compose pull && docker compose up -d
```

In a checkout the two files are already present; only the `export COMPOSE_FILE=...` line and the final command are needed. Without the export, pass the files explicitly: `docker compose -f compose.yaml -f compose.ghcr.yaml pull`, then the same with `up -d`. The override never builds: if the image cannot be pulled, Compose fails instead of building something else. `BODICH_BIND_IP` and `BODICH_PORT` work exactly as for the local build, for example `BODICH_BIND_IP=127.0.0.1 docker compose up -d` for MacBook-only access.

### Tags

| Tag | Points at | Published |
| --- | --- | --- |
| `main` (default) | The latest commit on `main` | After a push to `main` |
| `sha-<full commit SHA>` | Exactly that commit; never moved to another commit. Matches `BODICH_GIT_SHA` and the image's `org.opencontainers.image.revision` label | With every publish |
| `pr-<number>` | The latest head commit of a same-repository pull request | Same-repository pull requests only |

`sha-<SHA>-amd64` and `sha-<SHA>-arm64` also exist as the per-architecture images behind the multi-arch tags; use the tags above. A tag is only moved to the newest commit, so an older workflow run that finishes late never rolls `main` or `pr-<number>` back.

Select a tag with `BODICH_IMAGE_TAG`, set for both commands (the easiest way is to export it):

```sh
export BODICH_IMAGE_TAG=pr-123      # or main, or sha-<full commit SHA>
docker compose pull && docker compose up -d
```

To confirm what is running, compare the recorded source with the commit you expect:

```sh
docker compose exec bodich-preview cat /usr/share/bodich/build-provenance.json
```

Its `profile` is `release_safe`, `sourceState` is `clean`, and `sourceSha` equals the tag's commit. To go back to the default local build, run `docker compose down`, then `unset COMPOSE_FILE BODICH_IMAGE_TAG`, then `docker compose up --build -d`.

### What gets published, and what never does

- Publishing happens only after every Docker preview check (EN/RO smoke, browser smoke, context isolation, runtime isolation, provenance, fail-closed fixtures) passed on **both** architectures. The image pushed is the exact image those checks tested, not a rebuild.
- It is always the release-safe build (`npm run build`). Unapproved concept media and supplier drafts stay withheld; the workflow asserts `profile: release_safe` again on the pulled image. No beta or presentation image is published under these tags.
- Pull requests from forks, and Dependabot pull requests, run every check but never publish. `packages: write` is granted only to the publishing jobs; the checks themselves keep `contents: read`.
- After publishing, CI pulls the image back through `compose.ghcr.yaml` on both architectures, serves `/en/` and `/ro/`, and verifies the provenance record matches the commit.

### Package visibility (decision)

The package is **private** (the GHCR default for a new package). A private package needs a one-time login on the machine that pulls it, using a classic personal access token with only the `read:packages` scope:

```sh
echo "$GHCR_TOKEN" | docker login ghcr.io -u YuriiSokolenko --password-stdin
```

Private was chosen because this is an internal QA convenience for pre-release builds, and `pr-<number>` tags can contain unmerged work; there is no reason to make them anonymously pullable. The image contains only the release-safe `dist` built from this repository at that commit plus Nginx and the provenance record, with no private source files (the context-isolation checks above enforce this), so making the package public later is a safe owner decision. It is a package-settings change and needs no workflow change. Note that the workflow hands the tested image between jobs as a one-day GitHub Actions artifact, and artifacts of a public repository are downloadable by any GitHub account; the content is derivable from the public source either way.

### Retention

Nothing deletes old versions yet, so `pr-*` and `sha-*` tags accumulate. Until a retention policy is added (for example scheduled cleanup of `pr-*` and old `sha-*` versions with `actions/delete-package-versions`), prune them occasionally in the package's settings on GitHub.

## Manual device checks

For both `/en/` and `/ro/`, visit the home, products, accessories, support, about, and contact routes. On mobile, use portrait and landscape, open and close navigation, test touch and keyboard behavior, and inspect language switching, focus, image alternatives, zoom/reflow, and reduced motion. Record the real device, OS/browser version, test date, tester, and findings; do not infer a physical-device pass from Docker or CI.

- **Android:** Chrome stable with TalkBack, both locales and orientations.
- **iPad (supplemental):** Safari with VoiceOver on iPadOS 18.7.8, both locales and orientations. Record the actual model and browser build.
- **MacBook:** Safari, Firefox, and Chromium; also confirm the same local page in a desktop browser.

The iPad is supplementary and does not replace the required iPhone Safari + VoiceOver testing in [#69](issue-69-accessibility-performance.md). The device reports and independent review remain outstanding; #69 and #71 remain NO-GO.

## Server and security behavior

Nginx serves only files in the audited static release `dist`. Local EN/RO routes, generated CSS/JS, approved root landing/redirect page, `robots.txt`, and `sitemap.xml` are served as static files. Unknown paths return 404; there is no SPA fallback, API, admin route, host project mount, Docker socket, tunnel, or production service.

The Docker Nginx configuration sends the documented local CSP, noindex, content-type, referrer, frame, and permissions headers. Its CSP intentionally omits `upgrade-insecure-requests` because the preview listens on HTTP and has no TLS endpoint; the hosted `public/_headers` policy is unchanged. This is a separately configured local HTTP policy; it does **not** execute Cloudflare Pages' `_headers` file or prove hosted-header parity, HTTPS, or production security certification. The `_headers` file is not exposed as a static download. The runtime runs as UID/GID 101, has a read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, resource limits, and only a bounded `/tmp` tmpfs for Nginx's PID/temp files. It has no writable host mounts.

If a rebuild fails while a prior container is already running, Compose leaves that previously built image/container in place; it does not copy partial or failed build output into it. That means the last successfully built preview may continue responding until stopped. Run `docker compose down` first when you need the service stopped before attempting a replacement build.

## Troubleshooting and cleanup

- Check `docker compose ps` and `docker compose logs bodich-preview` if the health check is not healthy.
- If localhost works but another device does not, verify the Wi-Fi IPv4 from System Settings, macOS firewall permission for Docker Desktop, the chosen host bind address, VPN settings, and that the Wi-Fi does not isolate clients. The preview does not modify firewall rules.
- Check for a port conflict with `BODICH_PORT=4322 docker compose up --build -d`.
- Review the resolved port/bind configuration with `docker compose config`.

Stop and remove the preview container/network with:

```sh
docker compose down
```

The previous host-native [#92 LAN preview guide](issue-92-lan-preview.md) remains available as an optional developer path that requires Node.js 24 on the host; it is not needed for Docker QA.

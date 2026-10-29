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

## Manual device checks

For both `/en/` and `/ro/`, visit the home, products, accessories, support, about, and contact routes. On mobile, use portrait and landscape, open and close navigation, test touch and keyboard behavior, and inspect language switching, focus, image alternatives, zoom/reflow, and reduced motion. Record the real device, OS/browser version, test date, tester, and findings; do not infer a physical-device pass from Docker or CI.

- **Android:** Chrome stable with TalkBack, both locales and orientations.
- **iPad (supplemental):** Safari with VoiceOver on iPadOS 18.7.8, both locales and orientations. Record the actual model and browser build.
- **MacBook:** Safari, Firefox, and Chromium; also confirm the same local page in a desktop browser.

The iPad is supplementary and does not replace the required iPhone Safari + VoiceOver testing in [#69](issue-69-accessibility-performance.md). The device reports and independent review remain outstanding; #69 and #71 remain NO-GO.

## Server and security behavior

Nginx serves only files in the audited static release `dist`. Local EN/RO routes, generated CSS/JS, approved root landing/redirect page, `robots.txt`, and `sitemap.xml` are served as static files. Unknown paths return 404; there is no SPA fallback, API, admin route, host project mount, Docker socket, tunnel, or production service.

The Docker Nginx configuration sends the documented local CSP, noindex, content-type, referrer, frame, and permissions headers. This is a separately configured local HTTP policy; it does **not** execute Cloudflare Pages' `_headers` file or prove hosted-header parity, HTTPS, or production security certification. The `_headers` file is not exposed as a static download. The runtime runs as UID/GID 101, has a read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, resource limits, and only a bounded `/tmp` tmpfs for Nginx's PID/temp files. It has no writable host mounts.

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

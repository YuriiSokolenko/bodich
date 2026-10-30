# Full-content QA Docker preview (non-production)

The `qa_full` artifact is a separate GHCR image, `ghcr.io/yuriisokolenko/bodich-full-qa-preview:main`. It deliberately exposes all 132 KingTech supplier research records, their EN/RO draft copy, source-reported specifications and freshly generated 600px illustrative diagrams. The beta hero and other registered marketing concepts are also present. **None of these supplier references are verified BODICH products.** No price, stock, cart, checkout or payments are enabled.

This is a distributable **QA-only** container, not confidential storage. Run on trusted LAN or local loopback. Its content is visible to anyone who can connect to its port. The site emits `noindex, nofollow` and `robots.txt` disallows indexing, but those measures do not enforce access control. Never expose the QA container on public networks; do not run this image as a production/Cloudflare deployment.

## Docker-only usage

In the existing directory with `compose.yaml`, download the new override once:

```sh
curl -fsSLO https://raw.githubusercontent.com/YuriiSokolenko/bodich/main/compose.qa-full.yaml
```

Stop the release-safe preview before switching:

```sh
docker compose -f compose.yaml -f compose.ghcr.yaml down
BODICH_BIND_IP=127.0.0.1 docker compose -f compose.yaml -f compose.qa-full.yaml pull
BODICH_BIND_IP=127.0.0.1 docker compose -f compose.yaml -f compose.qa-full.yaml up -d
```

On the Mac open `http://localhost:4321/en/qa/` or `http://localhost:4321/ro/qa/`. For Android/iPad QA on the same trusted Wi-Fi, omit the loopback `BODICH_BIND_IP` override (the base Compose defaults to LAN listening), then open `http://<MacBook Wi-Fi IPv4>:4321/en/qa/`. Do not enable untrusted or internet-facing port forwarding.

To return to the release-safe image:

```sh
docker compose -f compose.yaml -f compose.qa-full.yaml down
BODICH_BIND_IP=127.0.0.1 docker compose -f compose.yaml -f compose.ghcr.yaml pull
BODICH_BIND_IP=127.0.0.1 docker compose -f compose.yaml -f compose.ghcr.yaml up -d
```

`qa_full` is build-time, not an Nginx runtime environment toggle. Setting a runtime variable cannot reveal withheld product data. The release-safe `main` GHCR tag continues to have no supplier-reference pages.

## Isolation

- Only an explicit Dockerfile.qa-full build can stage supplier research assets. The ordinary Dockerfile still runs all release gates and never stages the diagrams.
- A build requires exactly 132 distinct source IDs, approved=false diagrams, draft review status, valid EN/RO names/descriptions and 264 noindex detail routes. Missing assets or wrong identities fail.
- The separate `Docker Full QA preview` workflow tests amd64/arm64, and only pushes `sha-<full SHA>-<arch>` images on main after each architecture passes QA checks. Its final job publishes the multi-architecture `main` manifest.
- Images are generated from checked-in nonphotographic diagram recipes, not vendor photos. The three original marketing concepts are permitted only as visibly labelled presentation art. The UI links to source evidence rather than claiming BODICH ownership or verified sales data.

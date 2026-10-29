# syntax=docker/dockerfile:1
FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS dependencies
WORKDIR /app

# npm dependencies, including platform-specific native modules, are installed
# from the committed lockfile for this Docker target architecture only.
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG BODICH_GIT_SHA=UNKNOWN
ARG BODICH_SOURCE_STATE=UNKNOWN
COPY . .

RUN npm run check \
 && npm run qa:lock:check \
 && npm run build \
 && npm run pages:verify \
 && npm run catalog:products:dist \
 && npm run seo:routes \
 && npm run romanian:dist:preview \
 && npm run media:public \
 && npm run legal:dist \
 && npm run assets:release \
 && npm run release:decision:verify \
 && node scripts/write-docker-preview-provenance.mjs

# CI-only target: proves a post-gate build failure cannot export the runtime
# target. It is never selected by Compose.
FROM build AS fail-closed-fixture
RUN echo "INTENTIONAL_FAIL_CLOSED_FIXTURE" && exit 73

# CI-only browser runner. It reuses the exact Playwright package installed by
# npm ci and the matching preinstalled browsers; it is never shipped in runtime.
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea AS browser-smoke
WORKDIR /qa
COPY --from=dependencies /app/node_modules/playwright ./node_modules/playwright
COPY --from=dependencies /app/node_modules/playwright-core ./node_modules/playwright-core
COPY scripts/docker-preview-browser-smoke.mjs ./docker-preview-browser-smoke.mjs
ENTRYPOINT ["node", "/qa/docker-preview-browser-smoke.mjs"]

FROM nginx:1.31.8-alpine3.24@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606 AS runtime
ARG BODICH_GIT_SHA=UNKNOWN
ARG BODICH_SOURCE_STATE=UNKNOWN
LABEL org.opencontainers.image.title="BODICH release-safe LAN QA preview" \
      org.opencontainers.image.revision="${BODICH_GIT_SHA}" \
      org.bodich.source-state="${BODICH_SOURCE_STATE}"
COPY --from=build --chown=101:101 /app/dist/ /usr/share/nginx/html/
COPY --from=build /tmp/bodich-build-provenance.json /usr/share/bodich/build-provenance.json
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=0555 docker/entrypoint.sh /docker-entrypoint-local.sh
RUN rm -f /etc/nginx/conf.d/default.conf \
 && rm -f /usr/share/nginx/html/_headers \
 && mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi \
 && nginx -t
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/en/ && wget -q -O /dev/null http://127.0.0.1:8080/ro/ || exit 1
ENTRYPOINT ["/docker-entrypoint-local.sh"]
CMD ["nginx", "-g", "daemon off;"]

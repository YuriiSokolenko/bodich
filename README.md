# BODICH Website

Foundation for the bilingual (English and Romanian) BODICH turbine catalog website.

> **Preview project.** The company contact details, actual turbine products, specifications, legal information, product photography and online sales are intentionally not published yet.

## Stack

- Astro 7 + TypeScript (strict)
- Tailwind CSS 4 via the Vite plugin
- Static output, prepared for Cloudflare Pages
- Node.js 24 (see `.nvmrc`)
- npm with a committed `package-lock.json`

## Local development

```sh
nvm use
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

On the very first bootstrap only, before `package-lock.json` exists, run `npm install`. The initial feature branch workflow generates and commits the lockfile automatically; normal development and CI always use `npm ci`.

## Localized routes

Default (English): `/en/`; Romanian: `/ro/`. Root `/` redirects to `/en/`.

Each language has Home, Products, Accessories, Support, About Us and Contact routes. All are provisional until real business content is ready. Routes are minimal Astro wrappers: content, labels, metadata, navigation and language-switching rules are centralized in `src/i18n/index.ts`. The shared shell lives in `src/layouts/` and `src/components/`.

## Production and SEO

- A real production domain is **not** known yet. Configure `SITE_URL=https://your-real-domain.example` only after the owner provides it. This enables canonical and hreflang links.
- All pages currently emit `noindex, nofollow`, and `public/robots.txt` blocks crawlers: **intentional for this preview**.
- Before launching: approve public content, set contact/legal details, unblock search indexing, enable sitemap generation and verify all canonical/alternate URLs.
- Static output is in `dist/`, the build command is `npm run build` and no app server is needed.
- No commerce backend, cart, payment integration or customer data processing exists in phase 1.

## Roadmap

- [Master issue #1](https://github.com/YuriiSokolenko/bodich/issues/1)
- [Phase 1 issue #2](https://github.com/YuriiSokolenko/bodich/issues/2)

Refer to KingTech for site architecture inspiration only. Do not copy its brand assets, images or product claims.

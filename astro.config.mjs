import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL to the real deployed URL at launch. Until then we omit
// canonical and alternate absolute URLs rather than invent a company domain.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  // Default deployment is at /. ASTRO_BASE is used for nested-path CI previews.
  base: process.env.ASTRO_BASE || '/',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    locales: ['en', 'ro'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});

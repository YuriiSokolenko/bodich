import type { APIRoute } from 'astro';
import { hrefFor, locales } from '../i18n';
import { indexableInformationPages, isSeoPublicationContext } from '../seo/policy';

export const GET: APIRoute = ({ site }) => {
  // A preview base cannot publish robots.txt at the host root.
  const pages = isSeoPublicationContext(site, import.meta.env.BODICH_MEDIA_PROFILE || 'release_safe', import.meta.env.BASE_URL)
    ? indexableInformationPages() : [];
  const lines = ['User-agent: *', 'Disallow: /'];
  if (site && pages.length) {
    // Rendering an approved page needs CSS/JS. Never allow private galleries.
    lines.push('Allow: /_astro/');
    lines.push('Allow: /favicon.svg$');
    // Exact URLs prevent a reviewed home page from authorizing child routes.
    for (const page of pages) {
      for (const locale of locales) lines.push('Allow: ' + hrefFor(locale, page) + '$');
    }
    const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
    lines.push('Sitemap: ' + new URL(base + '/sitemap.xml', site).toString());
  }
  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

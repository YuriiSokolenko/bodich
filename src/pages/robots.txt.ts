import type { APIRoute } from 'astro';
import { hrefFor, locales } from '../i18n';
import { indexableInformationPages } from '../seo/policy';

export const GET: APIRoute = ({ site }) => {
  // Missing canonical domain or incomplete human approvals must fail closed.
  const releaseSafe = (import.meta.env.BODICH_MEDIA_PROFILE || 'release_safe') === 'release_safe';
  const pages = site && releaseSafe ? indexableInformationPages() : [];
  const lines = ['User-agent: *', 'Disallow: /'];
  if (site && pages.length) {
    // $ anchors these exceptions so approval of /en/ does not open /en/products/.
    for (const page of pages) {
      for (const locale of locales) lines.push(`Allow: ${hrefFor(locale, page)}$`);
    }
    lines.push(`Sitemap: ${new URL(`${import.meta.env.BASE_URL.replace(/\/+$/, '')}/sitemap.xml`, site)}`);
  }
  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

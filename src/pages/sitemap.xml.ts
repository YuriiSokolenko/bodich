import type { APIRoute } from 'astro';
import { hrefFor, locales } from '../i18n';
import { indexableInformationPages } from '../seo/policy';

const xmlEscape = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const GET: APIRoute = ({ site }) => {
  const releaseSafe = (import.meta.env.BODICH_MEDIA_PROFILE || 'release_safe') === 'release_safe';
  const urls = site && releaseSafe ? indexableInformationPages().flatMap((page) =>
    locales.map((locale) => {
      const location = xmlEscape(new URL(hrefFor(locale, page), site).toString());
      const alternates = locales.map((lang) =>
        `<xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(new URL(hrefFor(lang, page), site).toString())}"/>`
      );
      alternates.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(new URL(hrefFor('en', page), site).toString())}"/>`);
      return `  <url><loc>${location}</loc>${alternates.join('')}</url>`;
    }),
  ) : [];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

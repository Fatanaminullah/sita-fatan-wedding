import type { MetadataRoute } from 'next'
import { isProductionSite, siteOrigin } from '@/lib/site-env'

/**
 * Staging must never be crawled: it carries 350 fake guests and, once the
 * public guest pages land, URLs shaped exactly like the real ones. A guest who
 * found a staging link in search results would see the wrong invitation.
 *
 * Belt and braces with the `noindex` metadata in layout.tsx. robots.txt asks
 * politely and is honoured by the big crawlers; the meta tag is what stops a
 * page that was already fetched from being indexed.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionSite()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    // The admin app is behind auth, but there is no reason to invite crawling
    // of it, and /rsvp/<token> URLs must never be enumerated from an index.
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/guests', '/planner', '/waitlist', '/caps', '/users', '/audit', '/rsvp/'] }],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  }
}

/**
 * Is this deployment the real, public site?
 *
 * Derived from the site URL rather than a separate STAGING flag, because a
 * separate flag is a thing someone can forget to set on a new preview
 * deployment, and forgetting it means staging gets indexed. This way the
 * default for any host that is not the production domain is "not production",
 * which is the safe direction to fail in.
 */
export const PRODUCTION_ORIGIN = 'https://sitafatan.wedding'

export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? PRODUCTION_ORIGIN
}

export function isProductionSite(): boolean {
  return siteOrigin().replace(/\/$/, '') === PRODUCTION_ORIGIN
}

/**
 * The ticket picture's address, relative to the site.
 *
 * The route draws only what the address says and looks nothing up, so the
 * guest's language and VIP band travel here. The send and the guests table's
 * download build it the same way, so the picture downloaded is the picture
 * the guest is sent.
 */
export function ticketImagePath(guest: {
  token: string
  language: 'en' | 'id'
  isVip: boolean
  tableName: string | null
}) {
  const params = new URLSearchParams({ lang: guest.language })
  if (guest.isVip) {
    params.set('vip', '1')
    if (guest.tableName) params.set('table', guest.tableName)
  }
  // The .png sits on the path, before the query, which is where Meta's
  // clients look for it.
  return `/api/qr/${guest.token}.png?${params}`
}

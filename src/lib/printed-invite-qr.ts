/**
 * Guests given a printed card with a QR to their own digital invitation.
 *
 * Sita's board of directors at CNI (2026-10-03). Hardcoded on purpose: the
 * couple asked for exactly these three, and a general feature would need a
 * decision about who else gets one. The QR is the invitation link, never the
 * entry ticket: it opens /to/<slug>, the same page their WhatsApp would.
 */
export const PRINTED_INVITE_QR_GUEST_IDS: readonly string[] = [
  'b2e19a1c-f64c-4a7b-86e4-22902067f2d3', // Mr. Chew Say Loo
  'f0ecdae8-3d55-471e-b5a4-13432ed85d99', // Mr. S. Abrian Natan
  '61e50a2a-812f-4b19-a3e9-6ee3995660d4', // Mr. Suharman Subianto
]

/** The printable card's address. The route draws only what this says. */
export function inviteQrPath(guest: { slug: string; name: string; language: 'en' | 'id' }) {
  // `v` changes whenever the card's design does: the image is cached for a
  // year, so the same address would keep serving the old card.
  const params = new URLSearchParams({ name: guest.name, lang: guest.language, v: '3' })
  return `/api/invite-qr/${guest.slug}.png?${params}`
}

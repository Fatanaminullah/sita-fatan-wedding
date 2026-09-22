import QRCode from 'qrcode'

/**
 * A guest's entry ticket, as an image.
 *
 * WhatsApp's image header takes a URL that Meta fetches itself, so the QR has
 * to be reachable without a session. There is no version of this that is not a
 * public URL.
 *
 * What that costs is small and worth stating plainly: the URL contains the
 * entry token, so anyone holding the URL holds the ticket. That is already
 * true of the QR itself — the image IS the token, drawn — so this adds no
 * capability that the message it is attached to does not already carry. The
 * token is a version 4 uuid and is not guessable.
 *
 * What it must never become is a way to LEARN a token. This route renders
 * whatever it is given and never confirms whether a token belongs to anybody:
 * a made-up uuid returns a perfectly good QR of a made-up uuid. There is no
 * database lookup here at all, deliberately, so there is nothing to probe.
 *
 * docs/ROUTING.md Decision 2 keeps the invite slug and the entry token apart
 * precisely so a forwarded invitation cannot become entry. This route is on
 * the token side of that line and must never accept a slug.
 */

export const runtime = 'nodejs'

/** A uuid, and nothing else. Anything looser would render junk as a ticket. */
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const raw = (await params).token
  // Meta needs the URL to end in an image extension for some clients, so the
  // route accepts one and strips it.
  const token = raw.replace(/\.png$/i, '')

  if (!TOKEN.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const png = await QRCode.toBuffer(token, {
    type: 'png',
    // Large enough to scan from a phone screen held at a door, in a room lit
    // for a wedding rather than for scanning.
    width: 600,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  })

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      // Meta fetches this once when the message is sent and may refetch it.
      // The image never changes for a given token, so it can be cached hard.
      'cache-control': 'public, max-age=31536000, immutable',
      // Never indexed. A search engine holding a page of entry tickets is
      // exactly the thing the token/slug split exists to prevent.
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

import QRCode from 'qrcode'
import { ImageResponse } from 'next/og'
import { MONOGRAM_BARE } from '@/components/invitation/v2/monogram-paths'
import { loadFonts } from '@/lib/og-fonts'

/**
 * A printable card whose QR opens a guest's own digital invitation.
 *
 * For the Phomemo T02: 384 dots wide (its whole 48 mm head at 203 dpi),
 * black on white only, nothing thinner than 2 dots, so the thermal head
 * prints it as drawn. The check-in ticket's composition, in one ink.
 *
 * The QR is the invitation link, /to/<slug>, which anyone holding the card
 * may open: it is the same link the WhatsApp invitation carries. It is never
 * the entry token, which stays on its own side of docs/ROUTING.md Decision 2.
 * Like the ticket route it looks nothing up and renders what it is given.
 */

export const runtime = 'nodejs'

/** A public slug: lowercase words, digits and hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NAME = /^[\p{L}\p{N} .,'&()-]{1,60}$/u

const SITE = 'https://www.sitafatan.wedding'
const BLACK = '#000000'

const COPY = {
  en: { scan: 'Scan for your digital invitation', date: 'Saturday, 10 October 2026' },
  id: { scan: 'Pindai untuk undangan digital Anda', date: 'Sabtu, 10 Oktober 2026' },
} as const

const WIDTH = 384
const HEIGHT = 600

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.replace(/\.png$/i, '')
  if (!SLUG.test(slug) || slug.length > 80) return new Response('Not found', { status: 404 })

  const query = new URL(request.url).searchParams
  const t = COPY[query.get('lang') === 'id' ? 'id' : 'en']
  const rawName = query.get('name')?.trim() ?? ''
  const name = NAME.test(rawName) ? rawName : null

  // Square modules on white with a full quiet zone, drawn at a whole number
  // of dots per module so the head prints crisp edges, not a blur.
  const qr = await QRCode.toBuffer(`${SITE}/to/${slug}`, {
    type: 'png',
    width: 248,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: BLACK, light: '#FFFFFF' },
  })
  const qrSrc = `data:image/png;base64,${qr.toString('base64')}`

  const image = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', backgroundColor: '#FFFFFF', padding: 10 }}>
        {/* The ticket's double rule, as two solid lines a thermal head can hold. */}
        <div style={{ flex: 1, display: 'flex', border: `3px solid ${BLACK}`, padding: 5 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${BLACK}`,
              padding: '18px 16px',
              lineHeight: 1.2,
              color: BLACK,
            }}
          >
            {/* The bare mark: the bordered one's oval is a hairline the
                thermal head drops at this size. */}
            <svg width={48} height={64} viewBox="620 440 760 1100">
              {MONOGRAM_BARE.map((d, i) => (
                <path key={i} d={d} fill={BLACK} />
              ))}
            </svg>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                marginTop: 8,
                fontFamily: 'Instrument Serif',
                fontSize: 46,
                lineHeight: 1,
              }}
            >
              <span>Sita</span>
              <span style={{ fontStyle: 'italic', margin: '0 9px' }}>&amp;</span>
              <span>Fatan</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: 'Jost', fontWeight: 500, fontSize: 13, letterSpacing: 4 }}>
              10 . 10 . 2026
            </div>

            <div style={{ marginTop: 14, display: 'flex', border: `2px solid ${BLACK}`, padding: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a page */}
              <img src={qrSrc} width={248} height={248} alt="" />
            </div>

            <div
              style={{
                marginTop: 12,
                fontFamily: 'Jost',
                fontWeight: 500,
                fontSize: 16,
              }}
            >
              {t.scan}
            </div>
            {name ? (
              <div
                style={{
                  marginTop: 8,
                  fontFamily: 'Instrument Serif',
                  fontSize: 26,
                  lineHeight: 1.1,
                  textAlign: 'center',
                  maxWidth: 320,
                }}
              >
                {name}
              </div>
            ) : null}
            <div style={{ marginTop: 6, fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 18 }}>
              {t.date}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts: await loadFonts() }
  )

  const headers = new Headers(image.headers)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('x-robots-tag', 'noindex, nofollow')
  return new Response(image.body, { status: 200, headers })
}

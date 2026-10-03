import QRCode from 'qrcode'
import { ImageResponse } from 'next/og'
import { MONOGRAM_BORDERED } from '@/components/invitation/v2/monogram-paths'

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
 * The VIP band follows the same rule: the send puts it in the URL, and this
 * route only draws it.
 *
 * docs/ROUTING.md Decision 2 keeps the invite slug and the entry token apart
 * precisely so a forwarded invitation cannot become entry. This route is on
 * the token side of that line and must never accept a slug.
 */

export const runtime = 'nodejs'

/** A uuid, and nothing else. Anything looser would render junk as a ticket. */
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A table name as the couple type it: short, plain. Anything else is dropped. */
const TABLE = /^[\p{L}\p{N} .'&-]{1,24}$/u

// The printed suite: paper ground, blush, oxblood as the only ink.
const INK = '#5E040E'
const PAPER = '#FAF4F0'
const BLUSH = '#F2D6CB'

const COPY = {
  id: { pass: 'Tiket Masuk · Resepsi', when: 'Sabtu, 10 Oktober 2026 · 18.30 WIB', table: 'Meja' },
  en: { pass: 'Entry Pass · Reception', when: 'Saturday, 10 October 2026 · 6.30 PM', table: 'Table' },
} as const

type Face = { name: string; data: ArrayBuffer; weight: 300 | 400 | 500; style: 'normal' | 'italic' }

/**
 * The invitation's two faces, fetched once per instance: Instrument Serif
 * (with its true italic) for display, Jost for labels. Google serves TrueType
 * to a plain request, which is what the renderer reads.
 */
let fonts: Promise<Face[]> | null = null
function loadFonts() {
  fonts ??= (async () => {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Jost:wght@300;500&display=swap'
    ).then((r) => r.text())
    const faces = [
      ...css.matchAll(
        /font-family: '([^']+)';\s*font-style: (normal|italic);\s*font-weight: (\d+);[\s\S]*?url\(([^)]+)\)/g
      ),
    ]
    if (faces.length === 0) throw new Error('No font faces in the Google Fonts response')
    return Promise.all(
      faces.map(async ([, name, style, weight, url]) => ({
        name,
        data: await fetch(url).then((r) => r.arrayBuffer()),
        weight: Number(weight) as Face['weight'],
        style: style as Face['style'],
      }))
    )
  })().catch((error) => {
    fonts = null
    throw error
  })
  return fonts
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token
  // Meta needs the URL to end in an image extension for some clients, so the
  // route accepts one and strips it.
  const token = raw.replace(/\.png$/i, '')

  if (!TOKEN.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const query = new URL(request.url).searchParams
  const t = COPY[query.get('lang') === 'en' ? 'en' : 'id']
  const vip = query.get('vip') === '1'
  const tableRaw = query.get('table')?.trim() ?? ''
  const table = vip && TABLE.test(tableRaw) ? tableRaw : null
  // A bare number reads as a table in the guest's language; a name is kept.
  const tableLabel = table && /^\d+$/.test(table) ? `${t.table} ${table}` : table

  // Drawn as an image inside the card rather than as styled modules: square
  // modules, a full quiet zone and a dark ink on white are what keep it
  // scanning at a dim door. Oxblood on white is well past the contrast a
  // scanner needs.
  const qr = await QRCode.toBuffer(token, {
    type: 'png',
    width: 1000,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: INK, light: '#FFFFFF' },
  })
  const qrSrc = `data:image/png;base64,${qr.toString('base64')}`

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: PAPER,
          backgroundImage: `radial-gradient(circle at 50% 0%, #FFFFFF 0%, ${PAPER} 45%, ${BLUSH} 120%)`,
          padding: 36,
        }}
      >
        {/* The suite's double rule: a line and a hairline inside it. */}
        <div style={{ flex: 1, display: 'flex', border: `2px solid ${INK}`, padding: 10 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${INK}66`,
              padding: '40px 56px 40px',
              lineHeight: 1.25,
            }}
          >
            <svg width={118} height={156} viewBox="500 340 1000 1320">
              {MONOGRAM_BORDERED.map((d, i) => (
                <path key={i} d={d} fill={INK} />
              ))}
            </svg>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                marginTop: 14,
                fontFamily: 'Instrument Serif',
                fontSize: 92,
                lineHeight: 1,
                letterSpacing: -1,
                color: INK,
              }}
            >
              <span>Sita</span>
              <span style={{ fontStyle: 'italic', margin: '0 20px' }}>&amp;</span>
              <span>Fatan</span>
            </div>
            <div
              style={{
                marginTop: 14,
                fontFamily: 'Jost',
                fontWeight: 500,
                fontSize: 20,
                color: INK,
                opacity: 0.75,
                letterSpacing: 8,
              }}
            >
              10 . 10 . 2026
            </div>

            <div
              style={{
                marginTop: 30,
                display: 'flex',
                backgroundColor: '#FFFFFF',
                borderRadius: 4,
                padding: 22,
                border: `1px solid ${INK}40`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a page */}
              <img src={qrSrc} width={500} height={500} alt="" />
            </div>

            <div
              style={{
                marginTop: 30,
                fontFamily: 'Jost',
                fontWeight: 500,
                fontSize: 20,
                color: INK,
                letterSpacing: 7,
                textTransform: 'uppercase',
              }}
            >
              {t.pass}
            </div>
            <div style={{ marginTop: 14, fontFamily: 'Instrument Serif', fontSize: 38, lineHeight: 1.15, color: INK }}>
              {t.when}
            </div>
            <div style={{ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 38, lineHeight: 1.15, color: INK }}>
              Luxus Grand Ballroom
            </div>

            {vip ? (
              <div
                style={{
                  marginTop: 26,
                  display: 'flex',
                  backgroundColor: INK,
                  color: PAPER,
                  borderRadius: 2,
                  alignItems: 'baseline',
                  gap: 22,
                  padding: '12px 46px 16px',
                  fontFamily: 'Instrument Serif',
                  fontSize: 46,
                  lineHeight: 1,
                }}
              >
                <span style={{ fontStyle: 'italic', fontSize: 58 }}>VIP</span>
                {table ? <span>{tableLabel}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: await loadFonts() }
  )

  const headers = new Headers(image.headers)
  // Meta fetches this once when the message is sent and may refetch it.
  // The image never changes for a given address, so it can be cached hard.
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  // Never indexed. A search engine holding a page of entry tickets is
  // exactly the thing the token/slug split exists to prevent.
  headers.set('x-robots-tag', 'noindex, nofollow')
  return new Response(image.body, { status: 200, headers })
}

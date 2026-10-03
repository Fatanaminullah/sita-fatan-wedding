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

// The monogram's own pair, as on the favicon and the link preview: blush
// ground, oxblood ink. Type is the invitation's (Instrument Serif, Jost).
const BLUSH = '#F2D6CB'
const PAPER = '#FAF4F0'
const OXBLOOD = '#5E040E'
const INK = OXBLOOD

const COPY = {
  id: {
    event: ['Acara', 'Resepsi'],
    date: ['Tanggal', 'Sabtu, 10 Oktober 2026'],
    time: ['Waktu', '18.30 WIB'],
    place: ['Tempat', 'Luxus Grand Ballroom'],
    table: 'Meja',
  },
  en: {
    event: ['Event', 'Reception'],
    date: ['Date', 'Saturday, 10 October 2026'],
    time: ['Time', '6.30 PM'],
    place: ['Venue', 'Luxus Grand Ballroom'],
    table: 'Table',
  },
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

/** One ruled line of the details: a tracked label, a serif value. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: `1px solid ${INK}40`,
        padding: '10px 0 11px',
      }}
    >
      <span
        style={{
          fontFamily: 'Jost',
          fontWeight: 500,
          fontSize: 19,
          letterSpacing: 5,
          textTransform: 'uppercase',
          color: INK,
          opacity: 0.62,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'Instrument Serif',
          fontSize: 38,
          color: INK,
        }}
      >
        {value}
      </span>
    </div>
  )
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
  // Square modules in oxblood on paper with a full quiet zone: what keeps it
  // scanning at a dim door. Decoration stays outside the code, never in it.
  const qr = await QRCode.toBuffer(token, {
    type: 'png',
    width: 1000,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: OXBLOOD, light: PAPER },
  })
  const qrSrc = `data:image/png;base64,${qr.toString('base64')}`

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: BLUSH,
          padding: 40,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            border: `1px solid ${INK}59`,
            justifyContent: 'center',
            padding: '40px 72px',
          }}
        >
          <svg width={74} height={98} viewBox="500 340 1000 1320">
            {MONOGRAM_BORDERED.map((d, i) => (
              <path key={i} d={d} fill={OXBLOOD} />
            ))}
          </svg>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              marginTop: 16,
              fontFamily: 'Instrument Serif',
              fontSize: 100,
              lineHeight: 1,
              letterSpacing: -1,
              color: INK,
            }}
          >
            <span>Sita</span>
            <span style={{ fontStyle: 'italic', color: OXBLOOD, margin: '0 22px' }}>&amp;</span>
            <span>Fatan</span>
          </div>

          <div
            style={{
              marginTop: 34,
              display: 'flex',
              backgroundColor: PAPER,
              border: `1px solid ${INK}33`,
              padding: 18,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a page */}
            <img src={qrSrc} width={vip ? 430 : 470} height={vip ? 430 : 470} alt="" />
          </div>

          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Row label={t.event[0]} value={t.event[1]} />
            <Row label={t.date[0]} value={t.date[1]} />
            <Row label={t.time[0]} value={t.time[1]} />
            <Row label={t.place[0]} value={t.place[1]} />
            <div style={{ borderTop: `1px solid ${INK}40` }} />
          </div>

          {/* VIP is the one thing on this ticket a door volunteer must not
              miss, so it is the one solid block: oxblood, full width. */}
          {vip ? (
            <div
              style={{
                marginTop: 26,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: table ? 'space-between' : 'center',
                backgroundColor: OXBLOOD,
                color: PAPER,
                padding: '14px 40px 16px',
              }}
            >
              <span style={{ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 82, lineHeight: 1 }}>
                VIP
              </span>
              {table ? (
                <span style={{ fontFamily: 'Instrument Serif', fontSize: 58, lineHeight: 1 }}>{tableLabel}</span>
              ) : null}
            </div>
          ) : null}
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

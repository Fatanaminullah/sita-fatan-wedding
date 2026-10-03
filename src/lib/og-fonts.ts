/**
 * Fonts for images drawn with next/og.
 */

type Face = { name: string; data: ArrayBuffer; weight: 300 | 400 | 500; style: 'normal' | 'italic' }

/**
 * The invitation's two faces, fetched once per instance: Instrument Serif
 * (with its true italic) for display, Jost for labels. Google serves TrueType
 * to a plain request, which is what the renderer reads.
 */
let fonts: Promise<Face[]> | null = null
export function loadFonts() {
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


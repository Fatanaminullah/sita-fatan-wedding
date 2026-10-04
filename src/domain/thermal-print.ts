/**
 * Turning a label picture into what a Phomemo T02 prints.
 *
 * The T02 speaks ESC/POS raster: reset, heat, a GS v 0 header naming the
 * width in bytes and the line count, the dots, then a feed. One bit per dot,
 * the leftmost dot in the highest bit, 1 is black. Commands and timings are
 * the ones the phomymo project prints with on real T02s
 * (github.com/transcriptionstream/phomymo, "m-series").
 *
 * Pure: pixels in, bytes out. The Bluetooth half is src/lib/thermal-printer.ts.
 */

/** The print head: 48 mm at 203 dpi. */
export const T02_WIDTH_DOTS = 384

export type Pixels = { width: number; height: number; data: Uint8ClampedArray }
export type Raster = { widthBytes: number; heightLines: number; data: Uint8Array }

/**
 * The picture scaled to the full print width, keeping its proportions, and
 * reduced to black and white. Nearest-neighbour sampling: the label is drawn
 * in hard black on white, so there is no grey worth dithering.
 */
export function toRaster(pixels: Pixels, widthDots = T02_WIDTH_DOTS): Raster {
  const widthBytes = widthDots / 8
  const heightLines = Math.round((pixels.height * widthDots) / pixels.width)
  const data = new Uint8Array(widthBytes * heightLines)
  const scale = pixels.width / widthDots

  for (let y = 0; y < heightLines; y++) {
    const sy = Math.min(pixels.height - 1, Math.floor(y * scale))
    for (let x = 0; x < widthDots; x++) {
      const sx = Math.min(pixels.width - 1, Math.floor(x * scale))
      const i = (sy * pixels.width + sx) * 4
      const alpha = pixels.data[i + 3] / 255
      // Composite on white paper, then threshold.
      const lum =
        255 * (1 - alpha) + alpha * (0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2])
      if (lum < 128) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return { widthBytes, heightLines, data }
}

/** Darkness 1 (light) to 8 (dark), as the heat time the head is given. */
function heatTime(density: number) {
  const times = [40, 60, 80, 100, 120, 140, 160, 200]
  return times[Math.max(0, Math.min(7, Math.round(density) - 1))]
}

/**
 * One whole print job.
 *
 * The label leaves the printer by being printed past the tear bar, not by a
 * feed command: on a real T02 the ESC J feed changed nothing (80 and 180
 * dots left the code under the bar alike), so the job carries `tailLines`
 * of blank paper after the label. A thermal head has to move the paper to
 * print a blank line, so this cannot be skipped. 200 lines is about 25 mm.
 */
export function encodeT02Job(
  raster: Raster,
  options: { density?: number; feedDots?: number; tailLines?: number } = {}
): Uint8Array {
  const density = options.density ?? 6
  const feed = Math.max(0, Math.min(255, Math.round(options.feedDots ?? 32)))
  const tail = Math.max(0, Math.round(options.tailLines ?? 200))
  const lines = raster.heightLines + tail
  const parts = [
    [0x1b, 0x40], // ESC @  reset
    [0x1b, 0x37, 7, heatTime(density), 2], // ESC 7  heat dots, time, interval
    [0x1d, 0x7c, density], // GS |  density, for printers that read it
    [0x1d, 0x76, 0x30, 0x00, raster.widthBytes & 0xff, raster.widthBytes >> 8, lines & 0xff, lines >> 8],
  ]
  const head = parts.flat()
  const body = raster.widthBytes * lines // the tail is zeros: white paper
  const job = new Uint8Array(head.length + body + 3)
  job.set(head, 0)
  job.set(raster.data, head.length)
  job.set([0x1b, 0x4a, feed], head.length + body) // ESC J  feed n dots, where honoured
  return job
}

/**
 * Where the job splits into separate writes. The reset, heat and density
 * commands go one by one with a pause, as phomymo sends them; the header and
 * the dots follow as one stream.
 */
export const T02_PREAMBLE_LENGTHS = [2, 5, 3] as const

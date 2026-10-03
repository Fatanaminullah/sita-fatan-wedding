import { describe, it, expect } from 'vitest'
import { encodeT02Job, toRaster, T02_WIDTH_DOTS } from './thermal-print'

/** A w x h RGBA image, every pixel the given grey. */
function image(w: number, h: number, grey: number) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = grey
    data[i + 3] = 255
  }
  return { width: w, height: h, data }
}

describe('toRaster', () => {
  it('prints the T02 full width: 384 dots, 48 bytes a line', () => {
    const r = toRaster(image(400, 240, 255))
    expect(r.widthBytes).toBe(48)
    expect(T02_WIDTH_DOTS).toBe(384)
    // Scaled to the print width, keeping the label's proportions.
    expect(r.heightLines).toBe(230)
    expect(r.data.length).toBe(48 * 230)
  })

  it('turns white into nothing and black into dots', () => {
    expect(toRaster(image(384, 2, 255)).data.every((b) => b === 0)).toBe(true)
    expect(toRaster(image(384, 2, 0)).data.every((b) => b === 0xff)).toBe(true)
  })

  it('packs the leftmost pixel into the highest bit', () => {
    const img = image(384, 1, 255)
    img.data[0] = img.data[1] = img.data[2] = 0
    const r = toRaster(img)
    expect(r.data[0]).toBe(0x80)
    expect(r.data[1]).toBe(0)
  })

  it('treats a transparent pixel as paper', () => {
    const img = image(384, 1, 0)
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 0
    expect(toRaster(img).data.every((b) => b === 0)).toBe(true)
  })
})

describe('encodeT02Job', () => {
  const raster = { widthBytes: 48, heightLines: 300, data: new Uint8Array(48 * 300) }
  const job = encodeT02Job(raster, { density: 6, feedDots: 80 })

  it('starts by resetting the printer', () => {
    expect([...job.slice(0, 2)]).toEqual([0x1b, 0x40])
  })

  it('declares the raster with its width and a 16-bit line count', () => {
    const at = findSequence(job, [0x1d, 0x76, 0x30, 0x00])
    expect(at).toBeGreaterThan(0)
    expect([...job.slice(at + 4, at + 8)]).toEqual([48, 0, 300 & 0xff, 300 >> 8])
    expect(job.length - (at + 8)).toBe(48 * 300 + 3)
  })

  it('feeds past the tear bar afterwards', () => {
    expect([...job.slice(-3)]).toEqual([0x1b, 0x4a, 80])
  })
})

function findSequence(haystack: Uint8Array, needle: number[]) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

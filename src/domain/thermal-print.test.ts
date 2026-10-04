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
  const raster = { widthBytes: 48, heightLines: 300, data: new Uint8Array(48 * 300).fill(0xff) }
  const job = encodeT02Job(raster, { density: 6, tailLines: 200 })
  const header = findSequence(job, [0x1d, 0x76, 0x30, 0x00])

  it('starts by resetting the printer', () => {
    expect([...job.slice(0, 2)]).toEqual([0x1b, 0x40])
  })

  it('declares the label plus the blank tail as one raster, with a 16-bit line count', () => {
    expect(header).toBeGreaterThan(0)
    expect([...job.slice(header + 4, header + 8)]).toEqual([48, 0, 500 & 0xff, 500 >> 8])
    expect(job.length - (header + 8)).toBe(48 * 500 + 3)
  })

  // On a real T02 the feed command did nothing, so the label is pushed past
  // the tear bar by printing blank paper after it.
  it('prints blank paper after the label', () => {
    const start = header + 8 + 48 * 300
    expect(job.slice(start, start + 48 * 200).every((b) => b === 0)).toBe(true)
  })

  it('carries a long enough tail by default', () => {
    const plain = encodeT02Job({ widthBytes: 48, heightLines: 1, data: new Uint8Array(48) })
    const at = findSequence(plain, [0x1d, 0x76, 0x30, 0x00])
    expect(plain[at + 6] + (plain[at + 7] << 8)).toBe(1 + 90)
  })
})

function findSequence(haystack: Uint8Array, needle: number[]) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

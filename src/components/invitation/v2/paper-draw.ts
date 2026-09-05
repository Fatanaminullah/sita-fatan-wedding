/** Canvas text helpers shared by everything printed on paper. */

export const PAPER = '#F7F3EC'
export const INK = '#5E040E'
export const SOFT = 'rgba(42,35,33,.72)'

export type Fonts = { display: string; text: string }

export function mid(ctx: CanvasRenderingContext2D, txt: string, y: number, x: number) {
  ctx.fillText(txt, x - ctx.measureText(txt).width / 2, y)
}

export function track(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, sp: number) {
  const chars = [...txt]
  let total = 0
  for (const c of chars) total += ctx.measureText(c).width + sp
  total -= sp
  let cx = x - total / 2
  for (const c of chars) {
    ctx.fillText(c, cx, y)
    cx += ctx.measureText(c).width + sp
  }
}

export function wrapMid(ctx: CanvasRenderingContext2D, text: string, y: number, maxW: number, lh: number, x: number) {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (ctx.measureText(t).width > maxW && line) {
      mid(ctx, line, yy, x)
      line = w
      yy += lh
    } else line = t
  }
  if (line) mid(ctx, line, yy, x)
  return yy
}

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Paper fibre and a soft vignette on the given grid. Call after the fill. */
export function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 4711) {
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s >>> 8) / 8388608
  }
  ctx.lineWidth = 1
  const n = Math.round((w * h) / 1100)
  for (let i = 0; i < n; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const a = rnd() * Math.PI
    const l = 3 + rnd() * 9
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(200,181,154,.16)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75)
  vg.addColorStop(0, 'rgba(200,181,154,0)')
  vg.addColorStop(1, 'rgba(200,181,154,.22)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)
}

/** The engraved double rule with corner lozenges, from the certificate. */
export function engravedFrame(ctx: CanvasRenderingContext2D, w: number, h: number, inset = 62, gap = 18) {
  ctx.strokeStyle = INK
  ctx.lineWidth = 3.5
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2)
  ctx.lineWidth = 1.2
  const i2 = inset + gap
  ctx.strokeRect(i2, i2, w - i2 * 2, h - i2 * 2)
  ctx.fillStyle = INK
  for (const [x, y] of [
    [i2, i2],
    [w - i2, i2],
    [w - i2, h - i2],
    [i2, h - i2],
  ]) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-6, -6, 12, 12)
    ctx.restore()
  }
}

export function rule(ctx: CanvasRenderingContext2D, x: number, y: number, half: number) {
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x - half, y)
  ctx.lineTo(x - 16, y)
  ctx.moveTo(x + 16, y)
  ctx.lineTo(x + half, y)
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.PI / 4)
  ctx.fillRect(-4.5, -4.5, 9, 9)
  ctx.restore()
}

'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as T from 'three'
import { RSVP_DEADLINE, WEDDING_DATE } from './content'

/**
 * The letter, as a sheet of paper hanging in the air.
 *
 * Ported from ThreeUI's "3D Paper, Certificate" (source bundle
 * https://threeui.com/source-code/3d-paper.json, SHA-256 0cb83da7…, three
 * r149). The sheet simulation, the arc-length bend in the vertex shader, the
 * rim/alpha fragment patch, drag-to-turn with a measured throw, the hover
 * light, the settle-to-nearest-turn and the intro rise are the author's code,
 * moved onto the three.js r185 already in this bundle (colorSpace for
 * encoding, opaque_fragment for output_fragment, geometryNormal/ViewDir for
 * the removed geometry struct). What is drawn on the paper is ours.
 *
 * Not an iframe: that would ship a second three.js, fetch Google Fonts, and
 * sit as an opaque box on top of the photograph.
 */
export type PaperLetterHandle = {
  /** The sheet lifts away and dissolves. Resolves when it is gone. */
  dismiss: () => Promise<void>
}

const TW = 1200
const TH = 1656
const CW = 1400
const CH = 1932
const SW = 2.3
const SH = 2.72
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

const PAPER = '#F7F3EC'
const INK = '#5E040E'
const SOFT = 'rgba(42,35,33,.72)'

/* ---------- the letter, drawn on the 1200x1656 grid ------------------ */
function mid(ctx: CanvasRenderingContext2D, txt: string, y: number, x = 600) {
  ctx.fillText(txt, x - ctx.measureText(txt).width / 2, y)
}
function track(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, sp: number) {
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
function wrapMid(ctx: CanvasRenderingContext2D, text: string, y: number, maxW: number, lh: number) {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (ctx.measureText(t).width > maxW && line) {
      mid(ctx, line, yy)
      line = w
      yy += lh
    } else line = t
  }
  if (line) mid(ctx, line, yy)
  return yy
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawLetter(
  ctx: CanvasRenderingContext2D,
  o: { name: string; display: string; text: string; answered: boolean; mark: HTMLImageElement | null }
) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, TW, TH)

  // a whisper of fibre so the sheet reads as paper under the reflections
  let s = 4711
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s >>> 8) / 8388608
  }
  ctx.lineWidth = 1
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * TW
    const y = rnd() * TH
    const a = rnd() * Math.PI
    const l = 3 + rnd() * 9
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(200,181,154,.16)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
  const vg = ctx.createRadialGradient(TW / 2, TH / 2, TH * 0.3, TW / 2, TH / 2, TH * 0.75)
  vg.addColorStop(0, 'rgba(200,181,154,0)')
  vg.addColorStop(1, 'rgba(200,181,154,.22)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, TW, TH)

  // engraved double rule with corner lozenges, from the certificate
  ctx.strokeStyle = INK
  ctx.lineWidth = 3.5
  ctx.strokeRect(62, 62, TW - 124, TH - 124)
  ctx.lineWidth = 1.2
  ctx.strokeRect(80, 80, TW - 160, TH - 160)
  ctx.fillStyle = INK
  for (const [x, y] of [
    [80, 80],
    [TW - 80, 80],
    [TW - 80, TH - 80],
    [80, TH - 80],
  ]) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-6, -6, 12, 12)
    ctx.restore()
  }
  const rule = (y: number, half: number) => {
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(600 - half, y)
    ctx.lineTo(600 - 16, y)
    ctx.moveTo(600 + 16, y)
    ctx.lineTo(600 + half, y)
    ctx.stroke()
    ctx.save()
    ctx.translate(600, y)
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-4.5, -4.5, 9, 9)
    ctx.restore()
  }

  // the monogram: the keyed bitmap, centred
  if (o.mark) {
    const mw = 250
    ctx.drawImage(o.mark, 600 - mw / 2, 140, mw, mw)
  }

  ctx.fillStyle = SOFT
  ctx.font = `500 24px ${o.text}`
  track(ctx, 'DEAR', 600, 440, 10)

  // The guest's name is the largest thing on the sheet. Long names step
  // down, then wrap, until they sit inside the rules.
  ctx.fillStyle = INK
  let size = 132
  ctx.font = `400 ${size}px ${o.display}`
  while (ctx.measureText(o.name).width > 940 && size > 72) {
    size -= 6
    ctx.font = `400 ${size}px ${o.display}`
  }
  const nameBottom = wrapMid(ctx, o.name, 560, 940, size * 1.02)

  ctx.fillStyle = SOFT
  ctx.font = `italic 400 40px ${o.display}`
  const inviteY = wrapMid(ctx, 'you are invited to the wedding of', nameBottom + 96, 900, 48)

  ctx.fillStyle = INK
  ctx.font = `400 128px ${o.display}`
  mid(ctx, 'Sita', inviteY + 150)
  ctx.font = `italic 400 54px ${o.display}`
  mid(ctx, 'and', inviteY + 214)
  ctx.font = `400 128px ${o.display}`
  const namesBottom = inviteY + 340
  mid(ctx, 'Fatan', namesBottom)
  rule(namesBottom + 60, 150)

  ctx.fillStyle = INK
  ctx.font = `500 23px ${o.text}`
  track(ctx, WEDDING_DATE.long.toUpperCase(), 600, namesBottom + 130, 7)

  if (!o.answered) {
    ctx.fillStyle = SOFT
    ctx.font = `400 25px ${o.text}`
    mid(ctx, `Kindly reply by ${RSVP_DEADLINE.long}`, namesBottom + 184)
  }

  rule(1500, 180)
  ctx.fillStyle = SOFT
  ctx.font = `500 18px ${o.text}`
  track(ctx, 'JAKARTA · MMXXVI', 600, 1556, 6)
}

function makeLetterTexture(o: Parameters<typeof drawLetter>[1]) {
  const c = document.createElement('canvas')
  c.width = CW
  c.height = CH
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, CW, CH)
  ctx.save()
  ctx.scale(CW / TW, CH / TH)
  rr(ctx, 0, 0, TW, TH, 26)
  ctx.clip()
  drawLetter(ctx, o)
  ctx.restore()
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/* ---------- the bend: verbatim from the source -------------------------- */
const WAVE = `
uniform float uTime, uAmp, uFlutter, uPhase, uFreq, uTwist;
uniform vec2  uSize;

float sAmp(float u, float v){ return uAmp*(0.10 + pow(u,1.35))*(0.50 + 0.64*v); }
float sAmpV(float u){        return uAmp*(0.10 + pow(u,1.35))*0.64; }

float sTheta(float u, float v){
  float a  = sAmp(u,v);
  float ph = uFreq*u + uTwist*v + uTime*0.40 + uPhase;
  return a*sin(ph) + uFlutter*a*0.60*sin(ph*2.35 + uTime*2.0);
}
float sThetaV(float u, float v){
  float a  = sAmp(u,v), da = sAmpV(u);
  float ph = uFreq*u + uTwist*v + uTime*0.40 + uPhase;
  float f  = ph*2.35 + uTime*2.0;
  return da*sin(ph) + a*cos(ph)*uTwist
       + uFlutter*0.60*(da*sin(f) + a*cos(f)*uTwist*2.35);
}
float sYoff(float u, float v){
  float w = 1.0 - 0.55*v;
  return 0.021*uSize.y*sin(2.05*u + uTime*0.47 + uPhase)
       + 0.013*uSize.y*sin(3.35*u - 1.55*v + uTime*0.63 + uPhase)*w;
}
float sYdU(float u, float v){
  float w = 1.0 - 0.55*v;
  return 0.0431*uSize.y*cos(2.05*u + uTime*0.47 + uPhase)
       + 0.0436*uSize.y*cos(3.35*u - 1.55*v + uTime*0.63 + uPhase)*w;
}
float sYdV(float u, float v){
  float ph = 3.35*u - 1.55*v + uTime*0.63 + uPhase;
  return 0.013*uSize.y*(-1.55*cos(ph)*(1.0-0.55*v) - 0.55*sin(ph));
}

void sheetPoint(vec2 q, out vec3 P, out vec3 NN){
  float u = q.x, v = q.y;
  float x=0.0, z=0.0, xe=0.0, ze=0.0, dxv=0.0, dzv=0.0, dxe=0.0, dze=0.0;
  const int NS = 20;
  float h = 1.0/float(NS);
  for(int i=0;i<NS;i++){
    float uu = (float(i)+0.5)*h;
    float w  = clamp((u-(uu-0.5*h))/h, 0.0, 1.0);
    float th = sTheta(uu,v);
    float dt = sThetaV(uu,v);
    float c = cos(th), sn = sin(th);
    xe += c*h;          ze += sn*h;
    dxe += -sn*dt*h;    dze +=  c*dt*h;
    x   += c*h*w;       z   += sn*h*w;
    dxv += -sn*dt*h*w;  dzv +=  c*dt*h*w;
  }
  float W = uSize.x, H = uSize.y;
  float th0 = sTheta(u,v);
  P = vec3((x - xe*0.5)*W, (v-0.5)*H + sYoff(u,v), (z - ze*0.5)*W);
  vec3 Tu = vec3(W*cos(th0), sYdU(u,v), W*sin(th0));
  vec3 Tv = vec3((dxv - dxe*0.5)*W, H + sYdV(u,v), (dzv - dze*0.5)*W);
  NN = normalize(cross(Tu, Tv));
}`

function envTexture() {
  const w = 1024
  const h = 512
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#3a3d47')
  g.addColorStop(0.46, '#171820')
  g.addColorStop(1, '#08080a')
  x.fillStyle = g
  x.fillRect(0, 0, w, h)
  const blob = (cx: number, cy: number, rx: number, ry: number, col: string, a: string) => {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
    rg.addColorStop(0, col.replace('A', a))
    rg.addColorStop(1, col.replace('A', '0'))
    x.save()
    x.translate(cx, cy)
    x.scale(1, ry / rx)
    x.translate(-cx, -cy)
    x.fillStyle = rg
    x.beginPath()
    x.arc(cx, cy, rx, 0, 7)
    x.fill()
    x.restore()
  }
  blob(w * 0.3, h * 0.24, 330, 240, 'rgba(255,252,246,A)', '1')
  blob(w * 0.74, h * 0.34, 240, 200, 'rgba(150,175,235,A)', '.42')
  blob(w * 0.52, h * 0.86, 420, 190, 'rgba(255,170,120,A)', '.10')
  const t = new T.CanvasTexture(c)
  t.mapping = T.EquirectangularReflectionMapping
  t.colorSpace = T.SRGBColorSpace
  return t
}

type Props = {
  guestName: string
  answered: boolean
  /** Boot the scene (the intro rise) when this turns true. */
  started: boolean
  /** The sheet has left, by drag or by dismiss(). */
  onOpened: () => void
}

export const PaperLetter = forwardRef<PaperLetterHandle, Props>(function PaperLetter(
  { guestName, answered, started, onOpened },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<{ dismiss: () => Promise<void> } | null>(null)
  // The callback is read through a ref so a new arrow from the parent never
  // rebuilds the scene mid-flight (it did: the sheet reset while leaving).
  const onOpenedRef = useRef(onOpened)
  useEffect(() => {
    onOpenedRef.current = onOpened
  }, [onOpened])

  useImperativeHandle(ref, () => ({
    dismiss: () => api.current?.dismiss() ?? Promise.resolve(),
  }))

  useEffect(() => {
    if (!started) return
    const hostEl = hostRef.current
    const canvas = canvasRef.current
    if (!hostEl || !canvas) return
    const host: HTMLDivElement = hostEl

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // next/font gives the families private names; read them off the page.
    const probe = document.createElement('span')
    probe.className = 'inv-display'
    host.appendChild(probe)
    const display = getComputedStyle(probe).fontFamily
    probe.className = 'inv-body'
    const text = getComputedStyle(probe).fontFamily
    host.removeChild(probe)

    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = T.SRGBColorSpace
    renderer.toneMapping = T.NoToneMapping

    const scene = new T.Scene()
    const camera = new T.PerspectiveCamera(24, 1, 0.1, 100)
    camera.position.set(0, 0, 8.2)

    const pmrem = new T.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    const envSrc = envTexture()
    scene.environment = pmrem.fromEquirectangular(envSrc).texture

    const key = new T.DirectionalLight(0xfff6ec, 1.42)
    key.position.set(-3.3, 2.1, 2.0)
    const fill = new T.DirectionalLight(0x9fb6ff, 0.13)
    fill.position.set(3.6, -1.8, 1.6)
    const rim = new T.DirectionalLight(0xffffff, 0.1)
    rim.position.set(1.6, 1.2, -2.6)
    scene.add(key, fill, rim, new T.AmbientLight(0xffffff, 0.16))

    // r155+ point lights are in candela; the source's 2.6 read as unlit.
    const touchLight = new T.PointLight(0xffd9a8, 0, 7.5, 1.35)
    touchLight.position.set(0, 0, 1.7)
    scene.add(touchLight)

    const geo = new T.PlaneGeometry(SW, SH, 72, 96)
    const uni = {
      uTime: { value: 0 },
      uAmp: { value: 0.62 },
      uFreq: { value: 4.7 },
      uTwist: { value: 1.3 },
      uSize: { value: new T.Vector2(SW, SH) },
      uFlutter: { value: 0 },
      uPhase: { value: 0 },
      uRim: { value: 0.05 },
      uRimA: { value: 0.0 },
      uSpecA: { value: 0.0 },
      uRimCol: { value: new T.Color(0xffe8c8) },
    }

    let mark: HTMLImageElement | null = null
    let tex = makeLetterTexture({ name: guestName, display, text, answered, mark })
    const mat = new T.MeshPhysicalMaterial({
      map: tex,
      color: new T.Color(0xffffff),
      side: T.DoubleSide,
      metalness: 0.0,
      roughness: 0.86,
      clearcoat: 0.0,
      clearcoatRoughness: 0.5,
      sheen: 0.34,
      sheenRoughness: 0.9,
      sheenColor: new T.Color(0xffffff),
      envMapIntensity: 0.16,
      specularIntensity: 0.3,
      transparent: true,
      alphaTest: 0.42,
      opacity: 1,
    })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + WAVE)
        .replace(
          '#include <beginnormal_vertex>',
          `
      vec3 sheetP; vec3 objectNormal;
      sheetPoint(uv, sheetP, objectNormal);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif
    `
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = sheetP;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRim, uRimA, uSpecA;\nuniform vec3 uRimCol;')
        .replace('#include <alphatest_fragment>', 'if ( diffuseColor.a / max(opacity,1e-4) < alphaTest ) discard;')
        .replace(
          '#include <opaque_fragment>',
          `
      float fres = pow(1.0 - clamp(abs(dot(geometryNormal, geometryViewDir)),0.0,1.0), 3.2);
      outgoingLight += fres * uRim * uRimCol;
      float baseA = diffuseColor.a / max(opacity, 1e-4);
      float outA  = clamp(baseA + fres*uRimA
                        + uSpecA*dot(outgoingLight, vec3(0.3333)), 0.0, 1.0) * opacity;
      gl_FragColor = vec4( outgoingLight, outA );
    `
        )
    }

    const mesh = new T.Mesh(geo, mat)
    const group = new T.Group()
    group.add(mesh)
    scene.add(group)

    const haloTex = (() => {
      const s = 256
      const c = document.createElement('canvas')
      c.width = c.height = s
      const x = c.getContext('2d')!
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(0,0,0,.55)')
      g.addColorStop(0.45, 'rgba(0,0,0,.28)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = g
      x.fillRect(0, 0, s, s)
      const t = new T.CanvasTexture(c)
      t.colorSpace = T.SRGBColorSpace
      return t
    })()
    const haloMat = new T.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0.55 })
    const halo = new T.Mesh(new T.PlaneGeometry(3.9, 4.9), haloMat)
    halo.position.z = -0.62
    group.add(halo)

    /* ---- pointer: drag up to open, hover to light --------------------- */
    // The source turned the sheet under drag. Here a drag lifts it: past a
    // third of the way up, or with a flick, it leaves; otherwise it settles.
    let dragging = false
    let lift = 0
    let liftTarget = 0
    let startY = 0
    let lastY = 0
    let lastT = 0
    let liftVel = 0
    let overSheet = false
    let hover = 0
    let hoverTarget = 0
    let quad: number[][] | null = null
    let cursorNow = ''
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    let vw = 0
    let vh = 0
    let left = 0
    let top = 0

    const _v = new T.Vector3()
    function cornerPoint(qx: number, qy: number) {
      const t = uni.uTime.value
      const ph = uni.uPhase.value
      const A = uni.uAmp.value
      const F = uni.uFreq.value
      const TWs = uni.uTwist.value
      const u = qx
      const v = qy
      const theta = (uu: number) => A * (0.1 + Math.pow(uu, 1.35)) * (0.5 + 0.64 * v) * Math.sin(F * uu + TWs * v + t * 0.4 + ph)
      let x = 0
      let z = 0
      let xe = 0
      let ze = 0
      const N = 20
      const h = 1 / N
      for (let i = 0; i < N; i++) {
        const uu = (i + 0.5) * h
        const w = clamp((u - (uu - 0.5 * h)) / h, 0, 1)
        const th = theta(uu)
        const c = Math.cos(th)
        const s = Math.sin(th)
        xe += c * h
        ze += s * h
        x += c * h * w
        z += s * h * w
      }
      const yo = 0.021 * SH * Math.sin(2.05 * u + t * 0.47 + ph) + 0.013 * SH * Math.sin(3.35 * u - 1.55 * v + t * 0.63 + ph) * (1 - 0.55 * v)
      return _v.set((x - xe * 0.5) * SW, (v - 0.5) * SH + yo, (z - ze * 0.5) * SW)
    }
    function buildQuad() {
      const pts: number[][] = []
      for (const [u, v] of [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ]) {
        cornerPoint(u, v).applyMatrix4(group.matrixWorld).project(camera)
        pts.push([(_v.x * 0.5 + 0.5) * vw, (-_v.y * 0.5 + 0.5) * vh])
      }
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4
      const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4
      quad = pts.map(([x, y]) => [cx + (x - cx) * 1.07, cy + (y - cy) * 1.07])
    }
    function inQuad(px: number, py: number) {
      if (!quad) return false
      let sign = 0
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = quad[i]
        const [bx, by] = quad[(i + 1) % 4]
        const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
        if (c !== 0) {
          const s = c > 0 ? 1 : -1
          if (sign === 0) sign = s
          else if (s !== sign) return false
        }
      }
      return true
    }

    // Pointer positions are measured against the host, not the window: the
    // sheet lives inside a section, not a page of its own.
    const local = (e: PointerEvent) => [e.clientX - left, e.clientY - top]
    const onMove = (e: PointerEvent) => {
      const [px, py] = local(e)
      mouse.tx = (px / vw - 0.5) * 2
      mouse.ty = (py / vh - 0.5) * 2
      if (dragging) {
        const now = performance.now()
        liftVel = (lastY - e.clientY) / Math.max(1, now - lastT)
        lastY = e.clientY
        lastT = now
        liftTarget = clamp((startY - e.clientY) / vh, 0, 1.2)
        return
      }
      overSheet = inQuad(px, py)
      hoverTarget = overSheet ? 1 : 0
    }
    const onDown = (e: PointerEvent) => {
      const [px, py] = local(e)
      if (inQuad(px, py) && leaving === 0) {
        dragging = true
        startY = e.clientY + lift * vh
        lastY = e.clientY
        lastT = performance.now()
        liftVel = 0
      }
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      if (liftTarget > 0.33 || liftVel > 0.9) {
        leaving = 0.0001
      } else {
        liftTarget = 0
      }
    }
    const onLeave = () => {
      hoverTarget = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    host.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    host.addEventListener('pointerleave', onLeave)

    /* ---- resize --------------------------------------------------------- */
    function resize() {
      const r = host.getBoundingClientRect()
      vw = r.width
      vh = r.height
      left = r.left
      top = r.top
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(vw, vh, false)
      camera.aspect = vw / vh
      camera.updateProjectionMatrix()
      const visH = 2 * camera.position.z * Math.tan(T.MathUtils.degToRad(camera.fov) / 2)
      const visW = visH * camera.aspect
      const wCap = Math.min(0.88, 0.6 + Math.max(0, 1.45 - camera.aspect) * 0.45)
      group.scale.setScalar(Math.min((visH * 0.735) / SH, (visW * wCap) / SW))
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    const onScroll = () => {
      const r = host.getBoundingClientRect()
      left = r.left
      top = r.top
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    /* ---- loop ----------------------------------------------------------- */
    const clock = new T.Clock()
    const lightPos = new T.Vector3()
    let intro = 0
    let leaving = 0
    let leaveResolve: (() => void) | null = null
    let openedFired = false
    let raf = 0
    let alive = true

    function frame() {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime
      uni.uTime.value = REDUCED ? 2.4 : t * 0.55

      intro += (1 - intro) * Math.min(1, dt * 1.9)
      if (leaving > 0) {
        leaving = Math.min(1, leaving + dt * 1.4)
        if (leaving >= 1) {
          if (leaveResolve) {
            leaveResolve()
            leaveResolve = null
          }
          if (!openedFired) {
            openedFired = true
            onOpenedRef.current()
          }
        }
      }
      const gone = leaving
      const fade = Math.max(0, 1 - gone - Math.max(0, lift - 0.5) * 1.6)
      mat.opacity = intro * fade
      haloMat.opacity = intro * 0.55 * fade

      lift += (liftTarget - lift) * Math.min(1, dt * (dragging ? 18 : 6))

      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3.0)
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3.0)
      const idle = REDUCED ? 0 : 1
      const rise = 1 - intro
      const up = lift * 3.2 + gone * gone * 3.0
      // Idle sway at a third of the source's amplitude: the sheet is read, not watched.
      group.rotation.y = mouse.x * 0.05 + Math.sin(t * 0.23) * 0.016 * idle
      group.rotation.x = -mouse.y * 0.035 + Math.sin(t * 0.19) * 0.01 * idle + rise * 0.28 - (lift + gone) * 0.25
      group.rotation.z = Math.sin(t * 0.27) * 0.006 * idle
      group.position.y = Math.sin(t * 0.36) * 0.02 * idle - rise * 0.7 + up
      group.position.x = Math.sin(t * 0.21) * 0.015 * idle + mouse.x * 0.03
      group.updateMatrixWorld()

      hover += (hoverTarget - hover) * Math.min(1, dt * 4.5)
      touchLight.intensity = hover * 2.6 * 1.2 * intro
      if (hover > 0.002) {
        lightPos.set(mouse.tx, -mouse.ty, 0.5).unproject(camera).sub(camera.position).normalize()
        touchLight.position.copy(camera.position).addScaledVector(lightPos, (1.75 - camera.position.z) / lightPos.z)
      }

      buildQuad()
      const wantCursor = dragging ? 'grabbing' : overSheet && leaving === 0 ? 'grab' : ''
      if (wantCursor !== cursorNow) {
        cursorNow = wantCursor
        host.style.cursor = wantCursor
      }

      renderer.render(scene, camera)
    }

    function boot() {
      if (!alive) return
      const t2 = makeLetterTexture({ name: guestName, display, text, answered, mark })
      tex.dispose()
      tex = t2
      mat.map = t2
      mat.needsUpdate = true
      resize()
      mesh.visible = true
      mat.opacity = 0.002
      renderer.compile(scene, camera)
      renderer.render(scene, camera)
      mat.opacity = 1
      frame()
    }

    if (process.env.NODE_ENV !== 'production') {
      ;(window as unknown as { __paper?: unknown }).__paper = {
        state: () => ({ lift, liftTarget, dragging, leaving, vh, vw, intro, quad }),
      }
    }

    api.current = {
      dismiss: () =>
        new Promise<void>((resolve) => {
          if (leaving > 0) return resolve()
          leaving = 0.0001
          leaveResolve = resolve
        }),
    }

    const markReady = new Promise<void>((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        mark = img
        resolve()
      }
      img.onerror = () => resolve()
      img.src = '/monogram-mark.png'
    })
    const fonts = document.fonts
    const fontsReady = fonts?.ready
      ? Promise.all([
          fonts.load(`400 150px ${display}`),
          fonts.load(`italic 400 60px ${display}`),
          fonts.load(`500 22px ${text}`),
        ]).then(() => fonts.ready)
      : Promise.resolve()
    Promise.race([Promise.all([fontsReady, markReady]), new Promise((r) => setTimeout(r, 2500))]).then(boot)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      host.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll)
      geo.dispose()
      mat.dispose()
      tex.dispose()
      haloTex.dispose()
      haloMat.dispose()
      envSrc.dispose()
      scene.environment?.dispose()
      pmrem.dispose()
      renderer.dispose()
      api.current = null
    }
  }, [started, guestName, answered])

  return (
    <div ref={hostRef} className="inv-paper" aria-label={`A letter addressed to ${guestName}`} role="img">
      <canvas ref={canvasRef} className="inv-paper__gl" />
    </div>
  )
})

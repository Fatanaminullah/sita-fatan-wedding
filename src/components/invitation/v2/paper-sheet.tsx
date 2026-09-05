'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as T from 'three'
import { rr, type Fonts } from './paper-draw'

/**
 * A sheet of paper hanging in the air, printed on both sides.
 *
 * The simulation is ThreeUI's "3D Paper" (source bundle
 * https://threeui.com/source-code/3d-paper.json, certificate variant, three
 * r149), ported line for line onto the three.js r185 already in this bundle:
 * the arc-length bend in the vertex shader, the rim/alpha fragment patch,
 * drag with a measured throw, the hover light, the settle, the intro rise.
 * Two things are ours: the back face samples a second texture (the source
 * printed glass, one image both ways), and `mode` chooses what a drag does.
 *
 *   mode="lift"  a drag lifts the sheet; past a third, or a flick, it leaves
 *                (the letter on the cover)
 *   mode="turn"  a drag turns it, settling on the nearest face so the back
 *                can be read (the source's own interaction; the gift card)
 *
 * Everything printed is drawn by the caller on an authoring grid of
 * `grid.w` x `grid.h`, rendered at `pixels` for crispness.
 */
export type PaperSheetHandle = {
  /** lift only: the sheet leaves. Resolves when it is gone. */
  dismiss: () => Promise<void>
  /** turn only: flip to the other face. */
  flip: () => void
}

export type DrawFn = (ctx: CanvasRenderingContext2D, env: Fonts & { mark: HTMLImageElement | null }) => void

type Props = {
  /** Authoring grid the draw functions use. */
  grid: { w: number; h: number }
  /** Backing canvas size. */
  pixels: { w: number; h: number }
  /** Sheet size in world units. The camera sits at z=8.2, fov 24. */
  world: { w: number; h: number }
  /** How much of the host the sheet may fill (fraction of its height). */
  fit?: number
  /** Bend depth. The source used 1.18; the letter reads better at half. */
  amp?: number
  /** Ambient light multiplier. The card sits on an ivory ground and needs more. */
  ambient?: number
  /** Opacity of the dark cloud behind the sheet. */
  halo?: number
  /** Self-light, 0 to 1: lifts the print toward its own paper colour on a light ground. */
  glow?: number
  mode: 'lift' | 'turn'
  front: DrawFn
  back?: DrawFn
  /** Fonts to wait for before the first paint. */
  fontsToLoad?: string[]
  /** Boot the scene (the intro rise) when this turns true. */
  started: boolean
  /** lift: the sheet has left, by drag or by dismiss(). */
  onOpened?: () => void
  /** turn: the face now showing (0 front, 1 back). */
  onFace?: (face: 0 | 1) => void
  /**
   * WebGL could not carry the sheet (no WebGL2, a context lost, a shader the
   * GPU refused). The parent shows a plain card instead. Called at most once.
   */
  onFallback?: () => void
  ariaLabel: string
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

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

function makeTexture(grid: Props['grid'], pixels: Props['pixels'], draw: DrawFn | undefined, env: Parameters<DrawFn>[1]) {
  const c = document.createElement('canvas')
  c.width = pixels.w
  c.height = pixels.h
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, pixels.w, pixels.h)
  ctx.save()
  ctx.scale(pixels.w / grid.w, pixels.h / grid.h)
  rr(ctx, 0, 0, grid.w, grid.h, Math.min(grid.w, grid.h) * 0.022)
  ctx.clip()
  if (draw) draw(ctx, env)
  ctx.restore()
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

export const PaperSheet = forwardRef<PaperSheetHandle, Props>(function PaperSheet(
  {
    grid,
    pixels,
    world,
    fit = 0.735,
    amp = 0.62,
    ambient = 1,
    halo: haloOpacity = 0.55,
    glow = 0,
    mode,
    front,
    back,
    fontsToLoad = [],
    started,
    onOpened,
    onFace,
    onFallback,
    ariaLabel,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<PaperSheetHandle | null>(null)
  // Callbacks and draw functions are read through refs so a new arrow from
  // the parent never rebuilds the scene mid-flight.
  const cb = useRef({ onOpened, onFace, onFallback, front, back })
  useEffect(() => {
    cb.current = { onOpened, onFace, onFallback, front, back }
  }, [onOpened, onFace, onFallback, front, back])

  useImperativeHandle(ref, () => ({
    dismiss: () => api.current?.dismiss() ?? Promise.resolve(),
    flip: () => api.current?.flip(),
  }))

  const SW = world.w
  const SH = world.h

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

    // Older Android: no WebGL2, or a context that dies on creation. three
    // r185 needs WebGL2, so bow out to the plain card before touching it.
    let fellBack = false
    const fallBack = () => {
      if (fellBack) return
      fellBack = true
      cb.current.onFallback?.()
    }
    let gl2: WebGL2RenderingContext | null = null
    try {
      gl2 = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      gl2 = null
    }
    if (!gl2) {
      fallBack()
      return
    }
    let renderer: T.WebGLRenderer
    try {
      renderer = new T.WebGLRenderer({ canvas, context: gl2, antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      fallBack()
      return
    }
    const onContextLost = (e: Event) => {
      e.preventDefault()
      fallBack()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
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
    scene.add(key, fill, rim, new T.AmbientLight(0xffffff, 0.16 * ambient))

    // r155+ point lights are in candela; the source's 2.6 read as unlit.
    const touchLight = new T.PointLight(0xffd9a8, 0, 7.5, 1.35)
    touchLight.position.set(0, 0, 1.7)
    scene.add(touchLight)

    const geo = new T.PlaneGeometry(SW, SH, 72, 96)
    const uni = {
      uTime: { value: 0 },
      uAmp: { value: amp },
      uFreq: { value: 4.7 },
      uTwist: { value: 1.3 },
      uSize: { value: new T.Vector2(SW, SH) },
      uFlutter: { value: 0 },
      uPhase: { value: 0 },
      uRim: { value: 0.05 },
      uRimA: { value: 0.0 },
      uSpecA: { value: 0.0 },
      uRimCol: { value: new T.Color(0xffe8c8) },
      backMap: { value: null as T.Texture | null },
      uBack: { value: 0 },
    }

    let mark: HTMLImageElement | null = null
    const env = () => ({ display, text, mark })
    let tex = makeTexture(grid, pixels, cb.current.front, env())
    let texBack = makeTexture(grid, pixels, cb.current.back ?? cb.current.front, env())
    uni.backMap.value = texBack
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
      emissive: new T.Color(0xffffff),
      emissiveIntensity: glow,
    })
    // Emissive multiplies by the map too, so the print glows as itself.
    mat.emissiveMap = tex
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
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uRim, uRimA, uSpecA, uBack;\nuniform vec3 uRimCol;\nuniform sampler2D backMap;'
        )
        // The back of the sheet is its own print, mirrored so it reads
        // correctly when turned over. Which print shows is decided on the
        // CPU from the turn angle (uBack), not from gl_FrontFacing, which
        // the bent geometry did not report reliably.
        .replace(
          '#include <map_fragment>',
          `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = uBack > 0.5
          ? texture2D( backMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) )
          : texture2D( map, vMapUv );
        diffuseColor *= sampledDiffuseColor;
      #endif
    `
        )
        // The self-light follows the same face switch, or the front print
        // ghosts through the back.
        .replace(
          '#include <emissivemap_fragment>',
          `
      #ifdef USE_EMISSIVEMAP
        vec4 emissiveColor = uBack > 0.5
          ? texture2D( backMap, vec2( 1.0 - vEmissiveMapUv.x, vEmissiveMapUv.y ) )
          : texture2D( emissiveMap, vEmissiveMapUv );
        totalEmissiveRadiance *= emissiveColor.rgb;
      #endif
    `
        )
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
    const haloMat = new T.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: haloOpacity })
    const halo = new T.Mesh(new T.PlaneGeometry(SW * 1.7, SH * 1.8), haloMat)
    halo.position.z = -0.62
    group.add(halo)

    /* ---- pointer ---------------------------------------------------------- */
    let dragging = false
    // lift
    let lift = 0
    let liftTarget = 0
    let startY = 0
    let lastY = 0
    let lastT = 0
    let liftVel = 0
    // turn (the source's drag, settling on the nearest face)
    let dragYaw = 0
    let dragPitch = 0
    let release = 0
    let velYaw = 0
    let velPitch = 0
    let prevYaw = 0
    let prevPitch = 0
    let lastPX = 0
    let lastPY = 0
    let face: 0 | 1 = 0
    // shared
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

    const local = (e: PointerEvent) => [e.clientX - left, e.clientY - top]
    const onMove = (e: PointerEvent) => {
      const [px, py] = local(e)
      mouse.tx = (px / vw - 0.5) * 2
      mouse.ty = (py / vh - 0.5) * 2
      if (dragging) {
        if (mode === 'lift') {
          const now = performance.now()
          liftVel = (lastY - e.clientY) / Math.max(1, now - lastT)
          lastY = e.clientY
          lastT = now
          liftTarget = clamp((startY - e.clientY) / vh, 0, 1.2)
        } else {
          const dx = e.clientX - lastPX
          const dy = e.clientY - lastPY
          lastPX = e.clientX
          lastPY = e.clientY
          dragYaw += dx * 0.006
          dragPitch = clamp(dragPitch - dy * 0.0045, -0.6, 0.6)
        }
        return
      }
      overSheet = inQuad(px, py)
      hoverTarget = overSheet ? 1 : 0
    }
    const onDown = (e: PointerEvent) => {
      const [px, py] = local(e)
      if (!inQuad(px, py) || leaving !== 0) return
      dragging = true
      if (mode === 'lift') {
        startY = e.clientY + lift * vh
        lastY = e.clientY
        lastT = performance.now()
        liftVel = 0
      } else {
        lastPX = e.clientX
        lastPY = e.clientY
        velYaw = velPitch = 0
        prevYaw = dragYaw
        prevPitch = dragPitch
      }
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      if (mode === 'lift') {
        if (liftTarget > 0.33 || liftVel > 0.9) leaving = 0.0001
        else liftTarget = 0
      } else {
        release = 0.6
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

    /* ---- resize ----------------------------------------------------------- */
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
      group.scale.setScalar(Math.min((visH * fit) / SH, (visW * wCap) / SW))
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    const onScroll = () => {
      const r = host.getBoundingClientRect()
      left = r.left
      top = r.top
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    /* ---- loop ------------------------------------------------------------- */
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
            cb.current.onOpened?.()
          }
        }
      }
      const gone = leaving
      const fade = Math.max(0, 1 - gone - Math.max(0, lift - 0.5) * 1.6)
      mat.opacity = intro * fade
      haloMat.opacity = intro * haloOpacity * fade

      if (mode === 'lift') {
        lift += (liftTarget - lift) * Math.min(1, dt * (dragging ? 18 : 6))
      } else if (dragging) {
        const k = Math.min(1, dt * 14)
        velYaw += ((dragYaw - prevYaw) / Math.max(dt, 1e-3) - velYaw) * k
        velPitch += ((dragPitch - prevPitch) / Math.max(dt, 1e-3) - velPitch) * k
        velYaw = clamp(velYaw, -7, 7)
        velPitch = clamp(velPitch, -4, 4)
      } else {
        dragYaw += velYaw * dt
        dragPitch = clamp(dragPitch + velPitch * dt, -0.6, 0.6)
        const decay = Math.pow(0.018, dt)
        velYaw *= decay
        velPitch *= decay
        release = Math.max(0, release - dt)
        if (release <= 0) {
          // Settle on the nearest face (half turn), so the back can be read.
          const home = Math.round(dragYaw / Math.PI) * Math.PI
          const k = Math.min(1, dt * 0.9)
          dragYaw += (home - dragYaw) * k
          dragPitch -= dragPitch * k
        }
      }
      prevYaw = dragYaw
      prevPitch = dragPitch
      uni.uBack.value = Math.cos(dragYaw) < 0 ? 1 : 0
      const nowFace: 0 | 1 = Math.round(dragYaw / Math.PI) % 2 === 0 ? 0 : 1
      if (nowFace !== face) {
        face = nowFace
        cb.current.onFace?.(face)
      }

      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3.0)
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3.0)
      const idle = REDUCED ? 0 : 1
      const rise = 1 - intro
      const up = lift * 3.2 + gone * gone * 3.0
      group.rotation.y = dragYaw + mouse.x * 0.05 + Math.sin(t * 0.23) * 0.016 * idle
      group.rotation.x = dragPitch - mouse.y * 0.035 + Math.sin(t * 0.19) * 0.01 * idle + rise * 0.28 - (lift + gone) * 0.25
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
      const e = env()
      const t2 = makeTexture(grid, pixels, cb.current.front, e)
      const b2 = makeTexture(grid, pixels, cb.current.back ?? cb.current.front, e)
      tex.dispose()
      texBack.dispose()
      tex = t2
      texBack = b2
      mat.map = t2
      mat.emissiveMap = t2
      uni.backMap.value = b2
      mat.needsUpdate = true
      resize()
      mesh.visible = true
      mat.opacity = 0.002
      renderer.compile(scene, camera)
      // A shader the GPU rejected leaves a program that is not runnable;
      // three logs it and draws nothing. Treat it as no WebGL.
      const broken = renderer.info.programs?.some((pr) => {
        const d = (pr as unknown as { diagnostics?: { runnable?: boolean } }).diagnostics
        return d !== undefined && d.runnable === false
      })
      if (broken) {
        fallBack()
        return
      }
      renderer.render(scene, camera)
      mat.opacity = 1
      frame()
    }

    if (process.env.NODE_ENV !== 'production') {
      const w = window as unknown as { __sheets?: unknown[] }
      w.__sheets = w.__sheets ?? []
      w.__sheets.push({
        mode,
        state: () => ({ dragYaw, face, intro, leaving }),
        programs: () =>
          renderer.info.programs?.map((pr) => ({
            name: pr.name,
            back: String(renderer.getContext().getShaderSource(pr.fragmentShader) ?? '').includes('backMap'),
          })),
      })
    }

    api.current = {
      dismiss: () =>
        new Promise<void>((resolve) => {
          if (leaving > 0) return resolve()
          leaving = 0.0001
          leaveResolve = resolve
        }),
      flip: () => {
        if (mode !== 'turn') return
        velYaw = 0
        release = 0
        dragYaw = (Math.round(dragYaw / Math.PI) + 1) * Math.PI
      },
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
      ? Promise.all(fontsToLoad.map((f) => fonts.load(f.replace('$display', display).replace('$text', text)))).then(() => fonts.ready)
      : Promise.resolve()
    Promise.race([Promise.all([fontsReady, markReady]), new Promise((r) => setTimeout(r, 2500))]).then(boot)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', onContextLost)
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
      texBack.dispose()
      haloTex.dispose()
      haloMat.dispose()
      envSrc.dispose()
      scene.environment?.dispose()
      pmrem.dispose()
      renderer.dispose()
      api.current = null
    }
    // The draw functions and callbacks are read through cb; the scene is
    // rebuilt only for a new sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, mode, SW, SH, grid.w, grid.h, pixels.w, pixels.h, fit, amp, ambient, haloOpacity, glow])

  return (
    <div ref={hostRef} className="inv-paper" aria-label={ariaLabel} role="img">
      <canvas ref={canvasRef} className="inv-paper__gl" />
    </div>
  )
})

'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { DEPTH, ENTRY, FADE, SPACING, ribbonTravel } from './tunnel-ribbon'

/**
 * A tunnel of photographs the guest travels through. Adapted from the
 * "3D Gallery Photography" component on 21st.dev (moazamtrade): planes spread
 * around the camera's axis, sliding toward the viewer, fading and blurring at
 * both ends of the depth range, with a cloth-like curve under momentum.
 *
 * Changes from the original, all for this page: it is a ribbon, not a loop.
 * Every photograph exists once, in order, and the guest's position in the
 * pinned scroll is the only thing that moves them. By the end of the hold the
 * last one has passed the camera and the tunnel is empty, which is the whole
 * point: a loop driven by momentum could never promise that anyone saw the
 * fifteenth picture, and did not.
 *
 * State lives in refs, so the frame loop never re-renders. The set repeats,
 * so several planes share one texture.
 */
type Img = { src: string; width?: number; height?: number; alt?: string }

const MAX_X = 8
const MAX_Y = 8

/**
 * Where a photograph has to be whole: the moment it is first at full
 * opacity and clear of blur. Nearer than this it flies past the edges of
 * the screen, which is the point of a tunnel; before it, it is still
 * fading up out of the dark.
 */
const HERO_P = FADE.inEnd + 0.01
/**
 * How much of a photograph must be on screen at that moment. Not all of it:
 * a little bleed is what stops the tunnel reading as a contact sheet.
 */
const MIN_VISIBLE = 0.86
const BLUR = { inStart: 0.0, inEnd: 0.1, outStart: 0.4, outEnd: 0.43, max: 4 }

function createClothMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      map: { value: null },
      opacity: { value: 1 },
      blurAmount: { value: 0 },
      scrollForce: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: `
      uniform float scrollForce;
      uniform float time;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float curveIntensity = scrollForce * 0.3;
        float d = length(pos.xy);
        float curve = d * d * curveIntensity;
        float ripple1 = sin(pos.x * 2.0 + scrollForce * 3.0) * 0.02;
        float ripple2 = sin(pos.y * 2.5 + scrollForce * 2.0) * 0.015;
        float cloth = (ripple1 + ripple2) * abs(curveIntensity) * 2.0;
        pos.z -= (curve + cloth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      uniform float blurAmount;
      uniform float scrollForce;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(map, vUv);
        if (blurAmount > 0.0) {
          vec2 texel = 1.0 / vec2(textureSize(map, 0));
          vec4 acc = vec4(0.0);
          float total = 0.0;
          for (float x = -1.0; x <= 1.0; x += 1.0) {
            for (float y = -1.0; y <= 1.0; y += 1.0) {
              vec2 off = vec2(x, y) * texel * blurAmount;
              float w = 1.0 / (1.0 + length(vec2(x, y)));
              acc += texture2D(map, vUv + off) * w;
              total += w;
            }
          }
          color = acc / total;
        }
        color.rgb += vec3(abs(scrollForce) * 0.005);
        gl_FragColor = vec4(color.rgb, color.a * opacity);
      }
    `,
  })
}

/** The fraction of a span of half-size `half`, centred at `offset`, inside `limit`. */
function visibleSpan(offset: number, half: number, limit: number) {
  const lo = Math.max(offset - half, -limit)
  const hi = Math.min(offset + half, limit)
  return Math.max(0, hi - lo) / (2 * half)
}

/**
 * How much of the scatter a photograph can take and still show MIN_VISIBLE
 * of itself. Bisected rather than solved, because the two axes bind at
 * different offsets and the answer has to satisfy both at once. A plane
 * that cannot make it even dead centre (wider than the frustum) gets 0,
 * which is the best place for it.
 */
function fitScale(dx: number, dy: number, hw: number, hh: number, limitW: number, limitH: number) {
  const seen = (s: number) => visibleSpan(dx * s, hw, limitW) * visibleSpan(dy * s, hh, limitH)
  if (seen(1) >= MIN_VISIBLE) return 1
  let lo = 0
  let hi = 1
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    if (seen(mid) >= MIN_VISIBLE) lo = mid
    else hi = mid
  }
  return lo
}

function ramp(p: number, aStart: number, aEnd: number, bStart: number, bEnd: number) {
  // 0 before aStart, rises to 1 by aEnd, holds, falls to 0 between bStart and bEnd.
  if (p < aStart) return 0
  if (p < aEnd) return (p - aStart) / (aEnd - aStart)
  if (p < bStart) return 1
  if (p < bEnd) return 1 - (p - bStart) / (bEnd - bStart)
  return 0
}

type Sim = {
  /** Where the ribbon has travelled, in world units. Follows the scroll. */
  travel: number
  /** Travel per second, smoothed. Only the cloth shader reads it. */
  force: number
}

/**
 * One frame of the tunnel. Lives outside the component so every mutation
 * (uniforms, mesh transforms) is plain data work the React compiler does not
 * need to reason about.
 */
function stepTunnel(
  sim: Sim,
  dt: number,
  time: number,
  target: number,
  materials: THREE.ShaderMaterial[],
  meshes: (THREE.Mesh | null)[],
  /** One entry per plane. Duplicated photographs share a texture object. */
  textures: THREE.Texture[],
  positions: { x: number; y: number }[],
  planes: { w: number; h: number }[]
) {
  // The scroll says where to be; this is how fast the tunnel agrees to go.
  // It is the whole of the old momentum: a fling still overshoots into a
  // glide, but it can never take a photograph past the camera early, because
  // it is chasing a position rather than adding to one.
  const before = sim.travel
  sim.travel += (target - sim.travel) * Math.min(1, dt * 4)
  const speed = dt > 0 ? (sim.travel - before) / dt : 0
  sim.force += (speed * 0.06 - sim.force) * Math.min(1, dt * 6)

  for (let i = 0; i < planes.length; i++) {
    // The far end of the tunnel is z = 0 and the camera is at 0.45 of the
    // depth, so a photograph's whole life is travel passing through its own
    // place on the ribbon.
    const z = sim.travel - i * SPACING
    const mat = materials[i]
    const mesh = meshes[i]
    if (!mat || !mesh) continue
    const p = z / DEPTH
    const opacity = p < 0 || p > 1 ? 0 : ramp(p, FADE.inStart, FADE.inEnd, FADE.outStart, FADE.outEnd)
    mesh.visible = opacity > 0.001
    if (!mesh.visible) continue

    mat.uniforms.time.value = time
    mat.uniforms.scrollForce.value = sim.force
    mat.uniforms.opacity.value = opacity
    mat.uniforms.blurAmount.value = BLUR.max * (1 - ramp(p, BLUR.inStart, BLUR.inEnd, BLUR.outStart, BLUR.outEnd))

    const tex = textures[i]
    if (mat.uniforms.map.value !== tex) mat.uniforms.map.value = tex
    mesh.position.set(positions[i].x, positions[i].y, z - DEPTH / 2)
    mesh.scale.set(planes[i].w, planes[i].h, 1)
  }
}

function Scene({
  images,
  progress,
}: {
  images: Img[]
  /** Where the guest is inside the pinned hold, 0 to 1. The only driver. */
  progress: React.RefObject<number>
}) {
  // The ribbon repeats its photographs, so several planes point at the same
  // file. They must share one texture: useLoader calls loader.load() once per
  // entry it is handed and three's Cache is off by default, so a duplicated
  // url would become a second Texture and a second upload to the GPU. On the
  // non-hijab set that alone would have been another 430MB.
  const unique = useMemo(() => Array.from(new Set(images.map((i) => i.src))), [images])
  const loaded = useTexture(unique)
  const textures = useMemo(() => {
    const bySrc = new Map(unique.map((src, i) => [src, loaded[i]]))
    return images.map((img) => bySrc.get(img.src) as THREE.Texture)
  }, [images, unique, loaded])
  const materials = useMemo(() => images.map(() => createClothMaterial()), [images])
  const sim = useRef<Sim>({ travel: ENTRY, force: 0 })
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const travelEnd = ribbonTravel(images.length)

  useEffect(() => {
    loaded.forEach((t) => {
      // No colour space, on purpose. The planes use a raw ShaderMaterial that
      // writes gl_FragColor straight out and never converts back to sRGB, so
      // an sRGB texture was decoded to linear and shown as such: grey 128
      // came out as 55, and the photographs read darker, harsher and more
      // saturated, like an edit. Left untagged, the file's own sRGB values
      // reach the screen unchanged (2026-09-16). needsUpdate, because drei
      // caches these textures across mounts and one may already be on the
      // GPU with the old tag.
      if (t.colorSpace !== THREE.NoColorSpace) {
        t.colorSpace = THREE.NoColorSpace
        t.needsUpdate = true
      }
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.anisotropy = 4
    })
  }, [loaded])

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  /**
   * Plane size in world units, from the dimensions the set declares rather
   * than from the texture, so a photograph is never a frame at the wrong
   * shape while its file is still arriving. The short side is always 2, so
   * a portrait and a landscape frame carry the same weight in the tunnel.
   */
  const planes = useMemo(
    () =>
      images.map((img) => {
        const aspect = img.width && img.height ? img.width / img.height : 1
        return aspect > 1 ? { w: 2 * aspect, h: 2 } : { w: 2, h: 2 / aspect }
      }),
    [images]
  )

  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)

  /**
   * The scatter, pulled back until every photograph is actually on screen
   * when it matters. The spread used to be fixed world units chosen blind:
   * on a phone the frustum at the hero depth is about six units across and
   * planes were being thrown eleven, so a photograph could live its whole
   * lit life half off the side. The direction of the scatter is unchanged;
   * only how far it is allowed to go, and that now comes from this
   * viewport, this camera and this photograph's own shape.
   */
  const positions = useMemo(() => {
    const d = DEPTH * (0.5 - HERO_P)
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55
    const halfH = d * Math.tan((fov * Math.PI) / 360)
    const halfW = halfH * (size.width / Math.max(1, size.height))

    return planes.map((plane, i) => {
      const ha = (i * 2.618) % (Math.PI * 2)
      const va = (i * 1.618 + Math.PI / 3) % (Math.PI * 2)
      const dx = (Math.sin(ha) * ((i % 3) * 1.2) * MAX_X) / 3
      const dy = (Math.cos(va) * (((i + 1) % 4) * 0.8) * MAX_Y) / 4
      const s = fitScale(dx, dy, plane.w / 2, plane.h / 2, halfW, halfH)
      return { x: dx * s, y: dy * s }
    })
  }, [planes, size.width, size.height, camera])

  useFrame((state, delta) => {
    stepTunnel(
      sim.current,
      Math.min(delta, 0.05),
      state.clock.getElapsedTime(),
      ENTRY + (progress.current ?? 0) * travelEnd,
      materials,
      meshes.current,
      textures,
      positions,
      planes
    )
  })

  return (
    <>
      {images.map((img, i) => (
        <mesh
          // Index, not src: the ribbon shows some photographs twice.
          key={i}
          ref={(m) => {
            meshes.current[i] = m
          }}
          material={materials[i]}
          visible={false}
        >
          <planeGeometry args={[1, 1, 24, 24]} />
        </mesh>
      ))}
    </>
  )
}

export default function TunnelScene({
  images,
  progress,
}: {
  images: Img[]
  progress: React.RefObject<number>
}) {
  return (
    <Canvas
      // Not the origin: R3F points a fresh camera at (0,0,0), and a camera
      // standing on the point it looks at has no view matrix. NaN in the
      // projection took the whole context down.
      camera={{ position: [0, 0, 0.01], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}
    >
      <Scene images={images} progress={progress} />
    </Canvas>
  )
}

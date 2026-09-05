'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

/**
 * A tunnel of photographs the guest travels through. Adapted from the
 * "3D Gallery Photography" component on 21st.dev (moazamtrade): planes spread
 * around the camera's axis, sliding toward the viewer, fading and blurring at
 * both ends of the depth range, with a cloth-like curve under momentum.
 *
 * Changes from the original, all for this page: momentum lives in refs, not
 * React state, so the frame loop never re-renders; the wheel listener binds to
 * this canvas rather than the first canvas on the page (the ring is one); the
 * page's own scroll feeds momentum, so on a phone the tunnel moves with the
 * thumb and never traps the scroll; textures come from the 900px copies.
 */
type Img = { src: string; alt?: string }

const DEPTH = 50
const MAX_X = 8
const MAX_Y = 8

const FADE = { inStart: 0.05, inEnd: 0.25, outStart: 0.4, outEnd: 0.43 }
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

function ramp(p: number, aStart: number, aEnd: number, bStart: number, bEnd: number) {
  // 0 before aStart, rises to 1 by aEnd, holds, falls to 0 between bStart and bEnd.
  if (p < aStart) return 0
  if (p < aEnd) return (p - aStart) / (aEnd - aStart)
  if (p < bStart) return 1
  if (p < bEnd) return 1 - (p - bStart) / (bEnd - bStart)
  return 0
}

type Plane = { z: number; imageIndex: number }
type Sim = {
  planes: Plane[]
  velocity: number
  lastInteraction: number
}

/**
 * One frame of the tunnel. Lives outside the component so every mutation
 * (planes, uniforms, mesh transforms) is plain data work the React compiler
 * does not need to reason about.
 */
function stepTunnel(
  sim: Sim,
  dt: number,
  time: number,
  speed: number,
  impulse: React.RefObject<number>,
  materials: THREE.ShaderMaterial[],
  meshes: (THREE.Mesh | null)[],
  textures: THREE.Texture[],
  positions: { x: number; y: number }[]
) {
  if (impulse.current) {
    sim.velocity += impulse.current
    impulse.current = 0
    sim.lastInteraction = performance.now()
  }
  if (performance.now() - sim.lastInteraction > 3000) sim.velocity += 0.3 * dt * speed
  sim.velocity *= 0.95

  const n = textures.length
  const advance = sim.planes.length % n || n

  sim.planes.forEach((plane, i) => {
    let z = plane.z + sim.velocity * dt * 10
    if (z >= DEPTH) {
      const wraps = Math.floor(z / DEPTH)
      z -= DEPTH * wraps
      plane.imageIndex = (plane.imageIndex + wraps * advance) % n
    } else if (z < 0) {
      const wraps = Math.ceil(-z / DEPTH)
      z += DEPTH * wraps
      const step = plane.imageIndex - wraps * advance
      plane.imageIndex = ((step % n) + n) % n
    }
    plane.z = ((z % DEPTH) + DEPTH) % DEPTH

    const p = plane.z / DEPTH
    const mat = materials[i]
    mat.uniforms.time.value = time
    mat.uniforms.scrollForce.value = sim.velocity
    mat.uniforms.opacity.value = ramp(p, FADE.inStart, FADE.inEnd, FADE.outStart, FADE.outEnd)
    mat.uniforms.blurAmount.value = BLUR.max * (1 - ramp(p, BLUR.inStart, BLUR.inEnd, BLUR.outStart, BLUR.outEnd))

    const tex = textures[plane.imageIndex]
    if (mat.uniforms.map.value !== tex) mat.uniforms.map.value = tex
    const mesh = meshes[i]
    if (mesh) {
      // Planes past the fade are still real draw calls unless told otherwise.
      mesh.visible = mat.uniforms.opacity.value > 0.001
      mesh.position.set(positions[i].x, positions[i].y, plane.z - DEPTH / 2)
      const img = tex.image as { width: number; height: number } | undefined
      const aspect = img ? img.width / img.height : 1
      if (aspect > 1) mesh.scale.set(2 * aspect, 2, 1)
      else mesh.scale.set(2, 2 / aspect, 1)
    }
  })
}

function Scene({
  images,
  visibleCount,
  speed,
  impulse,
}: {
  images: Img[]
  visibleCount: number
  speed: number
  /** External momentum, written by the section (page scroll). Consumed each frame. */
  impulse: React.RefObject<number>
}) {
  const gl = useThree((s) => s.gl)
  const textures = useTexture(images.map((i) => i.src))
  const materials = useMemo(() => Array.from({ length: visibleCount }, createClothMaterial), [visibleCount])
  const sim = useRef<Sim>({ planes: [], velocity: 0, lastInteraction: 0 })
  const meshes = useRef<(THREE.Mesh | null)[]>([])

  useEffect(() => {
    textures.forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.anisotropy = 4
    })
  }, [textures])

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const positions = useMemo(() => {
    const out: { x: number; y: number }[] = []
    for (let i = 0; i < visibleCount; i++) {
      const ha = (i * 2.618) % (Math.PI * 2)
      const va = (i * 1.618 + Math.PI / 3) % (Math.PI * 2)
      const hr = (i % 3) * 1.2
      const vr = ((i + 1) % 4) * 0.8
      out.push({ x: (Math.sin(ha) * hr * MAX_X) / 3, y: (Math.cos(va) * vr * MAX_Y) / 4 })
    }
    return out
  }, [visibleCount])

  useEffect(() => {
    sim.current.planes = Array.from({ length: visibleCount }, (_, i) => ({
      z: ((DEPTH / visibleCount) * i) % DEPTH,
      imageIndex: i % images.length,
    }))
  }, [visibleCount, images.length])

  // Wheel and keys on this canvas only. No preventDefault: the page keeps
  // scrolling, and that scroll feeds the tunnel too.
  useEffect(() => {
    const el = gl.domElement
    const s = sim.current
    const onWheel = (e: WheelEvent) => {
      s.velocity += e.deltaY * 0.004 * speed
      s.lastInteraction = performance.now()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') s.velocity -= 2 * speed
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') s.velocity += 2 * speed
      else return
      s.lastInteraction = performance.now()
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [gl, speed])

  useFrame((state, delta) => {
    stepTunnel(
      sim.current,
      Math.min(delta, 0.05),
      state.clock.getElapsedTime(),
      speed,
      impulse,
      materials,
      meshes.current,
      textures,
      positions
    )
  })

  return (
    <>
      {Array.from({ length: visibleCount }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m
          }}
          material={materials[i]}
        >
          <planeGeometry args={[1, 1, 24, 24]} />
        </mesh>
      ))}
    </>
  )
}

export default function TunnelScene({
  images,
  impulse,
  visibleCount = 10,
  speed = 1,
}: {
  images: Img[]
  impulse: React.RefObject<number>
  visibleCount?: number
  speed?: number
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
      <Scene images={images} visibleCount={Math.min(visibleCount, images.length)} speed={speed} impulse={impulse} />
    </Canvas>
  )
}

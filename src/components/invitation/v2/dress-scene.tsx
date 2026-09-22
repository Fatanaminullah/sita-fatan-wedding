'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Guests dressed for the evening, turning slowly on a floor under a spot.
 * The figures are the owner's models (Tripo, from Gemini concepts of the
 * couple's own reference photographs), meshopt-compressed to about half a
 * megabyte each. Her and him always stand together: the section shows the
 * dress code, not the guest. Three tones, one look each per figure; picking
 * a tone crossfades both while the turntable keeps turning.
 *
 * Every model is normalised on load: stood on the floor, centred, scaled
 * to the same height, so the nine of them share one camera.
 */
export const LOOKS = {
  man: ['/guests/man-01.glb', '/guests/man-02.glb', '/guests/man-03.glb'],
  hijab: ['/guests/hijab-01.glb', '/guests/hijab-02.glb', '/guests/hijab-03.glb'],
  woman: ['/guests/woman-01.glb', '/guests/woman-02.glb', '/guests/woman-03.glb'],
} as const

export type Figure = { url: string; x: number; yaw: number }

/** Shared turntable state: the finger's spin, and the idle turn after it. */
type Spin = { angle: number; velocity: number; dragging: boolean; lastX: number; idleAt: number }

const HEIGHT = 1.78

function Model({ url, x, yaw, fadeKey, spinRef }: Figure & { fadeKey: string; spinRef: React.RefObject<Spin> }) {
  // Meshopt: the decoder ships inside three, nothing fetched from a CDN.
  const { scene } = useGLTF(url, undefined, true)
  const group = useRef<THREE.Group>(null)
  const fade = useRef(0)

  // A clone per placement, so the same look can stand twice, with every
  // material its own copy for the crossfade.
  const model = useMemo(() => {
    const m = scene.clone(true)
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const k = HEIGHT / size.y
    const c = box.getCenter(new THREE.Vector3())
    m.position.set(-c.x * k, -box.min.y * k, -c.z * k)
    m.scale.setScalar(k)
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh
        const src = mesh.material as THREE.MeshStandardMaterial
        // Tripo ships a physical material with volume and a glossy
        // roughness map; cloth is matte. Keep the colour and the normal
        // map, drop the rest.
        const mat = new THREE.MeshStandardMaterial({
          map: src.map,
          normalMap: src.normalMap,
          roughness: 0.88,
          metalness: 0,
          envMapIntensity: 0.45,
          transparent: true,
          opacity: 0,
        })
        mesh.material = mat
        mesh.frustumCulled = false
      }
    })
    return m
  }, [scene])

  useEffect(
    () => () => {
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) ((o as THREE.Mesh).material as THREE.Material).dispose()
      })
    },
    [model]
  )

  useFrame((_, dt) => {
    // Each figure turns on its own spot, so a pair never eclipse each other,
    // all of them by the one shared angle the finger (or the idle turn) sets.
    if (group.current && spinRef.current) group.current.rotation.y = yaw + spinRef.current.angle
    // Rise from nothing over a breath.
    if (fade.current < 1) {
      fade.current = Math.min(1, fade.current + dt * 2.2)
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) ((o as THREE.Mesh).material as THREE.Material).opacity = fade.current
      })
      if (fade.current >= 1) {
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) ((o as THREE.Mesh).material as THREE.Material).transparent = false
        })
      }
    }
  })

  return (
    <group ref={group} key={fadeKey} position={[x, 0, 0]}>
      <primitive object={model} />
    </group>
  )
}

function Room() {
  const gl = useThree((s) => s.gl)
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return tex
  }, [gl])
  useEffect(() => () => env.dispose(), [env])
  return <primitive attach="environment" object={env} />
}

function Stage({ figures, spinRef }: { figures: Figure[]; spinRef: React.RefObject<Spin> }) {
  useFrame((_, dt) => {
    const sp = spinRef.current
    if (!sp) return
    if (sp.dragging) return
    // Coast on the finger's velocity, then settle into the slow idle turn.
    sp.velocity *= Math.pow(0.08, dt)
    const idle = performance.now() > sp.idleAt ? 0.22 : 0
    sp.angle += (sp.velocity + idle) * dt
  })
  return (
    <group position={[0, -0.95, 0]}>
      <group>
        {figures.map((f, i) => (
          <Suspense key={f.url + i} fallback={null}>
            <Model {...f} fadeKey={f.url} spinRef={spinRef} />
          </Suspense>
        ))}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[1.9, 64]} />
        <meshStandardMaterial color={0x3f3935} roughness={0.95} />
      </mesh>
    </group>
  )
}

function Frame({ count }: { count: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const narrow = size.width < size.height
    const z = count > 1 ? (narrow ? 5.4 : 4.0) : narrow ? 4.4 : 3.4
    camera.position.set(0, 0.2, z)
    camera.lookAt(0, -0.02, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, count])
  return null
}

export default function DressScene({ figures }: { figures: Figure[] }) {
  const spin = useRef<Spin>({ angle: 0, velocity: 0, dragging: false, lastX: 0, idleAt: 0 })
  const host = useRef<HTMLDivElement>(null)

  // Drag anywhere on the stage to turn the figures; vertical touch still
  // scrolls the page (touch-action: pan-y on the host).
  useEffect(() => {
    const el = host.current
    if (!el) return
    const sp = spin.current
    let lastT = 0
    const down = (e: PointerEvent) => {
      sp.dragging = true
      sp.lastX = e.clientX
      sp.velocity = 0
      lastT = performance.now()
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!sp.dragging) return
      const now = performance.now()
      const dx = e.clientX - sp.lastX
      const dt = Math.max(1, now - lastT) / 1000
      const da = (dx / el.clientWidth) * Math.PI * 1.6
      sp.angle += da
      sp.velocity = da / dt
      sp.lastX = e.clientX
      lastT = now
    }
    const up = () => {
      if (!sp.dragging) return
      sp.dragging = false
      // The idle turn waits a few seconds after the hand lets go.
      sp.idleAt = performance.now() + 4000
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [])

  return (
    <div ref={host} style={{ width: '100%', height: '100%', touchAction: 'pan-y', cursor: 'grab' }}>
    <Canvas
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.2, 4.6], fov: 32, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Frame count={figures.length} />
      <Room />
      <ambientLight intensity={0.35} color={0xfff2e6} />
      <spotLight position={[2.5, 4.5, 3]} angle={0.55} penumbra={0.8} intensity={34} color={0xfff0dc} />
      <spotLight position={[-3, 3, -1]} angle={0.6} penumbra={0.9} intensity={14} color={0xdfe6f2} />
      <spotLight position={[0, 4, -3]} angle={0.5} penumbra={0.9} intensity={10} color={0xfff6ea} />
      <Stage figures={figures} spinRef={spin} />
    </Canvas>
    </div>
  )
}

/** Warm the other looks once the first is on screen. */
export function preloadLooks(urls: readonly string[]) {
  for (const u of urls) useGLTF.preload(u, undefined, true)
}

'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The Luxus ballroom chandelier, the one in the venue photograph: a wide
 * flat oval flush to the ceiling, dozens of small white lights in its
 * plate, and a dense curtain of thin crystal strands stepping down in
 * concentric tiers toward the centre, where they hang longest. Built from
 * the gate prototype's crystal chandelier (grand-door.html) and re-shaped
 * against the photograph: strands twice as dense and thinner, the tiers
 * inverted, small tips instead of balls, cool silver light instead of
 * amber. Three instanced draws for the strands, beads and tips.
 *
 * It hangs from the top of the frame over the verse, seen from below at an
 * angle, and its lights come up as the words fill in. Nothing is loaded.
 */
const RX = 1.3
const RZ = 1.7
/** Outer ring shortest, inner longest: the photograph's stepped underside. */
const RINGS = [
  { s: 1.0, n: 170, L: 0.5 },
  { s: 0.86, n: 150, L: 0.62 },
  { s: 0.72, n: 128, L: 0.78 },
  { s: 0.58, n: 104, L: 0.98 },
  { s: 0.44, n: 80, L: 1.18 },
  { s: 0.3, n: 56, L: 1.38 },
  { s: 0.16, n: 30, L: 1.52 },
]
const BEAD_GAP = 0.07

/** Deterministic noise, so the strands are the same every visit. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s >>> 8) / 8388608
  }
}

function useMaterials() {
  return useMemo(() => {
    const plate = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.35, metalness: 0.8 })
    const rim = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.25, metalness: 0.9 })
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6ea, emissiveIntensity: 3.2, roughness: 0.4 })
    const crystal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4,
      emissive: 0xe9eefc,
      emissiveIntensity: 0.1,
      depthWrite: false,
    })
    const tip = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
      depthWrite: false,
    })
    return { plate, rim, led, crystal, tip }
  }, [])
}

function Chandelier({ progress }: { progress: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const lights = useRef<THREE.PointLight[]>([])
  const M = useMaterials()
  const ledRef = useRef(M.led)

  const built = useMemo(() => {
    const rand = rng(4711)
    const geos: THREE.BufferGeometry[] = []
    const keep = <T extends THREE.BufferGeometry>(g: T) => {
      geos.push(g)
      return g
    }
    const plateShape = new THREE.Shape()
    plateShape.absellipse(0, 0, RX + 0.1, RZ + 0.1, 0, Math.PI * 2, false, 0)
    const plate = keep(new THREE.ShapeGeometry(plateShape, 64))
    const rimPts: THREE.Vector3[] = []
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2
      rimPts.push(new THREE.Vector3(Math.cos(a) * (RX + 0.08), 0, Math.sin(a) * (RZ + 0.08)))
    }
    const rim = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 128, 0.045, 10, true))
    // Dozens of small lights in the plate, in three elliptical rings.
    const ledGeo = keep(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 10))
    const leds: [number, number, number][] = []
    for (const [r, n] of [
      [0.92, 22],
      [0.66, 16],
      [0.38, 10],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r
        leds.push([Math.cos(a) * RX * r, -0.02, Math.sin(a) * RZ * r])
      }
    }
    leds.push([0, -0.02, 0])
    const strands: { x: number; z: number; L: number }[] = []
    RINGS.forEach((ring, ri) => {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + ri * 0.21
        const L = ring.L + (rand() - 0.5) * 0.05
        strands.push({ x: Math.cos(a) * RX * ring.s, z: Math.sin(a) * RZ * ring.s, L })
      }
    })
    const total = strands.length
    let beadCount = 0
    for (const s of strands) beadCount += Math.max(3, Math.floor(s.L / BEAD_GAP))
    const rods = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 5)), M.crystal, total)
    const beads = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.0075, 6, 5)), M.crystal, beadCount)
    const tips = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.016, 8, 6)), M.tip, total)
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    let bi = 0
    strands.forEach((s, i) => {
      d.position.set(s.x, -s.L / 2, s.z)
      d.scale.set(1, s.L, 1)
      d.updateMatrix()
      rods.setMatrixAt(i, d.matrix)
      d.scale.set(1, 1, 1)
      const nb = Math.max(3, Math.floor(s.L / BEAD_GAP))
      for (let b = 0; b < nb; b++) {
        d.position.set(s.x, -((b + 0.6) / nb) * s.L, s.z)
        d.updateMatrix()
        beads.setMatrixAt(bi, d.matrix)
        // A little sparkle: no two beads catch the light the same.
        const k = 0.35 + rand() * 0.75
        beads.setColorAt(bi, col.setRGB(k, k, k))
        bi++
      }
      const ts = 0.8 + rand() * 0.5
      d.position.set(s.x, -s.L - 0.02, s.z)
      d.scale.set(ts, ts, ts)
      d.updateMatrix()
      tips.setMatrixAt(i, d.matrix)
    })
    rods.instanceMatrix.needsUpdate = true
    beads.instanceMatrix.needsUpdate = true
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true
    tips.instanceMatrix.needsUpdate = true
    return { geos, plate, rim, ledGeo, leds, rods, beads, tips }
  }, [M])

  useEffect(
    () => () => {
      for (const g of built.geos) g.dispose()
      for (const m of Object.values(M)) m.dispose()
    },
    [built, M]
  )

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.elapsedTime
    // The faintest sway; a thing this size barely moves.
    g.rotation.z = Math.sin(t * 0.27) * 0.006
    g.rotation.x = Math.sin(t * 0.21) * 0.004
    // The lights come up with the words.
    const p = progress.current ?? 0
    const base = 0.5 + p * 1.5
    lights.current.forEach((l, i) => {
      if (l) l.intensity = base * (1 + Math.sin(t * 1.3 + i * 1.7) * 0.04)
    })
    ledRef.current.emissiveIntensity = 1.6 + p * 2.2
  })

  return (
    <group ref={group}>
      <mesh geometry={built.plate} material={M.plate} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} />
      <mesh geometry={built.rim} material={M.rim} position={[0, -0.04, 0]} />
      {built.leds.map((p, i) => (
        <mesh key={i} geometry={built.ledGeo} material={M.led} position={p} />
      ))}
      {[
        [-0.7, -0.9],
        [0.7, -0.9],
        [0, -0.4],
        [0, -1.3],
      ].map(([dz, dy], i) => (
        <pointLight
          key={i}
          ref={(el) => {
            if (el) lights.current[i] = el
          }}
          color={0xfff8ee}
          intensity={2}
          distance={7}
          decay={1.7}
          position={[0, dy, dz]}
        />
      ))}
      <primitive object={built.rods} />
      <primitive object={built.beads} />
      <primitive object={built.tips} />
    </group>
  )
}

/** A room reflection so the chrome and crystal have something to catch. */
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

function Frame() {
  const { camera, size } = useThree()
  useEffect(() => {
    // From below and in front, as in the photograph, so the stepped
    // underside reads; a narrow screen stands further back.
    const narrow = size.width < size.height
    camera.position.set(0, narrow ? -1.7 : -1.3, narrow ? 7.2 : 3.6)
    camera.lookAt(0, narrow ? -0.6 : -0.2, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export default function ChandelierScene({ progress }: { progress: React.RefObject<number> }) {
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ position: [0, -2.4, 4.6], fov: 40, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Frame />
      <Room />
      <ambientLight intensity={0.06} color={0xf4f2ff} />
      <group position={[0, 1.6, 0]}>
        <Chandelier progress={progress} />
      </group>
    </Canvas>
  )
}

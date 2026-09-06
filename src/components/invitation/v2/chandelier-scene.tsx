'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The flush crystal chandelier from the gate prototype, on its own: a
 * chrome elliptical plate and rim, fourteen recessed downlights, three warm
 * point lights, and six concentric rings of hanging strands (522 rods,
 * ~4000 beads, a crystal ball at every tip) as three instanced draws.
 * Ported from design_handoff_grand_door/grand-door.html; the geometry and
 * the materials are the owner-approved ones ("the last chandelier is
 * pretty good").
 *
 * It hangs from the top of the frame over the verse and breathes: a slow
 * sway, and its lights come up as the words fill in. Nothing is loaded.
 */
const RX = 1.15
const RZ = 1.55
const RINGS = [
  { s: 1.0, n: 150 },
  { s: 0.84, n: 126 },
  { s: 0.66, n: 100 },
  { s: 0.48, n: 74 },
  { s: 0.3, n: 48 },
  { s: 0.14, n: 24 },
]

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
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.22, metalness: 0.75, emissive: 0x2c3038, emissiveIntensity: 0.6 })
    const glow = new THREE.MeshStandardMaterial({ color: 0xffc873, emissive: 0xffaa40, emissiveIntensity: 1.6, roughness: 0.5 })
    const crystal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.72,
      emissive: 0xcfdcff,
      emissiveIntensity: 0.18,
    })
    const ball = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
      emissive: 0xfff3e0,
      emissiveIntensity: 0.3,
    })
    return { chrome, glow, crystal, ball }
  }, [])
}

function Chandelier({ progress }: { progress: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const lights = useRef<THREE.PointLight[]>([])
  const M = useMaterials()

  const built = useMemo(() => {
    const rand = rng(4711)
    const plateShape = new THREE.Shape()
    plateShape.absellipse(0, 0, RX + 0.08, RZ + 0.08, 0, Math.PI * 2, false, 0)
    const plate = new THREE.ShapeGeometry(plateShape, 48)
    const rimPts: THREE.Vector3[] = []
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2
      rimPts.push(new THREE.Vector3(Math.cos(a) * (RX + 0.06), 0, Math.sin(a) * (RZ + 0.06)))
    }
    const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 96, 0.035, 10, true)
    const downlight = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12)
    const downlights: [number, number, number][] = []
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const r = i % 2 ? 0.55 : 0.85
      downlights.push([Math.cos(a) * RX * r, -0.03, Math.sin(a) * RZ * r])
    }
    const strands: { x: number; z: number; L: number }[] = []
    RINGS.forEach((ring, ri) => {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + ri * 0.35
        const base = 0.55 + (1 - ring.s) * 1.0
        const L = base * (1 + 0.13 * Math.sin(a * 8 + ri * 0.7)) + rand() * 0.05
        strands.push({ x: Math.cos(a) * RX * ring.s, z: Math.sin(a) * RZ * ring.s, L })
      }
    })
    const total = strands.length
    let beadCount = 0
    for (const s of strands) beadCount += Math.max(2, Math.floor(s.L / 0.13))
    const rodGeo = new THREE.CylinderGeometry(0.005, 0.005, 1, 6)
    const beadGeo = new THREE.SphereGeometry(0.014, 8, 6)
    const ballGeo = new THREE.SphereGeometry(0.028, 10, 8)
    const rods = new THREE.InstancedMesh(rodGeo, M.crystal, total)
    const beads = new THREE.InstancedMesh(beadGeo, M.crystal, beadCount)
    const balls = new THREE.InstancedMesh(ballGeo, M.ball, total)
    const d = new THREE.Object3D()
    let bi = 0
    strands.forEach((s, i) => {
      d.position.set(s.x, -s.L / 2, s.z)
      d.scale.set(1, s.L, 1)
      d.rotation.set(0, 0, 0)
      d.updateMatrix()
      rods.setMatrixAt(i, d.matrix)
      d.scale.set(1, 1, 1)
      const nb = Math.max(2, Math.floor(s.L / 0.13))
      for (let b = 0; b < nb; b++) {
        d.position.set(s.x, -((b + 0.7) / nb) * s.L, s.z)
        d.updateMatrix()
        beads.setMatrixAt(bi++, d.matrix)
      }
      const bs = 0.85 + rand() * 0.45
      d.position.set(s.x, -s.L - 0.025, s.z)
      d.scale.set(bs, bs, bs)
      d.updateMatrix()
      balls.setMatrixAt(i, d.matrix)
    })
    rods.instanceMatrix.needsUpdate = true
    beads.instanceMatrix.needsUpdate = true
    balls.instanceMatrix.needsUpdate = true
    return { plate, rim, downlight, downlights, rods, beads, balls }
  }, [M])

  useEffect(
    () => () => {
      built.plate.dispose()
      built.rim.dispose()
      built.downlight.dispose()
      built.rods.geometry.dispose()
      built.beads.geometry.dispose()
      built.balls.geometry.dispose()
      for (const m of Object.values(M)) m.dispose()
    },
    [built, M]
  )

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.elapsedTime
    // A slow sway, as if the room breathed.
    g.rotation.z = Math.sin(t * 0.31) * 0.012
    g.rotation.x = Math.sin(t * 0.23) * 0.008
    // The lights come up with the words, and flicker very slightly.
    const p = progress.current ?? 0
    const base = 1.2 + p * 3.2
    lights.current.forEach((l, i) => {
      if (l) l.intensity = base * (1 + Math.sin(t * 1.7 + i * 2.1) * 0.05)
    })
  })

  return (
    <group ref={group}>
      <mesh geometry={built.plate} material={M.chrome} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} />
      <mesh geometry={built.rim} material={M.chrome} position={[0, -0.05, 0]} />
      {built.downlights.map((p, i) => (
        <mesh key={i} geometry={built.downlight} material={M.glow} position={p} />
      ))}
      {[-0.8, 0, 0.8].map((dz, i) => (
        <pointLight
          key={dz}
          ref={(el) => {
            if (el) lights.current[i] = el
          }}
          color={0xfff0d8}
          intensity={3}
          distance={6}
          decay={1.8}
          position={[0, -0.5, dz]}
        />
      ))}
      <primitive object={built.rods} />
      <primitive object={built.beads} />
      <primitive object={built.balls} />
    </group>
  )
}

function Frame() {
  const { camera, size } = useThree()
  useEffect(() => {
    // From a little below, looking up into it; on a narrow screen the
    // chandelier sits further away so its width fits.
    const narrow = size.width < size.height
    camera.position.set(0, -1.3, narrow ? 6.4 : 3.1)
    camera.lookAt(0, narrow ? -0.2 : 0.1, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export default function ChandelierScene({ progress }: { progress: React.RefObject<number> }) {
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ position: [0, -1.15, 4.4], fov: 42, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.85 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Frame />
      <ambientLight intensity={0.08} color={0xffe9d2} />
      <directionalLight position={[2, 1, 3]} intensity={0.18} color={0xfff2e2} />
      <group position={[0, 1.55, 0]}>
        <Chandelier progress={progress} />
      </group>
    </Canvas>
  )
}

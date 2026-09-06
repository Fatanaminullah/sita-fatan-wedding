'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The candelabra chandelier from the gate prototype, the first one over the
 * hall after the door: brass chain and lathe stem, three tiers of curved
 * arms (12, 8, 6) each with a bobeche, a candle and a glowing pleated
 * shade, a crystal teardrop under every arm, a bead cascade draping from
 * the lowest tier to the stem, and one warm light in the middle. Ported
 * from design_handoff_grand_door/grand-door.html (buildCandelabra).
 *
 * It hangs from the top of the frame over the verse and breathes: a slow
 * sway, and its light comes up as the words fill in. Nothing is loaded.
 */
const TIERS = [
  { y: 2.62, r: 0.62, n: 12 },
  { y: 3.02, r: 0.44, n: 8 },
  { y: 3.38, r: 0.28, n: 6 },
]

function useMaterials() {
  return useMemo(() => {
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8b25e, roughness: 0.3, metalness: 0.4 })
    const shade = new THREE.MeshStandardMaterial({ color: 0xf3e6cf, emissive: 0xffd9a0, emissiveIntensity: 1.0, roughness: 0.7, side: THREE.DoubleSide })
    const cream = new THREE.MeshStandardMaterial({ color: 0xe9e0cd, roughness: 0.9 })
    const crystal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.72,
      emissive: 0xcfdcff,
      emissiveIntensity: 0.28,
    })
    const ball = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
      emissive: 0xfff3e0,
      emissiveIntensity: 0.5,
    })
    return { brass, shade, cream, crystal, ball }
  }, [])
}

function Chandelier({ progress }: { progress: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const M = useMaterials()
  // Mutated per frame, so it lives behind a ref.
  const shadeRef = useRef(M.shade)

  const built = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const keep = <T extends THREE.BufferGeometry>(g: T) => {
      geos.push(g)
      return g
    }
    const stemPts = [
      [0.0, 0],
      [0.05, 0.06],
      [0.03, 0.18],
      [0.08, 0.3],
      [0.04, 0.5],
      [0.09, 0.66],
      [0.05, 0.86],
      [0.1, 1.0],
      [0.04, 1.18],
      [0.02, 1.3],
    ].map(([r, y]) => new THREE.Vector2(r + 0.015, y))
    const chain = keep(new THREE.CylinderGeometry(0.013, 0.013, 1.2, 8))
    const stem = keep(new THREE.LatheGeometry(stemPts, 20))
    const finialTop = keep(new THREE.SphereGeometry(0.05, 14, 10))
    const finialBottom = keep(new THREE.SphereGeometry(0.06, 14, 10))
    const dropTip = keep(new THREE.ConeGeometry(0.035, 0.14, 10))
    const bobeche = keep(new THREE.CylinderGeometry(0.045, 0.02, 0.02, 12))
    const candle = keep(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8))
    const shade = keep(new THREE.CylinderGeometry(0.045, 0.075, 0.11, 14, 1, true))
    const drop = keep(new THREE.ConeGeometry(0.018, 0.07, 8))
    const arms = TIERS.map((tier) =>
      keep(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.03, 0, 0),
            new THREE.Vector3(tier.r * 0.45, -0.13, 0),
            new THREE.Vector3(tier.r * 0.85, -0.1, 0),
            new THREE.Vector3(tier.r, 0.05, 0),
          ]),
          16,
          0.012,
          8
        )
      )
    )
    const candles: { a: number; x: number; z: number; y: number; tier: number }[] = []
    TIERS.forEach((tier, ti) => {
      for (let i = 0; i < tier.n; i++) {
        const a = (i / tier.n) * Math.PI * 2 + ti * 0.26
        candles.push({ a, x: Math.cos(a) * tier.r, z: Math.sin(a) * tier.r, y: tier.y, tier: ti })
      }
    })
    // Crystal cascade: bead chains draping from the bottom tier to the stem.
    const chains = 40
    const beadsPer = 7
    const beads = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.013, 8, 6)), M.crystal, chains * beadsPer)
    const drops = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(0.016, 0.06, 8)), M.ball, chains)
    const dm = new THREE.Object3D()
    let k = 0
    for (let i = 0; i < chains; i++) {
      const a = (i / chains) * Math.PI * 2
      const r0 = 0.58
      const y0 = 2.6
      const r1 = 0.16
      const y1 = 2.34 - (i % 3) * 0.05
      for (let b = 0; b < beadsPer; b++) {
        const t = b / (beadsPer - 1)
        const rr = r0 + (r1 - r0) * t
        const yy = y0 + (y1 - y0) * (t * t * 0.6 + t * 0.4) - Math.sin(t * Math.PI) * 0.06
        dm.position.set(Math.cos(a) * rr, yy, Math.sin(a) * rr)
        dm.rotation.set(0, 0, 0)
        dm.updateMatrix()
        beads.setMatrixAt(k++, dm.matrix)
      }
      dm.position.set(Math.cos(a) * r0, y0 - 0.07, Math.sin(a) * r0)
      dm.rotation.set(Math.PI, 0, 0)
      dm.updateMatrix()
      drops.setMatrixAt(i, dm.matrix)
    }
    beads.instanceMatrix.needsUpdate = true
    drops.instanceMatrix.needsUpdate = true
    return { geos, chain, stem, finialTop, finialBottom, dropTip, bobeche, candle, shade, drop, arms, candles, beads, drops }
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
    // A slow sway, as if the room breathed.
    g.rotation.z = Math.sin(t * 0.31) * 0.014
    g.rotation.x = Math.sin(t * 0.23) * 0.009
    // The light comes up with the words, and flickers very slightly.
    const p = progress.current ?? 0
    if (light.current) light.current.intensity = (1.4 + p * 3.6) * (1 + Math.sin(t * 1.7) * 0.04)
    shadeRef.current.emissiveIntensity = 0.55 + p * 0.55
  })

  // The prototype's candelabra is authored with its stem around y 2.4 to
  // 3.7; the group is placed so the chain's top sits at the frame's top.
  return (
    <group ref={group}>
      <mesh geometry={built.chain} material={M.brass} position={[0, 4.32, 0]} />
      <mesh geometry={built.stem} material={M.brass} position={[0, 2.42, 0]} />
      <mesh geometry={built.finialTop} material={M.brass} position={[0, 3.72, 0]} />
      <mesh geometry={built.finialBottom} material={M.brass} position={[0, 2.36, 0]} />
      <mesh geometry={built.dropTip} material={M.ball} position={[0, 2.26, 0]} rotation={[Math.PI, 0, 0]} />
      {built.candles.map((c, i) => (
        <group key={i}>
          <mesh geometry={built.arms[c.tier]} material={M.brass} position={[0, c.y, 0]} rotation={[0, -c.a, 0]} />
          <mesh geometry={built.bobeche} material={M.brass} position={[c.x, c.y + 0.06, c.z]} />
          <mesh geometry={built.candle} material={M.cream} position={[c.x, c.y + 0.12, c.z]} />
          <mesh geometry={built.shade} material={M.shade} position={[c.x, c.y + 0.24, c.z]} />
          <mesh geometry={built.drop} material={M.ball} position={[c.x, c.y - 0.05, c.z]} rotation={[Math.PI, 0, 0]} />
        </group>
      ))}
      <primitive object={built.beads} />
      <primitive object={built.drops} />
      <pointLight ref={light} color={0xffd9a0} intensity={3} distance={6} decay={1.8} position={[0, 2.85, 0]} />
    </group>
  )
}

/** A room reflection so the brass reads as brass, baked once. */
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
    // From a little below, looking up into it; on a narrow screen the
    // chandelier sits further away so its width fits.
    const narrow = size.width < size.height
    camera.position.set(0, narrow ? 1.9 : 1.7, narrow ? 5.2 : 2.9)
    camera.lookAt(0, narrow ? 2.6 : 2.45, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export default function ChandelierScene({ progress }: { progress: React.RefObject<number> }) {
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ position: [0, 2.2, 4.4], fov: 40, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Frame />
      <Room />
      <ambientLight intensity={0.1} color={0xffe9d2} />
      <directionalLight position={[2, 4, 3]} intensity={0.35} color={0xfff2e2} />
      <Chandelier progress={progress} />
    </Canvas>
  )
}

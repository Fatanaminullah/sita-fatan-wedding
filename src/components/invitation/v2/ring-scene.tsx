'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, invalidate } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The only WebGL in the vow: a white-gold ring with an emerald-cut stone in
 * a halo, turning once as the guest scrolls past.
 *
 * Nothing is downloaded. Band, prongs, stone and halo are built from
 * primitives; the reflections come from a procedural room environment baked
 * once on mount. `frameloop="demand"` keeps the GPU asleep unless `progress`
 * changes. If the owner supplies a real GLB later, it replaces <Ring /> and
 * nothing else changes.
 */
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

function stoneGeometry() {
  // An emerald cut: an octagon extruded with a bevel, so the crown steps.
  const w = 0.3
  const h = 0.4
  const c = 0.07
  const s = new THREE.Shape()
  s.moveTo(-w + c, -h)
  s.lineTo(w - c, -h)
  s.lineTo(w, -h + c)
  s.lineTo(w, h - c)
  s.lineTo(w - c, h)
  s.lineTo(-w + c, h)
  s.lineTo(-w, h - c)
  s.lineTo(-w, -h + c)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 3 })
  g.center()
  g.rotateX(-Math.PI / 2)
  return g
}

function Ring({ progress }: { progress: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const metal = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#f1f1f3'),
        metalness: 1,
        roughness: 0.16,
        clearcoat: 0.5,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.4,
      }),
    []
  )
  const stone = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ffffff'),
        metalness: 0,
        roughness: 0.02,
        transmission: 0.92,
        ior: 2.2,
        thickness: 0.6,
        envMapIntensity: 2.2,
        clearcoat: 1,
        specularIntensity: 1,
      }),
    []
  )
  const geo = useMemo(() => stoneGeometry(), [])
  useEffect(
    () => () => {
      metal.dispose()
      stone.dispose()
      geo.dispose()
    },
    [metal, stone, geo]
  )

  // Halo: small stones around the head.
  const halo = useMemo(() => {
    const pts: [number, number][] = []
    const w = 0.42
    const h = 0.52
    const per = 6
    for (let i = 0; i < per; i++) pts.push([-w + ((2 * w) / per) * (i + 0.5), h])
    for (let i = 0; i < per; i++) pts.push([-w + ((2 * w) / per) * (i + 0.5), -h])
    for (let i = 0; i < per + 1; i++) pts.push([w, -h + ((2 * h) / (per + 1)) * (i + 0.5)])
    for (let i = 0; i < per + 1; i++) pts.push([-w, -h + ((2 * h) / (per + 1)) * (i + 0.5)])
    return pts
  }, [])

  useFrame(() => {
    const p = progress.current ?? 0
    if (!group.current) return
    // One full turn across the section, leaning as it goes.
    group.current.rotation.y = p * Math.PI * 2 - 0.5
    group.current.rotation.x = 0.9 - p * 0.5
    group.current.rotation.z = -0.15 + Math.sin(p * Math.PI) * 0.12
  })

  return (
    <group ref={group} scale={0.74} position={[0, -0.12, 0]}>
      {/* band */}
      <mesh material={metal}>
        <torusGeometry args={[1, 0.085, 32, 96]} />
      </mesh>
      {/* head, sitting on top of the band */}
      <group position={[0, 1.02, 0]}>
        <mesh material={metal} position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.36, 0.28, 0.2, 8]} />
        </mesh>
        <mesh material={stone} geometry={geo} position={[0, 0.16, 0]} />
        {halo.map(([x, z], i) => (
          <mesh key={i} material={metal} position={[x, 0.16, z]}>
            <sphereGeometry args={[0.048, 12, 12]} />
          </mesh>
        ))}
        {[
          [-0.3, 0.34],
          [0.3, 0.34],
          [0.3, -0.34],
          [-0.3, -0.34],
        ].map(([x, z], i) => (
          <mesh key={i} material={metal} position={[x, 0.26, z]}>
            <sphereGeometry args={[0.04, 10, 10]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Ticker({ progress }: { progress: React.RefObject<number> }) {
  const last = useRef(-1)
  useEffect(() => {
    let raf = 0
    const check = () => {
      if (progress.current !== last.current) {
        last.current = progress.current ?? 0
        invalidate()
      }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [progress])
  return null
}

export default function RingScene({ progress }: { progress: React.RefObject<number> }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.6], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%' }}
    >
      <Room />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-4, -1, 2]} intensity={0.5} color="#e9eef7" />
      <Ring progress={progress} />
      <Ticker progress={progress} />
    </Canvas>
  )
}

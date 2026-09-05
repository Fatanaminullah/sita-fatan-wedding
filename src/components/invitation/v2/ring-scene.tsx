'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The only WebGL in the vow: a white-gold ring with an emerald-cut stone in
 * a halo, turning once as the guest scrolls past.
 *
 * The canvas is the size of the screen and sticky; it is never moved. The
 * ring is placed inside it from the anchor the words compute. A canvas that
 * was itself transformed every scroll frame went blank on Android until the
 * scroll stopped.
 *
 * Nothing is downloaded. Band, prongs, stone and halo are built from
 * primitives; the reflections come from a procedural room environment baked
 * once on mount. The canvas exists only while the section is near, so the
 * loop costs nothing elsewhere. If the owner supplies a real GLB later, it
 * replaces <Ring /> and nothing else changes.
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

export type RingAnchor = {
  /** Ring centre, px from the top of the section. */
  y: number
  /** Ring box, px. */
  size: number
}

function Ring({
  progress,
  anchor,
  section,
}: {
  progress: React.RefObject<number>
  anchor: React.RefObject<RingAnchor>
  section: React.RefObject<HTMLElement | null>
}) {
  const group = useRef<THREE.Group>(null)
  const viewport = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
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
    const g = group.current
    const el = section.current
    const a = anchor.current
    if (!g || !el || !a) return
    // Where the words want the ring, measured against the canvas itself,
    // which sits at the section's top until it sticks: the canvas never
    // moves by script, only the ring does.
    const rect = el.getBoundingClientRect()
    const cv = gl.domElement.getBoundingClientRect()
    const frac = (rect.top + a.y - cv.top) / viewport.height
    const halfH = 4.6 * Math.tan((30 * Math.PI) / 360)
    const s = (0.88 * a.size) / viewport.height
    g.position.y = (0.5 - frac) * 2 * halfH - 0.18 * s
    g.scale.setScalar(s)
    // One full turn across the section, leaning as it goes.
    g.rotation.y = p * Math.PI * 2 - 0.5
    g.rotation.x = 0.9 - p * 0.5
    g.rotation.z = -0.15 + Math.sin(p * Math.PI) * 0.12
  })

  return (
    <group ref={group}>
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

export default function RingScene({
  progress,
  anchor,
  section,
}: {
  progress: React.RefObject<number>
  anchor: React.RefObject<RingAnchor>
  section: React.RefObject<HTMLElement | null>
}) {
  return (
    <Canvas
      // Always, not demand: the canvas is only mounted while the section is
      // near, and on demand the first frame sometimes landed before the
      // environment and materials were ready, leaving an empty box.
      frameloop="always"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.6], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%' }}
    >
      <Room />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-4, -1, 2]} intensity={0.5} color="#e9eef7" />
      <Ring progress={progress} anchor={anchor} section={section} />
    </Canvas>
  )
}

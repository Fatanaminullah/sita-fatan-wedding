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
 * Every frame has to be cheap, or a phone shows nothing during a fling: the
 * GPU is busy with the scroll, a slow WebGL frame never lands, and the
 * canvas keeps showing whatever it last managed to present, which was an
 * empty one. So: no transmission (that is a second full-screen pass), the
 * pixel ratio capped, light geometry, the shaders compiled before the first
 * frame, and nothing drawn while the section is off screen.
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
  /** Ring centre at the start and end of its travel, px from the section top. */
  y0: number
  y1: number
  /** Ring box, px. */
  size: number
}

/** Same range as the words' ScrollTrigger: top at 80% down to bottom at 35%. */
export function ringProgress(rect: DOMRect, vh: number) {
  const start = vh * 0.8
  const span = vh * 0.45 + rect.height
  return Math.max(0, Math.min(1, (start - rect.top) / span))
}

function Ring({
  progressRef,
  anchor,
  section,
}: {
  progressRef: React.RefObject<number>
  anchor: React.RefObject<RingAnchor>
  section: React.RefObject<HTMLElement | null>
}) {
  const group = useRef<THREE.Group>(null)
  const viewport = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
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
      // Glass without transmission: a white body that is nearly all
      // reflection, faintly see-through, so the facets still catch the room.
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#f4f6fb'),
        metalness: 0.2,
        roughness: 0.03,
        envMapIntensity: 2.6,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        specularIntensity: 1,
        transparent: true,
        opacity: 0.88,
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

  // Compile every program now, while the section is still screens away, so
  // the first visible frame is not also the first slow one.
  useEffect(() => {
    // Materials only link against an environment once one is attached.
    const id = requestAnimationFrame(() => {
      try {
        gl.compile(scene, camera)
      } catch {
        /* the loop compiles lazily instead */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [gl, scene, camera])

  useFrame(() => {
    const g = group.current
    const el = section.current
    const a = anchor.current
    if (!g || !el || !a) return
    const rect = el.getBoundingClientRect()
    // Two heights: the screen's, for where the section is in the scroll,
    // and the canvas's, for where the ring is in the picture. On a phone
    // the canvas is taller than the screen.
    const wh = window.innerHeight
    const vh = viewport.height
    // Nothing to draw while the section is off screen; keep the frame free.
    if (rect.bottom < -a.size || rect.top > wh + a.size || a.size === 0) {
      g.visible = false
      return
    }
    g.visible = true
    // Progress from the live rect, not from the scroll listener chain, so
    // the ring is where the words are on this very frame.
    const p = ringProgress(rect, wh)
    progressRef.current = p
    // Where the words want the ring, measured against the canvas itself,
    // which sits at the section's top until it sticks: the canvas never
    // moves by script, only the ring does.
    const cv = gl.domElement.getBoundingClientRect()
    const y = a.y0 + (a.y1 - a.y0) * p
    const frac = (rect.top + y - cv.top) / vh
    const halfH = 4.6 * Math.tan((30 * Math.PI) / 360)
    const s = (0.88 * a.size) / vh
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
        <torusGeometry args={[1, 0.085, 20, 72]} />
      </mesh>
      {/* head, sitting on top of the band */}
      <group position={[0, 1.02, 0]}>
        <mesh material={metal} position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.36, 0.28, 0.2, 8]} />
        </mesh>
        <mesh material={stone} geometry={geo} position={[0, 0.16, 0]} />
        {halo.map(([x, z], i) => (
          <mesh key={i} material={metal} position={[x, 0.16, z]}>
            <sphereGeometry args={[0.048, 8, 8]} />
          </mesh>
        ))}
        {[
          [-0.3, 0.34],
          [0.3, 0.34],
          [0.3, -0.34],
          [-0.3, -0.34],
        ].map(([x, z], i) => (
          <mesh key={i} material={metal} position={[x, 0.26, z]}>
            <sphereGeometry args={[0.04, 8, 8]} />
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
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4.6], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <Room />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-4, -1, 2]} intensity={0.5} color="#e9eef7" />
      <Ring progressRef={progress} anchor={anchor} section={section} />
    </Canvas>
  )
}

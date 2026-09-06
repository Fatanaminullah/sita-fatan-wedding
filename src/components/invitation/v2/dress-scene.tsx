'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Tailor's forms on a stand, dressed for the evening, turning slowly on a
 * stone floor. One form for a guest coming alone, two for a party: a gown
 * and a suit. The cloth is one material shared by everything worn, so a
 * tap on a swatch re-dyes the whole outfit in a breath.
 *
 * Nothing is loaded: the forms are lathes and a few boxes, the cloth a
 * physical material with sheen so black still reads as fabric under light.
 */
export type Outfit = 'gown' | 'suit'

const IVORY = 0xf7f3ec
const STAND = 0x2b2826

function lathe(points: [number, number][], segments = 48) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  )
}

/** A woman's form under a long gown: fitted bodice, soft A-line to the floor. */
function gownGeometry() {
  return lathe([
    [0.0, 0.0],
    [0.46, 0.0],
    [0.45, 0.02],
    [0.36, 0.4],
    [0.28, 0.8],
    [0.21, 1.05],
    [0.185, 1.18],
    [0.19, 1.26],
    [0.225, 1.4],
    [0.245, 1.52],
    [0.225, 1.62],
    [0.18, 1.68],
    [0.12, 1.72],
    [0.09, 1.76],
    [0.0, 1.76],
  ])
}

/** A man's form in a jacket: squared shoulders, a straight fall to the hem. */
function suitGeometry() {
  return lathe([
    [0.0, 1.0],
    [0.27, 1.0],
    [0.27, 1.02],
    [0.25, 1.2],
    [0.26, 1.4],
    [0.3, 1.58],
    [0.36, 1.7],
    [0.34, 1.75],
    [0.2, 1.78],
    [0.1, 1.8],
    [0.0, 1.8],
  ])
}

/** The trousers under the jacket, as a plain column to the floor. */
function trousersGeometry() {
  return lathe([
    [0.0, 0.0],
    [0.21, 0.0],
    [0.23, 0.5],
    [0.25, 1.0],
    [0.0, 1.0],
  ])
}

function Form({ kind, cloth, x, yaw }: { kind: Outfit; cloth: THREE.Material; x: number; yaw: number }) {
  const geo = useMemo(() => {
    const g = kind === 'gown' ? [gownGeometry()] : [suitGeometry(), trousersGeometry()]
    return g
  }, [kind])
  useEffect(() => () => geo.forEach((g) => g.dispose()), [geo])
  const stand = useMemo(() => new THREE.MeshStandardMaterial({ color: STAND, roughness: 0.4, metalness: 0.6 }), [])
  const shirt = useMemo(() => new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.9 }), [])
  useEffect(
    () => () => {
      stand.dispose()
      shirt.dispose()
    },
    [stand, shirt]
  )
  return (
    <group position={[x, 0, 0]} rotation={[0, yaw, 0]}>
      {/* the neck cap and pole, the only parts of the form that show */}
      <mesh material={stand} position={[0, 1.83, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.06, 20]} />
      </mesh>
      {kind === 'suit' ? (
        <>
          <mesh geometry={geo[1]} material={cloth} />
          <mesh geometry={geo[0]} material={cloth} />
          {/* the shirt in the V of the lapels, and the lapels' edge in shadow */}
          <mesh material={shirt} position={[0, 1.58, 0.262]} rotation={[0.06, 0, 0]}>
            <boxGeometry args={[0.13, 0.32, 0.01]} />
          </mesh>
          <mesh material={cloth} position={[-0.085, 1.54, 0.27]} rotation={[0.06, 0, -0.3]}>
            <boxGeometry args={[0.09, 0.4, 0.008]} />
          </mesh>
          <mesh material={cloth} position={[0.085, 1.54, 0.27]} rotation={[0.06, 0, 0.3]}>
            <boxGeometry args={[0.09, 0.4, 0.008]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh geometry={geo[0]} material={cloth} />
          {/* a soft sash at the waist */}
          <mesh material={cloth} position={[0, 1.2, 0]}>
            <torusGeometry args={[0.215, 0.02, 8, 48]} />
          </mesh>
        </>
      )}
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

function Stage({ outfits, color }: { outfits: Outfit[]; color: string }) {
  const group = useRef<THREE.Group>(null)
  const cloth = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color),
        roughness: 0.82,
        metalness: 0,
        sheen: 0.7,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0xc8b59a),
        envMapIntensity: 0.5,
      }),
    // The colour is animated below, never rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const target = useRef(new THREE.Color(color))
  useEffect(() => {
    target.current.set(color)
  }, [color])
  useEffect(() => () => cloth.dispose(), [cloth])
  const clothRef = useRef(cloth)

  useFrame((_, dt) => {
    // The dye takes a breath to settle.
    clothRef.current.color.lerp(target.current, Math.min(1, dt * 3.5))
    const g = group.current
    if (g) g.rotation.y += dt * 0.18
  })

  const gap = 0.62
  return (
    <group position={[0, -0.95, 0]}>
      <group ref={group}>
        {outfits.map((o, i) => (
          <Form key={o + i} kind={o} cloth={cloth} x={outfits.length === 1 ? 0 : (i - 0.5) * 2 * gap} yaw={outfits.length === 1 ? 0 : (i - 0.5) * -0.5} />
        ))}
      </group>
      {/* the floor: stone, catching a soft pool of light */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[2.4, 64]} />
        <meshStandardMaterial color={0x6a6159} roughness={0.92} />
      </mesh>
    </group>
  )
}

function Frame({ count }: { count: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const narrow = size.width < size.height
    const z = count > 1 ? (narrow ? 5.2 : 4.2) : narrow ? 4.4 : 3.8
    camera.position.set(0, 0.15, z)
    camera.lookAt(0, -0.02, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, count])
  return null
}

export default function DressScene({ outfits, color }: { outfits: Outfit[]; color: string }) {
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.35, 4.6], fov: 32, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Frame count={outfits.length} />
      <Room />
      <ambientLight intensity={0.25} color={0xfff2e6} />
      <spotLight position={[2.5, 4.5, 3]} angle={0.5} penumbra={0.8} intensity={38} color={0xfff0dc} />
      <spotLight position={[-3, 3, -1]} angle={0.6} penumbra={0.9} intensity={14} color={0xdfe6f2} />
      <Stage outfits={outfits} color={color} />
    </Canvas>
  )
}

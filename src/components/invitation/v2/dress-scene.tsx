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
 * megabyte each. One figure for a guest coming alone, two for a party.
 * Each figure has three looks; swapping one crossfades to the next while
 * the turntable keeps turning.
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

const HEIGHT = 1.78

function Model({ url, x, yaw, fadeKey }: Figure & { fadeKey: string }) {
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
    // Each figure turns on its own spot, so a pair never eclipse each other.
    if (group.current) group.current.rotation.y += dt * 0.22
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

  useEffect(() => {
    if (group.current) group.current.rotation.y = yaw
  }, [yaw])

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

function Stage({ figures }: { figures: Figure[] }) {
  return (
    <group position={[0, -0.95, 0]}>
      <group>
        {figures.map((f, i) => (
          <Suspense key={f.url + i} fallback={null}>
            <Model {...f} fadeKey={f.url} />
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
    const z = count > 1 ? (narrow ? 5.6 : 4.4) : narrow ? 4.6 : 3.9
    camera.position.set(0, 0.2, z)
    camera.lookAt(0, -0.02, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, count])
  return null
}

export default function DressScene({ figures }: { figures: Figure[] }) {
  return (
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
      <Stage figures={figures} />
    </Canvas>
  )
}

/** Warm the other looks once the first is on screen. */
export function preloadLooks(urls: readonly string[]) {
  for (const u of urls) useGLTF.preload(u, undefined, true)
}

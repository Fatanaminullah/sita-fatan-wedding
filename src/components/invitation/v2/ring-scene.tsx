'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, invalidate } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { INK } from './theme'

/**
 * The only WebGL on the page: a wedding band turning with the scroll.
 *
 * Nothing is downloaded. The ring is a torus, the reflections come from a
 * procedural room environment baked once on mount, so the whole scene is the
 * library plus a few kilobytes. `frameloop="demand"` means the GPU sleeps
 * unless `progress` changes; the section invalidates as it scrubs.
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

function Band({ progress }: { progress: React.RefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(INK.gold),
        metalness: 1,
        roughness: 0.22,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.3,
      }),
    []
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const p = progress.current ?? 0
    if (!mesh.current) return
    // Two turns across the section, with a slight tilt so the inside of the
    // band catches the room.
    mesh.current.rotation.y = p * Math.PI * 4 + 0.6
    mesh.current.rotation.x = 0.55 + Math.sin(p * Math.PI) * 0.35
    mesh.current.rotation.z = 0.1
  })

  return (
    <mesh ref={mesh} material={material}>
      <torusGeometry args={[1, 0.19, 48, 96]} />
    </mesh>
  )
}

function Ticker({ progress }: { progress: React.RefObject<number> }) {
  // Re-render on demand when the scrubbed value moves.
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
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 4.2], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ width: '100%', height: '100%' }}
    >
      <Room />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <directionalLight position={[-4, -2, 2]} intensity={0.4} color="#ffe8c8" />
      <Band progress={progress} />
      <Ticker progress={progress} />
    </Canvas>
  )
}

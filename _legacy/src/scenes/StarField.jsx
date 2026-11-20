import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useStore, { VISUAL_MODE } from '../store/useStore'

const COUNT = 2000

// Generated once at module load — stable across re-renders
const STAR_POSITIONS = new Float32Array(COUNT * 3)
const STAR_SIZES = new Float32Array(COUNT)
for (let i = 0; i < COUNT; i++) {
  const r = 300 + Math.random() * 500
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  STAR_POSITIONS[i * 3] = r * Math.sin(phi) * Math.cos(theta)
  STAR_POSITIONS[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
  STAR_POSITIONS[i * 3 + 2] = r * Math.cos(phi)
  STAR_SIZES[i] = Math.random() * 1.5 + 0.3
}

// Hidden "AB" constellation — faint stars forming the letters A B
const AB_CONSTELLATION = [
  // Letter A
  [-42, 70, -300], [-28, 98, -300], [-14, 70, -300],
  [-35, 84, -300], [-21, 84, -300],
  // Letter B
  [7, 70, -300], [7, 98, -300],
  [7, 98, -300], [21, 94.5, -300], [21, 84, -300], [7, 84, -300],
  [7, 84, -300], [21, 80.5, -300], [21, 70, -300], [7, 70, -300],
]

export default function StarField() {
  const meshRef = useRef()
  const visualMode = useStore((s) => s.visualMode)

  const positions = STAR_POSITIONS
  const sizes = STAR_SIZES

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.002
    }
  })

  return (
    <group>
      {/* Main star field */}
      <points ref={meshRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={positions}
            count={COUNT}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-size"
            array={sizes}
            count={COUNT}
            itemSize={1}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.8}
          sizeAttenuation
          color={visualMode === VISUAL_MODE.SCHEMATIC ? '#00BFFF' : '#ffffff'}
          transparent
          opacity={visualMode === VISUAL_MODE.SCHEMATIC ? 0.4 : 0.85}
        />
      </points>

      {/* AB Constellation — faint glow */}
      {AB_CONSTELLATION.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.25, 4, 4]} />
          <meshBasicMaterial color="#FFD54F" transparent opacity={0.15} />
        </mesh>
      ))}
    </group>
  )
}

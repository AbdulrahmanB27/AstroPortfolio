import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import useStore, { VISUAL_MODE, STAGE } from '../store/useStore'
import StarField from './StarField'
import planetData from '../data/data.json'
import { useFlightMode } from '../hooks/useFlightMode'
import planetRegistry from '../utils/planetRegistry'

// ── Central Star ───────────────────────────────────────────────────────────────
function CentralStar({ schematic, onStarClick }) {
  const meshRef = useRef()
  const hoverRingRef = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
      if (!schematic) {
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.02
        meshRef.current.scale.setScalar(pulse)
      }
    }
    // Hover scan ring animation
    if (hoverRingRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.06
      hoverRingRef.current.scale.setScalar(s)
      hoverRingRef.current.material.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.15
    }
  })

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={onStarClick}
        onPointerOver={() => {
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = ''
        }}
      >
        <sphereGeometry args={[4, 12, 12]} />
        {schematic ? (
          <meshBasicMaterial color="#FFD54F" wireframe />
        ) : (
          <meshBasicMaterial color="#FFD54F" />
        )}
      </mesh>
      {!schematic && (
        <>
          <mesh>
            <sphereGeometry args={[5.2, 10, 10]} />
            <meshBasicMaterial color="#FF8F00" transparent opacity={hovered ? 0.25 : 0.12} />
          </mesh>
          <mesh>
            <sphereGeometry args={[6.5, 10, 10]} />
            <meshBasicMaterial color="#FFE082" transparent opacity={0.05} />
          </mesh>
        </>
      )}
      <pointLight color="#FFD54F" intensity={2.5} distance={200} decay={1.5} />

      {/* Hover scan ring around star */}
      {hovered && !schematic && (
        <mesh ref={hoverRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[5.8, 0.04, 4, 24]} />
          <meshBasicMaterial color="#FFD54F" transparent opacity={0.3} />
        </mesh>
      )}

      {/* Hover label */}
      {hovered && (
        <Html center position={[0, 6, 0]} zIndexRange={[20, 0]}>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.65rem',
            color: '#FFD54F',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: '0 0 12px rgba(255,213,79,0.5)',
          }}>
            ▸ Enter Core
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Star Corona — light rays that expand on STAR_CORE entry ───────────────────
function StarCorona() {
  const stage = useStore((s) => s.stage)
  const intensityRef = useRef({ value: 0 })
  const lightRef = useRef()
  const ring1Ref = useRef()
  const ring2Ref = useRef()

  useFrame((state, delta) => {
    const target = stage === STAGE.STAR_CORE ? 1 : 0
    intensityRef.current.value += (target - intensityRef.current.value) * delta * 1.5
    const v = intensityRef.current.value

    if (lightRef.current) {
      lightRef.current.intensity = v * 5
    }
    if (ring1Ref.current) {
      ring1Ref.current.material.opacity = v * (0.10 + Math.sin(state.clock.elapsedTime * 1.2) * 0.02)
      ring1Ref.current.scale.setScalar(1 + v * 0.2 + Math.sin(state.clock.elapsedTime * 0.8) * 0.03)
    }
    if (ring2Ref.current) {
      ring2Ref.current.material.opacity = v * (0.05 + Math.sin(state.clock.elapsedTime * 0.7) * 0.01)
      ring2Ref.current.scale.setScalar(1 + v * 0.45 + Math.sin(state.clock.elapsedTime * 0.5) * 0.04)
    }
  })

  return (
    <group>
      <pointLight ref={lightRef} color="#FFD54F" intensity={0} distance={60} decay={1} />
      <mesh ref={ring1Ref}>
        <sphereGeometry args={[8, 10, 10]} />
        <meshBasicMaterial color="#FFE082" transparent opacity={0} side={THREE.BackSide} />
      </mesh>
      <mesh ref={ring2Ref}>
        <sphereGeometry args={[13, 10, 10]} />
        <meshBasicMaterial color="#FF8F00" transparent opacity={0} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

// ── Moon ──────────────────────────────────────────────────────────────────────
function Moon({ orbitRadius, speed, offset, schematic, frozen }) {
  const ref = useRef()
  const frozenTimeRef = useRef(0)
  useFrame((state) => {
    if (!frozen) frozenTimeRef.current = state.clock.elapsedTime
    const elapsed = frozen ? frozenTimeRef.current : state.clock.elapsedTime
    const t = elapsed * (speed * 0.6) + offset
    ref.current.position.set(
      Math.cos(t) * orbitRadius,
      Math.sin(t * 0.3) * 0.3,
      Math.sin(t) * orbitRadius
    )
  })

  return (
    <group ref={ref}>
      <mesh>
        <dodecahedronGeometry args={[0.2, 0]} />
        {schematic ? (
          <meshBasicMaterial color="#90CAF9" wireframe />
        ) : (
          <meshStandardMaterial color="#90CAF9" roughness={0.7} />
        )}
      </mesh>
    </group>
  )
}

// ── Scan ring that appears on hover ───────────────────────────────────────────
function ScanRing({ radius, schematic }) {
  const ringRef = useRef()
  useFrame((state) => {
    if (ringRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08
      ringRef.current.scale.setScalar(s)
      ringRef.current.material.opacity = 0.4 + Math.sin(state.clock.elapsedTime * 4) * 0.2
    }
  })

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius * 1.3, 0.03, 4, 16]} />
      <meshBasicMaterial color={schematic ? '#00BFFF' : '#4FC3F7'} transparent opacity={0.4} />
    </mesh>
  )
}

// ── Planet ────────────────────────────────────────────────────────────────────
function Planet({ project, schematic, onPlanetClick }) {
  const groupRef = useRef()
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const orbitsFrozen = useStore((s) => s.orbitsFrozen)
  const frozenTimeRef = useRef(0)

  useFrame((state) => {
    if (orbitsFrozen) {
      // Use the frozen time for position calculation
    } else {
      frozenTimeRef.current = state.clock.elapsedTime
    }
    const elapsed = orbitsFrozen ? frozenTimeRef.current : state.clock.elapsedTime
    // Reduce orbit speed globally by 40% for a calmer feel
    const t = elapsed * (project.orbitSpeed * 0.6) + project.orbitOffset
    const x = Math.cos(t) * project.orbitRadius
    const z = Math.sin(t) * project.orbitRadius
    groupRef.current.position.set(x, 0, z)
    meshRef.current.rotation.y += 0.005

    // Write position to module-level registry — no Zustand update, no re-renders
    planetRegistry.positions[project.id] = { x, y: 0, z }
  })

  const color = new THREE.Color(project.color)

  return (
    <group ref={groupRef}>
      {/* Invisible hitbox — larger for easier clicking */}
      <mesh
        onClick={() => onPlanetClick(project)}
        onPointerOver={() => {
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = ''
        }}
      >
        <sphereGeometry args={[Math.max(project.size * 2, 2.5), 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Visible planet with surface detail */}
      <group ref={meshRef}>
        <mesh>
          <dodecahedronGeometry args={[project.size, 1]} />
          {schematic ? (
            <meshBasicMaterial color={project.color} wireframe />
          ) : (
            <meshStandardMaterial
              color={project.color}
              roughness={0.7}
              metalness={0.08}
              emissive={color.clone().multiplyScalar(0.08)}
            />
          )}
        </mesh>
        {/* Surface line — makes axial rotation visible */}
        {!schematic && (
          <mesh rotation={[0.3, 0, 0.2]}>
            <torusGeometry args={[project.size * 1.01, 0.02, 4, 16]} />
            <meshBasicMaterial color={project.color} transparent opacity={0.2} />
          </mesh>
        )}
      </group>

      {/* Featured ring */}
      {project.featured && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[project.size * 1.5, 0.06, 4, 16]} />
          <meshBasicMaterial
            color={schematic ? '#00BFFF' : project.color}
            transparent
            opacity={schematic ? 0.5 : 0.4}
          />
        </mesh>
      )}

      {/* Moons */}
      {project.moons?.map((moon, i) => (
        <Moon
          key={moon}
          orbitRadius={project.size * 1.8 + i * 0.6}
          speed={0.8 + i * 0.3}
          offset={(i / project.moons.length) * Math.PI * 2}
          schematic={schematic}
          frozen={orbitsFrozen}
        />
      ))}

      {/* Hover scan ring */}
      {hovered && <ScanRing radius={project.size} schematic={schematic} />}

      {/* Label */}
      <Html center position={[0, project.size + 0.5, 0]} zIndexRange={[20, 0]}>
        <div style={{
          fontFamily: 'Space Mono, monospace',
          fontSize: hovered ? '0.7rem' : '0.6rem',
          color: hovered ? project.color : 'rgba(224,224,224,0.7)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          transition: 'all 0.2s',
          textShadow: hovered ? `0 0 8px ${project.color}` : 'none',
        }}>
          {hovered ? `▸ ${project.title}` : project.title}
        </div>
        {hovered && (
          <div style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '0.55rem',
            color: 'rgba(224,224,224,0.6)',
            marginTop: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {project.shortDesc}
          </div>
        )}
      </Html>
    </group>
  )
}

// ── Orbit ring path ────────────────────────────────────────────────────────────
function OrbitRing({ radius, schematic }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.03, 4, 24]} />
      <meshBasicMaterial
        color={schematic ? '#004080' : '#4FC3F7'}
        transparent
        opacity={schematic ? 0.3 : 0.1}
      />
    </mesh>
  )
}

// ── Schematic grid overlay ─────────────────────────────────────────────────────
function SchematicGrid() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[200, 200, 40, 40]} />
      <meshBasicMaterial color="#003366" wireframe transparent opacity={0.25} />
    </mesh>
  )
}

// ── Death Star 3D object (visible in flight mode) ──────────────────────────────
const DEATH_STAR_POS = new THREE.Vector3(130, 0, 50)
const DETECTION_RANGE = 60

function DeathStar({ onReach }) {
  const meshRef = useRef()
  const groupRef = useRef()
  const [hovered, setHovered] = useState(false)
  const notifiedRef = useRef(false)
  const setHudPrompt = useStore((s) => s.setHudPrompt)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001
    }

    // Proximity notification — "Unknown structure detected"
    const dist = state.camera.position.distanceTo(DEATH_STAR_POS)
    if (!notifiedRef.current && dist < DETECTION_RANGE) {
      notifiedRef.current = true
      setHudPrompt('◉ Unknown structure detected — Sector 7G')
    }

    // Cinematic Fade-in based on distance (fades in fully as you approach 50 units, starts at 90)
    if (groupRef.current) {
      const opacity = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(dist, 90, 50, 0, 1), 0, 1)
      groupRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.transparent = true
          // Keep original opacity ratios for the glow effect
          if (child.material.color.getHexString() === '4caf50') {
            child.material.opacity = opacity * 0.06
          } else {
            child.material.opacity = opacity
          }
        }
      })
    }
  })

  return (
    <group position={[DEATH_STAR_POS.x, DEATH_STAR_POS.y, DEATH_STAR_POS.z]} ref={groupRef}>
      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onClick={onReach}
        onPointerOver={() => {
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = ''
        }}
      >
        <sphereGeometry args={[4, 12, 12]} />
        <meshStandardMaterial
          color="#546E7A"
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>
      {/* Concave detail (superlaser dish) */}
      <mesh position={[0, 1.2, 3.2]} rotation={[0.3, 0, 0]}>
        <sphereGeometry args={[1.2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#37474F"
          roughness={0.6}
          metalness={0.5}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Equatorial trench */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.02, 0.08, 4, 16]} />
        <meshBasicMaterial color="#455A64" />
      </mesh>
      {/* Subtle green glow */}
      <mesh>
        <sphereGeometry args={[5.5, 8, 8]} />
        <meshBasicMaterial color="#4CAF50" transparent opacity={0.06} />
      </mesh>
      <pointLight color="#4CAF50" intensity={0.8} distance={30} decay={2} />
      {/* Hover label */}
      {hovered && (
        <Html center position={[0, 6, 0]} zIndexRange={[20, 0]}>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.55rem',
            color: 'rgba(255,143,0,0.8)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            ◉ Unknown Structure — Sector 7G
          </div>
        </Html>
      )}
    </group>
  )
}

// ── 3D Flight Ship ─────────────────────────────────────────────────────────────
function FlightShip() {
  const groupRef = useRef()
  const engineGlow1 = useRef()
  const engineGlow2 = useRef()

  useFrame((state) => {
    if (groupRef.current) {
      const shipState = planetRegistry.flightShip

      // Keep it on the same plane but add subtle hovering
      const hover = Math.sin(state.clock.elapsedTime * 2) * 0.1
      groupRef.current.position.set(shipState.position.x, shipState.position.y + hover, shipState.position.z)

      groupRef.current.rotation.set(0, shipState.rotation.y, 0)

      const flicker = 0.6 + Math.sin(state.clock.elapsedTime * 30) * 0.4
      if (engineGlow1.current) engineGlow1.current.opacity = flicker
      if (engineGlow2.current) engineGlow2.current.opacity = flicker
    }
  })

  return (
    <group ref={groupRef}>
      {/* Ship Center / Fuselage — Oriented along Z */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.4, 2.5, 4, 8]} />
        <meshStandardMaterial color="#E0E0E0" roughness={0.2} metalness={0.8} />
      </mesh>

      {/* Cockpit Canopy */}
      <mesh position={[0, 0.25, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.3, 1.0, 4, 8]} />
        <meshStandardMaterial color="#1E88E5" roughness={0.1} metalness={0.9} transparent opacity={0.8} />
      </mesh>

      {/* Main Swept Wings */}
      <mesh position={[-1.0, 0, 0.5]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[2.5, 0.08, 1.2]} />
        <meshStandardMaterial color="#37474F" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[1.0, 0, 0.5]} rotation={[0, -0.4, 0]}>
        <boxGeometry args={[2.5, 0.08, 1.2]} />
        <meshStandardMaterial color="#37474F" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Tail Fins */}
      <mesh position={[-0.3, 0.4, 1.2]} rotation={[0.2, 0, 0.2]}>
        <boxGeometry args={[0.05, 0.8, 0.6]} />
        <meshStandardMaterial color="#4FC3F7" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0.3, 0.4, 1.2]} rotation={[0.2, 0, -0.2]}>
        <boxGeometry args={[0.05, 0.8, 0.6]} />
        <meshStandardMaterial color="#4FC3F7" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Twin Engines (Back is +Z) */}
      <group position={[-0.4, 0, 1.5]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.25, 0.6, 8]} />
          <meshStandardMaterial color="#263238" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.3]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshBasicMaterial color="#00E5FF" transparent opacity={0.8} ref={engineGlow1} />
        </mesh>
      </group>

      <group position={[0.4, 0, 1.5]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.25, 0.6, 8]} />
          <meshStandardMaterial color="#263238" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.3]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshBasicMaterial color="#00E5FF" transparent opacity={0.8} ref={engineGlow2} />
        </mesh>
      </group>

      {/* Lighting accents */}
      <pointLight position={[0, 0, 2]} color="#00E5FF" intensity={1.5} distance={15} decay={2} />
      <pointLight position={[0, 1, -2]} color="#FFFFFF" intensity={0.5} distance={10} decay={2} />
    </group>
  )
}

// ── Intro Planet — the starting location, non-selectable ──────────────────────
function IntroPlanet() {
  const groupRef = useRef()
  const meshRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.3
    const radius = 9
    groupRef.current.position.set(
      Math.cos(t) * radius,
      Math.sin(t * 0.4) * 0.15,
      Math.sin(t) * radius
    )
    meshRef.current.rotation.y += 0.004
  })

  return (
    <group ref={groupRef}>
      <group ref={meshRef}>
        <mesh>
          <dodecahedronGeometry args={[0.4, 1]} />
          <meshStandardMaterial
            color="#8D6E63"
            roughness={0.85}
            metalness={0.1}
            emissive="#5D4037"
            emissiveIntensity={0.05}
          />
        </mesh>
        {/* Surface line for rotation visibility */}
        <mesh rotation={[0.4, 0, 0.3]}>
          <torusGeometry args={[0.42, 0.012, 4, 12]} />
          <meshBasicMaterial color="#A1887F" transparent opacity={0.2} />
        </mesh>
      </group>
    </group>
  )
}

export default function OrbitScene({ onPlanetClick, onStarClick }) {
  useFlightMode()
  const visualMode = useStore((s) => s.visualMode)
  const flightModeUnlocked = useStore((s) => s.flightModeUnlocked)
  const milleniumFalconUnlocked = useStore((s) => s.milleniumFalconUnlocked)
  const setMilleniumFalconUnlocked = useStore((s) => s.setMilleniumFalconUnlocked)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const setAtmosphereFlash = useStore((s) => s.setAtmosphereFlash)
  const schematic = visualMode === VISUAL_MODE.SCHEMATIC
  const projects = planetData.projects

  // Reset cursor when OrbitScene unmounts (prevents stuck pointer cursor)
  useEffect(() => {
    return () => { document.body.style.cursor = '' }
  }, [])

  useEffect(() => {
    // If coming from liftoff, clear the atmosphere flash mask after a tiny delay
    // to ensure all 3D meshes (stars, planets) have compiled and rendered behind it.
    const timer = setTimeout(() => {
      setAtmosphereFlash(false)
    }, 400)

    return () => clearTimeout(timer)
  }, [setAtmosphereFlash])

  function handleDeathStarClick() {
    setMilleniumFalconUnlocked(true)
    setHudPrompt('// MILLENNIUM FALCON ACQUIRED — It trails you now.')
  }

  return (
    <>
      <ambientLight intensity={schematic ? 0.5 : 0.15} />
      <StarField />
      {schematic && <SchematicGrid />}

      <CentralStar schematic={schematic} onStarClick={onStarClick} />
      {!schematic && <StarCorona />}

      {/* Small intro planet — non-selectable, orbits close to the star */}
      {!schematic && <IntroPlanet />}
      {!schematic && <OrbitRing radius={9} schematic={schematic} />}

      {projects.map((project) => (
        <group key={project.id}>
          <OrbitRing radius={project.orbitRadius} schematic={schematic} />
          <Planet project={project} schematic={schematic} onPlanetClick={onPlanetClick} />
        </group>
      ))}

      {/* Death Star — visible only in flight mode and not yet unlocked */}
      {flightModeUnlocked && !milleniumFalconUnlocked && (
        <DeathStar onReach={handleDeathStarClick} />
      )}

      {/* 3D Player Ship */}
      {flightModeUnlocked && <FlightShip />}
    </>
  )
}

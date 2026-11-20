import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import useStore from '../store/useStore'
import StarField from './StarField'

// ── Moon terrain — stylized poly surface with visible facets ──────────────────
function SurfacePlanet() {
  return (
    <group>
      {/* Main planet body — flattened massive sphere */}
      <mesh position={[0, -399.5, 5]} receiveShadow>
        <sphereGeometry args={[400, 64, 64]} />
        <meshStandardMaterial color="#4A4E55" roughness={0.8} metalness={0.02} />
      </mesh>

      {/* ═══ DUNES — low-poly rolling hills with visible facets ═══ */}
      {/* NOTE: keep the camera→star sightline (x≈0–3 at z=-30..-45) clear — a dune
          there silhouettes as a black blob in front of the star */}
      {[
        { pos: [-14, -1.0, -20], s: 5.5, color: '#44484E' },
        { pos: [12, -0.8, -15], s: 4.0, color: '#4F535B' },
        { pos: [28, -1.4, -30], s: 7.0, color: '#41444A' },
        { pos: [-30, -1.5, -35], s: 8.0, color: '#3E4147' },
        { pos: [-22, -2.0, -44], s: 6.5, color: '#393C42' },
        { pos: [-20, -0.8, -25], s: 3.5, color: '#464A50' },
        { pos: [18, -0.6, -22], s: 3.0, color: '#4B4F56' },
      ].map((dune, i) => (
        <mesh key={`dune-${i}`} position={dune.pos} receiveShadow>
          <sphereGeometry args={[dune.s, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={dune.color} roughness={0.9} />
        </mesh>
      ))}

      {/* ═══ CRATERS — faceted torus rings ═══ */}
      {[
        { pos: [-6, -0.05, -12], r: 1.8, tube: 0.14 },
        { pos: [8, -0.1, -16], r: 2.5, tube: 0.16 },
        { pos: [-16, -0.1, -25], r: 3.0, tube: 0.18 },
        { pos: [5, 0.0, -28], r: 1.2, tube: 0.10 },
      ].map((crater, i) => (
        <mesh key={`crater-${i}`} position={crater.pos} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <torusGeometry args={[crater.r, crater.tube, 5, 14]} />
          <meshStandardMaterial color="#5A554D" roughness={0.9} />
        </mesh>
      ))}

      {/* ═══ SCATTERED ROCKS — chunky dodecahedra ═══ */}
      {[
        { pos: [-3, 0.05, -6], s: 0.15 },
        { pos: [4, 0.08, -8], s: 0.22 },
        { pos: [-8, 0.1, -12], s: 0.28 },
        { pos: [15, 0.15, -18], s: 0.38 },
        { pos: [-12, 0.12, -20], s: 0.32 },
        { pos: [2, 0.03, -3], s: 0.10 },
        { pos: [-5, 0.06, -9], s: 0.18 },
        { pos: [10, 0.04, -5], s: 0.12 },
        { pos: [-18, 0.18, -28], s: 0.42 },
        { pos: [22, 0.10, -24], s: 0.25 },
      ].map((rock, i) => (
        <mesh key={`rock-${i}`} position={rock.pos} rotation={[i * 1.1, i * 0.7, 0]} castShadow receiveShadow>
          <dodecahedronGeometry args={[rock.s, 0]} />
          <meshStandardMaterial color="#5A5E66" roughness={0.9} />
        </mesh>
      ))}

      {/* ═══ HORIZON ATMOSPHERIC HAZE ═══ */}
      <mesh position={[0, 0.8, -55]} rotation={[-0.1, 0, 0]}>
        <planeGeometry args={[250, 8]} />
        <meshBasicMaterial color="#FFE082" transparent opacity={0.012} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ── Astronaut — stylized poly figure, grounded on surface ────────────────
// Surface height at (-6,-4) is ≈0.35 (planet sphere r=400 centered at y=-399.5),
// so the astronaut base sits at 0.41 to rest its boots on the terrain.
export function Astronaut({ position = [-6, 0.41, -4], rotation = [0, Math.PI * 0.4, 0], scale = 0.5 }) {
  const groupRef = useRef()

  const suitWhite = '#F5F5F7'
  const visorGold = '#FFA000'
  const accentGray = '#B0BEC5'

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>

      {/* ═══ HELMET — poly sphere ═══ */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.75, 12, 12]} />
        <meshStandardMaterial color={suitWhite} roughness={0.3} metalness={0.02} />
      </mesh>

      {/* Gold visor — smooth for reflective look */}
      <mesh position={[0, 1.75, 0.3]} castShadow>
        <sphereGeometry args={[0.55, 8, 8, 0, Math.PI, 0.25, 1.5]} />
        <meshStandardMaterial color={visorGold} roughness={0.05} metalness={0.8} />
      </mesh>

      {/* ═══ TORSO ═══ */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <capsuleGeometry args={[0.45, 0.6, 6, 8]} />
        <meshStandardMaterial color={suitWhite} roughness={0.3} metalness={0.02} />
      </mesh>

      {/* Backpack */}
      <mesh position={[0, 1.05, -0.45]} castShadow>
        <boxGeometry args={[0.6, 0.7, 0.3]} />
        <meshStandardMaterial color={suitWhite} roughness={0.4} />
      </mesh>

      {/* ═══ ARMS ═══ */}
      {[-1, 1].map((side) => (
        <group key={`arm-${side}`} position={[side * 0.55, 1.1, 0]} rotation={[0.05, 0, side * -0.15]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.15, 0.4, 4, 6]} />
            <meshStandardMaterial color={suitWhite} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.35, 0.02]} castShadow>
            <dodecahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color={accentGray} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* ═══ LEGS ═══ */}
      {[-1, 1].map((side) => (
        <group key={`leg-${side}`} position={[side * 0.25, 0.3, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.16, 0.35, 4, 6]} />
            <meshStandardMaterial color={suitWhite} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.35, 0.05]} castShadow>
            <boxGeometry args={[0.2, 0.15, 0.28]} />
            <meshStandardMaterial color={accentGray} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Retro Rocket — stylized poly, grounded firmly on surface ────────────────
function Spacecraft() {
  const glowRef = useRef()
  const portholeGlowRef = useRef()

  useFrame((state) => {
    if (glowRef.current) {
      glowRef.current.material.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2
    }
    if (portholeGlowRef.current) {
      portholeGlowRef.current.intensity = 1.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.4
    }
  })

  const bodyWhite = '#ECEFF1'
  const accentDark = '#263238'
  const portholeGlass = '#81D4FA'
  const engineGlow = '#00B0FF'

  return (
    <group position={[8, 1.45, -14]} rotation={[0, -0.5, 0]} scale={0.8}>

      {/* ═══ MAIN BODY — poly capsule ═══ */}
      <mesh castShadow>
        <capsuleGeometry args={[0.5, 2.2, 6, 10]} />
        <meshStandardMaterial color={bodyWhite} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* Body ring */}
      <mesh position={[0, -0.6, 0]} castShadow>
        <torusGeometry args={[0.51, 0.018, 5, 16]} />
        <meshStandardMaterial color={accentDark} roughness={0.4} />
      </mesh>

      {/* ═══ NOSE CONE — faceted ═══ */}
      <mesh position={[0, 1.65, 0]} castShadow>
        <coneGeometry args={[0.5, 0.6, 6]} />
        <meshStandardMaterial color={bodyWhite} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* ═══ PORTHOLE WINDOW — smooth for glass feel ═══ */}
      <mesh position={[0, 0.6, 0.48]} castShadow>
        <torusGeometry args={[0.2, 0.03, 8, 16]} />
        <meshStandardMaterial color={accentDark} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.6, 0.49]}>
        <circleGeometry args={[0.18, 16]} />
        <meshStandardMaterial
          color={portholeGlass} roughness={0.1} metalness={0.5}
          transparent opacity={0.9} emissive={portholeGlass} emissiveIntensity={0.6}
        />
      </mesh>
      <pointLight ref={portholeGlowRef} position={[0, 0.6, 0.8]} color={portholeGlass} intensity={1.2} distance={4} decay={2} />

      {/* ═══ FINS — low-poly ═══ */}
      {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((angle, i) => (
        <group key={`fin-${i}`} rotation={[0, angle, 0]}>
          <mesh position={[0, -0.8, 0.6]} rotation={[0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.06, 1.2, 0.5]} />
            <meshStandardMaterial color={bodyWhite} roughness={0.2} metalness={0.1} />
          </mesh>
          <mesh position={[0, -1.4, 0.8]} castShadow>
            <cylinderGeometry args={[0.04, 0.08, 0.3, 6]} />
            <meshStandardMaterial color={accentDark} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Engine glow outputting onto the ground */}
      <mesh ref={glowRef} position={[0, -1.5, 0]}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshBasicMaterial color={engineGlow} transparent opacity={0.6} />
      </mesh>
      <pointLight position={[0, -1.6, 0]} color={engineGlow} intensity={1.0} distance={6} decay={2} />
    </group>
  )
}

// ── Massive cinematic sun — epic multi-layer glow ─────────────────────────────
function HorizonStar() {
  const lightRef = useRef()
  const coronaRef = useRef()
  const hovered = useStore((s) => s.hoveredMenuItem)
  const targetScaleVec = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    if (lightRef.current) {
      const targetIntensity = hovered ? 6.0 : 4.5
      lightRef.current.intensity = THREE.MathUtils.lerp(
        lightRef.current.intensity,
        targetIntensity + Math.sin(state.clock.elapsedTime * 0.5) * 0.5,
        delta * 3
      )
    }
    if (coronaRef.current) {
      const targetScale = hovered ? 1.06 : 1.0
      targetScaleVec.current.set(targetScale, targetScale, targetScale)
      coronaRef.current.scale.lerp(targetScaleVec.current, delta * 4)
    }
  })

  return (
    <group position={[15, 12, -120]}>
      {/* Star core */}
      <mesh>
        <sphereGeometry args={[22, 32, 32]} />
        <meshBasicMaterial color="#FFF59D" />
      </mesh>
      {/* Glow shells — additive, stepped opacity to fake a soft radial
          gradient (a single shell reads as a hard eclipse ring) */}
      <mesh ref={coronaRef}>
        <sphereGeometry args={[24.5, 32, 32]} />
        <meshBasicMaterial
          color="#FFB300"
          transparent
          opacity={hovered ? 0.24 : 0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[28, 32, 32]} />
        <meshBasicMaterial
          color="#FF8F00"
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[34, 32, 32]} />
        <meshBasicMaterial
          color="#FFCA28"
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[45, 32, 32]} />
        <meshBasicMaterial
          color="#FFE082"
          transparent
          opacity={0.03}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Key light */}
      <pointLight ref={lightRef} color="#FFD54F" intensity={4.5} distance={500} decay={1.0} />
      {/* Warm atmosphere */}
      <pointLight color="#FF8F00" intensity={1.5} distance={250} decay={1.5} />
    </group>
  )
}

// ── Faint orbit rings pushed far back ────────────────────────────────────
function DistantOrbitRings() {
  const groupRef = useRef()
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.008
    }
  })

  return (
    <group ref={groupRef}>
      {[140, 200, 260, 320].map((r, i) => (
        <mesh key={i} rotation={[Math.PI / 2 - 0.25, 0, i * 0.3]} position={[15, -15, -350]}>
          <torusGeometry args={[r * 0.8, 0.1, 4, 24]} />
          <meshBasicMaterial color="#4FC3F7" transparent opacity={0.06 - i * 0.012} />
        </mesh>
      ))}
    </group>
  )
}

// ── Majestic Mountains — stylized grounded monoliths on horizon ──────────────
function DistantPlanets() {
  const groupRef = useRef()
  useFrame((state) => {
    if (groupRef.current) {
      // Very slow distant rotation
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.002
    }
  })

  // Grounded into the horizon, acting as colossal geometric mountains
  const mountains = [
    { pos: [0, -10, -160], color: '#4FC3F7', size: 24 },
    { pos: [45, -12, -150], color: '#B0BEC5', size: 18 },
    { pos: [80, -20, -140], color: '#CE93D8', size: 28 },
    { pos: [-50, -18, -170], color: '#FFAB40', size: 26 },
    { pos: [65, -18, -180], color: '#81D4FA', size: 20 },
  ]

  return (
    <group ref={groupRef}>
      {mountains.map((m, i) => (
        <group key={i} position={m.pos}>
          {/* Main grounded mesh — slight self-glow so it reads as a colored
              landform instead of a murky black mound */}
          <mesh rotation={[0, i * 1.5, 0]} receiveShadow castShadow>
            <dodecahedronGeometry args={[m.size, 1]} />
            <meshStandardMaterial
              color={m.color}
              roughness={0.8}
              metalness={0.1}
              emissive={m.color}
              emissiveIntensity={0.12}
            />
          </mesh>
          {/* Faint atmospheric aura matching its color */}
          <mesh>
            <sphereGeometry args={[m.size * 1.3, 16, 16]} />
            <meshBasicMaterial
              color={m.color}
              transparent
              opacity={0.05}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default function IntroScene({ altMode = false, showCraft = true, isLiftoff = false }) {
  const { camera } = useThree()
  const setOpeningSequenceComplete = useStore((s) => s.setOpeningSequenceComplete)
  const openingSequenceComplete = useStore((s) => s.openingSequenceComplete)

  // ── Cinematic Opening Sequence ──────────────────────────────────────────────
  useEffect(() => {
    if (openingSequenceComplete || isLiftoff) return

    // Phase 1 start: deep space establishing shot
    camera.position.set(30, 35, 130)
    const lookTarget = { x: 10, y: 8, z: -30 }
    camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z)

    const tl = gsap.timeline({
      onComplete: () => setOpeningSequenceComplete(true)
    })

    // Phase 1 (0–1.2s): Deep space drift — star, planets, rings visible
    tl.to(camera.position, {
      x: 18, y: 24, z: 85,
      duration: 1.2,
      ease: 'power1.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z)
    }, 0)
    tl.to(lookTarget, {
      x: 8, y: 5, z: -40,
      duration: 1.2,
      ease: 'power1.inOut'
    }, 0)

    // Phase 2 (1.2–2.6s): Approaching the planet — camera curves down
    tl.to(camera.position, {
      x: 6, y: 10, z: 35,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z)
    }, 1.2)
    tl.to(lookTarget, {
      x: 5, y: 3, z: -28,
      duration: 1.4,
      ease: 'power2.inOut'
    }, 1.2)

    // Phase 3 (2.6–4.0s): Surface reveal — settle behind astronaut
    tl.to(camera.position, {
      x: -4, y: 2.2, z: 2.5,
      duration: 1.4,
      ease: 'power3.out',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z)
    }, 2.6)
    tl.to(lookTarget, {
      x: 4, y: 1.5, z: -30,
      duration: 1.4,
      ease: 'power3.out'
    }, 2.6)

    return () => tl.kill()
  }, [camera, openingSequenceComplete, isLiftoff, setOpeningSequenceComplete])

  // Static camera when returning to surface
  useEffect(() => {
    if (openingSequenceComplete && !isLiftoff) {
      camera.position.set(-4, 2.2, 2.5)
      camera.lookAt(4, 1.5, -30)
    }
  }, [camera, openingSequenceComplete, isLiftoff])

  // Subtle idle camera drift
  useFrame((state) => {
    if (isLiftoff || !openingSequenceComplete) return
    const t = state.clock.elapsedTime
    state.camera.position.x = -4 + Math.sin(t * 0.08) * 0.04
    state.camera.position.y = 2.2 + Math.sin(t * 0.06) * 0.02
    state.camera.lookAt(4, 1.5, -30)
  })

  return (
    <>
      {/* Low ambient for dramatic cinematic contrast */}
      <ambientLight intensity={0.12} />

      {/* Key light from the star — strong warm rim */}
      <directionalLight
        position={[15, 12, -120]}
        intensity={1.2}
        color="#FFE082"
      />

      {/* Warm rim light for astronaut/rocket silhouette */}
      <directionalLight
        position={[30, 10, -80]}
        intensity={0.8}
        color="#FF8F00"
      />

      {/* Cool fill from above for depth */}
      <directionalLight
        position={[-10, 20, 10]}
        intensity={0.15}
        color="#29B6F6"
      />

      {/* Warm bounce fill from behind camera — keeps backlit terrain from
          reading as pure-black holes against the star */}
      <directionalLight
        position={[-8, 6, 30]}
        intensity={0.22}
        color="#FFB74D"
      />

      <StarField />
      <SurfacePlanet />
      <HorizonStar />
      <DistantOrbitRings />
      <DistantPlanets />

      {/* Surrender astronaut to LiftoffScene during alt-launch */}
      {!(altMode && isLiftoff) && <Astronaut />}
      {showCraft && <Spacecraft />}
    </>
  )
}

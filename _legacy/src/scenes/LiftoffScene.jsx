import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import useStore, { STAGE } from '../store/useStore'
import IntroScene, { Astronaut } from './IntroScene'

// ── Cached Vector3 constants for DraggedAstronaut (avoid per-frame allocation) ──
const ROPE_TIE_OFFSET = new THREE.Vector3(0, -1.5, 0)
const UP = new THREE.Vector3(0, 1, 0)
const GRAVITY_VEC = new THREE.Vector3(0, -25, 0)

// ── Rising Rocket — matches IntroScene Spacecraft with poly styling + flames ──
function RisingRocket({ rocketRef, engineActive }) {
  const flameRef = useRef()
  const flame2Ref = useRef()

  useFrame((state) => {
    if (!engineActive) return
    if (flameRef.current) {
      const f = 0.7 + Math.sin(state.clock.elapsedTime * 20) * 0.3
      flameRef.current.scale.y = f * 1.5 + 0.5
      flameRef.current.material.opacity = 0.6 + Math.sin(state.clock.elapsedTime * 15) * 0.2
    }
    if (flame2Ref.current) {
      const f = 0.5 + Math.sin(state.clock.elapsedTime * 25 + 1) * 0.3
      flame2Ref.current.scale.y = f + 0.8
    }
  })

  const bodyWhite = '#ECEFF1'
  const accentDark = '#263238'
  const portholeGlass = '#81D4FA'

  return (
    <group ref={rocketRef} position={[8, 1.45, -14]} rotation={[0, -0.5, 0]} scale={0.8}>
      {/* ═══ MAIN BODY — poly capsule ═══ */}
      <mesh>
        <capsuleGeometry args={[0.5, 2.2, 4, 6]} />
        <meshStandardMaterial color={bodyWhite} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* Body ring */}
      <mesh position={[0, -0.6, 0]}>
        <torusGeometry args={[0.51, 0.018, 5, 16]} />
        <meshStandardMaterial color={accentDark} roughness={0.4} />
      </mesh>

      {/* ═══ NOSE CONE ═══ */}
      <mesh position={[0, 1.65, 0]}>
        <coneGeometry args={[0.5, 0.6, 6]} />
        <meshStandardMaterial color={bodyWhite} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* ═══ PORTHOLE WINDOW — smooth ═══ */}
      <mesh position={[0, 0.6, 0.48]}>
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

      {/* ═══ FINS ═══ */}
      {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((angle, i) => (
        <group key={`fin-${i}`} rotation={[0, angle, 0]}>
          <mesh position={[0, -0.8, 0.6]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.06, 1.2, 0.5]} />
            <meshStandardMaterial color={bodyWhite} roughness={0.2} metalness={0.1} />
          </mesh>
          <mesh position={[0, -1.4, 0.8]}>
            <cylinderGeometry args={[0.04, 0.08, 0.3, 6]} />
            <meshStandardMaterial color={accentDark} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Engine flames — only when active */}
      {engineActive && (
        <group position={[0, -1.7, 0]}>
          {/* Inner hot core flame */}
          <mesh ref={flameRef}>
            <coneGeometry args={[0.3, 1.5, 6]} />
            <meshBasicMaterial color="#4FC3F7" transparent opacity={0.7} />
          </mesh>
          {/* Outer glow flame */}
          <mesh ref={flame2Ref}>
            <coneGeometry args={[0.5, 2.5, 6]} />
            <meshBasicMaterial color="#FFD54F" transparent opacity={0.2} />
          </mesh>
          {/* Engine lights */}
          <pointLight color="#4FC3F7" intensity={3} distance={25} decay={2} />
          <pointLight position={[0, -1, 0]} color="#FFD54F" intensity={2} distance={15} decay={2} />
        </group>
      )}
    </group>
  )
}

// ── Flailing astronaut tethered to the ship during alt-launch ──────────────────
function DraggedAstronaut({ rocketRef }) {
  const astronautRef = useRef()
  const ropeMeshRef = useRef()
  const velocity = useRef(new THREE.Vector3(0, 0, 0))
  const pos = useRef(new THREE.Vector3(-6, -0.05, -4))

  // ── ROPE PHYSICS CONFIG ──
  const SEGMENTS = 15
  const ROPE_LENGTH = 16.5
  const SEG_LEN = ROPE_LENGTH / SEGMENTS
  
  // Verlet particles for rope
  const particles = useRef(
    Array.from({ length: SEGMENTS + 1 }, () => ({
      pos: new THREE.Vector3(-6, -0.05, -4),
      oldPos: new THREE.Vector3(-6, -0.05, -4),
    }))
  )

  const workVecs = useRef({
    tie: new THREE.Vector3(),
    delta: new THREE.Vector3(),
    velScaled: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    snapPos: new THREE.Vector3(),
    dirScaled: new THREE.Vector3(),
    diff: new THREE.Vector3()
  })

  useFrame((state, delta) => {
    if (!rocketRef.current || !astronautRef.current || !ropeMeshRef.current) return

    const dt = Math.min(delta, 0.05) // stricter clamp for physics stability
    const GRAVITY = 25
    const RESTITUTION = -0.3
    const SPRING_STRENGTH = 15
    const w = workVecs.current
    const rope = particles.current

    // 1. ASTRO PHYSICS
    w.tie.copy(ROPE_TIE_OFFSET)
    rocketRef.current.localToWorld(w.tie)

    velocity.current.y -= GRAVITY * dt
    w.velScaled.copy(velocity.current).multiplyScalar(dt)
    pos.current.add(w.velScaled)

    if (pos.current.y < -0.05) {
      pos.current.y = -0.05
      velocity.current.y *= RESTITUTION
      velocity.current.x *= 0.92
      velocity.current.z *= 0.92
    }

    // Constraint against rocket
    w.diff.copy(pos.current).sub(w.tie)
    const dist = w.diff.length()

    if (dist > ROPE_LENGTH) {
      const stretch = dist - ROPE_LENGTH
      w.dir.copy(w.diff).normalize()

      w.snapPos.copy(w.dir).multiplyScalar(ROPE_LENGTH)
      pos.current.copy(w.tie).add(w.snapPos)

      const dot = velocity.current.dot(w.dir)
      if (dot > 0) {
        w.dirScaled.copy(w.dir).multiplyScalar(dot)
        velocity.current.sub(w.dirScaled)
      }
      w.dirScaled.copy(w.dir).multiplyScalar(stretch * SPRING_STRENGTH)
      velocity.current.sub(w.dirScaled)
    }

    astronautRef.current.position.copy(pos.current)
    if (pos.current.y > 0.5) {
      astronautRef.current.rotation.x += velocity.current.z * dt * 0.1
      astronautRef.current.rotation.y += velocity.current.x * dt * 0.1
      astronautRef.current.rotation.z += velocity.current.y * dt * 0.05
    }

    // 2. ROPE VERLET INTEGRATION
    rope[0].pos.copy(w.tie) // anchor to rocket
    rope[SEGMENTS].pos.copy(pos.current) // anchor to astronaut

    // Verlet step
    for (let i = 1; i < SEGMENTS; i++) {
      const p = rope[i]
      w.delta.copy(p.pos).sub(p.oldPos)
      p.oldPos.copy(p.pos)
      p.pos.add(w.delta)
      p.pos.addScaledVector(GRAVITY_VEC, dt * dt)
      
      // Ground collision for rope
      if (p.pos.y < 0) p.pos.y = 0
    }

    // Relaxation constraint loop (multiple iterations for stiffness)
    for (let iter = 0; iter < 10; iter++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const p1 = rope[i]
        const p2 = rope[i + 1]

        w.delta.copy(p2.pos).sub(p1.pos)
        const currentDist = w.delta.length()
        if (currentDist === 0) continue

        const error = currentDist - SEG_LEN
        w.delta.normalize().multiplyScalar(error * 0.5)

        if (i !== 0) p1.pos.add(w.delta)
        if (i + 1 !== SEGMENTS) p2.pos.sub(w.delta)
      }
    }

    // Update Catmull curve geometry
    const curvePoints = rope.map(p => p.pos.clone())
    const curve = new THREE.CatmullRomCurve3(curvePoints)
    ropeMeshRef.current.geometry.dispose()
    ropeMeshRef.current.geometry = new THREE.TubeGeometry(curve, SEGMENTS * 2, 0.025, 6, false)
  })

  // Initial dummy geometry to be replaced on first frame
  const initCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0)
  ])

  return (
    <>
      <group ref={astronautRef}>
        <Astronaut scale={0.5} position={[0, 0, 0]} rotation={[0, 0, 0]} />
      </group>
      <mesh ref={ropeMeshRef}>
        <tubeGeometry args={[initCurve, 20, 0.025, 6, false]} />
        <meshBasicMaterial color="#FF3D00" />
      </mesh>
    </>
  )
}

export default function LiftoffScene({ altMode = false }) {
  const { camera } = useThree()
  const setStage = useStore((s) => s.setStage)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const setAtmosphereFlash = useStore((s) => s.setAtmosphereFlash)
  const setAltLaunchTriggered = useStore((s) => s.setAltLaunchTriggered)

  const [engineActive, setEngineActive] = useState(false)
  const rocketRef = useRef()

  useEffect(() => {
    // Start from IntroScene's final camera position
    camera.position.set(-4, 2.2, 2.5)
    camera.lookAt(4, 1.5, -30)

    if (altMode) {
      setHudPrompt('\u26A0 UNPLANNED DEPARTURE SEQUENCE \u26A0 ... HOLD ON!')
    } else {
      setHudPrompt('Ignition sequence initiated...')
    }

    const lookAtTarget = new THREE.Vector3(4, 1.5, -30)

    const tl = gsap.timeline({
      onUpdate: () => camera.lookAt(lookAtTarget),
      onComplete: () => {
        setStage(STAGE.ORBIT)
        setAltLaunchTriggered(false)
        setHudPrompt('Orbit established. Click celestial bodies to explore.')
      },
    })

    // Phase 0 (0–0.5s): Engine ignites, camera pans to frame the rocket
    tl.call(() => {
      setEngineActive(true)
      setHudPrompt('Engine ignition confirmed...')
    })
    tl.to(lookAtTarget, { x: 8, y: 2, z: -14, duration: 0.5, ease: 'power2.inOut' }, 0)

    // ── Rocket Continuous Ascent (0.5s – 6.5s) ──
    if (rocketRef.current) {
      tl.to(rocketRef.current.position, { y: 200, duration: 6.0, ease: 'power2.in' }, 0.5)
    }

    // Phase 1 (0.5–2.5s): Camera watches from surface
    tl.to(lookAtTarget, { x: 6, y: 12, z: -10, duration: 2.0, ease: 'power1.in' }, 0.5)

    // Phase 2 (2.5–4.5s): Camera follows into the sky
    tl.to(camera.position, {
      x: -2, y: 30, z: 12, duration: 2.0, ease: 'power2.inOut',
      onStart: () => setHudPrompt('Ascending through upper atmosphere...'),
    }, 2.5)
    tl.to(lookAtTarget, { x: 0, y: 35, z: 0, duration: 2.0, ease: 'power2.inOut' }, 2.5)

    // Phase 3 (4.5–6.5s): Camera settles into orbit, rocket flies away
    tl.to(camera.position, {
      x: 0, y: 55, z: 20, duration: 2.0, ease: 'power3.out',
      onStart: () => {
        setHudPrompt('Entering orbit...')
        setAtmosphereFlash(true)
      },
    }, 4.5)
    tl.to(lookAtTarget, { x: 0, y: 0, z: 0, duration: 2.0, ease: 'power3.out' }, 4.5)

    return () => tl.kill()
  }, [camera, setStage, setHudPrompt, altMode, setAtmosphereFlash, setAltLaunchTriggered])

  return (
    <>
      {/* IntroScene provides its own lighting and StarField — no duplicates needed */}

      {/* Surface scene — static spacecraft always hidden: RisingRocket replaces it */}
      <IntroScene altMode={altMode} showCraft={false} isLiftoff={true} />

      {/* Animated rocket — normal lift-off used for both sequences now */}
      <RisingRocket rocketRef={rocketRef} engineActive={engineActive} />

      {/* Dragged astronaut strictly tethered in alt-launch */}
      {altMode && <DraggedAstronaut rocketRef={rocketRef} />}
    </>
  )
}

import { Suspense, useEffect, useCallback, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import useStore, { STAGE, VIEW_MODE } from './store/useStore'
import { useKeyBindings } from './hooks/useKeyBindings'
import { flyCamera } from './utils/cameraAnimations'
import planetRegistry from './utils/planetRegistry'
import gsap from 'gsap'

import IntroScene from './scenes/IntroScene'
import LiftoffScene from './scenes/LiftoffScene'
import OrbitScene from './scenes/OrbitScene'
import CockpitScene from './scenes/CockpitScene'

import SurfaceMenu from './components/ui/SurfaceMenu'
import HudOverlay from './components/hud/HudOverlay'
import StarCorePanel from './components/panels/StarCorePanel'
import PlanetPanel from './components/panels/PlanetPanel'
import AdminPanel from './components/panels/AdminPanel'
import SimplifiedView from './components/panels/SimplifiedView'
import FlightModeLayer from './components/ui/FlightModeLayer'

const ORBIT_POS = new THREE.Vector3(0, 55, 20)
const ORIGIN = new THREE.Vector3(0, 0, 0)

// Inner component — lives inside Canvas so useThree/useFrame are available
function SceneManager() {
  const { camera } = useThree()
  const stage = useStore((s) => s.stage)
  const setStage = useStore((s) => s.setStage)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const setActivePlanetId = useStore((s) => s.setActivePlanetId)
  const pendingNavTarget = useStore((s) => s.pendingNavTarget)
  const setPendingNavTarget = useStore((s) => s.setPendingNavTarget)
  const altLaunchTriggered = useStore((s) => s.altLaunchTriggered)
  const isAnimating = useStore((s) => s.isAnimating)
  const setIsAnimating = useStore((s) => s.setIsAnimating)
  const setOrbitsFrozen = useStore((s) => s.setOrbitsFrozen)

  // Track previous stage to detect return transitions
  const prevStageRef = useRef(STAGE.SURFACE)

  useEffect(() => {
    const prev = prevStageRef.current
    prevStageRef.current = stage

    if (stage === STAGE.ORBIT) {
      // ── Returning from a detail panel → fly camera back to orbit ─────────
      if (prev === STAGE.STAR_CORE || prev === STAGE.PLANET) {
        setIsAnimating(true)
        setOrbitsFrozen(false)

        // Slower, more cinematic pullback from star core
        const duration = prev === STAGE.STAR_CORE ? 2.5 : 1.8
        setHudPrompt(prev === STAGE.STAR_CORE ? 'Exiting stellar core...' : 'Returning to orbit...')
        flyCamera(camera, ORBIT_POS, ORIGIN, duration, 'power3.inOut', () => {
          setIsAnimating(false)
          setHudPrompt('Click celestial bodies to explore.')
        })
        return
      }

      // ── First orbit entry after liftoff: consume pendingNavTarget ─────────
      if (pendingNavTarget === 'star') {
        setPendingNavTarget(null)
        setIsAnimating(true)
        setHudPrompt('Approach vector locked — Entering stellar core...')

        // Multi-phase cinematic entry matching handleStarClick
        const tl = gsap.timeline({
          onComplete: () => {
            setStage(STAGE.STAR_CORE)
            setIsAnimating(false)
          },
        })
        tl.to(camera.position, {
          x: 0, y: 12, z: 16,
          duration: 1.2, ease: 'power2.in',
          onUpdate: () => camera.lookAt(ORIGIN),
        }, 0)
        tl.to(camera.position, {
          x: 0, y: 5, z: 8,
          duration: 1.0, ease: 'power2.inOut',
          onUpdate: () => camera.lookAt(ORIGIN),
          onStart: () => setHudPrompt('Entering stellar atmosphere...'),
        }, 1.2)
        tl.to(camera.position, {
          x: 0, y: 3, z: 6,
          duration: 0.8, ease: 'power3.out',
          onUpdate: () => camera.lookAt(ORIGIN),
        }, 2.2)
        return
      }

      // Consume any remaining nav target (e.g. 'orbit' from Projects click)
      if (pendingNavTarget) {
        setPendingNavTarget(null)
      }
      setHudPrompt('Click celestial bodies to explore.')
    }
  }, [stage, pendingNavTarget, setPendingNavTarget, setStage, setHudPrompt, camera, setIsAnimating, setOrbitsFrozen])

  const flightModeUnlocked = useStore((s) => s.flightModeUnlocked)
  const prevFlightModeRef = useRef(flightModeUnlocked)

  useEffect(() => {
    const prev = prevFlightModeRef.current
    prevFlightModeRef.current = flightModeUnlocked
    if (prev && !flightModeUnlocked && stage === STAGE.ORBIT) {
      setIsAnimating(true)
      flyCamera(camera, ORBIT_POS, ORIGIN, 1.8, 'power3.inOut', () => {
        setIsAnimating(false)
        setHudPrompt('Click celestial bodies to explore.')
      })
    }
  }, [flightModeUnlocked, camera, stage, setHudPrompt, setIsAnimating])

  const handlePlanetClick = useCallback((project) => {
    if (isAnimating) return
    setIsAnimating(true)
    setOrbitsFrozen(true)
    setActivePlanetId(project.id)
    setHudPrompt(`Approach vector locked — ${project.title}`)

    const pos = planetRegistry.positions[project.id]
    if (pos) {
      // Position camera so planet appears on the left side of the viewport
      // (right side is occupied by the detail panel)
      const targetPos = new THREE.Vector3(pos.x + 3, project.size * 2 + 4, pos.z + 9)
      const lookAt = new THREE.Vector3(pos.x + 6, 0, pos.z)
      flyCamera(camera, targetPos, lookAt, 1.5, 'power3.inOut', () => {
        setStage(STAGE.PLANET)
        setIsAnimating(false)
      })
    } else {
      setTimeout(() => { setStage(STAGE.PLANET); setIsAnimating(false) }, 600)
    }
  }, [camera, isAnimating, setActivePlanetId, setHudPrompt, setIsAnimating, setStage, setOrbitsFrozen])

  const handleStarClick = useCallback(() => {
    if (isAnimating) return
    setIsAnimating(true)
    setHudPrompt('Approach vector locked — Entering stellar core...')

    // Multi-phase cinematic star entry
    const tl = gsap.timeline({
      onComplete: () => {
        setStage(STAGE.STAR_CORE)
        setIsAnimating(false)
      },
    })

    // Phase 1 (0–1.2s): Accelerate toward the star from current orbit position
    tl.to(camera.position, {
      x: 0, y: 12, z: 16,
      duration: 1.2,
      ease: 'power2.in',
      onUpdate: () => camera.lookAt(ORIGIN),
    }, 0)

    // Phase 2 (1.2–2.2s): Dive closer, camera tilts to dramatic angle
    tl.to(camera.position, {
      x: 0, y: 5, z: 8,
      duration: 1.0,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(ORIGIN),
      onStart: () => setHudPrompt('Entering stellar atmosphere...'),
    }, 1.2)

    // Phase 3 (2.2–3.0s): Final approach — camera settles into the star's glow
    tl.to(camera.position, {
      x: 0, y: 3, z: 6,
      duration: 0.8,
      ease: 'power3.out',
      onUpdate: () => camera.lookAt(ORIGIN),
    }, 2.2)

    return () => tl.kill()
  }, [camera, isAnimating, setHudPrompt, setIsAnimating, setStage])

  return (
    <>
      {stage === STAGE.SURFACE && <IntroScene />}
      {stage === STAGE.LIFTOFF && <LiftoffScene altMode={altLaunchTriggered} />}
      {stage === STAGE.COCKPIT && <CockpitScene />}
      {(stage === STAGE.ORBIT ||
        stage === STAGE.STAR_CORE ||
        stage === STAGE.PLANET) && (
          <OrbitScene
            onPlanetClick={handlePlanetClick}
            onStarClick={handleStarClick}
          />
        )}
    </>
  )
}

export default function App() {
  const stage = useStore((s) => s.stage)
  const viewMode = useStore((s) => s.viewMode)
  const setAdminOpen = useStore((s) => s.setAdminOpen)
  const openingSequenceComplete = useStore((s) => s.openingSequenceComplete)

  useKeyBindings()

  // Auto-open admin panel if URL hash is #/admin
  useEffect(() => {
    if (window.location.hash === '#/admin') {
      setAdminOpen(true)
    }
  }, [setAdminOpen])

  const isSimplified = viewMode === VIEW_MODE.SIMPLIFIED
  const bgColor = '#04060e'

  return (
    <>
      {/* Full 3D solar system view — always rendered */}
      <Canvas
        shadows
        onPointerMissed={() => {
          const s = useStore.getState()
          if (s.isAnimating) return
          if (s.stage === STAGE.PLANET) {
            s.setHudPrompt('Returning to orbit...')
            s.setStage(STAGE.ORBIT)
          } else if (s.stage === STAGE.COCKPIT) {
             // We don't exit cockpit on missed click if a screen is focused
             // because screens are parts of the mesh, and clicking background
             // often happens when interacting. 
             // But we could add a logic here if needed.
          }
        }}
        camera={{ fov: 55, near: 0.1, far: 2000 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        dpr={[1, 1.5]}
        style={{ background: bgColor }}
      >
        <Suspense fallback={null}>
          <SceneManager />
        </Suspense>
      </Canvas>

      {/* Simplified View as overlay */}
      {isSimplified && <SimplifiedView />}

      <HudOverlay />

      {!isSimplified && (stage === STAGE.SURFACE || stage === STAGE.LIFTOFF || stage === STAGE.COCKPIT) && openingSequenceComplete && (
        <SurfaceMenu fading={stage === STAGE.LIFTOFF || stage === STAGE.COCKPIT} />
      )}
      {!isSimplified && stage === STAGE.STAR_CORE && <StarCorePanel />}
      {!isSimplified && stage === STAGE.PLANET && <PlanetPanel />}
 
      {/* Global Back navigation for Cockpit */}
      {!isSimplified && stage === STAGE.COCKPIT && (
        <button
          onClick={() => useStore.getState().setCockpitExitRequested(true)}
          style={{
            position: 'fixed',
            top: '88px',
            left: '40px',
            background: 'rgba(6,8,16,0.6)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(79,195,247,0.3)',
            borderRadius: '4px',
            color: '#4FC3F7',
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.7rem',
            padding: '8px 16px',
            cursor: 'pointer',
            zIndex: 100,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(79,195,247,0.8)'
            e.currentTarget.style.background = 'rgba(79,195,247,0.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(79,195,247,0.3)'
            e.currentTarget.style.background = 'rgba(6,8,16,0.6)'
          }}
        >
          <span>←</span> Back to Surface
        </button>
      )}
 
      <FlightModeLayer />
      <AdminPanel />
    </>
  )
}

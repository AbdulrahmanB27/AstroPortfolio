import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useStore, { STAGE } from '../store/useStore'

import planetRegistry from '../utils/planetRegistry'

const SPEED = 40.0
const TURN_SPEED = 2.0
const BOUNDARY = 200

export function useFlightMode() {
  const flightModeUnlocked = useStore((s) => s.flightModeUnlocked)
  const stage = useStore((s) => s.stage)
  const { camera } = useThree()

  const keysRef = useRef(new Set())
  const lookAtRef = useRef(new THREE.Vector3())
  const initialized = useRef(false)

  // Cached working objects to avoid per-frame allocation
  const workEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const workForward = useRef(new THREE.Vector3())
  const workIdealOffset = useRef(new THREE.Vector3())
  const workIdealLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!flightModeUnlocked) {
      initialized.current = false
      return
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        useStore.getState().setFlightModeUnlocked(false)
        useStore.getState().setHudPrompt('Exiting flight mode.')
        return
      }
      keysRef.current.add(e.key.toLowerCase())
    }
    function onKeyUp(e) { keysRef.current.delete(e.key.toLowerCase()) }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [flightModeUnlocked])

  useFrame((_, delta) => {
    if (!flightModeUnlocked) return
    if (stage !== STAGE.ORBIT) return

    const keys = keysRef.current
    const shipState = planetRegistry.flightShip

    // Initialize ship to camera position if just activated
    if (!initialized.current) {
      shipState.position = camera.position.clone()
      shipState.position.y = 1 // Spawn on the planetary plane
      shipState.position.z -= 10 // Spawn slightly ahead

      workEuler.current.set(0, camera.rotation.y, 0)
      shipState.rotation = { x: 0, y: workEuler.current.y, z: 0 }

      workForward.current.set(0, 0, -1).applyEuler(workEuler.current)
      lookAtRef.current.copy(shipState.position).add(workForward.current.multiplyScalar(20))

      initialized.current = true
    }

    // Input handling
    if (keys.has('a') || keys.has('arrowleft')) shipState.rotation.y += TURN_SPEED * delta
    if (keys.has('d') || keys.has('arrowright')) shipState.rotation.y -= TURN_SPEED * delta

    workEuler.current.set(0, shipState.rotation.y, 0)
    workForward.current.set(0, 0, -1).applyEuler(workEuler.current)

    if (keys.has('w') || keys.has('arrowup')) {
      shipState.position.x += workForward.current.x * SPEED * delta
      shipState.position.z += workForward.current.z * SPEED * delta
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      shipState.position.x -= workForward.current.x * SPEED * delta
      shipState.position.z -= workForward.current.z * SPEED * delta
    }

    // Clamp
    shipState.position.x = THREE.MathUtils.clamp(shipState.position.x, -BOUNDARY, BOUNDARY)
    shipState.position.z = THREE.MathUtils.clamp(shipState.position.z, -BOUNDARY, BOUNDARY)

    // 3rd Person Camera Calculation
    // Ideal offset: directly behind and slightly above
    workIdealOffset.current.set(0, 3, 12).applyEuler(workEuler.current).add(shipState.position)

    // Ideal look at: ahead of the ship
    workIdealLookAt.current.set(0, 0, -30).applyEuler(workEuler.current).add(shipState.position)

    // Smooth lerp for cinematic camera feel
    camera.position.lerp(workIdealOffset.current, 0.05)
    lookAtRef.current.lerp(workIdealLookAt.current, 0.05)
    camera.lookAt(lookAtRef.current)
  })
}

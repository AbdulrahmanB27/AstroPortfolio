import './draco'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { SYS_MATRIX } from './constants'
import { fx, rig } from './rig'
import { findMaterial, tuneProp } from './materials'
import { app, useApp } from '../state/store'
import { flightRequest } from '../state/director'
import { bodyPosition, systemRefs } from './orbits'

const BASE = import.meta.env.BASE_URL
const URLS = { scout: `${BASE}models/scout.glb`, freighter: `${BASE}models/freighter.glb`, station: `${BASE}models/station.glb` }

/** Hidden flight mode: a small ship steered in the orbital plane, with something to find far outside the system. */
const SHIP_SCALE = 46
const STATION_POS = new THREE.Vector3(37500, 700, -34500)
const STATION_R = 1500
const MAX_RANGE = 66000
const CAM_BACK = 2300
const CAM_UP = 900

const ship = { x: 0, z: 11000, heading: Math.PI / 2, speed: 0, turn: 0, hinted: false }
const input = { keys: new Set<string>(), down: false, px: 0, py: 0 }
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const camSys = new THREE.Vector3()
const lookSys = new THREE.Vector3()

function Flight() {
  const scout = useGLTF(URLS.scout)
  const freighter = useGLTF(URLS.freighter)
  const station = useGLTF(URLS.station)
  const gl = useThree((s) => s.gl)
  const shipRef = useRef<THREE.Group>(null)
  const stationRef = useRef<THREE.Group>(null)
  const altActive = useApp((s) => s.altShipActive)
  const started = useRef(false)

  const glows = useMemo(() => {
    tuneProp(scout.scene, { shadows: false, env: 0.9 })
    tuneProp(freighter.scene, { shadows: false, env: 0.9 })
    tuneProp(station.scene, { shadows: false, env: 0.6 })
    const g = [findMaterial(scout.scene, 'EngineGlow'), findMaterial(freighter.scene, 'EngineGlow')]
    g.forEach((m) => m && (m.toneMapped = false))
    return g
  }, [scout, freighter, station])

  useEffect(() => {
    const el = gl.domElement
    const key = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (down) input.keys.add(k)
        else input.keys.delete(k)
        if (k.startsWith('arrow')) e.preventDefault()
      }
    }
    const kd = key(true)
    const ku = key(false)
    const pd = (e: PointerEvent) => {
      input.down = true
      input.px = e.clientX
      input.py = e.clientY
    }
    const pm = (e: PointerEvent) => {
      input.px = e.clientX
      input.py = e.clientY
    }
    const pu = () => {
      input.down = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointercancel', pu)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointercancel', pu)
      input.keys.clear()
      input.down = false
    }
  }, [gl])

  useFrame((state, dt) => {
    const st = app()
    const d = Math.min(dt, 0.05)
    if (flightRequest.pending) {
      // (re)spawn: just outside the first orbit, or on approach to the station for the QA view
      if (flightRequest.pending === 'station') {
        ship.x = STATION_POS.x - 5200
        ship.z = STATION_POS.z + 6800
        ship.heading = Math.atan2(STATION_POS.x - ship.x, -(STATION_POS.z - ship.z))
      } else {
        const first = systemRefs.layout?.bodies[0]
        if (first) {
          const p = bodyPosition(first, fx.orbitTime)
          // start on the sunward side of the first planet, flying past its lit face
          const out = Math.hypot(p.x, p.z) || 1
          const rx = p.x / out
          const rz = p.z / out
          const R = first.radius
          // narrow screens start further back so the planet does not fill the view ahead
          const back = state.size.width / state.size.height < 0.8 ? 8.0 : 4.2
          ship.x = p.x - rx * R * 2.4 + rz * R * back
          ship.z = p.z - rz * R * 2.4 - rx * R * back
          const turnIn = 0.21
          ship.heading = Math.atan2(-rz * Math.cos(turnIn) + rx * Math.sin(turnIn), -(rx * Math.cos(turnIn) + rz * Math.sin(turnIn)))
        } else {
          ship.x = 2600
          ship.z = 10200
          ship.heading = Math.PI * 0.62
        }
      }
      ship.speed = 0
      ship.turn = 0
      flightRequest.pending = null
      started.current = false
    }
    // ── controls ──
    const k = input.keys
    let steer = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0)
    let thrust = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 0.6 : 0)
    if (input.down) {
      // hold to fly: the ship turns towards the pointer and accelerates
      const nx = (input.px / state.size.width) * 2 - 1
      const ny = (input.py / state.size.height) * 2 - 1
      steer += THREE.MathUtils.clamp(nx * 1.6, -1, 1)
      thrust += ny < 0.55 ? 1 : -0.4
    }
    steer = THREE.MathUtils.clamp(steer, -1, 1)
    thrust = THREE.MathUtils.clamp(thrust, -0.6, 1)
    const boost = k.has('shift') ? 2.1 : 1
    if (!fx.frozen) {
      ship.turn += (steer * 1.15 - ship.turn) * Math.min(1, d * 5)
      ship.heading += ship.turn * d
      const target = thrust * 3400 * boost
      ship.speed += (target - ship.speed) * Math.min(1, d * (thrust !== 0 ? 1.3 : 0.45))
      ship.x += Math.sin(ship.heading) * ship.speed * d
      ship.z += -Math.cos(ship.heading) * ship.speed * d
      const r = Math.hypot(ship.x, ship.z)
      if (r > MAX_RANGE) {
        ship.x *= MAX_RANGE / r
        ship.z *= MAX_RANGE / r
      }
    }
    const fwdX = Math.sin(ship.heading)
    const fwdZ = -Math.cos(ship.heading)
    const g = shipRef.current
    if (g) {
      g.position.set(ship.x, 0, ship.z)
      g.rotation.set(0, -ship.heading, -ship.turn * 0.45, 'YXZ')
    }
    const glow = Math.max(0.25, Math.min(1.6, Math.abs(ship.speed) / 3000 + (thrust > 0 ? 0.35 : 0)))
    glows.forEach((m) => m && (m.emissiveIntensity = glow * 9))

    // ── chase camera (system space → world) ──
    camSys.set(ship.x - fwdX * CAM_BACK, CAM_UP, ship.z - fwdZ * CAM_BACK)
    lookSys.set(ship.x + fwdX * 2400, 0, ship.z + fwdZ * 2400)
    tmpA.copy(camSys).applyMatrix4(SYS_MATRIX)
    tmpB.copy(lookSys).applyMatrix4(SYS_MATRIX)
    const ease = started.current ? 1 - Math.exp(-d * 3.6) : 1 - Math.exp(-d * 2.4)
    rig.pos.lerp(tmpA, fx.frozen ? 1 : ease)
    rig.target.lerp(tmpB, fx.frozen ? 1 : Math.min(1, ease * 1.6))
    rig.fov += (42 - rig.fov) * Math.min(1, d * 3)
    rig.sway = 0
    if (rig.pos.distanceTo(tmpA) < 400) started.current = true

    // ── the thing out there ──
    const sg = stationRef.current
    if (sg) {
      const ds = Math.hypot(ship.x - STATION_POS.x, ship.z - STATION_POS.z)
      sg.visible = ds < 36000
      const radius = Math.hypot(ship.x, ship.z)
      if (!ship.hinted && radius > 27000) {
        ship.hinted = true
        st.showToast('Long-range sensors: something large beyond the outer orbit.', 5200)
      }
      if (!st.stationFound && ds < 15000) {
        st.set({ stationFound: true })
        st.showToast('Unidentified station ahead. That is no moon.', 5200)
      }
      if (!st.altShipUnlocked && ds < STATION_R + 2600) {
        st.set({ altShipUnlocked: true, altShipActive: true })
        st.showToast('Docking beacon answered: light freighter unlocked.', 5600)
      }
    }
  })

  const unlock = () => {
    const st = app()
    if (!st.altShipUnlocked) {
      st.set({ stationFound: true, altShipUnlocked: true, altShipActive: true })
      st.showToast('Docking beacon answered: light freighter unlocked.', 5600)
    }
  }

  return (
    <group matrix={SYS_MATRIX} matrixAutoUpdate={false}>
      <group ref={shipRef}>
        <group scale={SHIP_SCALE}>
          <primitive object={scout.scene} visible={!altActive} />
          <primitive object={freighter.scene} visible={altActive} scale={0.9} />
        </group>
      </group>
      <group ref={stationRef} position={STATION_POS} visible={false}>
        <primitive object={station.scene} scale={STATION_R} rotation={[0, -0.83, 0]} onClick={unlock} />
      </group>
    </group>
  )
}

/** Assets for the secret load only when flight mode is first entered. */
export function FlightSet() {
  const mode = useApp((s) => s.mode)
  const unlocked = useApp((s) => s.flightUnlocked)
  if (!unlocked || mode !== 'flight') return null
  // own boundary: loading the secret models must never blank the rest of the scene
  return (
    <Suspense fallback={null}>
      <Flight />
    </Suspense>
  )
}

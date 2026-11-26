import './draco'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { HOME_CENTER, HOME_GLOBE_ORBIT_SCALE, HOME_R, STAR_R, STAR_SYSTEM_SCALE, SYS_MATRIX, SYS_QUAT } from './constants'
import { fx, rig } from './rig'
import { findMaterial, tuneProp } from './materials'
import { app, useApp } from '../state/store'
import { flightRequest } from '../state/director'
import { bodyPosition, moonOffset, moonSize, systemRefs } from './orbits'

const BASE = import.meta.env.BASE_URL
const URLS = { scout: `${BASE}models/scout.glb`, freighter: `${BASE}models/freighter.glb`, station: `${BASE}models/station.glb` }

/** Hidden flight mode: a small ship steered in the orbital plane, with something to find far outside the system. */
const SHIP_SCALE = 46
const FREIGHTER_SCALE = 0.9
const SHIP_R = 95
const STATION_POS = new THREE.Vector3(37500, 700, -34500)
const STATION_R = 1500
const MAX_RANGE = 66000
const CAM_BACK = 2300
const CAM_UP = 900
const BOOST = 2.1

const ship = { x: 0, z: 11000, heading: Math.PI / 2, speed: 0, turn: 0, hinted: false, kx: 0, kz: 0, boost: 0 }
const input = { keys: new Set<string>(), down: false, px: 0, py: 0 }
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const camSys = new THREE.Vector3()
const lookSys = new THREE.Vector3()
const SYS_QUAT_INV = SYS_QUAT.clone().invert()
const HOME_SYS = HOME_CENTER.clone().applyMatrix4(SYS_MATRIX.clone().invert())

// ── solid bodies (system space spheres, rebuilt every frame: everything out here moves) ──
interface Solid {
  x: number
  y: number
  z: number
  r: number
}
const solids: Solid[] = []
let solidCount = 0
function solid(x: number, y: number, z: number, r: number) {
  const s = solids[solidCount] ?? (solids[solidCount] = { x: 0, y: 0, z: 0, r: 0 })
  s.x = x
  s.y = y
  s.z = z
  s.r = r
  solidCount++
}
function gatherSolids() {
  solidCount = 0
  solid(0, 0, 0, STAR_R * STAR_SYSTEM_SCALE)
  solid(HOME_SYS.x, HOME_SYS.y, HOME_SYS.z, systemRefs.world.get('__home')?.radius ?? HOME_R * HOME_GLOBE_ORBIT_SCALE)
  solid(STATION_POS.x, STATION_POS.y, STATION_POS.z, STATION_R)
  for (const b of systemRefs.layout?.bodies ?? []) {
    bodyPosition(b, fx.orbitTime, tmpA)
    // drawn radius (phones draw the planets larger)
    const r = systemRefs.world.get(b.project.id)?.radius ?? b.radius
    solid(tmpA.x, 0, tmpA.z, r)
    for (let i = 0; i < b.project.planet.moons; i++) {
      moonOffset(b.project.planet.seed, i, fx.time, tmpB)
      solid(tmpA.x + tmpB.x * r, tmpB.y * r, tmpA.z + tmpB.z * r, r * moonSize(i))
    }
  }
}

const impact = { at: -10, x: 0, z: 0, strength: 0 }

/** Read by the QA scripts (ship state, the last touch on a body, the bodies it can touch). */
export const flightState = { ship, impact, solids: () => solids.slice(0, solidCount), shipRadius: SHIP_R }

/**
 * Keep the ship out of every body. Its velocity is its speed along the nose plus a knock that dies away; a hit
 * reflects the part of that velocity that pointed into the body (most of it is lost), so a glancing touch slides
 * past and a head-on one stops the ship and pushes it back.
 */
function collide() {
  const fwdX = Math.sin(ship.heading)
  const fwdZ = -Math.cos(ship.heading)
  for (let i = 0; i < solidCount; i++) {
    const s = solids[i]
    const reach = s.r + SHIP_R
    if (Math.abs(s.y) >= reach) continue
    const ring = Math.sqrt(reach * reach - s.y * s.y) // the body's outline where it cuts the orbital plane
    let dx = ship.x - s.x
    let dz = ship.z - s.z
    let dist = Math.hypot(dx, dz)
    if (dist >= ring) continue
    if (dist < 1e-3) {
      dx = -fwdX
      dz = -fwdZ
      dist = 1
    }
    const nx = dx / dist
    const nz = dz / dist
    ship.x = s.x + nx * ring
    ship.z = s.z + nz * ring
    let vx = fwdX * ship.speed + ship.kx
    let vz = fwdZ * ship.speed + ship.kz
    const into = vx * nx + vz * nz
    if (into >= 0) continue
    vx -= 1.35 * into * nx
    vz -= 1.35 * into * nz
    ship.speed = vx * fwdX + vz * fwdZ
    ship.kx = vx - fwdX * ship.speed
    ship.kz = vz - fwdZ * ship.speed
    if (-into > 500 && fx.time - impact.at > 0.3) {
      impact.at = fx.time
      impact.x = ship.x - nx * SHIP_R
      impact.z = ship.z - nz * SHIP_R
      impact.strength = Math.min(1, -into / 3400)
    }
  }
}

// ── engines and the boost trail ──
interface Nozzle {
  x: number
  y: number
  z: number
  half: number
}

/** Where a ship's engines are, in its own space (nose towards -Z): one entry per separate glowing nozzle. */
function findNozzles(root: THREE.Object3D): Nozzle[] {
  root.updateWorldMatrix(true, true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const pts: THREE.Vector3[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m.material as THREE.Material)?.name !== 'EngineGlow') return
    const pos = m.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toRoot))
  })
  if (!pts.length) return [{ x: 0, y: 0, z: 1, half: 0.4 }]
  pts.sort((a, b) => a.x - b.x)
  const gap = Math.max(0.02, (pts[pts.length - 1].x - pts[0].x) * 0.16)
  const groups: THREE.Vector3[][] = [[pts[0]]]
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x - pts[i - 1].x > gap) groups.push([])
    groups[groups.length - 1].push(pts[i])
  }
  const use = groups.length <= MAX_RIBBONS ? groups : [pts]
  return use.map((g) => ({
    x: (g[0].x + g[g.length - 1].x) / 2,
    y: g.reduce((a, p) => a + p.y, 0) / g.length,
    z: Math.max(...g.map((p) => p.z)),
    half: Math.max(0.08, (g[g.length - 1].x - g[0].x) / 2),
  }))
}

const MAX_RIBBONS = 3
const TRAIL_N = 48
const TRAIL_LIFE = 0.26
/** Past states of the ship, newest first; slot 0 is always the ship right now. */
const trail = Array.from({ length: TRAIL_N }, () => ({ x: 0, z: 0, fx: 0, fz: 1, heat: 0, born: -10 }))

const TRAIL_VERT = /* glsl */ `
attribute float aSide; attribute vec2 aData; varying float vSide; varying vec2 vData;
void main(){ vSide = aSide; vData = aData; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const TRAIL_FRAG = /* glsl */ `
varying float vSide; varying vec2 vData;
void main(){
  float age = clamp(vData.x, 0.0, 1.0);
  float edge = clamp(1.0 - abs(vSide), 0.0, 1.0);
  float core = edge * edge * edge;
  float fade = pow(1.0 - age, 1.6);
  // white-hot at the nozzle, cooling through amber to a dull orange as it spreads and thins out
  vec3 col = mix(vec3(1.0, 0.34, 0.07), vec3(1.0, 0.84, 0.56), core * (1.0 - age));
  gl_FragColor = vec4(col * (0.55 * edge * edge + 3.0 * core * (1.0 - 0.6 * age)) * fade * vData.y, 1.0);
}`
const FLASH_FRAG = /* glsl */ `
uniform float uT; uniform float uGain; varying vec2 vUv;
void main(){
  float r = length(vUv * 2.0 - 1.0);
  float front = mix(0.2, 0.9, sqrt(uT));                   // a thin ring that runs outwards and fades
  float ring = exp(-pow((r - front) / 0.045, 2.0));
  float core = exp(-r * r * 26.0) * (1.0 - uT) * (1.0 - uT);
  float a = (ring * 0.55 + core * 1.5) * (1.0 - uT) * (1.0 - uT) * smoothstep(1.0, 0.92, r);
  gl_FragColor = vec4(vec3(1.0, 0.72, 0.38) * a * uGain, 1.0);
}`
const UV_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

function makeTrail() {
  const count = MAX_RIBBONS * TRAIL_N * 2
  const geo = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const data = new THREE.BufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage)
  const side = new Float32Array(count)
  const index: number[] = []
  for (let r = 0; r < MAX_RIBBONS; r++) {
    for (let i = 0; i < TRAIL_N; i++) {
      const v = (r * TRAIL_N + i) * 2
      side[v] = -1
      side[v + 1] = 1
      if (i < TRAIL_N - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
  }
  geo.setAttribute('position', position)
  geo.setAttribute('aData', data)
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  geo.setIndex(index)
  const mat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 3
  return { mesh, position, data }
}

function Flight() {
  const scout = useGLTF(URLS.scout)
  const freighter = useGLTF(URLS.freighter)
  const station = useGLTF(URLS.station)
  const gl = useThree((s) => s.gl)
  const shipRef = useRef<THREE.Group>(null)
  const stationRef = useRef<THREE.Group>(null)
  const flashRef = useRef<THREE.Mesh>(null)
  const altActive = useApp((s) => s.altShipActive)
  const started = useRef(false)

  const { glows, nozzles } = useMemo(() => {
    tuneProp(scout.scene, { shadows: false, env: 0.9 })
    tuneProp(freighter.scene, { shadows: false, env: 0.9 })
    tuneProp(station.scene, { shadows: false, env: 0.6 })
    const g = [findMaterial(scout.scene, 'EngineGlow'), findMaterial(freighter.scene, 'EngineGlow')]
    g.forEach((m) => m && (m.toneMapped = false))
    return { glows: g, nozzles: { scout: findNozzles(scout.scene), freighter: findNozzles(freighter.scene) } }
  }, [scout, freighter, station])
  const trailFx = useMemo(makeTrail, [])
  const flashMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: UV_VERT, fragmentShader: FLASH_FRAG, uniforms: { uT: { value: 1 }, uGain: { value: 0 } }, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }),
    [],
  )
  useEffect(
    () => () => {
      trailFx.mesh.geometry.dispose()
      trailFx.mesh.material.dispose()
      flashMat.dispose()
      rig.roll = 0
    },
    [trailFx, flashMat],
  )

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
    // keys held when the window loses focus never get their keyup
    const blur = () => input.keys.clear()
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointercancel', pu)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
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
      ship.kx = 0
      ship.kz = 0
      ship.boost = 0
      impact.at = -10
      trail.forEach((s) => (s.born = -10))
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
    const boosting = k.has('shift') && thrust > 0
    if (!fx.frozen) {
      ship.turn += (steer * 1.15 - ship.turn) * Math.min(1, d * 5)
      ship.heading += ship.turn * d
      const target = thrust * 3400 * (boosting ? BOOST : 1)
      ship.speed += (target - ship.speed) * Math.min(1, d * (thrust !== 0 ? 1.3 : 0.45))
      ship.boost += ((boosting ? 1 : 0) - ship.boost) * Math.min(1, d * 7)
      ship.x += (Math.sin(ship.heading) * ship.speed + ship.kx) * d
      ship.z += (-Math.cos(ship.heading) * ship.speed + ship.kz) * d
      const fade = Math.exp(-d * 2.6)
      ship.kx *= fade
      ship.kz *= fade
      gatherSolids()
      collide()
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
    const glow = Math.max(0.25, Math.min(1.6, Math.abs(ship.speed) / 3000 + (thrust > 0 ? 0.35 : 0))) + ship.boost * 0.7
    glows.forEach((m) => m && (m.emissiveIntensity = glow * 9))

    // ── boost trail: one ribbon per nozzle, laid along where the ship has just been ──
    if (!fx.frozen) {
      for (let i = TRAIL_N - 1; i > 0; i--) Object.assign(trail[i], trail[i - 1])
      const head = trail[0]
      head.x = ship.x
      head.z = ship.z
      head.fx = fwdX
      head.fz = fwdZ
      head.heat = ship.boost
      head.born = fx.time
    }
    const jets = altActive ? nozzles.freighter : nozzles.scout
    const size = SHIP_SCALE * (altActive ? FREIGHTER_SCALE : 1)
    const pos = trailFx.position
    const data = trailFx.data
    for (let r = 0; r < MAX_RIBBONS; r++) {
      const jet = jets[r]
      let last = 0
      for (let i = 0; i < TRAIL_N; i++) {
        const v = (r * TRAIL_N + i) * 2
        const s = trail[i]
        const age = (fx.time - s.born) / TRAIL_LIFE
        // points that have burnt out (or ribbons this ship does not have) fold onto the last live one
        const live = !!jet && age < 1
        if (live) last = i
        const p = trail[live ? i : last]
        const cx = jet ? jet.x * size : 0
        const back = jet ? jet.z * size * 0.92 : 0
        const px = p.x - p.fz * cx - p.fx * back
        const pz = p.z + p.fx * cx - p.fz * back
        // the exhaust spreads by the same amount whatever the nozzle's width (a wide slab engine stays a band, not a fan)
        const w = live ? jet.half * size * 1.1 + 62 * age : 0
        const y = jet ? jet.y * size : 0
        pos.setXYZ(v, px + p.fz * w, y, pz - p.fx * w)
        pos.setXYZ(v + 1, px - p.fz * w, y, pz + p.fx * w)
        const heat = live ? s.heat : 0
        data.setXY(v, age, heat)
        data.setXY(v + 1, age, heat)
      }
    }
    pos.needsUpdate = true
    data.needsUpdate = true

    // ── a touch on a body: a ring of light where it happened, and a short shudder ──
    const since = fx.time - impact.at
    const flash = flashRef.current
    if (flash) {
      const on = since < 0.5
      flash.visible = on
      if (on) {
        flash.position.set(impact.x, 0, impact.z)
        flash.quaternion.copy(SYS_QUAT_INV).multiply(state.camera.quaternion)
        flash.scale.setScalar(150 + 230 * impact.strength)
        flashMat.uniforms.uT.value = since / 0.5
        flashMat.uniforms.uGain.value = 0.7 + 1.0 * impact.strength
      }
    }
    rig.roll = since < 0.45 && !st.reducedMotion ? Math.sin(since * 46) * 0.012 * impact.strength * (1 - since / 0.45) : 0

    // ── chase camera (system space → world): it follows from behind and above, and rides over anything in its way ──
    camSys.set(ship.x - fwdX * CAM_BACK, CAM_UP, ship.z - fwdZ * CAM_BACK)
    for (let i = 0; i < solidCount; i++) {
      const s = solids[i]
      const clear = s.r * 1.2 + 140
      tmpA.set(camSys.x - s.x, camSys.y - s.y, camSys.z - s.z)
      const dist = tmpA.length()
      if (dist < clear && dist > 1e-3) camSys.set(s.x, s.y, s.z).addScaledVector(tmpA, clear / dist)
    }
    lookSys.set(ship.x + fwdX * 2400, 0, ship.z + fwdZ * 2400)
    tmpA.copy(camSys).applyMatrix4(SYS_MATRIX)
    tmpB.copy(lookSys).applyMatrix4(SYS_MATRIX)
    const ease = started.current ? 1 - Math.exp(-d * 3.6) : 1 - Math.exp(-d * 2.4)
    rig.pos.lerp(tmpA, fx.frozen ? 1 : ease)
    rig.target.lerp(tmpB, fx.frozen ? 1 : Math.min(1, ease * 1.6))
    // the view opens up a little under boost
    rig.fov += (42 + 5 * ship.boost - rig.fov) * Math.min(1, d * 3)
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
          <primitive object={freighter.scene} visible={altActive} scale={FREIGHTER_SCALE} />
        </group>
      </group>
      <primitive object={trailFx.mesh} />
      <mesh ref={flashRef} material={flashMat} visible={false} renderOrder={5}>
        <planeGeometry args={[2, 2]} />
      </mesh>
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

import './draco'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ASTRO_POS, ASTRO_UP, HOME_CENTER, HOME_GLOBE_ORBIT_SCALE, HOME_R, ROCKET_POS, ROCKET_UP, STAR_POS } from './constants'
import { fx } from './rig'
import { findMaterial, makeRegolith, tuneProp } from './materials'
import { SNOISE } from './glsl'
import { qa } from '../qa/params'
import { ROCKET_YAW } from './shots'

const BASE = import.meta.env.BASE_URL
export const HOME_ASSETS = [`${BASE}models/home_terrain.glb`, `${BASE}models/home_planet.glb`, `${BASE}models/astronaut.glb`, `${BASE}models/rocket.glb`]
HOME_ASSETS.forEach((u) => useGLTF.preload(u))

const Y = new THREE.Vector3(0, 1, 0)
const TETHER_POINTS = 28
/** Horizontal direction towards the star, and the axis the lander pitches round on its way there. */
const DOWNRANGE = new THREE.Vector3(0, 0, -1)
const PITCH_AXIS = new THREE.Vector3(1, 0, 0)
/** Rope length: the distance from pad to astronaut plus a little slack. */
const GAG_ROPE = Math.hypot(ASTRO_POS.x - ROCKET_POS.x, ASTRO_POS.z - ROCKET_POS.z) + 1.5
const gagToAstro = new THREE.Vector3()
const gagAnchor = new THREE.Vector3()
const gagRest = new THREE.Vector3()
const gagAnkle = new THREE.Vector3()
const gagUp = new THREE.Vector3()
const gagTmp = new THREE.Vector3()
const gagQuat = new THREE.Quaternion()

/** Shared handle so the director and the tether gag can find the moving parts. */
export const homeRefs = {
  rocket: null as THREE.Group | null,
  astronaut: null as THREE.Object3D | null,
  bones: {} as Record<string, THREE.Object3D>,
  restPose: {} as Record<string, THREE.Euler>,
}

// ─────────────────────────────────────────────────────────── exhaust ──
const PLUME_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vPos; varying vec3 vN; varying vec3 vView;
void main(){
  vUv = uv; vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal; vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`
const PLUME_FRAG = /* glsl */ `
${SNOISE}
uniform float uTime; uniform float uPower;
varying vec2 vUv; varying vec3 vPos; varying vec3 vN; varying vec3 vView;
void main(){
  float t = 1.0 - vUv.y;                      // 0 at the nozzle, 1 at the tail
  // soft sides: brightest where we look through the middle of the flame
  float facing = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
  float n = snoise(vec3(vPos.x * 1.4, vPos.y * 0.7 + uTime * 11.0, vPos.z * 1.4)) * 0.5 + 0.5;
  float n2 = snoise(vec3(vPos.x * 3.5, vPos.y * 1.8 + uTime * 17.0, vPos.z * 3.5)) * 0.5 + 0.5;
  float body = pow(clamp(1.0 - t, 0.0, 1.0), 1.5) * (0.5 + 0.5 * n) * (0.75 + 0.25 * n2);
  float core = exp(-max(t, 0.0) * 5.0);
  // a tapering flame, not a rod: thin and translucent towards the tail
  float a = (body * 0.5 + core * 0.55) * facing * uPower;
  vec3 col = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.74, 0.4), exp(-t * 2.2));
  col = mix(col, vec3(1.0, 0.94, 0.82), core * 0.6);
  gl_FragColor = vec4(col * a * 1.25, 1.0);
}`

function Exhaust() {
  const mesh = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const geo = useMemo(() => {
    // open cone: nozzle exit at y = 0.55, narrowing to a tail
    const g = new THREE.CylinderGeometry(0.88, 0.22, 12, 32, 16, true)
    g.translate(0, 0.55 - 6, 0)
    return g
  }, [])
  useFrame(() => {
    const p = fx.engine
    mat.uniforms.uTime.value = fx.time
    mat.uniforms.uPower.value = p
    if (mesh.current) {
      mesh.current.visible = p > 0.002
      mesh.current.scale.set(0.85 + 0.2 * p, 0.3 + 0.9 * p + Math.sin(fx.time * 31) * 0.03, 0.85 + 0.2 * p)
    }
    if (light.current) light.current.intensity = p * 900
  })
  return (
    <>
      <mesh ref={mesh} geometry={geo} material={mat} visible={false} />
      <pointLight ref={light} position={[0, 0.3, 0]} color="#ffb060" intensity={0} distance={70} decay={2} />
    </>
  )
}

// ───────────────────────────────────────────────────────── dust ring ──
const DUST_PUFFS = 26
/** Ground dust kicked up at ignition: soft camera-facing puffs that roll outward from the pad and thin out. */
function DustRing() {
  const { points, mat } = useMemo(() => {
    const pos = new Float32Array(DUST_PUFFS * 3)
    const seed = new Float32Array(DUST_PUFFS * 3)
    for (let i = 0; i < DUST_PUFFS; i++) {
      const a = (i / DUST_PUFFS) * Math.PI * 2 + (i % 3) * 0.21
      pos[i * 3] = Math.cos(a)
      pos[i * 3 + 2] = Math.sin(a)
      seed[i * 3] = (i * 0.618) % 1
      seed[i * 3 + 1] = (i * 0.377) % 1
      seed[i * 3 + 2] = (i * 0.853) % 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
attribute vec3 aSeed; uniform float uAmt; uniform float uTime; uniform float uScale;
varying float vFade; varying float vSeed;
void main(){
  float reach = 2.5 + (9.0 + 9.0 * aSeed.x) * pow(uAmt, 0.6);
  vec3 p = vec3(position.x * reach, 0.5 + aSeed.y * 1.6 * uAmt + sin(uTime * 0.7 + aSeed.z * 6.28) * 0.15, position.z * reach);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (3.0 + 5.0 * aSeed.z) * (0.6 + 1.1 * uAmt);
  gl_PointSize = size * uScale / max(-mv.z, 0.1);
  vFade = smoothstep(0.0, 0.08, uAmt) * pow(1.0 - uAmt, 1.3);
  vSeed = aSeed.x;
}`,
      fragmentShader: /* glsl */ `
varying float vFade; varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = pow(smoothstep(1.0, 0.0, d), 1.8) * vFade * (0.2 + 0.14 * vSeed);
  gl_FragColor = vec4(vec3(1.0, 0.74, 0.46) * a, 1.0);
}`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const points = new THREE.Points(g, mat)
    points.frustumCulled = false
    points.visible = false
    return { points, mat }
  }, [])
  useFrame(({ size, camera }) => {
    mat.uniforms.uTime.value = fx.time
    mat.uniforms.uAmt.value = fx.dust
    // world-size sprites: pixels per metre at distance 1
    mat.uniforms.uScale.value = size.height / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360))
    points.visible = fx.dust > 0.001 && fx.dust < 0.999
  })
  return <primitive object={points} />
}

// ──────────────────────────────────────────────────────────── set ──
export function HomeSet() {
  const terrain = useGLTF(HOME_ASSETS[0])
  const globe = useGLTF(HOME_ASSETS[1])
  const astro = useGLTF(HOME_ASSETS[2])
  const rocket = useGLTF(HOME_ASSETS[3])

  const near = useRef<THREE.Group>(null)
  const globeRef = useRef<THREE.Group>(null)
  const rocketRef = useRef<THREE.Group>(null)
  const astroRef = useRef<THREE.Group>(null)
  const rimRef = useRef<THREE.Mesh>(null)
  // in the system view the little home planet keeps a soft lit rim so it never vanishes into black
  const rimMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uGain: { value: 0 }, uStar: { value: STAR_POS.clone() } },
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `uniform float uGain; uniform vec3 uStar; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N = normalize(vN);
  float f = pow(1.0 - clamp(dot(N, normalize(cameraPosition - vW)), 0.0, 1.0), 2.2);
  float lit = smoothstep(-0.3, 0.55, dot(N, normalize(uStar - vW)));
  gl_FragColor = vec4(vec3(0.95, 0.7, 0.42) * f * (0.1 + 1.25 * lit) * uGain, 1.0);
}`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const streak = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([2.6, 2.0, 1.2, 0, 0, 0]), 3))
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }))
    ;(l.material as THREE.LineBasicMaterial).toneMapped = false
    l.frustumCulled = false
    l.visible = false
    return l
  }, [])
  // once the lander is too far to resolve, its engine remains as a bright spark heading for the system
  const spark = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    glow.addColorStop(0, 'rgba(255,255,255,1)')
    glow.addColorStop(0.22, 'rgba(255,255,255,0.9)')
    glow.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 64, 64)
    const m = new THREE.PointsMaterial({ color: new THREE.Color(3.4, 2.6, 1.7), map: new THREE.CanvasTexture(c), size: 18, sizeAttenuation: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    m.toneMapped = false
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    pts.visible = false
    return pts
  }, [])
  const gagWasOn = useRef(false)
  const tether = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TETHER_POINTS * 3), 3))
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#d8d2c4' }))
    line.frustumCulled = false
    line.visible = false
    return line
  }, [])
  const parts = useRef<{ hatch?: THREE.Object3D; hatchGlow?: THREE.MeshStandardMaterial | null; engineGlow?: THREE.MeshStandardMaterial | null }>({})

  const rocketQuat = useMemo(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(Y, ROCKET_UP)
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, ROCKET_YAW))
  }, [])
  const astroQuat = useMemo(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(Y, ASTRO_UP)
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, THREE.MathUtils.degToRad(-7)))
  }, [])

  useEffect(() => {
    const ground = makeRegolith({ bump: 0.016, grain: 1.1 })
    const rock = makeRegolith({ bump: 0.02, grain: 1.3, roughness: 0.88 })
    terrain.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const isRock = m.name.startsWith('Rocks')
      if (isRock && qa.debug.has('norocks')) m.visible = false
      if (!isRock && qa.debug.has('noground')) m.visible = false
      m.material = isRock ? rock : ground
      m.castShadow = isRock ? !qa.debug.has('norockshadow') : !qa.debug.has('noterrainshadow')
      m.receiveShadow = true
    })
    const far = makeRegolith({ bump: 0, grain: 0.6 })
    globe.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.material = far
        m.receiveShadow = false
        m.castShadow = false
      }
    })
    tuneProp(astro.scene)
    tuneProp(rocket.scene)
    parts.current.hatch = rocket.scene.getObjectByName('Hatch') ?? undefined
    parts.current.hatchGlow = findMaterial(rocket.scene, 'HatchGlow')
    parts.current.engineGlow = findMaterial(rocket.scene, 'EngineGlow')
    for (const mat of [parts.current.hatchGlow, parts.current.engineGlow]) if (mat) mat.toneMapped = false
    // the export carries a zero emission strength, which glTF stores as a black emissive colour: restore the lamp colour
    parts.current.hatchGlow?.emissive.set('#ffae5c')
    // the lit panel was modelled just under the dark door frame: bring it a few centimetres proud of the frame
    rocket.scene.getObjectByName('HatchGlow')?.scale.set(1.026, 1, 1.026)
    // puppet joints
    const names = ['Hips', 'Torso', 'Head', 'ArmL', 'ForearmL', 'ArmR', 'ForearmR', 'ThighL', 'ShinL', 'ThighR', 'ShinR']
    for (const n of names) {
      const b = astro.scene.getObjectByName(n)
      if (b) {
        homeRefs.bones[n] = b
        homeRefs.restPose[n] = b.rotation.clone()
      }
    }
    homeRefs.astronaut = astro.scene
  }, [terrain, globe, astro, rocket])

  useFrame(({ camera }) => {
    const dist = camera.position.length()
    // detailed set only matters near the surface
    if (near.current) near.current.visible = dist < 9000
    if (globeRef.current) {
      const s = 1 + (HOME_GLOBE_ORBIT_SCALE - 1) * fx.system
      globeRef.current.scale.setScalar(s)
    }
    const r = rocketRef.current
    if (r) {
      homeRefs.rocket = r
      r.position.copy(ROCKET_POS).addScaledVector(ROCKET_UP, fx.lift).addScaledVector(DOWNRANGE, fx.downrange)
      r.quaternion.copy(rocketQuat)
      if (fx.pitch) r.rotateOnWorldAxis(PITCH_AXIS, -fx.pitch)
      r.visible = fx.rocketVisible > 0.5
    }
    if (r) {
      spark.position.copy(r.position)
      spark.visible = fx.rocketVisible > 0.5 && fx.engine > 0.5 && fx.lift > 300
      // exhaust trail behind the departing lander, long enough to read from far away
      streak.visible = spark.visible
      if (streak.visible) {
        const pos = streak.geometry.getAttribute('position') as THREE.BufferAttribute
        gagTmp.copy(ROCKET_UP).multiplyScalar(Math.cos(fx.pitch)).addScaledVector(DOWNRANGE, Math.sin(fx.pitch)).normalize()
        const len = 120 + fx.lift * 0.35 + fx.downrange * 0.2
        pos.setXYZ(0, r.position.x, r.position.y, r.position.z)
        pos.setXYZ(1, r.position.x - gagTmp.x * len, r.position.y - gagTmp.y * len, r.position.z - gagTmp.z * len)
        pos.needsUpdate = true
      }
    }
    if (rimRef.current) {
      rimRef.current.visible = fx.system > 0.02
      rimRef.current.scale.setScalar(1 + (HOME_GLOBE_ORBIT_SCALE - 1) * fx.system)
      rimMat.uniforms.uGain.value = 1.25 * fx.system
    }
    const p = parts.current
    if (p.hatch) p.hatch.rotation.y = fx.hatch * 0.64
    if (p.hatchGlow) p.hatchGlow.emissiveIntensity = fx.hatchGlow * 0.95
    if (p.engineGlow) p.engineGlow.emissiveIntensity = fx.engine * 16
    updateGag()
  })

  /**
   * The hidden launch: a line runs from a landing leg to the astronaut's ankle. It lies slack until the lander
   * has climbed, then drags the astronaut feet-first across the dust and up into the sky. Posed, not simulated.
   */
  function updateGag() {
    const a = astroRef.current
    if (!a) return
    const on = fx.gag >= 0
    if (!on) {
      if (gagWasOn.current) {
        // restore the calm standing figure
        gagWasOn.current = false
        tether.visible = false
        a.position.copy(ASTRO_POS)
        a.quaternion.copy(astroQuat)
        for (const n in homeRefs.bones) homeRefs.bones[n].rotation.copy(homeRefs.restPose[n])
      }
      return
    }
    gagWasOn.current = true
    const t = fx.time
    const g = fx.gag
    // rope anchor on the lander, on the side facing the astronaut
    gagToAstro.copy(ASTRO_POS).sub(ROCKET_POS).setY(0).normalize()
    gagAnchor.copy(ROCKET_POS).addScaledVector(ROCKET_UP, fx.lift + 1.1).addScaledVector(gagToAstro, 2.3)
    gagRest.copy(ASTRO_POS).y += 0.12
    const rope = GAG_ROPE
    const h = gagAnchor.y - ASTRO_POS.y
    const d = gagAnchor.distanceTo(gagRest)
    const bones = homeRefs.bones
    const rest = homeRefs.restPose
    let ankle = gagRest
    if (d <= rope) {
      // slack: the astronaut notices something is wrong
      a.position.copy(ASTRO_POS)
      a.quaternion.copy(astroQuat)
      const alarm = THREE.MathUtils.smoothstep(g, 0.05, 0.22)
      if (bones.Head) bones.Head.rotation.set(rest.Head.x - 0.1 * alarm, rest.Head.y, rest.Head.z + 0.55 * alarm)
      if (bones.ArmL) bones.ArmL.rotation.set(rest.ArmL.x + 0.9 * alarm, rest.ArmL.y - 0.5 * alarm, rest.ArmL.z)
      if (bones.ArmR) bones.ArmR.rotation.set(rest.ArmR.x + 1.1 * alarm + Math.sin(t * 14) * 0.12 * alarm, rest.ArmR.y + 0.5 * alarm, rest.ArmR.z)
    } else {
      if (h < rope) {
        // taut and still on the ground: dragged towards the pad on a circle of radius `rope` round the anchor
        const s = Math.sqrt(Math.max(rope * rope - h * h, 0))
        gagAnkle.copy(ROCKET_POS).addScaledVector(gagToAstro, s + 2.3)
        gagAnkle.y = THREE.MathUtils.lerp(ROCKET_POS.y, ASTRO_POS.y, Math.min(1, s / 32)) + 0.34 + Math.abs(Math.sin(t * 13)) * 0.16
        gagUp.copy(gagToAstro).multiplyScalar(0.95).setY(0.22 + Math.sin(t * 9) * 0.08).normalize()
      } else {
        // airborne: hangs upside down under the lander and swings
        gagAnkle.copy(gagAnchor).y -= rope
        gagAnkle.x += Math.sin(t * 2.4) * 1.4
        gagAnkle.z += Math.cos(t * 1.9) * 0.9
        gagUp.copy(gagAnkle).sub(gagAnchor).normalize()
      }
      ankle = gagAnkle
      a.position.copy(gagAnkle)
      gagQuat.setFromUnitVectors(Y, gagUp)
      a.quaternion.copy(gagQuat)
      const f = Math.sin(t * 11)
      const f2 = Math.cos(t * 8.5)
      if (bones.ArmL) bones.ArmL.rotation.set(2.6 + f * 0.45, -0.5, 0)
      if (bones.ArmR) bones.ArmR.rotation.set(2.4 - f2 * 0.5, 0.5, 0)
      if (bones.ForearmL) bones.ForearmL.rotation.set(0.5 + f2 * 0.4, 0, 0)
      if (bones.ForearmR) bones.ForearmR.rotation.set(0.6 - f * 0.4, 0, 0)
      if (bones.ThighR) bones.ThighR.rotation.set(0.9 + f * 0.5, 0.3, 0)
      if (bones.ShinR) bones.ShinR.rotation.set(-1.0 + f2 * 0.4, 0, 0)
      if (bones.Head) bones.Head.rotation.set(-0.4, f * 0.3, 0)
    }
    // the rope itself: straight when taut, sagging onto the ground when slack
    const pos = tether.geometry.getAttribute('position') as THREE.BufferAttribute
    const slack = Math.max(0, rope - d)
    for (let i = 0; i < TETHER_POINTS; i++) {
      const k = i / (TETHER_POINTS - 1)
      gagTmp.copy(gagAnchor).lerp(ankle, k)
      const sag = Math.sin(k * Math.PI) * slack * 0.9
      const floor = THREE.MathUtils.lerp(ROCKET_POS.y, ASTRO_POS.y, k) + 0.05
      gagTmp.y = Math.max(gagTmp.y - sag, Math.min(gagTmp.y, floor))
      pos.setXYZ(i, gagTmp.x, gagTmp.y, gagTmp.z)
    }
    pos.needsUpdate = true
    tether.visible = fx.rocketVisible > 0.5
  }

  return (
    <>
      <group ref={globeRef} position={HOME_CENTER}>
        <group position={[-HOME_CENTER.x, -HOME_CENTER.y, -HOME_CENTER.z]}>
          <primitive object={globe.scene} />
        </group>
      </group>
      <primitive object={spark} />
      <primitive object={streak} />
      <mesh ref={rimRef} position={HOME_CENTER} material={rimMat} visible={false}>
        <sphereGeometry args={[HOME_R * 1.03, 48, 32]} />
      </mesh>
      <group ref={near}>
        <primitive object={terrain.scene} />
        <group ref={astroRef} position={ASTRO_POS} quaternion={astroQuat}>
          <primitive object={astro.scene} />
        </group>
        <primitive object={tether} />
        <group ref={rocketRef} position={ROCKET_POS} quaternion={rocketQuat}>
          <primitive object={rocket.scene} />
          <Exhaust />
        </group>
        <group position={ROCKET_POS} quaternion={rocketQuat}>
          <DustRing />
        </group>
      </group>
    </>
  )
}

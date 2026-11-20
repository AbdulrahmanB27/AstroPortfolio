import './draco'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { fx } from './rig'
import { COCKPIT_MATRIX, COCKPIT_SCREEN } from './shots'
import { updateScreen } from '../ui/screenAnchor'
import { app, useApp } from '../state/store'

const BASE = import.meta.env.BASE_URL
const SMALL = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700
const SUFFIX = SMALL ? '_2048' : ''
const MODEL = `${BASE}models/cockpit.glb`
const TEX_SUN = `${BASE}textures/cockpit_sun${SUFFIX}.webp`
const TEX_LAMP = `${BASE}textures/cockpit_lamp${SUFFIX}.webp`
useGLTF.preload(MODEL)
useTexture.preload(TEX_SUN)
useTexture.preload(TEX_LAMP)

const BAKED_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
// Two baked light sets: the star through the window (always there) and the cabin's own lamps (power).
const BAKED_FRAG = /* glsl */ `
uniform sampler2D tSun; uniform sampler2D tLamp; uniform float uPower; uniform float uSun; uniform float uLamp;
varying vec2 vUv;
void main(){
  vec3 sun = texture2D(tSun, vUv).rgb;
  vec3 lamp = texture2D(tLamp, vUv).rgb;
  vec3 col = sun * uSun + lamp * uLamp * uPower;
  gl_FragColor = vec4(col, 1.0);
}`

const LIGHT_COLORS: Record<string, [number, number, number, number]> = {
  CeilingLight: [1.0, 0.74, 0.46, 0.58],
  AmberLight: [1.0, 0.56, 0.14, 1.6],
  WhiteLight: [0.8, 0.9, 1.0, 0.5],
}

/** On phones the main display is a narrower unit: both bezels fit the screen at reading size. */
const PORTRAIT_MONITOR = 0.56

/** Baked rocket cockpit. It sits inside the lander's capsule and replaces the exterior while the visitor is inside. */
export function CockpitSet() {
  const mode = useApp((s) => s.mode)
  const gltf = useGLTF(MODEL)
  const [sun, lamp] = useTexture([TEX_SUN, TEX_LAMP])
  const size = useThree((s) => s.size)
  const group = useRef<THREE.Group>(null)

  const parts = useMemo(() => {
    for (const t of [sun, lamp]) {
      t.flipY = false
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.needsUpdate = true
    }
    const baked = new THREE.ShaderMaterial({
      vertexShader: BAKED_VERT,
      fragmentShader: BAKED_FRAG,
      uniforms: { tSun: { value: sun }, tLamp: { value: lamp }, uPower: { value: 0 }, uSun: { value: 3.3 }, uLamp: { value: 1.5 } },
    })
    const lights: { mat: THREE.MeshBasicMaterial; base: THREE.Color; gain: number }[] = []
    let screen: THREE.Mesh | null = null
    let monitor: THREE.Mesh | null = null
    let screenMat: THREE.MeshBasicMaterial | null = null
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      if (m.name.startsWith('CockpitBaked')) m.material = baked
      else if (m.name.startsWith('Monitor')) {
        monitor = m
        m.material = baked
      }
      else if (m.name.startsWith('Screen')) {
        screen = m
        screenMat = new THREE.MeshBasicMaterial({ color: '#05070a' })
        m.material = screenMat
      } else if (m.name.startsWith('WindowGlass')) {
        m.visible = false
      } else {
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material
        const spec = LIGHT_COLORS[src.name]
        if (spec) {
          const mat = new THREE.MeshBasicMaterial({ color: 0x000000 })
          mat.toneMapped = false
          m.material = mat
          lights.push({ mat, base: new THREE.Color(spec[0], spec[1], spec[2]), gain: spec[3] })
        }
      }
    })
    return { baked, lights, screen: screen as THREE.Mesh | null, monitor: monitor as THREE.Mesh | null, screenMat: screenMat as THREE.MeshBasicMaterial | null }
  }, [gltf, sun, lamp])

  useEffect(() => {
    const g = group.current
    if (!g) return
    g.matrixAutoUpdate = false
    g.matrix.copy(COCKPIT_MATRIX)
    g.matrixWorldNeedsUpdate = true
  }, [])

  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    const st = app()
    g.visible = st.mode === 'cockpit'
    if (!g.visible) return
    const p = fx.cockpitPower
    // lamps come up with a brief flicker, the screen a beat later
    const flick = p < 0.999 ? 0.8 + 0.2 * Math.sin(fx.time * 60) * (1 - p) : 1
    parts.baked.uniforms.uPower.value = p * flick
    for (const l of parts.lights) l.mat.color.copy(l.base).multiplyScalar(l.gain * p * flick)
    if (parts.screenMat) {
      const s = Math.max(0, (p - 0.45) / 0.55)
      parts.screenMat.color.setRGB(0.0025 + 0.004 * s, 0.003 + 0.005 * s, 0.004 + 0.007 * s)
    }
    const portrait = size.width / size.height < 0.8
    const narrow = portrait ? PORTRAIT_MONITOR : 1
    if (parts.monitor) parts.monitor.scale.x = narrow
    if (parts.screen) parts.screen.scale.x = narrow
    if (parts.screen && !st.busy) {
      updateScreen('console', parts.screen, camera as THREE.PerspectiveCamera, size.width, size.height, COCKPIT_SCREEN.width / 2, COCKPIT_SCREEN.height / 2, 0.02, portrait ? 8 : 0)
    }
  })

  return (
    <group ref={group} visible={mode === 'cockpit'}>
      <primitive object={gltf.scene} />
    </group>
  )
}

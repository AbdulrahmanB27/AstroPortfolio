import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { FAR, STAR_DIR, STAR_POS, SUN_DIR, SYS_Y } from './constants'
import { fx, rig, setPose } from './rig'
import { Sky } from './Sky'
import { StarBody } from './StarBody'
import { HomeSet } from './HomeSet'
import { SystemSet } from './SystemSet'
import { CockpitSet } from './CockpitSet'
import { ProbeSet } from './ProbeSet'
import { FlightSet } from './FlightSet'
import { app, useApp } from '../state/store'
import { qa } from '../qa/params'

const tmp = new THREE.Vector3()
const up = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Applies the rig to the real camera once per frame and advances the scene clocks. */
function CameraRig() {
  const lastAspect = useRef(0)
  const veil = useRef<HTMLElement | null>(null)
  useEffect(() => {
    veil.current = document.getElementById('veil')
  }, [])
  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const d = Math.min(dt, 0.05)
    const st = app()
    if (!fx.frozen) {
      fx.time += d
      // the sky barely drifts from the surface; the system view runs at full speed
      if (!fx.orbitPaused) fx.orbitTime += d * (st.content?.site.settings.orbitSpeed ?? 1) * (0.08 + 0.92 * fx.system)
    }
    const aspect = state.size.width / state.size.height
    if (rig.resting && !st.busy && Math.abs(aspect - lastAspect.current) > 1e-4) setPose(rig.resting(aspect))
    lastAspect.current = aspect

    const s = fx.frozen || st.reducedMotion ? 0 : rig.sway
    tmp.copy(rig.pos)
    if (s > 0) {
      tmp.x += Math.sin(fx.time * 0.23) * s
      tmp.y += Math.sin(fx.time * 0.31 + 1.3) * s * 0.55
      tmp.z += Math.cos(fx.time * 0.19 + 0.4) * s * 0.4
    }
    cam.position.copy(tmp)
    // camera "up" eases from the local vertical to the orbital-plane normal in the system view
    up.copy(WORLD_UP).lerp(SYS_Y, fx.system).normalize()
    cam.up.copy(up)
    cam.lookAt(rig.target)
    if (rig.roll) cam.rotateZ(rig.roll)

    const alt = cam.position.length()
    const near = st.mode === 'cockpit' ? 0.03 : THREE.MathUtils.clamp(alt * 0.004, 0.08, 260)
    if (cam.fov !== rig.fov || cam.near !== near) {
      cam.fov = rig.fov
      cam.near = near
      cam.far = FAR
      cam.updateProjectionMatrix()
    }
    if (veil.current) veil.current.style.opacity = String(fx.blackout)
  })
  return null
}

/** Tiny procedural environment: dark space, warm glow towards the star, soft bounce from below. */
function Environment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = new THREE.Scene()
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uStar: { value: STAR_DIR.clone() } },
        vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
uniform vec3 uStar; varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  float s = max(dot(d, uStar), 0.0);
  vec3 col = vec3(0.010, 0.012, 0.018);
  col += vec3(0.085, 0.066, 0.05) * smoothstep(0.15, -0.6, d.y);          // ground bounce
  col += vec3(0.05, 0.06, 0.085) * smoothstep(-0.1, 0.9, d.y) * 0.5;       // cool sky fill
  col += vec3(1.0, 0.56, 0.22) * pow(s, 5.0) * 0.9;                         // corona wash
  col += vec3(1.0, 0.86, 0.62) * smoothstep(0.955, 0.975, s) * 26.0;        // the disc
  gl_FragColor = vec4(col, 1.0);
}`,
      }),
    )
    env.add(dome)
    const rt = pm.fromScene(env, 0.015)
    scene.environment = rt.texture
    scene.environmentIntensity = 0.5
    return () => {
      scene.environment = null
      rt.dispose()
      pm.dispose()
    }
  }, [gl, scene])
  return null
}

/**
 * Surface lighting (key with shadows, rim kickers, cool fill) hands over to a single light at the star's true
 * position in the system view, so the probe, ships and planets' props are lit from the right direction.
 */
/** Surface light intensities in JSX order: key, wrap, right kicker, left kicker, camera fill. Constants, never read back from the scene. */
const SURFACE_LIGHTS = [9.0, 0.7, 13, 4.2, 1.35]

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const surface = useRef<THREE.Group>(null)
  const starLight = useRef<THREE.PointLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  const lastLift = useRef(-1)
  useEffect(() => {
    const l = sun.current
    if (!l) return
    l.target.position.set(3, 0, -9)
    l.position.copy(l.target.position).addScaledVector(SUN_DIR, 260)
    l.target.updateMatrixWorld()
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [gl])
  useFrame(() => {
    // static world: refresh the shadow map only while something that casts is moving
    frames.current++
    const moving = Math.abs(fx.lift - lastLift.current) > 0.001 || fx.gag >= 0 || fx.hatch > 0.001
    if (frames.current < 40 || moving) gl.shadowMap.needsUpdate = true
    lastLift.current = fx.lift
    const k = 1 - fx.system
    surface.current?.children.forEach((c, i) => {
      ;(c as THREE.Light).intensity = SURFACE_LIGHTS[i] * k
    })
    if (starLight.current) starLight.current.intensity = 15 * fx.system
    if (hemi.current) hemi.current.intensity = 0.95 * k + 1.0 * fx.system
  })
  return (
    <>
      <group ref={surface}>
        <directionalLight
          ref={sun}
          color="#ffc78c"
          intensity={SURFACE_LIGHTS[0]}
          castShadow={!qa.debug.has('noshadow')}
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-46}
          shadow-camera-right={46}
          shadow-camera-top={9}
          shadow-camera-bottom={-12}
          shadow-camera-near={20}
          shadow-camera-far={520}
          shadow-bias={-0.00012}
          shadow-normalBias={0.02}
          shadow-radius={2.4}
          shadow-blurSamples={12}
        />
        {/* soft wrap from the huge stellar disc */}
        <directionalLight color="#ffb877" intensity={SURFACE_LIGHTS[1]} position={[STAR_DIR.x * 100 + 20, 46, STAR_DIR.z * 100]} />
        {/* warm kickers skim the ground: rim light on the astronaut, the lander and rock edges */}
        <directionalLight color="#ffa860" intensity={SURFACE_LIGHTS[2]} position={[150, 9, -112]} />
        <directionalLight color="#ffbe84" intensity={SURFACE_LIGHTS[3]} position={[-150, 9, -110]} />
        {/* cool fill from the camera side so back-lit forms never fall to black */}
        <directionalLight color="#a3adc6" intensity={SURFACE_LIGHTS[4]} position={[-30, 26, 90]} />
      </group>
      <pointLight ref={starLight} position={STAR_POS} color="#ffd9a8" intensity={0} decay={0} />
      <hemisphereLight ref={hemi} args={['#42557c', '#7a5230', 0.95]} />
    </>
  )
}

function PostFX() {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  // MSAA matters at 1x; at high pixel density it costs more than it shows
  // 2x is the ceiling: with dense rock scatter, 4x shades the costly ground material several times per pixel
  const samples = qa.debug.has('msaa4') ? 4 : qa.debug.has('msaa0') ? 0 : size.width < 700 || dpr >= 1.4 ? 0 : 2
  return (
    <EffectComposer multisampling={samples} frameBufferType={THREE.HalfFloatType}>
      {/* bloom is a blur: half resolution looks the same and costs a quarter */}
      <Bloom mipmapBlur resolutionScale={qa.debug.has('fullbloom') ? 1 : 0.5} intensity={qa.debug.has('nobloom') ? 0 : 0.5} luminanceThreshold={1.0} luminanceSmoothing={0.3} radius={0.72} levels={qa.debug.has('fullbloom') ? 7 : 6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.66} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.11} />
    </EffectComposer>
  )
}

/** The load screen lifts only after real frames have been drawn (shaders compiled, shadows rendered). */
function Ready() {
  const frames = useRef(0)
  const compiled = useRef(false)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    // compile every shader in the scene behind the loading screen (including planets that are not yet in
    // view), without blocking the page; otherwise the first look at each new body freezes a frame or more
    let alive = true
    const done = () => {
      if (alive) compiled.current = true
    }
    const fallback = window.setTimeout(done, 20000)
    // things that exist but are hidden right now (moons, probe, cockpit, exhaust) are compiled through stand-ins
    const warm = new THREE.Scene()
    scene.traverse((o) => {
      const r = o as THREE.Mesh
      if (!(r.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) || !r.material) return
      let hidden = false
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) hidden = true
      if (!hidden) return
      const Twin = o.constructor as new (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => THREE.Object3D
      const twin = new Twin(r.geometry, r.material)
      twin.castShadow = o.castShadow
      twin.receiveShadow = o.receiveShadow
      warm.add(twin)
    })
    // the scene is drawn into the post-processing buffer (linear colour), not straight to the screen; shaders
    // are specialised for their target, so compile against a buffer of the same kind or the work is wasted
    const like = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(like)
    const jobs = [gl.compileAsync(scene, camera), gl.compileAsync(warm, camera, scene)]
    gl.setRenderTarget(prev)
    Promise.all(jobs).then(done, done).finally(() => like.dispose())
    return () => {
      alive = false
      window.clearTimeout(fallback)
    }
  }, [gl, scene, camera])
  useFrame(() => {
    if (frames.current < 0 || !compiled.current) return
    if (++frames.current > 4) {
      frames.current = -1
      app().set({ sceneReady: true })
    }
  })
  return null
}

function Scene() {
  const mode = useApp((s) => s.mode)
  const inSystem = mode === 'orbit' || mode === 'project' || mode === 'flight' || mode === 'launch'
  return (
    <>
      <CameraRig />
      <Environment />
      <Lights />
      <Sky />
      <StarBody />
      <HomeSet />
      <SystemSet />
      <CockpitSet />
      {inSystem && <ProbeSet />}
      <FlightSet />
      <PostFX />
      <Ready />
    </>
  )
}

/** Pixel budget: sharp where the GPU can afford it, never more than ~3.2 MP, and it backs off if frames drop. */
function dprRange() {
  const w = window.innerWidth
  const h = window.innerHeight
  const budget = Math.sqrt(3.2e6 / Math.max(1, w * h))
  const max = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.6, budget))
  return { min: Math.max(0.7, max * 0.62), max }
}

/**
 * Resolution scaling. Starts sharp and steps down only when the GPU cannot keep up; a size that failed once is
 * never tried again, so it cannot oscillate. The target is the device's own pace: the shortest frame interval it
 * has shown is its real refresh (60 Hz, or less when a battery saver paces the browser), so a paced browser is
 * not mistaken for a struggling GPU, and a view locked at half the refresh rate is not mistaken for a paced one.
 */
function AdaptiveDpr({ range, dpr, setDpr }: { range: { min: number; max: number }; dpr: number; setDpr: (v: number) => void }) {
  const st = useRef({ settle: 0, last: 0, dts: [] as number[], fastest: 1000, low: 0, high: 0, ceiling: range.max })
  useFrame(() => {
    const now = performance.now()
    const s = st.current
    if (!app().sceneReady) return void (s.settle = 0)
    if (!s.settle) {
      s.settle = now + 2500
      s.last = now
      return
    }
    const dt = now - s.last
    s.last = now
    if (dt > 250) return void (s.dts.length = 0) // tab was hidden or a one-off stall: start the window again
    if (dt > 4) s.dts.push(dt)
    if (s.dts.length < 100) return
    const sorted = s.dts.slice().sort((a, b) => a - b)
    const mean = s.dts.reduce((a, b) => a + b, 0) / s.dts.length
    s.dts.length = 0
    s.fastest = Math.min(s.fastest, sorted[10])
    // nothing is acted on in the first seconds after the loader lifts
    if (now < s.settle) return
    const fps = 1000 / mean
    const target = Math.min(60, 1000 / s.fastest)
    if (fps < target * 0.92) {
      // missed refreshes are visible stutter: better one notch softer
      s.high = 0
      if (++s.low >= 2 && dpr > range.min + 1e-3) {
        s.low = 0
        s.ceiling = Math.min(s.ceiling, dpr - 0.1)
        setDpr(Math.max(range.min, Math.round((dpr - 0.1) * 20) / 20))
      }
    } else if (fps > target * 0.975) {
      s.low = 0
      if (++s.high >= 3 && dpr < s.ceiling - 1e-3) {
        s.high = 0
        setDpr(Math.min(s.ceiling, Math.round((dpr + 0.1) * 20) / 20))
      }
    } else {
      s.low = 0
      s.high = 0
    }
  })
  return null
}

export function World() {
  const range = useMemo(dprRange, [])
  const [dpr, setDpr] = useState(range.max)
  return (
    <Canvas
      className="world"
      flat
      shadows={{ type: qa.debug.has('pcf') ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap }}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: qa.view !== null }}
      camera={{ fov: 40, near: 0.1, far: FAR, position: [0, 2, 10] }}
    >
      <color attach="background" args={['#030407']} />
      {qa.t === null && <AdaptiveDpr range={range} dpr={dpr} setDpr={setDpr} />}
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}

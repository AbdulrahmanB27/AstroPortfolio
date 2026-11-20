import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { HOME_CENTER, HOME_GLOBE_ORBIT_SCALE, HOME_R, PLANET_HOME_SCALE, STAR_DIST, STAR_R, STAR_SYSTEM_SCALE, SYS_MATRIX } from './constants'
import { bodyPosition, layoutSystem, systemRefs, type Body } from './orbits'
import { makePlanetMaterial, makeRingMaterial } from './planetMaterial'
import { fx, rig, setPose } from './rig'
import { app, useApp } from '../state/store'
import { qa } from '../qa/params'
import { director, ORBIT_AZ } from '../state/director'
import { pixelRadius, updateLabels } from '../ui/labels'
import type { PlanetSpec } from '../content/schema'

const SPHERE = new THREE.SphereGeometry(1, 72, 48)
const SPHERE_LO = new THREE.SphereGeometry(1, 24, 16)
const RING = new THREE.RingGeometry(1.35, 2.25, 128, 1)
const HALO = new THREE.RingGeometry(1.0, 1.035, 96, 1)
const HALO_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.6), transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
HALO_MAT.toneMapped = false
const haloQ = new THREE.Quaternion()
const haloQ2 = new THREE.Quaternion()
const tmp = new THREE.Vector3()
const MIN_HIT_PX = 26

const interactive = () => {
  const s = app()
  return s.mode === 'orbit' && !s.busy
}
const setCursor = (on: boolean) => {
  document.body.style.cursor = on ? 'pointer' : ''
}

function circle(radius: number, segments = 256) {
  const pts = new Float32Array((segments + 1) * 3)
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts[i * 3] = Math.cos(a) * radius
    pts[i * 3 + 2] = Math.sin(a) * radius
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3))
  return g
}

/** Hair-thin orbit lines. Brighter in the system view, barely there from the surface. */
function OrbitLines({ lanes }: { lanes: number[] }) {
  // each lane has its own material so far tracks can sit further back than near ones
  const mats = useMemo(() => lanes.map(() => new THREE.LineBasicMaterial({ color: '#d9c7a8', transparent: true, opacity: 0.1, depthWrite: false })), [lanes])
  const homeMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#f2b45a', transparent: true, opacity: 0.1, depthWrite: false }), [])
  const lines = useMemo(() => lanes.map((r, i) => new THREE.Line(circle(r), mats[i])), [lanes, mats])
  const home = useMemo(() => new THREE.Line(circle(STAR_DIST), homeMat), [homeMat])
  useFrame(() => {
    const k = fx.system
    // in flight the map graphics step back: the ship and the planets carry the view
    const calm = app().mode === 'flight' ? 0.45 : 1
    const n = Math.max(1, lanes.length - 1)
    mats.forEach((m, i) => {
      const depth = 1 - 0.5 * (i / n)
      m.opacity = (0.06 + 0.125 * k * depth) * (1 - fx.focusDim) * calm
    })
    homeMat.opacity = 0.2 * k * (1 - fx.focusDim) * calm
  })
  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      <primitive object={home} />
    </>
  )
}

/** Starlit dust in the orbital plane: a faint warm pool around the star that gives the plane some body. */
function DustDisc({ outer }: { outer: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uGain: { value: 0 }, uOuter: { value: outer * 1.2 } },
        vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform float uGain; uniform float uOuter; varying vec3 vP;
void main(){
  float r = length(vP.xy) / uOuter;   // ring geometry lies in its local XY plane
  float glow = exp(-r * 3.6) * 0.9 + 0.07 * (1.0 - smoothstep(0.45, 0.95, r));
  float lanes = 0.86 + 0.14 * sin(r * 58.0);
  float edge = 1.0 - smoothstep(0.82, 1.0, r);
  gl_FragColor = vec4(vec3(1.0, 0.6, 0.28) * glow * lanes * edge * uGain, 1.0);
}`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [outer],
  )
  const mesh = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const gain = 0.055 * fx.system * (1 - 0.75 * fx.focusDim) * (app().mode === 'flight' ? 0.5 : 1)
    mat.uniforms.uGain.value = gain
    // from the surface the plane would cover half the sky for nothing: do not draw it at all there
    if (mesh.current) mesh.current.visible = gain > 0.0005 && !qa.debug.has('nodisc')
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={-3} visible={false}>
      <ringGeometry args={[STAR_R * STAR_SYSTEM_SCALE * 0.9, outer * 1.2, 96, 1]} />
    </mesh>
  )
}

/** Optional schematic radial grid on the orbital plane (toggled in /admin or with Shift+G). */
function RadialGrid({ outer, density, opacity }: { outer: number; density: number; opacity: number }) {
  const obj = useMemo(() => {
    const pts: number[] = []
    const R = outer * 1.18
    const rings = density
    for (let i = 1; i <= rings; i++) {
      const r = (R * i) / rings
      const seg = 160
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2
        const a1 = ((s + 1) / seg) * Math.PI * 2
        pts.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r)
      }
    }
    const spokes = density * 2
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2
      pts.push(Math.cos(a) * STAR_R * 1.6, 0, Math.sin(a) * STAR_R * 1.6, Math.cos(a) * R, 0, Math.sin(a) * R)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const m = new THREE.LineBasicMaterial({ color: '#8fb4d9', transparent: true, opacity, depthWrite: false })
    return new THREE.LineSegments(g, m)
  }, [outer, density, opacity])
  useFrame(() => {
    const m = obj.material as THREE.LineBasicMaterial
    m.opacity = opacity * (0.25 + 0.75 * fx.system) * (1 - fx.focusDim)
  })
  useEffect(() => () => obj.geometry.dispose(), [obj])
  return <primitive object={obj} />
}

function Moon({ spec, index, radius }: { spec: PlanetSpec; index: number; radius: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => makePlanetMaterial({ ...spec, type: 'moon', palette: [], seed: spec.seed + 17 * (index + 1) }), [spec, index])
  const dist = 1.75 + index * 0.55
  const size = 0.16 - index * 0.03
  useFrame(() => {
    const a = fx.time * (0.16 - index * 0.035) + index * 2.1 + spec.seed
    if (ref.current) {
      ref.current.position.set(Math.cos(a) * dist, Math.sin(a * 0.7 + index) * 0.22, Math.sin(a) * dist)
      mat.uniforms.uTime.value = fx.time
      mat.uniforms.uBump.value = radius * size
    }
  })
  return <mesh ref={ref} geometry={SPHERE_LO} material={mat} scale={size} />
}

function Planet({ body }: { body: Body }) {
  const group = useRef<THREE.Group>(null)
  const proxy = useRef<THREE.Mesh>(null)
  const id = body.project.id
  const spec = body.project.planet
  const mat = useMemo(() => makePlanetMaterial(spec), [spec])
  const ringMat = useMemo(() => (spec.ring ? makeRingMaterial(spec) : null), [spec])
  const world = useMemo(() => ({ pos: new THREE.Vector3(), radius: body.radius, ring: body.project.planet.ring }), [body])
  const halo = useRef<THREE.Mesh>(null)
  const tilt = useMemo(() => 0.18 + ((spec.seed % 13) / 13) * 0.3, [spec.seed])
  const size = useThree((s) => s.size)

  useEffect(() => {
    systemRefs.world.set(id, world)
    return () => {
      systemRefs.world.delete(id)
    }
  }, [id, world])

  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    const st = app()
    const portrait = size.width / size.height < 0.8
    const s = THREE.MathUtils.lerp(PLANET_HOME_SCALE, portrait ? 1.85 : 1, fx.system)
    const r = body.radius * s
    bodyPosition(body, fx.orbitTime, g.position)
    g.scale.setScalar(r)
    g.getWorldPosition(world.pos)
    world.radius = r
    const focused = st.projectId === id
    const dim = focused ? 1 : 1 - 0.94 * fx.focusDim
    mat.uniforms.uTime.value = fx.time
    mat.uniforms.uDim.value = dim
    mat.uniforms.uBump.value = r * 1.25
    if (ringMat) {
      ringMat.uniforms.uCenter.value.copy(world.pos)
      ringMat.uniforms.uRadius.value = r
      ringMat.uniforms.uDim.value = dim
    }
    if (halo.current) {
      // unmistakable selection: a thin ring that faces the camera while this planet is hovered or picked from the list
      const on = st.hoverId === id && st.mode === 'orbit'
      halo.current.visible = on
      if (on) {
        halo.current.quaternion.copy(camera.quaternion)
        if (g.parent) halo.current.quaternion.premultiply(haloQ.copy(g.parent.getWorldQuaternion(haloQ2)).invert())
        halo.current.scale.setScalar((spec.ring ? 2.45 : 1.38) + Math.sin(fx.time * 4) * 0.03)
      }
    }
    if (proxy.current) {
      const px = pixelRadius(camera as THREE.PerspectiveCamera, world.pos, r, size.height)
      proxy.current.scale.setScalar(Math.max(1.12, MIN_HIT_PX / Math.max(px, 0.001)))
    }
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive()) return
    e.stopPropagation()
    app().set({ hoverId: id })
    setCursor(true)
  }
  const out = () => {
    if (app().hoverId === id) app().set({ hoverId: null })
    setCursor(false)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive() || e.delta > 6) return
    e.stopPropagation()
    setCursor(false)
    director.focusProject(id)
  }

  return (
    <group ref={group}>
      <mesh geometry={SPHERE} material={mat} rotation={[tilt * 0.6, 0, tilt * 0.4]} />
      {ringMat && <mesh geometry={RING} material={ringMat} rotation={[-Math.PI / 2 + tilt, 0, 0.12]} renderOrder={2} />}
      {Array.from({ length: spec.moons }, (_, i) => (
        <Moon key={i} spec={spec} index={i} radius={body.radius} />
      ))}
      <mesh ref={halo} geometry={HALO} material={HALO_MAT} visible={false} renderOrder={4} />
      <mesh ref={proxy} geometry={SPHERE_LO} onPointerOver={over} onPointerOut={out} onClick={click}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/** Clickable stand-ins for the star and the home planet: both take the visitor back to the surface. */
function HomeTargets() {
  const home = useRef<THREE.Mesh>(null)
  const size = useThree((s) => s.size)
  const world = useMemo(() => ({ pos: HOME_CENTER.clone(), radius: HOME_R }), [])
  useEffect(() => {
    systemRefs.world.set('__home', world)
    return () => {
      systemRefs.world.delete('__home')
    }
  }, [world])
  useFrame(({ camera }) => {
    world.radius = HOME_R * (1 + (HOME_GLOBE_ORBIT_SCALE - 1) * fx.system)
    if (home.current) {
      const px = pixelRadius(camera as THREE.PerspectiveCamera, HOME_CENTER, world.radius, size.height)
      home.current.scale.setScalar(world.radius * Math.max(1.15, MIN_HIT_PX / Math.max(px, 0.001)))
    }
  })
  const over = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive()) return
    e.stopPropagation()
    app().set({ hoverId: id })
    setCursor(true)
  }
  const out = () => {
    app().set({ hoverId: null })
    setCursor(false)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive() || e.delta > 6) return
    e.stopPropagation()
    setCursor(false)
    director.returnHome()
  }
  return (
    <>
      <mesh ref={home} position={HOME_CENTER} geometry={SPHERE_LO} onPointerOver={over('__home')} onPointerOut={out} onClick={click}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <mesh position={tmp.set(0, 0, 0).applyMatrix4(SYS_MATRIX).clone()} geometry={SPHERE_LO} scale={STAR_R * STAR_SYSTEM_SCALE * 1.1} onPointerOver={over('__star')} onPointerOut={out} onClick={click}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </>
  )
}

/** Light orbit control for the overview: drag turns the system, wheel or pinch zooms. Eased, clamped, never free-fly. */
const orbitInput = { az: ORBIT_AZ, el: 0, zoom: 1, dragging: false }
export const wasDragged = () => orbitInput.dragging

function useOrbitInput() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let start = { x: 0, y: 0, az: 0, el: 0, pinch: 0, zoom: 1 }
    const active = () => {
      const st = app()
      return st.mode === 'orbit' && !st.busy
    }
    const pinchDist = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const down = (e: PointerEvent) => {
      if (!active()) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      orbitInput.dragging = false
      start = { x: e.clientX, y: e.clientY, az: orbitInput.az, el: orbitInput.el, pinch: pointers.size === 2 ? pinchDist() : 0, zoom: orbitInput.zoom }
    }
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !active()) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2 && start.pinch > 0) {
        orbitInput.dragging = true
        orbitInput.zoom = THREE.MathUtils.clamp((start.zoom * start.pinch) / Math.max(20, pinchDist()), 0.5, 1.35)
        return
      }
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!orbitInput.dragging && Math.hypot(dx, dy) < 6) return
      orbitInput.dragging = true
      orbitInput.az = start.az - dx * 0.22
      orbitInput.el = THREE.MathUtils.clamp(start.el + dy * 0.1, -16, 24)
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      // let the click that ends a drag be ignored, then clear
      window.setTimeout(() => (orbitInput.dragging = false), 0)
    }
    const wheel = (e: WheelEvent) => {
      if (!active()) return
      e.preventDefault()
      orbitInput.zoom = THREE.MathUtils.clamp(orbitInput.zoom * Math.exp(e.deltaY * 0.0011), 0.5, 1.35)
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])
}

export function SystemSet() {
  const content = useApp((s) => s.content)
  const gridOn = useApp((s) => s.gridOn)
  const layout = useMemo(() => (content ? layoutSystem(content.projects) : null), [content])
  const size = useThree((s) => s.size)
  useOrbitInput()

  useEffect(() => {
    systemRefs.layout = layout
  }, [layout])

  useFrame(({ camera }, dt) => {
    const st = app()
    fx.orbitPaused = st.hoverId !== null || st.mode === 'project' || st.mode === 'cockpit'
    if (st.mode === 'orbit' && !st.busy && rig.resting) {
      const k = fx.frozen ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * 7)
      rig.orbitAz += (orbitInput.az - rig.orbitAz) * k
      rig.orbitEl += (orbitInput.el - rig.orbitEl) * k
      rig.orbitZoom += (orbitInput.zoom - rig.orbitZoom) * k
      setPose(rig.resting(size.width / size.height))
    } else if (st.mode !== 'orbit') {
      // every arrival starts from the composed overview
      orbitInput.az = ORBIT_AZ
      orbitInput.el = 0
      orbitInput.zoom = 1
    }
    updateLabels(camera as THREE.PerspectiveCamera, size.width, size.height, {
      show: (st.mode === 'orbit' && !st.busy) || st.mode === 'flight',
      hoverId: st.hoverId,
      focusId: st.mode === 'project' ? st.projectId : null,
      shipClear: st.mode === 'flight',
    })
  })

  if (!layout || !content) return null
  const grid = content.site.settings.grid
  return (
    <>
      <group matrix={SYS_MATRIX} matrixAutoUpdate={false}>
        <OrbitLines lanes={layout.lanes} />
        <DustDisc outer={layout.outer} />
        {gridOn && <RadialGrid outer={layout.outer} density={grid.density} opacity={grid.opacity} />}
        {layout.bodies.map((b) => (
          <Planet key={b.project.id} body={b} />
        ))}
      </group>
      <HomeTargets />
    </>
  )
}

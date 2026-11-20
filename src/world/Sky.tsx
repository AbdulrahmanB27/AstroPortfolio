import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { fx } from './rig'
import { SNOISE } from './glsl'
import { qa } from '../qa/params'

/**
 * Background: sparse starfield, the hidden "A B" constellation and a very faint dust band.
 * Everything is drawn as pure directions at the far plane, so it never parallaxes.
 */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rad = (d: number) => (d * Math.PI) / 180
/** Sky direction from azimuth (deg, + = right of the star) and elevation (deg) as seen from the landing site. */
const skyDir = (az: number, el: number) =>
  new THREE.Vector3(Math.sin(rad(az)) * Math.cos(rad(el)), Math.sin(rad(el)), -Math.cos(rad(az)) * Math.cos(rad(el)))

// Letter strokes as star positions on a 0..1 grid (x right, y up).
const LETTER_A: [number, number, number][] = [
  [0.0, 0.0, 0.8], [0.22, 0.48, 0.55], [0.5, 1.0, 1.0], [0.78, 0.48, 0.6], [1.0, 0.0, 0.85], [0.5, 0.46, 0.45],
]
const LETTER_B: [number, number, number][] = [
  [0.0, 0.0, 0.9], [0.0, 0.5, 0.6], [0.0, 1.0, 0.95], [0.62, 0.92, 0.5], [0.78, 0.72, 0.7], [0.56, 0.5, 0.45],
  [0.86, 0.28, 0.75], [0.66, 0.04, 0.55],
]

function buildStars(seed: number) {
  const rnd = mulberry(seed * 7919 + 13)
  const pos: number[] = []
  const col: number[] = []
  const size: number[] = []
  const phase: number[] = []
  const push = (d: THREE.Vector3, brightness: number, s: number, tint: number) => {
    pos.push(d.x, d.y, d.z)
    // tint: 0 warm .. 1 cool
    const warm = new THREE.Color(1.0, 0.86, 0.68)
    const cool = new THREE.Color(0.78, 0.86, 1.0)
    const c = warm.lerp(cool, tint).multiplyScalar(brightness)
    col.push(c.r, c.g, c.b)
    size.push(s)
    phase.push(rnd() * 6.28)
  }
  for (let i = 0; i < 1900; i++) {
    const z = rnd() * 2 - 1
    const a = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    const m = rnd()
    const bright = 0.3 + 1.5 * Math.pow(m, 4.5)
    push(new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a)), bright, 1.7 + 2.8 * Math.pow(m, 5), rnd())
  }
  // The signature: "A B" high in the home sky, right of the star. Jittered so it reads as stars first.
  const AZ0 = 8.6
  const EL0 = 16.2
  const W = 2.0
  const H = 2.9
  const GAP = 1.25
  const place = (pts: [number, number, number][], offset: number) => {
    for (const [x, y, b] of pts) {
      const jx = (rnd() - 0.5) * 0.16
      const jy = (rnd() - 0.5) * 0.12
      push(skyDir(AZ0 + offset + (x + jx) * W, EL0 + (y + jy) * H), 0.5 + b * 0.5, 2.1 + b * 1.3, 0.25 + rnd() * 0.5)
    }
  }
  place(LETTER_A, 0)
  place(LETTER_B, W + GAP)
  // a few decoys around it
  for (let i = 0; i < 7; i++) push(skyDir(AZ0 - 2 + rnd() * 10, EL0 - 1.4 + rnd() * 6), 0.3 + rnd() * 0.35, 1.8 + rnd(), rnd())
  return { pos: new Float32Array(pos), col: new Float32Array(col), size: new Float32Array(size), phase: new Float32Array(phase) }
}

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aPhase;
uniform float uPixelRatio; uniform float uTime;
varying vec3 vColor;
void main(){
  vColor = aColor * (0.88 + 0.12 * sin(uTime * 0.6 + aPhase));
  vec4 mv = viewMatrix * vec4(position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
  gl_Position.z = gl_Position.w * 0.999995;
  gl_PointSize = aSize * uPixelRatio;
}`
const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(smoothstep(1.0, 0.0, d), 1.8);
  gl_FragColor = vec4(vColor * a, 1.0);
}`

const DUST_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 mv = viewMatrix * vec4(position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
  gl_Position.z = gl_Position.w * 0.999999;
}`
const DUST_FRAG = /* glsl */ `
${SNOISE}
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  // a tilted band of faint warm-grey dust
  float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.9, 0.25))) * 2.6, 2.0));
  float n = fbm3(d * 2.1 + 4.0) * 0.5 + 0.5;
  float n2 = fbm3(d * 5.3 - 2.0) * 0.5 + 0.5;
  float a = band * smoothstep(0.35, 0.95, n) * (0.55 + 0.45 * n2);
  vec3 col = mix(vec3(0.20, 0.15, 0.11), vec3(0.11, 0.13, 0.19), n2);
  gl_FragColor = vec4(col * a * 0.3, 1.0);
}`

export function Sky() {
  const dpr = useThree((s) => s.viewport.dpr)
  const { points, dust, starMat } = useMemo(() => {
    const s = buildStars(qa.seed)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(s.pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(s.col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(s.size, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(s.phase, 1))
    const starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uPixelRatio: { value: 1 }, uTime: { value: 0 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
    const points = new THREE.Points(g, starMat)
    points.frustumCulled = false
    points.renderOrder = -10
    const dust = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 3),
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    )
    dust.frustumCulled = false
    dust.renderOrder = -11
    return { points, dust, starMat }
  }, [])

  useFrame(() => {
    starMat.uniforms.uTime.value = fx.time
    starMat.uniforms.uPixelRatio.value = dpr
  })

  return (
    <>
      <primitive object={dust} />
      <primitive object={points} />
    </>
  )
}

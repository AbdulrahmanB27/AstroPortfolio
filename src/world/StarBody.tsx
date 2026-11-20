import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { STAR_POS, STAR_R, STAR_SYSTEM_SCALE } from './constants'
import { fx } from './rig'
import { SNOISE } from './glsl'
import { qa } from '../qa/params'
import { app } from '../state/store'

/** The star: HDR granulated photosphere plus a soft layered corona that feeds the bloom. */
const SURF_VERT = /* glsl */ `
varying vec3 vDir; varying vec3 vWorld; varying vec3 vN;
void main(){
  vDir = normalize(position);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const SURF_FRAG = /* glsl */ `
${SNOISE}
uniform float uTime; uniform float uGain;
varying vec3 vDir; varying vec3 vWorld; varying vec3 vN;
void main(){
  float t = uTime * 0.022;
  vec3 p = vDir * 2.6;
  // slow convective flow: warp the domain, then read cells at two scales
  float wa = snoise(p * 1.1 + vec3(0.0, t, 0.0));
  float wb = snoise(p * 1.1 + vec3(5.2, -t, 1.3));
  vec3 w = p + 0.3 * vec3(wa, wb, -0.7 * wa - 0.7 * wb);
  vec3 bq = w * 1.25 + vec3(0.0, 0.0, t * 0.8);
  float big = snoise(bq) * 0.62 + snoise(bq * 2.1 + 3.7) * 0.38;
  // very large regions: whole provinces of the surface run hotter or cooler
  float huge = snoise(vDir * 1.25 + vec3(3.0, t * 0.35, 7.0));
  // granulation at three sizes; the finest fades out when a cell is smaller than a pixel
  float fine = smoothstep(0.012, 0.003, length(fwidth(vDir)));
  float cellA = clamp(1.0 - abs(snoise(w * 6.5 + vec3(t * 1.6, 0.0, 0.0))), 0.0, 1.0);
  float cellB = clamp(1.0 - abs(snoise(w * 15.0 - vec3(0.0, t * 2.4, 0.0))), 0.0, 1.0);
  float cellC = clamp(1.0 - abs(snoise(w * 36.0 + vec3(t * 3.0, 4.0, 0.0))), 0.0, 1.0);
  // cellX peaks along thin lines: used as dark lanes between bright granules
  float gran = 1.0 - (pow(cellA, 5.0) * 0.55 + pow(cellB, 5.0) * 0.4 + pow(cellC, 4.0) * 0.28 * fine);
  // a few dark spots with brighter rims
  float sn = snoise(vDir * 2.3 + vec3(11.0, 4.0, t * 0.2));
  float spot = smoothstep(0.58, 0.8, sn);
  float heat = 0.3 + 0.3 * big + 0.2 * huge + 0.32 * gran - 0.5 * spot + 0.14 * smoothstep(0.42, 0.58, sn) * (1.0 - spot);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(normalize(vN), V), 0.0, 1.0);
  float limb = 0.26 + 0.74 * pow(mu, 0.7);
  vec3 deep = vec3(0.78, 0.2, 0.02);
  vec3 mid  = vec3(1.00, 0.6, 0.15);
  vec3 hot  = vec3(1.00, 0.93, 0.74);
  vec3 col = mix(deep, mid, smoothstep(0.16, 0.62, heat));
  col = mix(col, hot, smoothstep(0.62, 1.16, heat));
  col *= 0.58 + 0.86 * smoothstep(0.25, 1.1, heat);
  col *= mix(vec3(1.0, 0.56, 0.28), vec3(1.0), pow(mu, 0.55));
  col *= limb * uGain;
  // the very edge dissolves into the corona instead of ending in a hard circle
  // a thin bright chromosphere right at the edge, instead of a hard circle
  col = mix(vec3(1.0, 0.76, 0.42) * 1.45, col, smoothstep(0.0, 0.13, mu));
  gl_FragColor = vec4(col, 1.0);
}`

const BILL_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const CORONA_FRAG = /* glsl */ `
${SNOISE}
uniform float uTime; uniform float uExtent; uniform float uGain;
varying vec2 vUv;
void main(){
  float r = length(vUv) * uExtent;           // in star radii
  if (r > uExtent) discard;
  float a = atan(vUv.y, vUv.x);
  vec3 q = vec3(cos(a) * 2.2, sin(a) * 2.2, uTime * 0.035);
  float rays = clamp(0.5 + 0.5 * snoise(q + vec3(0.0, 0.0, r * 0.35)), 0.0, 1.0);
  float reach = 0.54 + 0.85 * pow(rays, 1.5);
  // a handful of longer streamers
  float spike = pow(max(snoise(vec3(cos(a) * 4.3, sin(a) * 4.3, uTime * 0.02 + 5.0)), 0.0), 3.0);
  float x = max(r - 0.985, 0.0);
  float inner = exp(-x * 12.5 / reach) + spike * exp(-x * 3.6) * 0.24;
  float outer = exp(-x * 2.8 / reach) * 0.16;
  float haze = exp(-x * 0.9) * 0.028;
  float edge = smoothstep(uExtent, uExtent * 0.72, r);
  vec3 col = vec3(1.0, 0.74, 0.38) * inner * 1.15 + vec3(1.0, 0.5, 0.16) * outer + vec3(0.9, 0.38, 0.1) * haze;
  gl_FragColor = vec4(col * edge * uGain, 1.0);
}`

export function StarBody() {
  const corona = useRef<THREE.Mesh>(null)
  const root = useRef<THREE.Group>(null)
  const { surfMat, coronaMat } = useMemo(() => {
    const surfMat = new THREE.ShaderMaterial({
      vertexShader: SURF_VERT,
      fragmentShader: SURF_FRAG,
      uniforms: { uTime: { value: 0 }, uGain: { value: 1.18 } },
    })
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: BILL_VERT,
      fragmentShader: CORONA_FRAG,
      uniforms: { uTime: { value: 0 }, uExtent: { value: 5.2 }, uGain: { value: 1.0 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    return { surfMat, coronaMat }
  }, [])

  useFrame(({ camera }) => {
    surfMat.uniforms.uTime.value = fx.time
    coronaMat.uniforms.uTime.value = fx.time
    // inside the cockpit the window only shows the zone right at the limb: keep space dark there
    coronaMat.uniforms.uGain.value = app().mode === 'cockpit' ? 0.16 : 1
    if (corona.current) corona.current.quaternion.copy(camera.quaternion)
    if (root.current) root.current.scale.setScalar(1 + (STAR_SYSTEM_SCALE - 1) * fx.system)
  })

  const extent = 5.2
  return (
    <group ref={root} position={STAR_POS}>
      <mesh material={surfMat} renderOrder={-5} visible={!qa.debug.has('nostar')}>
        <sphereGeometry args={[STAR_R, 96, 64]} />
      </mesh>
      <mesh ref={corona} material={coronaMat} renderOrder={-4} visible={!qa.debug.has('nocorona')}>
        <planeGeometry args={[STAR_R * 2 * extent, STAR_R * 2 * extent]} />
      </mesh>
    </group>
  )
}

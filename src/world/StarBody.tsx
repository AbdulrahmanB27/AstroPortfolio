import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { STAR_POS, STAR_R, STAR_SYSTEM_SCALE } from './constants'
import { fx } from './rig'
import { starNoise } from './starNoise'
import { qa } from '../qa/params'
import { app } from '../state/store'

/**
 * The star. A luminous sphere: white-hot towards the centre of the disc, falling to deep orange at the
 * limb, with fine convection cells, a brighter network between the large cells, a few small sunspot
 * groups, and a corona with streamers and prominences that feeds the bloom.
 */
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
uniform sampler2D tNoise; uniform float uTime; uniform float uGain;
varying vec3 vDir; varying vec3 vWorld; varying vec3 vN;

// the noise texture projected along the three axes and blended, so there is no seam and no pinched pole
vec3 tri(vec3 p, vec3 w, float s, vec2 o){
  return texture2D(tNoise, p.yz * s + o).rgb * w.x
       + texture2D(tNoise, p.zx * s + o.yx + 0.37).rgb * w.y
       + texture2D(tNoise, p.xy * s - o + 0.71).rgb * w.z;
}
// one sunspot group: x = umbra, y = penumbra, z = bright surroundings
vec3 spot(vec3 d, vec3 c, float size, float wobble){
  float q = length(d - c) / size * wobble;
  return vec3(smoothstep(0.6, 0.36, q), smoothstep(1.0, 0.8, q), smoothstep(3.2, 1.0, q));
}

void main(){
  // the whole star turns slowly
  float rot = uTime * 0.0011;
  float cr = cos(rot), sr = sin(rot);
  vec3 d0 = normalize(vDir);
  vec3 d = vec3(cr * d0.x + sr * d0.z, d0.y, -sr * d0.x + cr * d0.z);
  vec3 w = pow(abs(d), vec3(5.0));
  w /= (w.x + w.y + w.z);

  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(normalize(vN), V), 0.0, 1.0);

  // convection: two cell patterns that slowly hand over to each other, so the surface seethes
  float t = uTime;
  vec3 C = tri(d, w, 0.62, vec2(t * 0.0005, -t * 0.0004));
  float mott = C.g;                       // broad hotter and cooler provinces
  // the cell patterns are pushed around by the broad pattern, so no two regions tile alike
  vec3 dw = d + (C.g - 0.5) * 0.11;
  vec3 A = tri(dw, w, 2.5, vec2(t * 0.0016, t * 0.0009));
  vec3 B = tri(dw, w, 2.95, vec2(-t * 0.0012, t * 0.0014) + 0.5);
  float turn = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(t * 0.13));
  float gran = mix(A.r, B.r, turn);
  // bright network: only the strongest stretches of the borders between the large cells light up
  // thin bright seams where large cells meet, showing only in the hotter provinces
  float net = smoothstep(0.9, 1.0, 1.0 - C.b) * smoothstep(0.4, 0.7, mott);

  // surface detail flattens towards the limb, where the view grazes it
  float vis = smoothstep(0.04, 0.5, mu);

  // limb darkening: the disc reads as a glowing ball rather than a flat circle
  float ld = pow(mu, 0.6);
  // Colours keep their blue low even at the hottest, so the tone curve leaves them golden rather than white.
  vec3 deep = vec3(0.6, 0.09, 0.01);
  vec3 mid = vec3(1.0, 0.4, 0.045);
  vec3 hot = vec3(1.0, 0.7, 0.17);
  vec3 col = mix(deep * 0.75, mid, smoothstep(0.0, 0.58, ld));
  col = mix(col, hot * 1.32, smoothstep(0.4, 1.0, ld) * 0.95);
  // hotter provinces run brighter and yellower, cooler ones dimmer and redder
  float prov = smoothstep(0.25, 0.75, mott);
  col *= mix(vec3(0.66, 0.56, 0.5), vec3(1.2, 1.24, 1.5), prov);

  // soft bright cells with darker, redder lanes between them
  float cellTone = mix(1.0, 0.79 + 0.26 * gran, 0.2 + 0.8 * vis);
  col *= cellTone * mix(vec3(0.95, 0.82, 0.7), vec3(1.0), gran);
  col += vec3(1.0, 0.78, 0.3) * net * 0.3 * vis;

  // sunspot groups: small, few, each with a ragged outline
  float wob = 0.75 + 0.5 * A.g;
  vec3 s = spot(d, normalize(vec3(0.34, 0.5, 0.8)), 0.05, wob)
         + spot(d, normalize(vec3(0.43, 0.46, 0.77)), 0.03, wob)
         + spot(d, normalize(vec3(-0.5, 0.3, 0.81)), 0.042, wob)
         + spot(d, normalize(vec3(-0.2, -0.35, -0.9)), 0.055, wob)
         + spot(d, normalize(vec3(0.75, 0.1, -0.6)), 0.04, wob)
         + spot(d, normalize(vec3(-0.85, 0.42, -0.2)), 0.045, wob);
  s = clamp(s, 0.0, 1.0);
  col += hot * 0.34 * (s.z - s.y) * (0.35 + 0.65 * gran) * vis;     // bright surroundings
  col *= mix(1.0, 0.5 + 0.28 * gran, s.y);                           // penumbra
  col = mix(col, col * vec3(0.2, 0.12, 0.1), s.x);                   // umbra

  col *= uGain;
  // the very edge melts into the corona
  col = mix(vec3(1.0, 0.5, 0.16) * 1.15, col, smoothstep(0.0, 0.1, mu));
  gl_FragColor = vec4(col, 1.0);
}`

const BILL_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const CORONA_FRAG = /* glsl */ `
uniform sampler2D tNoise; uniform float uTime; uniform float uExtent; uniform float uGain;
varying vec2 vUv;

// an arch of plasma standing on the limb: an ellipse squashed along the limb, of which only the part
// above the surface shows, broken into strands
float prominence(vec2 p, float ang, float rho, float squash, float seed){
  vec2 er = vec2(cos(ang), sin(ang));
  vec2 et = vec2(-er.y, er.x);
  vec2 q = p - er * (1.0 - rho * 0.25);
  vec2 l = vec2(dot(q, et) / squash, dot(q, er));
  float dist = abs(length(l) - rho);
  float along = atan(l.y, l.x);
  float strands = texture2D(tNoise, vec2(along * 0.35 + seed * 0.37, uTime * 0.004 + seed)).g;
  float body = exp(-pow(dist / (rho * 0.2), 2.0)) * (0.3 + 1.0 * strands) + exp(-pow(dist / (rho * 0.5), 2.0)) * 0.22;
  return body * smoothstep(-0.1, 0.35, l.y / rho);
}

void main(){
  vec2 p = vUv * uExtent;                     // in star radii
  float r = length(p);
  if (r > uExtent) discard;
  float a = atan(p.y, p.x) / 6.2831853;       // the texture tiles, so whole turns join without a seam
  float t = uTime;
  float n1 = texture2D(tNoise, vec2(a * 2.0 + 0.11, 0.23 + t * 0.0016)).g;
  float n2 = texture2D(tNoise, vec2(a * 5.0 + 0.47, 0.61 - t * 0.0023)).g;
  float fine = texture2D(tNoise, vec2(a * 14.0, r * 0.06 - t * 0.003)).g;
  float tongues = texture2D(tNoise, vec2(a * 11.0 + 0.3, 0.87 + t * 0.006)).g;
  float reach = 0.4 + 1.2 * n1 * n1 + 0.4 * n2 + 2.2 * pow(tongues, 4.0);
  float x = max(r - 0.985, 0.0);
  float inner = exp(-x * 15.0 / reach);
  float mid = exp(-x * 3.1 / reach) * (0.12 + 0.12 * fine);
  float haze = exp(-x * 0.85) * 0.03;
  vec3 col = vec3(1.0, 0.62, 0.24) * inner * 1.05 + vec3(1.0, 0.45, 0.12) * mid + vec3(0.9, 0.36, 0.09) * haze;
  float loops = prominence(p, 1.12, 0.1, 0.62, 1.0) + prominence(p, 2.3, 0.065, 1.35, 2.0) + prominence(p, 2.86, 0.12, 0.8, 3.0)
              + prominence(p, 0.5, 0.075, 0.55, 4.0) + prominence(p, 3.9, 0.09, 1.2, 5.0) + prominence(p, 5.25, 0.11, 0.7, 6.0);
  col += vec3(1.0, 0.36, 0.1) * loops * 0.5 * smoothstep(0.975, 1.005, r);
  float edge = smoothstep(uExtent, uExtent * 0.72, r);
  gl_FragColor = vec4(col * edge * uGain, 1.0);
}`

export function StarBody() {
  const corona = useRef<THREE.Mesh>(null)
  const root = useRef<THREE.Group>(null)
  const { surfMat, coronaMat } = useMemo(() => {
    const tNoise = { value: starNoise() }
    const surfMat = new THREE.ShaderMaterial({
      vertexShader: SURF_VERT,
      fragmentShader: SURF_FRAG,
      uniforms: { tNoise, uTime: { value: 0 }, uGain: { value: 1.0 } },
    })
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: BILL_VERT,
      fragmentShader: CORONA_FRAG,
      uniforms: { tNoise, uTime: { value: 0 }, uExtent: { value: 5.2 }, uGain: { value: 1.0 } },
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

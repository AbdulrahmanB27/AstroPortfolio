import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, BackSide, Color, Group, Mesh, ShaderMaterial, Vector3 } from 'three';
import { PALETTE, WORLD } from '../../lib/constants';
import { isCockpitScene, useApp } from '../../state/store';

/**
 * The central star: an HDR emissive sphere (blooms), a slowly boiling surface shader,
 * and a camera-facing corona. Clicking it from orbit returns home.
 */

const surfaceVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fragment -> camera, in view space. The fragment shader needs the real view direction,
    // not the view axis; see the note on \`facing\` below.
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform vec3 uGlow;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vView;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
    return n;
  }

  void main() {
    vec3 p = normalize(vPos);
    float t = uTime * 0.05;
    // Fine granulation only. A low-frequency, high-amplitude mottle read as a cloud deck
    // and pulled the disc toward neutral grey — the star looked like an overcast moon
    // rather than a light source. Stars have no weather.
    float n = noise(p * 22.0 + t) * 0.65 + noise(p * 48.0 - t * 1.7) * 0.35;

    // Against the true view direction, not the view axis. Hard-coding (0,0,1) is only
    // correct for an object at the centre of the frame: everywhere else the point whose
    // normal points down +Z is not the point nearest the camera, so the bright core slid
    // off the disc toward the frame edge. Measured on the project view, where the star sits
    // in the upper left, the peak sat 28px up and left of the disc's luminous centroid, and
    // the star read as a sphere lit from somewhere else rather than as the thing emitting.
    float facing = clamp(dot(vNormal, normalize(vView)), 0.0, 1.0);
    float rn = sqrt(max(0.0, 1.0 - facing * facing));   // 0 at the centre, 1 at the limb

    // Limb darkening across the whole disc, not just near the edge: the colour has to run
    // continuously from the pale core out through amber to a deep orange rim, so the
    // surface reads as a graded sphere of burning gas.
    float limb = pow(1.0 - rn * rn, 0.42);
    vec3 col = mix(uEdge, uCore, limb);
    col = mix(col, uGlow, smoothstep(0.35, 0.92, rn) * 0.55);
    col *= 0.95 + (n - 0.5) * 0.11;

    // This material is not tone mapped, so anything at or above 1.0 clips to flat white.
    // Only a small central hotspot is allowed past the bloom threshold (1.0); everywhere
    // else stays under it and keeps its colour.
    float hotspot = smoothstep(0.42, 0.0, rn);
    float level = 0.60 + limb * 0.22 + hotspot * 0.30;
    gl_FragColor = vec4(col * level, 1.0);
  }
`;

const coronaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Distances are measured in star radii (`uReach` = the plane's half-width in radii) so the
// corona can be made physically wider without re-tuning where the bright inner ring sits.
// The star's body is only ~1.1x the widest planet body, and a ringed planet is three times
// its width on screen, so the glow is what has to carry "this is the centre of the system".
const coronaFragment = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uTime;
  uniform float uReach;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float dr = length(c) * 2.0 * uReach;          // distance from centre, in star radii
    float ang = atan(c.y, c.x);
    // Low frequency and shallow. Beating sin(9a) against sin(5a) put a 14-lobe ripple in
    // the halo — measured at 27% of the radius — so the corona's outline read as a cog
    // rather than a circle at every threshold.
    float rays = 0.5 + 0.5 * sin(ang * 3.0 + uTime * 0.10) * sin(ang * 2.0 - uTime * 0.06);
    // Wide and soft: a tight band here drew a hard bright outline around the disc, which
    // read as a stroke on a circle rather than as light leaving a surface.
    float core = smoothstep(1.85, 0.62, dr);
    float halo = pow(max(0.0, 1.0 - dr / uReach), 1.75) * (0.86 + rays * 0.14);
    vec3 col = mix(uOuter, uInner, core * 0.75 + 0.12) * (core * 0.95 + halo * 1.05);
    float alpha = clamp(core * 0.62 + halo * 0.72, 0.0, 1.0);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

/** Corona half-width in star radii. Was 2.6; widened so the star outreaches the rings. */
const CORONA_REACH = 5.0;

const tmp = new Vector3();

export function Star({ onSelect }: { onSelect?: () => void }) {
  const surfaceRef = useRef<ShaderMaterial>(null);
  const coronaRef = useRef<ShaderMaterial>(null);
  const coronaGroup = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const scene = useApp((s) => s.scene);
  const interactive = scene === 'system';
  // This light has no decay so distant planets stay lit, which also means it passes
  // straight through the cabin walls and washed the cockpit floor to a sandy warm grey.
  // Inside, the room is lit by its own practicals (see `Lights`, which dims the key for
  // the same reason); the star still reads through the window on its own emission.
  const interior = isCockpitScene(scene);

  const surfaceUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCore: { value: new Color(PALETTE.starCore) },
      uEdge: { value: new Color(PALETTE.starGlow) },
      uGlow: { value: new Color(PALETTE.starEdge) },
    }),
    [],
  );
  const coronaUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uInner: { value: new Color(PALETTE.starGlow) },
      uOuter: { value: new Color(PALETTE.starEdge) },
      uReach: { value: CORONA_REACH },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (surfaceRef.current) surfaceRef.current.uniforms.uTime!.value += delta;
    if (coronaRef.current) coronaRef.current.uniforms.uTime!.value += delta;
    if (coronaGroup.current) {
      // Billboard the corona toward the camera.
      state.camera.getWorldPosition(tmp);
      coronaGroup.current.lookAt(tmp);
    }
  });

  const r = WORLD.starRadius;

  return (
    <group name="star">
      <mesh
        ref={meshRef}
        name="star-surface"
        onClick={interactive ? (e) => { e.stopPropagation(); onSelect?.(); } : undefined}
        onPointerOver={interactive ? () => (document.body.style.cursor = 'pointer') : undefined}
        onPointerOut={interactive ? () => (document.body.style.cursor = '') : undefined}
      >
        <sphereGeometry args={[r, 64, 48]} />
        <shaderMaterial ref={surfaceRef} vertexShader={surfaceVertex} fragmentShader={surfaceFragment} uniforms={surfaceUniforms} toneMapped={false} />
      </mesh>
      {/* Soft outer shell for a luminous limb when seen against space. */}
      <mesh name="star-shell" scale={1.11}>
        <sphereGeometry args={[r, 48, 32]} />
        <meshBasicMaterial color={PALETTE.starGlow} transparent opacity={0.16} side={BackSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <group ref={coronaGroup} name="star-corona">
        <mesh renderOrder={-1}>
          <planeGeometry args={[r * CORONA_REACH * 2, r * CORONA_REACH * 2]} />
          <shaderMaterial
            ref={coronaRef}
            vertexShader={coronaVertex}
            fragmentShader={coronaFragment}
            uniforms={coronaUniforms}
            transparent
            depthWrite={false}
            depthTest
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      {/* Light from the star for the orbital bodies (no decay so distant planets stay lit). */}
      {/* No decay so distant planets stay lit; the contrast comes from a low ambient. */}
      <pointLight color={PALETTE.keyLight} intensity={interior ? 0.12 : 3.1} distance={0} decay={0} />
    </group>
  );
}

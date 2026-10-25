import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { PALETTE } from '../../lib/constants';
import { handles } from '../rig';
import { vehicleView } from './rocketState';

/**
 * Stylized rocket, ~7.4 units tall, standing on its pad with the origin at ground level.
 * The hatch faces +Z (toward the camera after the stage yaw). Sequences drive
 * `handles.rocket` (whole vehicle), `handles.rocketEngine.setThrust`, and the hatch.
 *
 * The hull is one turned profile rather than a stack of primitives. It used to be a cylinder,
 * a frustum and a cone, which met at two hard creases — the nose read as a party hat set on a
 * can — and the fins were rotated boxes, so every edge was a zero-width seam. Now:
 *  - the nose is a tangent ogive, the curve real nose cones use, flowing out of the body with
 *    no crease where they meet;
 *  - the engine is a bell, flared the way a nozzle is, not a truncated cone;
 *  - the fins are swept, bevelled plates, so their edges catch the key light;
 *  - the body carries the things that say "built": panel seams, a curved cockpit window in a
 *    frame, attitude thrusters under the nose, rails on the ladder, and its registration.
 *
 * Every dimension the camera relies on is unchanged — body radius 1.0, hatch centre at
 * y 3.15 on +Z — because the cockpit entry flies to that door.
 */

type Vec3 = [number, number, number];

/** Body radius; everything mounted on the hull is placed against this. */
const R = 1.0;
const BODY_BOTTOM = 1.72;
const BODY_TOP = 5.3;
const NOSE_TIP = 7.35;

/**
 * Tangent ogive, sampled bottom-up as (radius, height) points between two distances from the
 * tip — the order a lathe needs for its normals to face out.
 */
function ogive(fromTip: number, toTip: number, steps: number): Vector2[] {
  const L = NOSE_TIP - BODY_TOP;
  const rho = (R * R + L * L) / (2 * R);
  const pts: Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    // x is distance from the tip, so the radius grows from 0 at the tip to R at the shoulder.
    const x = fromTip + (toTip - fromTip) * (i / steps);
    const r = Math.sqrt(Math.max(0, rho * rho - (L - x) * (L - x))) + R - rho;
    pts.push(new Vector2(Math.max(0.0001, r), NOSE_TIP - x));
  }
  return pts;
}

function buildGeometries() {
  // Body and nose as one surface, so there is no crease at the shoulder.
  const hull = new LatheGeometry(
    // The ogive's first point is the shoulder itself, so it is not listed twice: a repeated
    // point is a zero-length segment, and its normal darkens a ring round the hull.
    [new Vector2(R, BODY_BOTTOM), ...ogive(NOSE_TIP - BODY_TOP, 0.32, 28)],
    64,
  );
  // The tip in the accent colour, continuing the same curve.
  const tip = new LatheGeometry(ogive(0.32, 0, 8), 48);
  // Aft skirt: a slightly proud ring with rounded lips top and bottom.
  const skirt = new LatheGeometry(
    [
      new Vector2(0.86, 1.1),
      new Vector2(1.0, 1.12),
      new Vector2(1.035, 1.17),
      new Vector2(1.035, 1.67),
      new Vector2(1.0, 1.73),
    ],
    64,
  );
  // Thrust structure: the cone that carries the engine into the skirt.
  const thrust = new LatheGeometry([new Vector2(0.36, 0.92), new Vector2(0.55, 0.98), new Vector2(0.86, 1.1)], 48);
  // Engine bell: throat at the top, flaring to the exit. Double-sided so the inside of the
  // nozzle reads as a hollow, not a hole.
  const bellPts: Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    bellPts.push(new Vector2(0.3 + 0.33 * Math.pow(t, 0.62), 0.95 - t * 0.74));
  }
  const bell = new LatheGeometry(bellPts, 48);
  const bellLip = new LatheGeometry(
    [new Vector2(0.62, 0.23), new Vector2(0.655, 0.215), new Vector2(0.65, 0.19), new Vector2(0.6, 0.2)],
    48,
  );

  // Swept fin: root along the hull, tip chord lower and further out. Bevelled so the edges
  // take light.
  const fin = new Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0, 1.55);
  fin.lineTo(0.95, 0.42);
  fin.lineTo(1.0, -0.45);
  fin.lineTo(0.78, -0.45);
  fin.closePath();
  const finGeo = new ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3, curveSegments: 4 });
  finGeo.translate(0, 0, -0.04);

  // The cockpit window: a strip of the hull itself, curved with it, plus its frame.
  const WIN_Y = 5.12;
  const WIN_H = 0.3;
  const WIN_PHI = 0.84;
  const glass = new LatheGeometry([new Vector2(R + 0.006, WIN_Y - WIN_H / 2), new Vector2(R + 0.006, WIN_Y + WIN_H / 2)], 24, -WIN_PHI / 2, WIN_PHI);
  const frameBar = (y: number) =>
    new LatheGeometry(
      [new Vector2(R, y - 0.035), new Vector2(R + 0.03, y - 0.03), new Vector2(R + 0.03, y + 0.03), new Vector2(R, y + 0.035)],
      24,
      -WIN_PHI / 2 - 0.03,
      WIN_PHI + 0.06,
    );
  const frameTop = frameBar(WIN_Y + WIN_H / 2);
  const frameBottom = frameBar(WIN_Y - WIN_H / 2);

  return { hull, tip, skirt, thrust, bell, bellLip, finGeo, glass, frameTop, frameBottom, window: { y: WIN_Y, h: WIN_H, phi: WIN_PHI } };
}

/** The vehicle's registration, stacked vertically the way launch vehicles carry it. */
function buildMarking(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#23272f';
  ctx.font = '700 76px "Space Grotesk", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = ['A', 'B', '·', '0', '1'];
  chars.forEach((ch, i) => ctx.fillText(ch, canvas.width / 2, 52 + i * 102));
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const flameVertex = /* glsl */ `
  uniform float uLength;
  varying float vT;
  varying float vAngle;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    // 0 at the nozzle (the cone's base), 1 at its apex, which the mesh turns to point down.
    vT = clamp(position.y / uLength + 0.5, 0.0, 1.0);
    vAngle = atan(position.z, position.x);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCool;
  varying float vT;
  varying float vAngle;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // Turbulence streams away from the nozzle; the tip flickers, the root holds steady.
    float n = noise(vec2(vAngle * 2.0, vT * 7.0 - uTime * 11.0));
    float flicker = (n - 0.5) * 0.35 * vT;
    vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.32, vT));
    col = mix(col, uCool, smoothstep(0.3, 0.85, vT + flicker));
    // Shock diamonds: bright bands close to the nozzle, as an underexpanded plume shows.
    float diamonds = smoothstep(0.55, 1.0, sin(vT * 38.0 - uTime * 3.0)) * (1.0 - smoothstep(0.0, 0.45, vT));
    col += uHot * diamonds * 0.35;
    // Soft at the silhouette, so the plume has volume rather than the hard edge of a cone.
    float edge = pow(abs(dot(vNormalV, vViewV)), 0.7);
    float a = (1.0 - smoothstep(0.45, 1.0, vT + flicker)) * edge * uOpacity;
    gl_FragColor = vec4(col * a, a);
  }
`;

function flameMaterial(hot: Color, mid: Color, cool: Color, length: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uLength: { value: length },
      uHot: { value: hot },
      uMid: { value: mid },
      uCool: { value: cool },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export function Rocket(props: { position: readonly [number, number, number]; rotation?: Vec3 }) {
  const vehicleRef = useRef<Group>(null);
  const flameRef = useRef<Mesh>(null);
  const flameCoreRef = useRef<Mesh>(null);
  const engineLightRef = useRef<PointLight>(null);
  const hatchRef = useRef<Group>(null);
  const hatchLightRef = useRef<Mesh>(null);
  const hatchGlowRef = useRef<Mesh>(null);
  const hatchLampRef = useRef<PointLight>(null);

  const geo = useMemo(buildGeometries, []);
  const marking = useMemo(buildMarking, []);

  const mats = useMemo(() => {
    // Rougher and less metallic than it looks like it should be. At 0.48/0.08 the warm key
    // threw a 3px specular down the hull's edge that clipped to pure achromatic white over
    // 4,000 pixels — a strip of white tape stuck to a cylinder. A broader, dimmer highlight
    // wraps the form and keeps the star's cream in it.
    const body = new MeshStandardMaterial({ color: PALETTE.rocketWhite, roughness: 0.72, metalness: 0.03 });
    const graphite = new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.55, metalness: 0.45 });
    const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, metalness: 0.1 });
    const nozzle = new MeshStandardMaterial({ color: '#1b1e25', roughness: 0.4, metalness: 0.7, side: DoubleSide });
    const glass = new MeshStandardMaterial({ color: '#0f1622', roughness: 0.2, metalness: 0.6, emissive: '#2a3a55', emissiveIntensity: 0.4 });
    const seam = new MeshStandardMaterial({ color: '#9a978f', roughness: 0.8, metalness: 0.05 });
    // Above 1.0 on purpose: the plume is not tone mapped, so the bloom threshold of 1.0 is a
    // real ceiling. At the plain token value the plume sat exactly at the threshold and bled
    // nothing — the launch payoff rendered as a flat paper cone.
    const flame = flameMaterial(
      new Color('#fff1cf').multiplyScalar(1.7),
      new Color(PALETTE.starGlow).multiplyScalar(1.45),
      new Color(PALETTE.starEdge).multiplyScalar(0.9),
      2.4,
    );
    const flameCore = flameMaterial(new Color('#ffffff').multiplyScalar(2.2), new Color('#fff4dc').multiplyScalar(2.0), new Color(PALETTE.starGlow).multiplyScalar(1.2), 1.5);
    const pad = new MeshStandardMaterial({ color: '#3a3733', roughness: 0.95 });
    const padRing = new MeshStandardMaterial({ color: '#5a554f', roughness: 0.9 });
    const strip = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(1.5), toneMapped: false });
    const decal = new MeshStandardMaterial({ map: marking, transparent: true, roughness: 0.72, metalness: 0.03, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    return { body, graphite, accent, nozzle, glass, seam, flame, flameCore, pad, padRing, strip, decal };
  }, [marking]);

  // Read every frame rather than set once: the cockpit deep link decides this before
  // this component exists, so a one-shot write would be lost.
  useFrame((state) => {
    const vehicle = vehicleRef.current;
    if (vehicle) vehicle.visible = !vehicleView.interior;
    if (mats.flame.uniforms.uOpacity!.value > 0.001) {
      mats.flame.uniforms.uTime!.value = state.clock.elapsedTime;
      mats.flameCore.uniforms.uTime!.value = state.clock.elapsedTime;
    }
  });

  useEffect(() => {
    const vehicle = vehicleRef.current;
    if (!vehicle) return;
    handles.rocket = vehicle;
    handles.rocketEngine = {
      setThrust: (t: number) => {
        const k = Math.max(0, Math.min(1, t));
        mats.flame.uniforms.uOpacity!.value = k * 0.9;
        mats.flameCore.uniforms.uOpacity!.value = k;
        if (flameRef.current) flameRef.current.scale.set(0.7 + k * 0.5, 0.4 + k * 1.4, 0.7 + k * 0.5);
        if (flameCoreRef.current) flameCoreRef.current.scale.set(0.6 + k * 0.3, 0.5 + k * 0.9, 0.6 + k * 0.3);
        if (engineLightRef.current) engineLightRef.current.intensity = k * 140;
      },
    };
    handles.rocketHatch = {
      setOpen: (t: number) => {
        if (hatchRef.current) hatchRef.current.position.x = -0.62 * Math.max(0, Math.min(1, t));
        if (hatchLightRef.current) (hatchLightRef.current.material as MeshBasicMaterial).opacity = 0.2 + t * 0.8;
        // The open hatch has to show a lit cabin behind it. Flying at an unlit recess made
        // the last second of the entry a featureless black frame.
        const open = Math.max(0, Math.min(1, t));
        if (hatchGlowRef.current) (hatchGlowRef.current.material as MeshBasicMaterial).opacity = open * 0.9;
        if (hatchLampRef.current) hatchLampRef.current.intensity = open * 5.5;
      },
    };
    return () => {
      delete handles.rocket;
      delete handles.rocketEngine;
      delete handles.rocketHatch;
    };
  }, [mats]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(
    () => () => {
      marking.dispose();
      for (const g of Object.values(geo)) if (typeof (g as { dispose?: () => void }).dispose === 'function') (g as { dispose: () => void }).dispose();
    },
    [geo, marking],
  );

  const { body, graphite, accent, nozzle, glass, seam, flame, flameCore, pad, padRing, strip, decal } = mats;
  const legAngles = [Math.PI / 6, Math.PI / 6 + (Math.PI * 2) / 3, Math.PI / 6 + (Math.PI * 4) / 3];
  const finAngles = [0, 1, 2, 3].map((i) => (i * Math.PI) / 2 + Math.PI / 4);
  const win = geo.window;

  return (
    <group position={[props.position[0], props.position[1], props.position[2]]} rotation={props.rotation} name="rocket-site">
      {/* Launch pad */}
      <mesh position={[0, 0.06, 0]} material={pad} receiveShadow>
        <cylinderGeometry args={[2.6, 2.8, 0.12, 48]} />
      </mesh>
      <mesh position={[0, 0.125, 0]} material={padRing} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.9, 2.05, 64]} />
      </mesh>
      {/* Flame trench grate: dark slots under the engine, so the pad reads as a launch pad
          rather than a coaster. */}
      {[-0.42, -0.14, 0.14, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.123, 0]} material={graphite} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 1.25]} />
        </mesh>
      ))}

      <group ref={vehicleRef} name="rocket">
        {/* Landing legs */}
        {legAngles.map((a, i) => (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[1.3, 0.8, 0]} rotation={[0, 0, 0.62]} material={graphite} castShadow>
              <cylinderGeometry args={[0.06, 0.07, 1.9, 12]} />
            </mesh>
            {/* Piston sleeve on the main strut: the leg is a shock absorber, not a stick. */}
            <mesh position={[1.12, 1.07, 0]} rotation={[0, 0, 0.62]} material={seam} castShadow>
              <cylinderGeometry args={[0.085, 0.085, 0.55, 12]} />
            </mesh>
            {/* Upper stay: starts outside the hull radius so it never pokes through it. */}
            <mesh position={[1.28, 1.18, 0]} rotation={[0, 0, -0.52]} material={graphite} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.78, 8]} />
            </mesh>
            <mesh position={[1.75, 0.16, 0]} material={graphite} castShadow receiveShadow>
              <cylinderGeometry args={[0.26, 0.3, 0.1, 18]} />
            </mesh>
          </group>
        ))}

        {/* Engine: bell, lip, thrust structure, aft skirt */}
        <mesh geometry={geo.bell} material={nozzle} castShadow />
        <mesh geometry={geo.bellLip} material={graphite} castShadow />
        <mesh geometry={geo.thrust} material={graphite} castShadow />
        <mesh geometry={geo.skirt} material={graphite} castShadow receiveShadow />

        {/* Hull and nose, one surface; accent tip */}
        <mesh geometry={geo.hull} material={body} castShadow receiveShadow />
        <mesh geometry={geo.tip} material={accent} castShadow />

        {/* Accent band, shoulder band and panel seams */}
        <mesh position={[0, 2.2, 0]} material={accent}>
          <cylinderGeometry args={[R + 0.012, R + 0.012, 0.16, 64, 1, true]} />
        </mesh>
        <mesh position={[0, BODY_TOP, 0]} material={graphite}>
          <cylinderGeometry args={[R + 0.012, R + 0.012, 0.08, 64, 1, true]} />
        </mesh>
        {[3.98, 4.86].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={seam}>
            <cylinderGeometry args={[R + 0.004, R + 0.004, 0.018, 64, 1, true]} />
          </mesh>
        ))}
        {/* Vertical seams on the sides and back, clear of the hatch and the window. */}
        {[Math.PI / 2, Math.PI, -Math.PI / 2].map((phi) => (
          <mesh key={phi} position={[Math.sin(phi) * (R + 0.004), (BODY_BOTTOM + BODY_TOP) / 2, Math.cos(phi) * (R + 0.004)]} rotation={[0, phi, 0]} material={seam}>
            <planeGeometry args={[0.018, BODY_TOP - BODY_BOTTOM - 0.1]} />
          </mesh>
        ))}

        {/* Fins */}
        {finAngles.map((a) => (
          <group key={a} rotation={[0, a - Math.PI / 2, 0]}>
            <mesh geometry={geo.finGeo} position={[R - 0.06, 0.78, 0]} material={accent} castShadow receiveShadow />
          </group>
        ))}

        {/* Attitude thrusters under the nose, in line with the fins */}
        {finAngles.map((a) => (
          <group key={a} rotation={[0, a, 0]}>
            <mesh position={[0, 5.6, R - 0.01]} material={graphite} castShadow>
              <boxGeometry args={[0.16, 0.2, 0.1]} />
            </mesh>
            <mesh position={[0, 5.6, R + 0.06]} rotation={[Math.PI / 2, 0, 0]} material={nozzle}>
              <cylinderGeometry args={[0.025, 0.04, 0.06, 10]} />
            </mesh>
          </group>
        ))}

        {/* Hatch (slides sideways when opened) */}
        <group position={[0, 3.15, 0]}>
          <mesh position={[0, 0, 0.97]} material={graphite}>
            <boxGeometry args={[0.82, 1.22, 0.1]} />
          </mesh>
          <group ref={hatchRef}>
            <mesh position={[0, 0, 1.02]} material={body} castShadow>
              <boxGeometry args={[0.7, 1.1, 0.08]} />
            </mesh>
            <mesh position={[0.22, 0, 1.07]} material={graphite}>
              <boxGeometry args={[0.06, 0.24, 0.03]} />
            </mesh>
            {/* A small viewport in the door. */}
            <mesh position={[0, 0.28, 1.065]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
              <cylinderGeometry args={[0.1, 0.1, 0.02, 20]} />
            </mesh>
          </group>
          <mesh ref={hatchLightRef} position={[0, 0.66, 1.03]}>
            <boxGeometry args={[0.7, 0.05, 0.03]} />
            <meshBasicMaterial color={PALETTE.starGlow} transparent opacity={0.2} toneMapped={false} />
          </mesh>
          {/* Lit cabin seen through the open hatch, revealed as the door slides aside.
              Tried as a modelled recess with side walls; the walls occluded the lamp and
              the doorway went black, so this stays a lit face with the frame around it
              supplying the depth. */}
          <mesh ref={hatchGlowRef} position={[0, 0, 0.94]}>
            <planeGeometry args={[0.66, 1.06]} />
            <meshBasicMaterial color={PALETTE.screenGlow} transparent opacity={0} toneMapped={false} />
          </mesh>
          <pointLight ref={hatchLampRef} color={PALETTE.starGlow} intensity={0} distance={4.5} decay={2} position={[0, 0.1, 1.3]} />
        </group>

        {/* Ladder: rails and rungs */}
        {[-0.25, 0.25].map((x) => (
          <mesh key={x} position={[x, 2.05, 1.05]} material={graphite}>
            <cylinderGeometry args={[0.022, 0.022, 0.86, 8]} />
          </mesh>
        ))}
        {[1.75, 1.95, 2.15, 2.35].map((y) => (
          <mesh key={y} position={[0, y, 1.05]} rotation={[0, 0, Math.PI / 2]} material={graphite}>
            <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
          </mesh>
        ))}

        {/* Porthole, in a proud frame */}
        <mesh position={[0, 4.45, R - 0.01]} material={graphite}>
          <torusGeometry args={[0.25, 0.045, 12, 32]} />
        </mesh>
        <mesh position={[0, 4.45, R]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
          <cylinderGeometry args={[0.22, 0.22, 0.04, 32]} />
        </mesh>

        {/* Cockpit window: curved with the hull, framed top and bottom, posts at the ends */}
        <mesh geometry={geo.glass} material={glass} />
        <mesh geometry={geo.frameTop} material={graphite} />
        <mesh geometry={geo.frameBottom} material={graphite} />
        {[-1, 1].map((side) => {
          const phi = side * (win.phi / 2 + 0.015);
          return (
            <mesh key={side} position={[Math.sin(phi) * (R + 0.012), win.y, Math.cos(phi) * (R + 0.012)]} rotation={[0, phi, 0]} material={graphite}>
              <boxGeometry args={[0.04, win.h + 0.06, 0.03]} />
            </mesh>
          );
        })}

        {/* Registration, on the side the camera sees beside the hatch */}
        <mesh position={[0, 3.2, 0]} material={decal}>
          <cylinderGeometry args={[R + 0.003, R + 0.003, 1.3, 12, 1, true, -0.8, 0.26]} />
        </mesh>

        {/* Nav light strip */}
        <mesh position={[0, 2.62, 1.01]} material={strip}>
          <boxGeometry args={[0.5, 0.03, 0.02]} />
        </mesh>

        {/* Engine flame (scaled by thrust) */}
        <group position={[0, 0.3, 0]}>
          <mesh ref={flameRef} position={[0, -1.1, 0]} rotation={[Math.PI, 0, 0]} material={flame}>
            <coneGeometry args={[0.5, 2.4, 32, 12, true]} />
          </mesh>
          <mesh ref={flameCoreRef} position={[0, -0.7, 0]} rotation={[Math.PI, 0, 0]} material={flameCore}>
            <coneGeometry args={[0.28, 1.5, 24, 8, true]} />
          </mesh>
          <pointLight ref={engineLightRef} color={PALETTE.starEdge} intensity={0} distance={40} decay={2} position={[0, -0.6, 0]} />
        </group>
      </group>
    </group>
  );
}

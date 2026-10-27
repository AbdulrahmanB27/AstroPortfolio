import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PointLight } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../lib/constants';
import { handles } from '../rig';
import { vehicleView } from './rocketState';
import { batchStatic } from '../staticBatch';

/**
 * Stylized rocket, ~7.5 units tall, standing on its pad with the origin at ground level.
 * The hatch faces +Z (toward the camera after the stage yaw). Sequences drive
 * `handles.rocket` (whole vehicle), `handles.rocketEngine.setThrust`, and the hatch.
 *
 * Refined, not redesigned. The silhouette — the cone and its pointed amber tip, the angled
 * fins, the proportions — is the owner's and stays exactly as it was; a version that swapped
 * the cone for a rounded ogive and the fins for swept plates was rejected. What changed is
 * finish: twice the radial segments so the curves stop faceting, bevelled fins and frames so
 * edges take a highlight instead of ending in a zero-width seam, and the small hardware that
 * says the thing was assembled — rivet rows at the bands, panel seams, a bolted porthole, a
 * hatch with hinges and a lever, ladder rails, cooling rings on the nozzle, pistons in the legs.
 */

type Vec3 = [number, number, number];

/** Body radius, and the radial segments every turned part of the hull uses. */
const R = 1.0;
const SEG = 64;

/** Rivet rows: (height, radius it sits on). Each row is SEG rivets around the hull. */
const RIVET_ROWS: [number, number][] = [
  [1.76, R],
  [2.09, R + 0.012],
  [2.31, R + 0.012],
  [5.22, R],
];

/** Rivets as one instanced mesh: a few hundred bumps, one draw call. */
function Rivets({ material }: { material: MeshStandardMaterial }) {
  const ref = useRef<InstancedMesh>(null);
  const count = RIVET_ROWS.length * SEG;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    let i = 0;
    for (const [y, r] of RIVET_ROWS) {
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        o.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
        o.rotation.set(0, a, 0);
        o.updateMatrix();
        mesh.setMatrixAt(i++, o.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, material, count]}>
      <sphereGeometry args={[0.014, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
    </instancedMesh>
  );
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

  const mats = useMemo(() => {
    // Rougher and less metallic than it looks like it should be. At 0.48/0.08 the warm key
    // threw a 3px specular down the hull's edge that clipped to pure achromatic white over
    // 4,000 pixels — a strip of white tape stuck to a cylinder. A broader, dimmer highlight
    // wraps the form and keeps the star's cream in it.
    const body = new MeshStandardMaterial({ color: PALETTE.rocketWhite, roughness: 0.72, metalness: 0.03 });
    const graphite = new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.55, metalness: 0.45 });
    const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, metalness: 0.1 });
    // Double-sided so the inside of the bell reads as the inside of a nozzle, not a hole.
    const nozzle = new MeshStandardMaterial({ color: '#1b1e25', roughness: 0.4, metalness: 0.7, side: DoubleSide });
    const glass = new MeshStandardMaterial({ color: '#0f1622', roughness: 0.2, metalness: 0.6, emissive: '#2a3a55', emissiveIntensity: 0.4 });
    // Above 1.0 on purpose: these materials are not tone mapped, so the bloom threshold of
    // 1.0 is a real ceiling. At the plain token value the plume sat exactly at the
    // threshold and bled nothing — the launch payoff rendered as a flat paper cone.
    const flame = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(1.45), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const flameCore = new MeshBasicMaterial({ color: new Color('#fff4dc').multiplyScalar(2.1), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const pad = new MeshStandardMaterial({ color: '#3a3733', roughness: 0.95 });
    const padRing = new MeshStandardMaterial({ color: '#5a554f', roughness: 0.9 });
    const strip = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(1.5), toneMapped: false });
    // Seams and fastener heads: a shade under the hull, so they read as joins in it rather
    // than as lines painted on it.
    const seam = new MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.8, metalness: 0.05 });
    const steel = new MeshStandardMaterial({ color: '#8d939c', roughness: 0.38, metalness: 0.75 });
    return { body, graphite, accent, nozzle, glass, flame, flameCore, pad, padRing, strip, seam, steel };
  }, []);

  const geo = useMemo(
    () => ({
      fin: new RoundedBoxGeometry(0.9, 1.4, 0.18, 3, 0.05),
      hatchFrame: new RoundedBoxGeometry(0.82, 1.22, 0.1, 3, 0.04),
      hatchDoor: new RoundedBoxGeometry(0.7, 1.1, 0.08, 3, 0.03),
      windowGlass: new RoundedBoxGeometry(0.9, 0.28, 0.12, 3, 0.04),
      windowFrame: new RoundedBoxGeometry(1.0, 0.38, 0.1, 3, 0.05),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  // Read every frame rather than set once: the cockpit deep link decides this before
  // this component exists, so a one-shot write would be lost.
  useFrame(() => {
    const vehicle = vehicleRef.current;
    if (vehicle) vehicle.visible = !vehicleView.interior;
  });

  useEffect(() => {
    const vehicle = vehicleRef.current;
    if (!vehicle) return;
    handles.rocket = vehicle;
    handles.rocketEngine = {
      setThrust: (t: number) => {
        const k = Math.max(0, Math.min(1, t));
        mats.flame.opacity = k * 0.9;
        mats.flameCore.opacity = k;
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

  // Hull, legs, ladder and fasteners as one draw call per material; the door is batched on its
  // own because it slides, and the plume is left alone because it scales. See `staticBatch`.
  useLayoutEffect(() => (vehicleRef.current ? batchStatic(vehicleRef.current) : undefined), []);

  const { body, graphite, accent, nozzle, glass, flame, flameCore, pad, padRing, strip, seam, steel } = mats;
  const legAngles = [Math.PI / 6, Math.PI / 6 + (Math.PI * 2) / 3, Math.PI / 6 + (Math.PI * 4) / 3];

  return (
    <group position={[props.position[0], props.position[1], props.position[2]]} rotation={props.rotation} name="rocket-site">
      {/* Launch pad */}
      <mesh position={[0, 0.06, 0]} material={pad} receiveShadow>
        <cylinderGeometry args={[2.6, 2.8, 0.12, 40]} />
      </mesh>
      <mesh position={[0, 0.125, 0]} material={padRing} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.9, 2.05, 48]} />
      </mesh>

      <group ref={vehicleRef} name="rocket">
        {/* Landing legs */}
        {legAngles.map((a, i) => (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[1.3, 0.8, 0]} rotation={[0, 0, 0.62]} material={graphite} castShadow>
              <cylinderGeometry args={[0.06, 0.07, 1.9, 16]} />
            </mesh>
            {/* Piston sleeve on the strut: the leg is a shock absorber, not a stick. */}
            <mesh position={[1.12, 1.07, 0]} rotation={[0, 0, 0.62]} material={steel} castShadow>
              <cylinderGeometry args={[0.085, 0.085, 0.5, 16]} />
            </mesh>
            {/* Hinge pin where the strut meets the skirt. */}
            <mesh position={[0.93, 1.38, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
              <cylinderGeometry args={[0.045, 0.045, 0.2, 12]} />
            </mesh>
            {/* Upper stay: starts outside the hull radius so it never pokes through it. */}
            <mesh position={[1.28, 1.18, 0]} rotation={[0, 0, -0.52]} material={graphite} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.78, 8]} />
            </mesh>
            <mesh position={[1.75, 0.16, 0]} material={graphite} castShadow receiveShadow>
              <cylinderGeometry args={[0.26, 0.3, 0.1, 28]} />
            </mesh>
            <mesh position={[1.75, 0.215, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
              <torusGeometry args={[0.25, 0.012, 8, 28]} />
            </mesh>
          </group>
        ))}
        {/* Engine bell + skirt */}
        <mesh position={[0, 0.62, 0]} material={nozzle} castShadow>
          <cylinderGeometry args={[0.34, 0.6, 0.7, 48, 1, true]} />
        </mesh>
        {/* Cooling rings round the bell, and a lip at its exit. */}
        {[0.42, 0.62, 0.82].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
            <torusGeometry args={[0.34 + ((0.97 - y) / 0.7) * 0.26 + 0.008, 0.016, 8, 48]} />
          </mesh>
        ))}
        <mesh position={[0, 0.275, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <torusGeometry args={[0.6, 0.022, 8, 48]} />
        </mesh>
        <mesh position={[0, 0.98, 0]} material={graphite} castShadow>
          <cylinderGeometry args={[0.55, 0.42, 0.3, 48]} />
        </mesh>
        <mesh position={[0, 1.42, 0]} material={graphite} castShadow>
          <cylinderGeometry args={[1.02, 1.02, 0.6, SEG]} />
        </mesh>
        {/* Body */}
        <mesh position={[0, 3.5, 0]} material={body} castShadow receiveShadow>
          <cylinderGeometry args={[R, R, 3.6, SEG]} />
        </mesh>
        <mesh position={[0, 5.62, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.72, R, 0.65, SEG]} />
        </mesh>
        <mesh position={[0, 6.7, 0]} material={body} castShadow>
          <coneGeometry args={[0.72, 1.55, SEG]} />
        </mesh>
        <mesh position={[0, 7.3, 0]} material={accent} castShadow>
          <coneGeometry args={[0.2, 0.4, 32]} />
        </mesh>
        {/* Seam where the shoulder meets the cone, and a collar under the amber tip. */}
        <mesh position={[0, 5.945, 0]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
          <torusGeometry args={[0.722, 0.012, 6, SEG]} />
        </mesh>
        <mesh position={[0, 7.105, 0]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
          <torusGeometry args={[0.2, 0.012, 6, 32]} />
        </mesh>
        {/* Accent bands */}
        <mesh position={[0, 2.2, 0]} material={accent}>
          <cylinderGeometry args={[1.012, 1.012, 0.16, SEG, 1, true]} />
        </mesh>
        <mesh position={[0, 5.3, 0]} material={graphite}>
          <cylinderGeometry args={[1.012, 1.012, 0.08, SEG, 1, true]} />
        </mesh>
        {/* Panel seams: one ring clear of the hatch and the porthole, and three vertical joins
            on the sides and back, away from everything on the front face. */}
        <mesh position={[0, 3.92, 0]} material={seam}>
          <cylinderGeometry args={[R + 0.003, R + 0.003, 0.016, SEG, 1, true]} />
        </mesh>
        {[Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
          <mesh key={a} position={[Math.sin(a) * (R + 0.003), 3.49, Math.cos(a) * (R + 0.003)]} rotation={[0, a, 0]} material={seam}>
            <planeGeometry args={[0.016, 3.46]} />
          </mesh>
        ))}
        <Rivets material={steel} />
        {/* Fins */}
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]}>
            <mesh geometry={geo.fin} position={[1.35, 1.55, 0]} rotation={[0, 0, -0.35]} material={accent} castShadow receiveShadow />
          </group>
        ))}
        {/* Hatch (slides sideways when opened) */}
        <group position={[0, 3.15, 0]}>
          <mesh geometry={geo.hatchFrame} position={[0, 0, 0.97]} material={graphite} />
          {/* Fasteners round the frame. */}
          {[-0.36, 0.36].map((x) =>
            [-0.5, -0.17, 0.17, 0.5].map((y) => (
              <mesh key={`${x}${y}`} position={[x, y, 1.025]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
                <cylinderGeometry args={[0.014, 0.014, 0.012, 8]} />
              </mesh>
            )),
          )}
          <group ref={hatchRef} userData={{ batch: true }}>
            <mesh geometry={geo.hatchDoor} position={[0, 0, 1.02]} material={body} castShadow />
            {/* Door viewport in a ring. */}
            <mesh position={[0, 0.3, 1.062]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
              <cylinderGeometry args={[0.085, 0.085, 0.012, 24]} />
            </mesh>
            <mesh position={[0, 0.3, 1.062]} material={graphite}>
              <torusGeometry args={[0.095, 0.014, 8, 24]} />
            </mesh>
            {/* Lever handle on two standoffs. */}
            <mesh position={[0.22, -0.04, 1.1]} material={steel}>
              <capsuleGeometry args={[0.018, 0.2, 4, 10]} />
            </mesh>
            {[-0.13, 0.05].map((y) => (
              <mesh key={y} position={[0.22, y, 1.08]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
                <cylinderGeometry args={[0.014, 0.014, 0.05, 8]} />
              </mesh>
            ))}
            {/* Hinge knuckles on the opening edge. */}
            {[-0.38, 0, 0.38].map((y) => (
              <mesh key={y} position={[-0.355, y, 1.05]} material={graphite}>
                <cylinderGeometry args={[0.022, 0.022, 0.12, 10]} />
              </mesh>
            ))}
          </group>
          <mesh ref={hatchLightRef} position={[0, 0.66, 1.03]} userData={{ dynamic: true }}>
            <boxGeometry args={[0.7, 0.05, 0.03]} />
            <meshBasicMaterial color={PALETTE.starGlow} transparent opacity={0.2} toneMapped={false} />
          </mesh>
          {/* Lit cabin seen through the open hatch, revealed as the door slides aside.
              Tried as a modelled recess with side walls; the walls occluded the lamp and
              the doorway went black, so this stays a lit face with the frame around it
              supplying the depth. */}
          <mesh ref={hatchGlowRef} position={[0, 0, 0.94]} userData={{ dynamic: true }}>
            <planeGeometry args={[0.66, 1.06]} />
            <meshBasicMaterial color={PALETTE.screenGlow} transparent opacity={0} toneMapped={false} />
          </mesh>
          <pointLight ref={hatchLampRef} color={PALETTE.starGlow} intensity={0} distance={4.5} decay={2} position={[0, 0.1, 1.3]} />
        </group>
        {/* Ladder: rails, rungs and the standoffs that carry it off the hull */}
        {[1.75, 1.95, 2.15, 2.35].map((y) => (
          <mesh key={y} position={[0, y, 1.06]} rotation={[0, 0, Math.PI / 2]} material={graphite}>
            <cylinderGeometry args={[0.025, 0.025, 0.5, 10]} />
          </mesh>
        ))}
        {[-0.25, 0.25].map((x) => (
          <group key={x}>
            <mesh position={[x, 2.05, 1.06]} material={graphite}>
              <cylinderGeometry args={[0.022, 0.022, 0.84, 10]} />
            </mesh>
            {[1.68, 2.42].map((y) => (
              <mesh key={y} position={[x, y, 1.03]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
                <cylinderGeometry args={[0.016, 0.016, 0.06, 8]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Porthole: glass in a proud ring, bolted round */}
        <mesh position={[0, 4.55, 0.98]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
          <cylinderGeometry args={[0.3, 0.3, 0.1, 40]} />
        </mesh>
        <mesh position={[0, 4.55, 1.035]} material={graphite}>
          <torusGeometry args={[0.255, 0.035, 12, 40]} />
        </mesh>
        <mesh position={[0, 4.55, 1.02]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
          <cylinderGeometry args={[0.22, 0.22, 0.06, 40]} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.255, 4.55 + Math.sin(a) * 0.255, 1.07]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
              <cylinderGeometry args={[0.013, 0.013, 0.012, 8]} />
            </mesh>
          );
        })}
        {/* Cockpit window band near the top */}
        <group position={[0, 5.1, 0.93]} rotation={[0.2, 0, 0]}>
          <mesh geometry={geo.windowFrame} position={[0, 0, -0.02]} material={graphite} />
          <mesh geometry={geo.windowGlass} material={glass} />
          {/* Centre mullion, as on the cabin's own forward window. */}
          <mesh position={[0, 0, 0.062]} material={graphite}>
            <boxGeometry args={[0.025, 0.28, 0.01]} />
          </mesh>
        </group>
        {/* Nav light strip */}
        <mesh position={[0, 2.62, 1.01]} material={strip}>
          <boxGeometry args={[0.5, 0.03, 0.02]} />
        </mesh>
        {/* Engine flame (scaled by thrust) */}
        <group position={[0, 0.3, 0]} userData={{ dynamic: true }}>
          <mesh ref={flameRef} position={[0, -1.1, 0]} rotation={[Math.PI, 0, 0]} material={flame}>
            <coneGeometry args={[0.5, 2.4, 32, 1, true]} />
          </mesh>
          <mesh ref={flameCoreRef} position={[0, -0.7, 0]} rotation={[Math.PI, 0, 0]} material={flameCore}>
            <coneGeometry args={[0.28, 1.5, 24, 1, true]} />
          </mesh>
          <pointLight ref={engineLightRef} color={PALETTE.starEdge} intensity={0} distance={40} decay={2} position={[0, -0.6, 0]} />
        </group>
      </group>
    </group>
  );
}

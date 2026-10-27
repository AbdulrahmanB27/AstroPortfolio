import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CatmullRomCurve3,
  Color,
  DataTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../lib/constants';
import { STAGE_FRAME } from '../../lib/stageFrame';
import { useApp } from '../../state/store';
import { handles } from '../rig';
import { batchStatic } from '../staticBatch';

/**
 * Stylized EVA suit, ~1.75 units tall, feet on the ground, facing the star.
 *
 * Built from the parts that exist because a suit works, not from an outline:
 *  - stands on  : boot soles that meet the shins through an ankle cuff, plus a contact disc
 *  - joined by  : neck ring, waist ring, shoulder bearings, wrist and ankle cuffs
 *  - moves at   : knee and elbow convolute rings (these also catch the key light like bevels)
 *  - worn via   : PLSS backpack with real thickness, shoulder straps running to the chest
 *  - operated at: chest control module with switches, the umbilical hose that feeds it, and
 *                 a wrist computer on the left forearm
 *  - handled by : gloves with a palm pad, the fingers held together and a thumb
 *  - carries    : thigh pockets, and pouches on a belt at the waist
 *  - breathes   : a pack with vent slats, a side control box, valve caps and straps on the tanks
 *  - protected  : a gold visor framed by the helmet's hard shell, over the clear bubble
 *  - lit by     : helmet lamps either side, and a helmet camera
 *  - walks on   : boots with a heel block and tread under the sole
 *  - secured by : a hip tether ring (the same ring the comedic launch hooks onto)
 *
 * Every cuff and ring is a torus and every hard box is rounded, so edges take a highlight
 * instead of terminating in a zero-width seam. The figure is seen mostly from behind and at
 * a hundred pixels tall, so the detail that matters is the silhouette: the pack's antenna, the
 * hose looping round the waist, the lamps on the helmet.
 *
 * It also breathes. A figure that holds perfectly still for as long as someone reads the menu
 * reads as a statue; a slow rise and fall, a shift of weight and an occasional look along the
 * horizon read as someone standing there. All of it runs on an inner group, so the comedic
 * launch can still take the whole figure by `handles.astronaut`, and none of it runs for a
 * visitor who has asked for reduced motion.
 */

type Vec3 = [number, number, number];

/** The visor's window in the helmet shell: radians either side of straight ahead, and from the crown. */
const VISOR_HALF = 1.05;
const VISOR_TOP = 0.52;
const VISOR_BOTTOM = 1.82;
/** Shell patches round the visor, as sphere ranges: phi, phiLength, theta, thetaLength, segments. */
const HELMET_SHELL: [number, number, number, number, number, number][] = [
  // The back half.
  [0, Math.PI, 0, Math.PI, 16, 20],
  // Left and right cheeks, from the side of the head to the visor's edge.
  [-Math.PI, Math.PI / 2 - VISOR_HALF, 0, Math.PI, 5, 20],
  [-Math.PI / 2 + VISOR_HALF, Math.PI / 2 - VISOR_HALF, 0, Math.PI, 5, 20],
  // Brow and chin, across the front above and below the visor.
  [-Math.PI / 2 - VISOR_HALF, VISOR_HALF * 2, 0, VISOR_TOP, 16, 4],
  [-Math.PI / 2 - VISOR_HALF, VISOR_HALF * 2, VISOR_BOTTOM, Math.PI - VISOR_BOTTOM, 16, 8],
];

/**
 * What the visor and the suit's metal reflect: a dark sky, the warm line of the horizon, the
 * ground, and the star.
 *
 * Without anything to reflect, a metal surface renders as its specular highlight on black. The
 * gold visor was a flat dark-grey dome, and the shoulder bearings read as two black balls. The
 * figure stands still, so a fixed picture of where it stands is all the reflection it needs:
 * painted once into a small texture, in world space, rather than rendered by a cube camera.
 */
function suitEnvironment(toStar: Vector3, up: Vector3): DataTexture {
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  const d = new Vector3();
  const mix = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  for (let j = 0; j < h; j++) {
    // Row 0 is the bottom of the texture (DataTexture is not flipped): elevation -90 degrees.
    const lat = ((j + 0.5) / h - 0.5) * Math.PI;
    for (let i = 0; i < w; i++) {
      // The inverse of three's equirect lookup: u = atan2(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5.
      const lon = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const e = d.dot(up);
      let r: number, g: number, b: number;
      if (e >= 0) {
        // Sky: a warm haze on the horizon, navy above it, near black overhead.
        const k = Math.pow(e, 0.45);
        r = mix(120, 8, k);
        g = mix(84, 12, k);
        b = mix(52, 26, k);
      } else {
        // Ground: lit regolith near the horizon, falling into shadow underfoot.
        const k = Math.pow(-e, 0.6);
        r = mix(96, 26, k);
        g = mix(72, 20, k);
        b = mix(50, 15, k);
      }
      // The star, and the glow it throws round itself.
      const s = d.dot(toStar);
      const core = Math.max(0, (s - 0.985) / 0.015);
      const halo = Math.pow(Math.max(0, s), 18) * 0.7;
      r = Math.min(255, r + 255 * (core + halo));
      g = Math.min(255, g + 230 * core + 170 * halo);
      b = Math.min(255, b + 200 * core + 90 * halo);
      const o = (j * w + i) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, w, h);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function suitMaterials() {
  const suit = new MeshStandardMaterial({ color: PALETTE.suitWhite, roughness: 0.66, metalness: 0.02 });
  // Soft goods (joints, straps) read darker than the hard shell.
  const soft = new MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.9, metalness: 0 });
  const dark = new MeshStandardMaterial({ color: '#2b2f38', roughness: 0.72, metalness: 0.18 });
  const metal = new MeshStandardMaterial({ color: '#8d939c', roughness: 0.38, metalness: 0.75 });
  const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, metalness: 0.08 });
  const visor = new MeshPhysicalMaterial({
    color: '#d79c3c',
    roughness: 0.08,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const bubble = new MeshPhysicalMaterial({
    color: '#dfe7f2',
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    clearcoat: 1,
  });
  const shadow = new MeshStandardMaterial({ color: '#000000', transparent: true, opacity: 0.38, roughness: 1, side: DoubleSide });
  // The lamp lenses and the beacon: not tone mapped, so they read as lights.
  const lamp = new MeshBasicMaterial({ color: new Color('#fff1d6').multiplyScalar(1.1), toneMapped: false });
  const beacon = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.4 });
  // The wrist computer's display: lit, but dimmer than a lamp.
  const screen = new MeshBasicMaterial({ color: new Color(PALETTE.screenGlow).multiplyScalar(0.55), toneMapped: false });
  return { suit, soft, dark, metal, accent, visor, bubble, shadow, lamp, beacon, screen };
}

function suitGeometry() {
  const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);
  // The umbilical: from the side of the pack, down round the waist, into the chest module.
  const hose = new TubeGeometry(
    new CatmullRomCurve3([
      // Close to the body all the way round. At 7cm off the hip it stood out from the suit as
      // a loop, and from the camera read as a handle.
      new Vector3(0.19, 1.37, 0.24),
      new Vector3(0.255, 1.3, 0.12),
      new Vector3(0.27, 1.27, -0.05),
      new Vector3(0.2, 1.33, -0.22),
      new Vector3(0.08, 1.43, -0.29),
    ]),
    32,
    0.022,
    8,
    false,
  );
  return {
    palm: rb(0.13, 0.11, 0.065, 0.028),
    fingers: rb(0.055, 0.075, 0.125, 0.024),
    wristPad: rb(0.1, 0.07, 0.035, 0.012),
    pocket: rb(0.06, 0.15, 0.13, 0.02),
    pouch: rb(0.09, 0.08, 0.05, 0.015),
    heel: rb(0.2, 0.05, 0.1, 0.015),
    sideBox: rb(0.05, 0.16, 0.12, 0.015),
    sole: rb(0.225, 0.052, 0.38, 0.02),
    boot: rb(0.205, 0.135, 0.335, 0.045),
    toe: rb(0.19, 0.1, 0.08, 0.03),
    hips: rb(0.4, 0.2, 0.27, 0.07),
    chest: rb(0.27, 0.21, 0.075, 0.025),
    chestFace: rb(0.235, 0.175, 0.012, 0.005),
    pack: rb(0.375, 0.47, 0.17, 0.05),
    packLid: rb(0.36, 0.03, 0.158, 0.012),
    strap: rb(0.07, 0.42, 0.045, 0.018),
    patch: rb(0.11, 0.075, 0.012, 0.01),
    hose,
  };
}

type SuitMaterials = ReturnType<typeof suitMaterials>;
type SuitGeometry = ReturnType<typeof suitGeometry>;

/** One leg: boot, ankle cuff, shin, knee joint, thigh. `side` is -1 (left) or +1 (right). */
function Leg({ side, stance, m, geo }: { side: number; stance: number; m: SuitMaterials; geo: SuitGeometry }) {
  const { suit, soft, dark, metal, accent } = m;
  return (
    <group position={[side * 0.145, 0, stance]}>
      {/* Sole: a thin tread plate the boot sits on, proud at the toe only. */}
      <mesh geometry={geo.sole} position={[0, 0.026, -0.035]} material={dark} castShadow receiveShadow />
      {/* Boot upper: one form, tapering to the toe, with a rolled cuff on top. */}
      <mesh geometry={geo.boot} position={[0, 0.115, -0.02]} material={suit} castShadow receiveShadow />
      <mesh geometry={geo.toe} position={[0, 0.1, -0.19]} rotation={[0.42, 0, 0]} material={suit} castShadow />
      {/* Heel block, and tread grooves across the sole. */}
      <mesh geometry={geo.heel} position={[0, 0.03, 0.12]} material={dark} castShadow />
      {[-0.17, -0.09, -0.01].map((z) => (
        <mesh key={z} position={[0, 0.004, z]} material={metal}>
          <boxGeometry args={[0.2, 0.008, 0.018]} />
        </mesh>
      ))}
      {/* Ankle strap over the boot, buckled at the side. */}
      <mesh position={[0, 0.165, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={soft}>
        <torusGeometry args={[0.115, 0.012, 8, 28]} />
      </mesh>
      <mesh position={[side * 0.118, 0.165, -0.02]} material={metal}>
        <boxGeometry args={[0.012, 0.035, 0.045]} />
      </mesh>
      {/* Ankle cuff: joins boot to shin, no gap. */}
      <mesh position={[0, 0.2, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
        <torusGeometry args={[0.1, 0.022, 12, 28]} />
      </mesh>
      {/* Shin. A pressurised leg is a thick tube; at the old radius the figure stood on stilts
          under a torso twice their width. */}
      <mesh position={[0, 0.43, 0.01]} material={suit} castShadow>
        <capsuleGeometry args={[0.1, 0.3, 8, 20]} />
      </mesh>
      {/* Knee convolute: three close rings, the way a pressure joint actually flexes. */}
      {[0.655, 0.7, 0.745].map((y) => (
        <mesh key={y} position={[0, y, 0.005]} rotation={[Math.PI / 2, 0, 0]} material={soft} castShadow>
          <torusGeometry args={[0.105, 0.02, 10, 24]} />
        </mesh>
      ))}
      {/* Thigh, with a cargo pocket on its outer face. */}
      <mesh position={[0, 0.95, 0]} material={suit} castShadow>
        <capsuleGeometry args={[0.117, 0.26, 8, 20]} />
      </mesh>
      {/* Crew stripe above the knee, the way a suit is told apart from across a worksite. It is
          the one band of colour on the figure, and the one that reads from behind. */}
      <mesh position={[0, 0.86, 0]} material={accent}>
        <cylinderGeometry args={[0.1195, 0.1195, 0.04, 24, 1, true]} />
      </mesh>
      <mesh geometry={geo.pocket} position={[side * 0.113, 0.93, 0.01]} material={soft} castShadow />
      <mesh position={[side * 0.145, 0.985, 0.01]} material={dark}>
        <boxGeometry args={[0.006, 0.025, 0.1]} />
      </mesh>
    </group>
  );
}

/** One arm, posed by the caller. */
function Arm({
  side,
  rotation,
  forearm,
  swayRef,
  m,
  geo,
}: {
  side: number;
  rotation: Vec3;
  forearm: Vec3;
  swayRef: React.RefObject<Group | null>;
  m: SuitMaterials;
  geo: SuitGeometry;
}) {
  const { suit, soft, dark, metal, accent, screen } = m;
  return (
    <group position={[side * 0.285, 1.665, 0]} rotation={rotation}>
      <group ref={swayRef} userData={{ batch: true }}>
        {/* Shoulder: the suit's own fabric over the joint, and the bearing ring where the arm
            meets the hard torso. A bare metal sphere here read as a black ball on each side. */}
        <mesh position={[0, -0.03, 0]} material={suit} castShadow>
          <sphereGeometry args={[0.09, 20, 16]} />
        </mesh>
        <mesh position={[0, -0.065, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
          <torusGeometry args={[0.086, 0.016, 10, 24]} />
        </mesh>
        {/* Upper arm */}
        <mesh position={[0, -0.185, 0]} material={suit} castShadow>
          <capsuleGeometry args={[0.085, 0.19, 8, 18]} />
        </mesh>
        {/* Mission patch on the left shoulder, facing out. */}
        {side < 0 && <mesh geometry={geo.patch} position={[-0.083, -0.13, 0]} rotation={[0, -Math.PI / 2, 0]} material={accent} />}
        {/* Elbow convolute */}
        {[-0.3, -0.335].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={soft} castShadow>
            <torusGeometry args={[0.086, 0.018, 10, 22]} />
          </mesh>
        ))}
        <group position={[0, -0.35, 0]} rotation={forearm}>
          {/* Forearm */}
          <mesh position={[0, -0.16, 0]} material={suit} castShadow>
            <capsuleGeometry args={[0.076, 0.16, 8, 18]} />
          </mesh>
          {/* Wrist computer on the left forearm, screen out. */}
          {side < 0 && (
            <group position={[-0.07, -0.17, 0]} rotation={[0, 0, Math.PI / 2]}>
              <mesh geometry={geo.wristPad} material={dark} castShadow />
              <mesh position={[0, 0, 0.02]} rotation={[0, 0, 0]} material={screen}>
                <planeGeometry args={[0.07, 0.045]} />
              </mesh>
            </group>
          )}
          {/* Wrist ring + glove: a palm, four fingers curled a little, and a thumb. */}
          <mesh position={[0, -0.285, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
            <torusGeometry args={[0.072, 0.018, 10, 22]} />
          </mesh>
          {/* The glove is the suit's soft goods, not a dark claw: four fingers held together and
              curled in a little, the way a pressurised glove rests, with a darker grip pad. At
              a hundred pixels, four thin dark capsules splayed apart read as talons. */}
          <mesh geometry={geo.palm} position={[0, -0.355, 0]} rotation={[0, Math.PI / 2, 0]} material={soft} castShadow />
          <mesh geometry={geo.fingers} position={[side * -0.01, -0.43, 0]} rotation={[0, 0, side * -0.28]} material={soft} castShadow />
          {/* Grip pad on the palm, which faces the thigh. */}
          <mesh position={[side * -0.034, -0.36, 0]} rotation={[0, Math.PI / 2, 0]} material={dark}>
            <boxGeometry args={[0.09, 0.07, 0.006]} />
          </mesh>
          <mesh position={[side * -0.05, -0.37, -0.055]} rotation={[0.6, 0, side * 0.5]} material={soft} castShadow>
            <capsuleGeometry args={[0.019, 0.045, 4, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function Astronaut(props: { position: readonly [number, number, number]; rotation?: Vec3 }) {
  const ref = useRef<Group>(null);
  const poseRef = useRef<Group>(null);
  const upperRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const armLRef = useRef<Group>(null);
  const armRRef = useRef<Group>(null);

  const mats = useMemo(suitMaterials, []);
  const geo = useMemo(suitGeometry, []);

  useEffect(() => {
    if (ref.current) handles.astronaut = ref.current;
    return () => {
      delete handles.astronaut;
    };
  }, []);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // The visor and the metal fittings reflect where the figure is actually standing.
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    group.updateWorldMatrix(true, false);
    // The star sits at the world origin.
    const toStar = group.getWorldPosition(new Vector3()).negate().normalize();
    const env = suitEnvironment(toStar, STAGE_FRAME.up);
    mats.visor.envMap = env;
    mats.visor.envMapIntensity = 2.1;
    mats.metal.envMap = env;
    mats.metal.envMapIntensity = 0.9;
    mats.visor.needsUpdate = true;
    mats.metal.needsUpdate = true;
    return () => {
      mats.visor.envMap = null;
      mats.metal.envMap = null;
      env.dispose();
    };
  }, [mats]);
  // A hundred-odd parts, drawn twice a frame (once for the sun's shadow), in five groups that
  // move: one draw call per material per group. See `staticBatch`.
  useLayoutEffect(() => (ref.current ? batchStatic(ref.current) : undefined), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  // Its own clock: R3F's restarts from zero whenever the frame loop changes mode.
  const clock = useRef(0);
  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1);
    const t = clock.current;
    // Reduced motion: hold the authored pose, and keep the beacon steady rather than blinking.
    if (useApp.getState().reducedMotion) {
      mats.beacon.opacity = 0.7;
      return;
    }
    // Breathing: the upper body rises and falls a few millimetres.
    if (upperRef.current) upperRef.current.position.y = Math.sin(t * 1.6) * 0.006;
    // Weight shift from foot to foot, slower than the breath.
    if (poseRef.current) poseRef.current.rotation.z = Math.sin(t * 0.42) * 0.012;
    // Looking along the horizon: mostly still, with a slow glance either way.
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.21) * 0.22 + Math.sin(t * 0.67) * 0.04;
      headRef.current.rotation.x = Math.sin(t * 0.33) * 0.035 - 0.02;
    }
    if (armLRef.current) armLRef.current.rotation.z = Math.sin(t * 0.8 + 1) * 0.02;
    if (armRRef.current) armRRef.current.rotation.z = Math.sin(t * 0.8) * 0.02;
    // The beacon: a short blink every two and a half seconds.
    mats.beacon.opacity = (t % 2.5) < 0.18 ? 1 : 0.25;
  });

  const { suit, soft, dark, metal, accent, visor, bubble, shadow, lamp, beacon } = mats;

  return (
    <group ref={ref} position={[props.position[0], props.position[1], props.position[2]]} rotation={props.rotation} name="astronaut">
      {/* Contact shadow so the figure is planted, not hovering. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shadow}>
        <circleGeometry args={[0.42, 32]} />
      </mesh>

      <group scale={0.8}>
        <group ref={poseRef} userData={{ batch: true }}>
          <Leg side={-1} stance={-0.03} m={mats} geo={geo} />
          <Leg side={1} stance={0.04} m={mats} geo={geo} />

          {/* Hips + waist ring joining the lower torso to the hard upper torso. */}
          <mesh geometry={geo.hips} position={[0, 1.145, 0]} material={suit} castShadow />
          <mesh position={[0, 1.255, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
            <torusGeometry args={[0.205, 0.028, 12, 36]} />
          </mesh>
          {/* Hip tether ring — the anchor the runaway launch hooks onto. */}
          <mesh position={[0.215, 1.2, 0.02]} rotation={[0, 0, Math.PI / 2]} material={metal} castShadow>
            <torusGeometry args={[0.045, 0.014, 10, 20]} />
          </mesh>
          {/* Belt pouches at the back and left hip. */}
          {[
            { x: -0.21, z: 0.02, r: -Math.PI / 2 },
            { x: -0.11, z: 0.14, r: -0.5 },
            { x: 0.11, z: 0.14, r: 0.5 },
          ].map((p) => (
            <mesh key={p.x} geometry={geo.pouch} position={[p.x, 1.16, p.z]} rotation={[0, p.r, 0]} material={soft} castShadow />
          ))}

          <group ref={upperRef} userData={{ batch: true }}>
            {/* Hard upper torso: tapered shell, not a bare capsule. */}
            <mesh position={[0, 1.5, 0]} material={suit} castShadow receiveShadow>
              <cylinderGeometry args={[0.255, 0.225, 0.46, 32]} />
            </mesh>
            <mesh position={[0, 1.73, 0]} material={suit} castShadow>
              <sphereGeometry args={[0.255, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            {/* Chest control module: switches and an umbilical connector. */}
            <mesh geometry={geo.chest} position={[0, 1.5, -0.235]} material={dark} castShadow />
            <mesh geometry={geo.chestFace} position={[0, 1.5, -0.275]} material={soft} />
            {[-0.07, 0, 0.07].map((x) => (
              <mesh key={x} position={[x, 1.545, -0.285]} material={accent}>
                <boxGeometry args={[0.038, 0.026, 0.012]} />
              </mesh>
            ))}
            <mesh position={[0.075, 1.435, -0.29]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 0.05, 14]} />
            </mesh>
            {/* The umbilical hose, pack to chest, round the right hip. */}
            <mesh geometry={geo.hose} material={soft} castShadow />

            {/* PLSS backpack: a real box with thickness, standing off the shell. */}
            <mesh geometry={geo.pack} position={[0, 1.52, 0.255]} material={suit} castShadow receiveShadow />
            {/* Chamfered lid and base: flush with the shell, so it reads as a fitted pack. */}
            <mesh geometry={geo.packLid} position={[0, 1.762, 0.255]} material={dark} castShadow />
            <mesh geometry={geo.packLid} position={[0, 1.278, 0.255]} material={dark} castShadow />
            {/* Oxygen tanks: clearly outside the shell, half-buried in it. */}
            {[-0.105, 0.105].map((x) => (
              <mesh key={x} position={[x, 1.505, 0.395]} material={metal} castShadow>
                <capsuleGeometry args={[0.052, 0.28, 8, 18]} />
              </mesh>
            ))}
            <mesh position={[0, 1.78, 0.3]} material={metal} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.055, 14]} />
            </mesh>
            {/* Valve caps on the tanks, and the straps that hold them. */}
            {[-0.105, 0.105].map((x) => (
              <group key={`tank-${x}`}>
                <mesh position={[x, 1.715, 0.395]} material={dark} castShadow>
                  <cylinderGeometry args={[0.022, 0.03, 0.04, 12]} />
                </mesh>
                {[1.42, 1.6].map((y) => (
                  <mesh key={y} position={[x, y, 0.395]} rotation={[Math.PI / 2, 0, 0]} material={dark}>
                    <torusGeometry args={[0.055, 0.008, 6, 20]} />
                  </mesh>
                ))}
              </group>
            ))}
            {/* Vent slats on the pack, between the tanks. */}
            {[1.36, 1.39, 1.42, 1.45].map((y) => (
              <mesh key={y} position={[0, y, 0.343]} material={dark}>
                <boxGeometry args={[0.07, 0.012, 0.006]} />
              </mesh>
            ))}
            {/* Control box on the pack's right side, with a dial. */}
            <mesh geometry={geo.sideBox} position={[0.2, 1.5, 0.25]} material={dark} castShadow />
            <mesh position={[0.228, 1.53, 0.25]} rotation={[0, 0, Math.PI / 2]} material={metal}>
              <cylinderGeometry args={[0.022, 0.022, 0.014, 14]} />
            </mesh>
            <mesh position={[0.227, 1.46, 0.25]} rotation={[0, Math.PI / 2, 0]} material={accent}>
              <planeGeometry args={[0.03, 0.02]} />
            </mesh>
            {/* Antenna off the pack's top corner, with a beacon that blinks. It is the one
                feature that breaks the figure's outline against the sky. */}
            <mesh position={[-0.14, 1.95, 0.3]} rotation={[0.08, 0, 0.06]} material={dark} castShadow>
              <cylinderGeometry args={[0.008, 0.012, 0.38, 8]} />
            </mesh>
            <mesh position={[-0.151, 2.14, 0.315]} material={beacon}>
              <sphereGeometry args={[0.018, 10, 8]} />
            </mesh>
            {/* Shoulder straps: the pack is worn, not floating. */}
            {[-1, 1].map((side) => (
              <mesh key={side} geometry={geo.strap} position={[side * 0.165, 1.615, 0.035]} rotation={[0.4, 0, 0]} material={soft} castShadow />
            ))}

            {/* Both arms rest, slightly clear of the pressurised torso, with a little
                asymmetry so the stance reads as a person standing rather than a mannequin. */}
            <Arm side={-1} rotation={[0.1, 0, 0.26]} forearm={[0.4, 0, 0]} swayRef={armLRef} m={mats} geo={geo} />
            <Arm side={1} rotation={[-0.14, 0, -0.2]} forearm={[0.62, 0, -0.12]} swayRef={armRRef} m={mats} geo={geo} />

            {/* Neck ring, then the head: helmet bubble, gold visor, brow shade, lamps. */}
            <mesh position={[0, 1.845, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
              <torusGeometry args={[0.132, 0.028, 12, 32]} />
            </mesh>
            <group ref={headRef} position={[0, 1.86, 0]} userData={{ batch: true }}>
              {/* The clear pressure bubble. Only its gloss shows, over the visor. */}
              <mesh position={[0, 0.145, 0]} material={bubble}>
                <sphereGeometry args={[0.212, 32, 26]} />
              </mesh>
              {/* Gold visor, set into a window in the shell. Sphere phi = -PI/2 points at -Z. */}
              <mesh position={[0, 0.145, 0]} material={visor}>
                <sphereGeometry args={[0.206, 28, 18, -Math.PI / 2 - VISOR_HALF, VISOR_HALF * 2, VISOR_TOP, VISOR_BOTTOM - VISOR_TOP]} />
              </mesh>
              {/*
                The hard shell round it: the back, both cheeks, the brow and the chin, standing
                just proud of the visor so the opening has an edge. This replaced a rear
                hemisphere with a separate sunshade band: from the front the band read as the
                peak of a cap, and the visor ran into the top of the helmet with nothing round it.
              */}
              {HELMET_SHELL.map(([phi, phiLength, theta, thetaLength, w, h], i) => (
                <mesh key={i} position={[0, 0.145, 0]} material={suit} castShadow>
                  <sphereGeometry args={[0.215, w, h, phi, phiLength, theta, thetaLength]} />
                </mesh>
              ))}
              {/* Helmet lamps on the cheeks, lenses forward. */}
              {[-1, 1].map((side) => (
                <group key={side} position={[side * 0.222, 0.2, -0.04]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]} material={dark} castShadow>
                    <cylinderGeometry args={[0.032, 0.036, 0.09, 14]} />
                  </mesh>
                  {/* Facing -Z. Rotated about X it lay flat along the housing and was never seen. */}
                  <mesh position={[0, 0, -0.047]} rotation={[0, Math.PI, 0]} material={lamp}>
                    <circleGeometry args={[0.026, 14]} />
                  </mesh>
                </group>
              ))}
              {/* Helmet camera on the right lamp's housing. */}
              <mesh position={[0.19, 0.28, -0.02]} material={metal} castShadow>
                <boxGeometry args={[0.045, 0.04, 0.07]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

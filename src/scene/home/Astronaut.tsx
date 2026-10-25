import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, DoubleSide, Group, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, TubeGeometry, Vector3, Color } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../lib/constants';
import { useApp } from '../../state/store';
import { handles } from '../rig';

/**
 * Stylized EVA suit, ~1.75 units tall, feet on the ground, facing the star.
 *
 * Built from the parts that exist because a suit works, not from an outline:
 *  - stands on  : boot soles that meet the shins through an ankle cuff, plus a contact disc
 *  - joined by  : neck ring, waist ring, shoulder bearings, wrist and ankle cuffs
 *  - moves at   : knee and elbow convolute rings (these also catch the key light like bevels)
 *  - worn via   : PLSS backpack with real thickness, shoulder straps running to the chest
 *  - operated at: chest control module with switches, and the umbilical hose that feeds it
 *  - protected  : gold visor shell over the helmet bubble, under a brow sunshade
 *  - lit by     : helmet lamps either side, and a helmet camera
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

export function Astronaut(props: { position: readonly [number, number, number]; rotation?: Vec3 }) {
  const ref = useRef<Group>(null);
  const poseRef = useRef<Group>(null);
  const upperRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const armLRef = useRef<Group>(null);
  const armRRef = useRef<Group>(null);

  const mats = useMemo(() => {
    const suit = new MeshStandardMaterial({ color: PALETTE.suitWhite, roughness: 0.66, metalness: 0.02 });
    // Soft goods (joints, straps) read darker than the hard shell.
    const soft = new MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.9, metalness: 0 });
    const dark = new MeshStandardMaterial({ color: '#2b2f38', roughness: 0.72, metalness: 0.18 });
    const metal = new MeshStandardMaterial({ color: '#8d939c', roughness: 0.38, metalness: 0.75 });
    const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, metalness: 0.08 });
    const visor = new MeshPhysicalMaterial({
      color: '#c98a2e',
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
    return { suit, soft, dark, metal, accent, visor, bubble, shadow, lamp, beacon };
  }, []);

  const geo = useMemo(() => {
    const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);
    // The umbilical: from the side of the pack, down round the waist, into the chest module.
    const hose = new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0.19, 1.36, 0.25),
        new Vector3(0.3, 1.22, 0.14),
        new Vector3(0.31, 1.2, -0.08),
        new Vector3(0.2, 1.3, -0.27),
        new Vector3(0.08, 1.43, -0.3),
      ]),
      32,
      0.022,
      8,
      false,
    );
    return {
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
  }, []);

  useEffect(() => {
    if (ref.current) handles.astronaut = ref.current;
    return () => {
      delete handles.astronaut;
    };
  }, []);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
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

  /** One leg: boot, ankle cuff, shin, knee joint, thigh. `side` is -1 (left) or +1 (right). */
  const Leg = ({ side, stance }: { side: number; stance: number }) => (
    <group position={[side * 0.145, 0, stance]}>
      {/* Sole: a thin tread plate the boot sits on, proud at the toe only. */}
      <mesh geometry={geo.sole} position={[0, 0.026, -0.035]} material={dark} castShadow receiveShadow />
      {/* Boot upper: one form, tapering to the toe, with a rolled cuff on top. */}
      <mesh geometry={geo.boot} position={[0, 0.115, -0.02]} material={suit} castShadow receiveShadow />
      <mesh geometry={geo.toe} position={[0, 0.1, -0.19]} rotation={[0.42, 0, 0]} material={suit} castShadow />
      {/* Ankle cuff: joins boot to shin, no gap. */}
      <mesh position={[0, 0.2, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
        <torusGeometry args={[0.095, 0.022, 12, 28]} />
      </mesh>
      {/* Shin */}
      <mesh position={[0, 0.43, 0.01]} material={suit} castShadow>
        <capsuleGeometry args={[0.093, 0.3, 8, 20]} />
      </mesh>
      {/* Knee convolute: three close rings, the way a pressure joint actually flexes. */}
      {[0.655, 0.7, 0.745].map((y) => (
        <mesh key={y} position={[0, y, 0.005]} rotation={[Math.PI / 2, 0, 0]} material={soft} castShadow>
          <torusGeometry args={[0.098, 0.02, 10, 24]} />
        </mesh>
      ))}
      {/* Thigh */}
      <mesh position={[0, 0.95, 0]} material={suit} castShadow>
        <capsuleGeometry args={[0.108, 0.26, 8, 20]} />
      </mesh>
    </group>
  );

  /** One arm, posed by the caller. */
  const Arm = ({ side, rotation, forearm, swayRef }: { side: number; rotation: Vec3; forearm: Vec3; swayRef: React.RefObject<Group | null> }) => (
    <group position={[side * 0.285, 1.665, 0]} rotation={rotation}>
      <group ref={swayRef}>
        {/* Shoulder bearing */}
        <mesh material={metal} castShadow>
          <sphereGeometry args={[0.098, 20, 16]} />
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
          {/* Wrist ring + glove: a hand that could grip something. */}
          <mesh position={[0, -0.285, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
            <torusGeometry args={[0.072, 0.018, 10, 22]} />
          </mesh>
          <mesh position={[0, -0.345, 0]} material={dark} castShadow>
            <sphereGeometry args={[0.081, 18, 14]} />
          </mesh>
          <mesh position={[0.015, -0.375, -0.035]} rotation={[0.5, 0, 0]} material={dark} castShadow>
            <capsuleGeometry args={[0.03, 0.05, 6, 12]} />
          </mesh>
        </group>
      </group>
    </group>
  );

  return (
    <group ref={ref} position={[props.position[0], props.position[1], props.position[2]]} rotation={props.rotation} name="astronaut">
      {/* Contact shadow so the figure is planted, not hovering. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shadow}>
        <circleGeometry args={[0.42, 32]} />
      </mesh>

      <group scale={0.8}>
        <group ref={poseRef}>
          <Leg side={-1} stance={-0.03} />
          <Leg side={1} stance={0.04} />

          {/* Hips + waist ring joining the lower torso to the hard upper torso. */}
          <mesh geometry={geo.hips} position={[0, 1.145, 0]} material={suit} castShadow />
          <mesh position={[0, 1.255, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
            <torusGeometry args={[0.205, 0.028, 12, 36]} />
          </mesh>
          {/* Hip tether ring — the anchor the runaway launch hooks onto. */}
          <mesh position={[0.215, 1.2, 0.02]} rotation={[0, 0, Math.PI / 2]} material={metal} castShadow>
            <torusGeometry args={[0.045, 0.014, 10, 20]} />
          </mesh>

          <group ref={upperRef}>
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
            <Arm side={-1} rotation={[0.1, 0, 0.26]} forearm={[0.4, 0, 0]} swayRef={armLRef} />
            <Arm side={1} rotation={[-0.14, 0, -0.2]} forearm={[0.62, 0, -0.12]} swayRef={armRRef} />

            {/* Neck ring, then the head: helmet bubble, gold visor, brow shade, lamps. */}
            <mesh position={[0, 1.845, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
              <torusGeometry args={[0.132, 0.028, 12, 32]} />
            </mesh>
            <group ref={headRef} position={[0, 1.86, 0]}>
              <mesh position={[0, 0.145, 0]} material={bubble} castShadow>
                <sphereGeometry args={[0.212, 32, 26]} />
              </mesh>
              {/* Gold visor over the front hemisphere. Sphere phi = -PI/2 points at -Z, so the
                  visor spans phi -PI..0 and the opaque rear shell spans 0..PI. */}
              <mesh position={[0, 0.145, 0]} material={visor} castShadow>
                <sphereGeometry args={[0.206, 32, 26, -Math.PI, Math.PI, 0.42, Math.PI * 0.5]} />
              </mesh>
              {/* Back of the helmet is opaque shell, not glass. */}
              <mesh position={[0, 0.145, 0]} material={suit} castShadow>
                <sphereGeometry args={[0.207, 32, 26, 0, Math.PI, 0, Math.PI]} />
              </mesh>
              {/* Brow sunshade */}
              <mesh position={[0, 0.275, -0.03]} rotation={[0.38, 0, 0]} material={suit} castShadow>
                <cylinderGeometry args={[0.192, 0.192, 0.032, 28, 1, false, Math.PI, Math.PI]} />
              </mesh>
              {/* Helmet lamps, one each side, lenses forward. */}
              {[-1, 1].map((side) => (
                <group key={side} position={[side * 0.205, 0.2, -0.04]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]} material={dark} castShadow>
                    <cylinderGeometry args={[0.032, 0.036, 0.09, 14]} />
                  </mesh>
                  <mesh position={[0, 0, -0.047]} rotation={[Math.PI / 2, 0, 0]} material={lamp}>
                    <circleGeometry args={[0.026, 14]} />
                  </mesh>
                </group>
              ))}
              {/* Helmet camera on the right lamp's housing. */}
              <mesh position={[0.2, 0.265, -0.02]} material={metal} castShadow>
                <boxGeometry args={[0.045, 0.04, 0.07]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

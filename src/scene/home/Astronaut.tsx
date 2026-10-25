import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, Group, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { PALETTE } from '../../lib/constants';
import { handles } from '../rig';

/**
 * Stylized EVA suit, ~1.75 units tall, feet on the ground, facing the star.
 *
 * Built from the parts that exist because a suit works, not from an outline:
 *  - stands on  : boot soles that meet the shins through an ankle cuff, plus a contact disc
 *  - joined by  : neck ring, waist ring, shoulder bearings, wrist and ankle cuffs
 *  - moves at   : knee and elbow convolute rings (these also catch the key light like bevels)
 *  - worn via   : PLSS backpack with real thickness, shoulder straps running to the chest
 *  - operated at: chest control module with switches and an umbilical connector
 *  - protected  : gold visor shell over the helmet bubble, under a brow sunshade
 *  - secured by : a hip tether ring (the same ring the comedic launch hooks onto)
 *
 * Every cuff and ring is a torus rather than a hard cylinder cut, so edges take a highlight
 * instead of terminating in a zero-width seam.
 */

type Vec3 = [number, number, number];

export function Astronaut(props: { position: readonly [number, number, number]; rotation?: Vec3 }) {
  const ref = useRef<Group>(null);

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
    return { suit, soft, dark, metal, accent, visor, bubble, shadow };
  }, []);

  useEffect(() => {
    if (ref.current) handles.astronaut = ref.current;
    return () => {
      delete handles.astronaut;
    };
  }, []);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const { suit, soft, dark, metal, accent, visor, bubble, shadow } = mats;

  /** One leg: boot, ankle cuff, shin, knee joint, thigh. `side` is -1 (left) or +1 (right). */
  const Leg = ({ side, stance }: { side: number; stance: number }) => (
    <group position={[side * 0.145, 0, stance]}>
      {/* Sole: a thin tread plate the boot sits on, proud at the toe only. */}
      <mesh position={[0, 0.026, -0.035]} material={dark} castShadow receiveShadow>
        <boxGeometry args={[0.225, 0.052, 0.38]} />
      </mesh>
      {/* Boot upper: one form, tapering to the toe, with a rolled cuff on top. */}
      <mesh position={[0, 0.115, -0.02]} material={suit} castShadow receiveShadow>
        <boxGeometry args={[0.205, 0.135, 0.335]} />
      </mesh>
      <mesh position={[0, 0.10, -0.19]} rotation={[0.42, 0, 0]} material={suit} castShadow>
        <boxGeometry args={[0.19, 0.10, 0.08]} />
      </mesh>
      {/* Ankle cuff: joins boot to shin, no gap. */}
      <mesh position={[0, 0.20, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
        <torusGeometry args={[0.095, 0.022, 10, 22]} />
      </mesh>
      {/* Shin */}
      <mesh position={[0, 0.43, 0.01]} material={suit} castShadow>
        <capsuleGeometry args={[0.093, 0.30, 6, 16]} />
      </mesh>
      {/* Knee convolute: three close rings, the way a pressure joint actually flexes. */}
      {[0.655, 0.70, 0.745].map((y) => (
        <mesh key={y} position={[0, y, 0.005]} rotation={[Math.PI / 2, 0, 0]} material={soft} castShadow>
          <torusGeometry args={[0.098, 0.02, 8, 20]} />
        </mesh>
      ))}
      {/* Thigh */}
      <mesh position={[0, 0.95, 0]} material={suit} castShadow>
        <capsuleGeometry args={[0.108, 0.26, 6, 16]} />
      </mesh>
    </group>
  );

  /** One arm, posed by the caller. */
  const Arm = ({ side, rotation, forearm }: { side: number; rotation: Vec3; forearm: Vec3 }) => (
    <group position={[side * 0.285, 1.665, 0]} rotation={rotation}>
      {/* Shoulder bearing */}
      <mesh material={metal} castShadow>
        <sphereGeometry args={[0.098, 16, 14]} />
      </mesh>
      {/* Upper arm */}
      <mesh position={[0, -0.185, 0]} material={suit} castShadow>
        <capsuleGeometry args={[0.085, 0.19, 6, 14]} />
      </mesh>
      {/* Elbow convolute */}
      {[-0.30, -0.335].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={soft} castShadow>
          <torusGeometry args={[0.086, 0.018, 8, 18]} />
        </mesh>
      ))}
      <group position={[0, -0.35, 0]} rotation={forearm}>
        {/* Forearm */}
        <mesh position={[0, -0.16, 0]} material={suit} castShadow>
          <capsuleGeometry args={[0.076, 0.16, 6, 14]} />
        </mesh>
        {/* Wrist ring + glove: a hand that could grip something. */}
        <mesh position={[0, -0.285, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
          <torusGeometry args={[0.072, 0.018, 8, 18]} />
        </mesh>
        <mesh position={[0, -0.345, 0]} material={dark} castShadow>
          <sphereGeometry args={[0.081, 14, 12]} />
        </mesh>
        <mesh position={[0.015, -0.375, -0.035]} rotation={[0.5, 0, 0]} material={dark} castShadow>
          <capsuleGeometry args={[0.03, 0.05, 4, 10]} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={ref} position={[props.position[0], props.position[1], props.position[2]]} rotation={props.rotation} name="astronaut">
      {/* Contact shadow so the figure is planted, not hovering. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shadow}>
        <circleGeometry args={[0.42, 24]} />
      </mesh>

      <group scale={0.8}>
        <Leg side={-1} stance={-0.03} />
        <Leg side={1} stance={0.04} />

        {/* Hips + waist ring joining the lower torso to the hard upper torso. */}
        <mesh position={[0, 1.145, 0]} material={suit} castShadow>
          <boxGeometry args={[0.40, 0.20, 0.27]} />
        </mesh>
        <mesh position={[0, 1.255, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
          <torusGeometry args={[0.205, 0.028, 10, 28]} />
        </mesh>
        {/* Hip tether ring — the anchor the runaway launch hooks onto. */}
        <mesh position={[0.215, 1.20, 0.02]} rotation={[0, 0, Math.PI / 2]} material={metal} castShadow>
          <torusGeometry args={[0.045, 0.014, 8, 16]} />
        </mesh>

        {/* Hard upper torso: tapered shell, not a bare capsule. */}
        <mesh position={[0, 1.50, 0]} material={suit} castShadow receiveShadow>
          <cylinderGeometry args={[0.255, 0.225, 0.46, 24]} />
        </mesh>
        <mesh position={[0, 1.73, 0]} material={suit} castShadow>
          <sphereGeometry args={[0.255, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {/* Chest control module: switches and an umbilical connector. */}
        <mesh position={[0, 1.50, -0.235]} material={dark} castShadow>
          <boxGeometry args={[0.27, 0.21, 0.075]} />
        </mesh>
        <mesh position={[0, 1.50, -0.275]} material={soft}>
          <boxGeometry args={[0.235, 0.175, 0.012]} />
        </mesh>
        {[-0.07, 0, 0.07].map((x) => (
          <mesh key={x} position={[x, 1.545, -0.285]} material={accent}>
            <boxGeometry args={[0.038, 0.026, 0.012]} />
          </mesh>
        ))}
        <mesh position={[0.075, 1.435, -0.29]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.05, 12]} />
        </mesh>

        {/* PLSS backpack: a real box with thickness, standing off the shell. */}
        <mesh position={[0, 1.52, 0.255]} material={suit} castShadow receiveShadow>
          <boxGeometry args={[0.375, 0.47, 0.17]} />
        </mesh>
        {/* Chamfered lid and base: flush with the shell, so it reads as a fitted pack. */}
        <mesh position={[0, 1.762, 0.255]} material={dark} castShadow>
          <boxGeometry args={[0.36, 0.03, 0.158]} />
        </mesh>
        <mesh position={[0, 1.278, 0.255]} material={dark} castShadow>
          <boxGeometry args={[0.36, 0.028, 0.158]} />
        </mesh>
        {/* Oxygen tanks: clearly outside the shell, half-buried in it. */}
        {[-0.105, 0.105].map((x) => (
          <mesh key={x} position={[x, 1.505, 0.395]} material={metal} castShadow>
            <capsuleGeometry args={[0.052, 0.28, 6, 14]} />
          </mesh>
        ))}
        <mesh position={[0, 1.78, 0.30]} material={metal} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 0.055, 12]} />
        </mesh>
        {/* Shoulder straps: the pack is worn, not floating. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.165, 1.615, 0.035]} rotation={[0.40, 0, 0]} material={soft} castShadow>
            <boxGeometry args={[0.07, 0.42, 0.045]} />
          </mesh>
        ))}

        {/* Both arms rest, slightly clear of the pressurised torso, with a little
            asymmetry so the stance reads as a person standing rather than a mannequin. */}
        <Arm side={-1} rotation={[0.10, 0, 0.26]} forearm={[0.40, 0, 0]} />
        <Arm side={1} rotation={[-0.14, 0, -0.20]} forearm={[0.62, 0, -0.12]} />

        {/* Neck ring, helmet bubble, gold visor and brow shade. */}
        <mesh position={[0, 1.845, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal} castShadow>
          <torusGeometry args={[0.132, 0.028, 10, 24]} />
        </mesh>
        <mesh position={[0, 2.005, 0]} material={bubble} castShadow>
          <sphereGeometry args={[0.212, 26, 22]} />
        </mesh>
        {/* Gold visor over the front hemisphere. Sphere phi = -PI/2 points at -Z, so the
            visor spans phi -PI..0 and the opaque rear shell spans 0..PI. */}
        <mesh position={[0, 2.005, 0]} material={visor} castShadow>
          <sphereGeometry args={[0.206, 26, 22, -Math.PI, Math.PI, 0.42, Math.PI * 0.5]} />
        </mesh>
        {/* Back of the helmet is opaque shell, not glass. */}
        <mesh position={[0, 2.005, 0]} material={suit} castShadow>
          <sphereGeometry args={[0.207, 26, 22, 0, Math.PI, 0, Math.PI]} />
        </mesh>
        {/* Brow sunshade */}
        <mesh position={[0, 2.135, -0.03]} rotation={[0.38, 0, 0]} material={suit} castShadow>
          <cylinderGeometry args={[0.192, 0.192, 0.032, 20, 1, false, Math.PI, Math.PI]} />
        </mesh>
      </group>
    </group>
  );
}

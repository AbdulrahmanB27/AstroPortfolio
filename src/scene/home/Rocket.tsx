import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { PALETTE } from '../../lib/constants';
import { handles } from '../rig';
import { vehicleView } from './rocketState';

/**
 * Stylized rocket, ~7.5 units tall, standing on its pad with the origin at ground level.
 * The hatch faces +Z (toward the camera after the stage yaw). Sequences drive
 * `handles.rocket` (whole vehicle), `handles.rocketEngine.setThrust`, and the hatch.
 */

type Vec3 = [number, number, number];

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
    const nozzle = new MeshStandardMaterial({ color: '#1b1e25', roughness: 0.4, metalness: 0.7 });
    const glass = new MeshStandardMaterial({ color: '#0f1622', roughness: 0.2, metalness: 0.6, emissive: '#2a3a55', emissiveIntensity: 0.4 });
    // Above 1.0 on purpose: these materials are not tone mapped, so the bloom threshold of
    // 1.0 is a real ceiling. At the plain token value the plume sat exactly at the
    // threshold and bled nothing — the launch payoff rendered as a flat paper cone.
    const flame = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(1.45), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const flameCore = new MeshBasicMaterial({ color: new Color('#fff4dc').multiplyScalar(2.1), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const pad = new MeshStandardMaterial({ color: '#3a3733', roughness: 0.95 });
    const padRing = new MeshStandardMaterial({ color: '#5a554f', roughness: 0.9 });
    const strip = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(1.5), toneMapped: false });
    return { body, graphite, accent, nozzle, glass, flame, flameCore, pad, padRing, strip };
  }, []);

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

  const { body, graphite, accent, nozzle, glass, flame, flameCore, pad, padRing, strip } = mats;
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
              <cylinderGeometry args={[0.06, 0.07, 1.9, 10]} />
            </mesh>
            {/* Upper stay: starts outside the hull radius so it never pokes through it. */}
            <mesh position={[1.28, 1.18, 0]} rotation={[0, 0, -0.52]} material={graphite} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.78, 8]} />
            </mesh>
            <mesh position={[1.75, 0.16, 0]} material={graphite} castShadow receiveShadow>
              <cylinderGeometry args={[0.26, 0.3, 0.1, 14]} />
            </mesh>
          </group>
        ))}
        {/* Engine bell + skirt */}
        <mesh position={[0, 0.62, 0]} material={nozzle} castShadow>
          <cylinderGeometry args={[0.34, 0.6, 0.7, 24, 1, true]} />
        </mesh>
        <mesh position={[0, 0.98, 0]} material={graphite} castShadow>
          <cylinderGeometry args={[0.55, 0.42, 0.3, 24]} />
        </mesh>
        <mesh position={[0, 1.42, 0]} material={graphite} castShadow>
          <cylinderGeometry args={[1.02, 1.02, 0.6, 32]} />
        </mesh>
        {/* Body */}
        <mesh position={[0, 3.5, 0]} material={body} castShadow receiveShadow>
          <cylinderGeometry args={[1.0, 1.0, 3.6, 32]} />
        </mesh>
        <mesh position={[0, 5.62, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.72, 1.0, 0.65, 32]} />
        </mesh>
        <mesh position={[0, 6.7, 0]} material={body} castShadow>
          <coneGeometry args={[0.72, 1.55, 32]} />
        </mesh>
        <mesh position={[0, 7.3, 0]} material={accent} castShadow>
          <coneGeometry args={[0.2, 0.4, 20]} />
        </mesh>
        {/* Accent bands */}
        <mesh position={[0, 2.2, 0]} material={accent}>
          <cylinderGeometry args={[1.012, 1.012, 0.16, 32, 1, true]} />
        </mesh>
        <mesh position={[0, 5.3, 0]} material={graphite}>
          <cylinderGeometry args={[1.012, 1.012, 0.08, 32, 1, true]} />
        </mesh>
        {/* Fins */}
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]}>
            <mesh position={[1.35, 1.55, 0]} rotation={[0, 0, -0.35]} material={accent} castShadow>
              <boxGeometry args={[0.9, 1.4, 0.18]} />
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
        {/* Ladder rungs + step */}
        {[1.75, 1.95, 2.15, 2.35].map((y) => (
          <mesh key={y} position={[0, y, 1.03]} rotation={[0, 0, Math.PI / 2]} material={graphite}>
            <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
          </mesh>
        ))}
        {/* Porthole */}
        <mesh position={[0, 4.55, 0.98]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
          <cylinderGeometry args={[0.3, 0.3, 0.1, 24]} />
        </mesh>
        <mesh position={[0, 4.55, 1.02]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
          <cylinderGeometry args={[0.22, 0.22, 0.06, 24]} />
        </mesh>
        {/* Cockpit window band near the top */}
        <mesh position={[0, 5.1, 0.93]} rotation={[0.2, 0, 0]} material={glass}>
          <boxGeometry args={[0.9, 0.28, 0.12]} />
        </mesh>
        {/* Nav light strip */}
        <mesh position={[0, 2.62, 1.01]} material={strip}>
          <boxGeometry args={[0.5, 0.03, 0.02]} />
        </mesh>
        {/* Engine flame (scaled by thrust) */}
        <group position={[0, 0.3, 0]}>
          <mesh ref={flameRef} position={[0, -1.1, 0]} rotation={[Math.PI, 0, 0]} material={flame}>
            <coneGeometry args={[0.5, 2.4, 20, 1, true]} />
          </mesh>
          <mesh ref={flameCoreRef} position={[0, -0.7, 0]} rotation={[Math.PI, 0, 0]} material={flameCore}>
            <coneGeometry args={[0.28, 1.5, 16, 1, true]} />
          </mesh>
          <pointLight ref={engineLightRef} color={PALETTE.starEdge} intensity={0} distance={40} decay={2} position={[0, -0.6, 0]} />
        </group>
      </group>
    </group>
  );
}

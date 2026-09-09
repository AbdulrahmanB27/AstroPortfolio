import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { PALETTE } from '../../lib/constants';
import { flight } from './flightState';

/**
 * The player's default ship: a small stylized shuttle (~5.5 units long) in the same
 * white/graphite/amber language as the launch rocket. Nose points -Z; the engine plume
 * scales with the smoothed thrust value from the physics step.
 */
export function Ship() {
  const flameRef = useRef<Mesh>(null);
  const coreRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);

  const mats = useMemo(() => {
    // A whisper of cool emissive stands in for space fill so the hull never goes black
    // when the star is ahead of the ship (the chase camera mostly sees the tail).
    const fill = { emissive: '#1a2540', emissiveIntensity: 0.55 };
    const body = new MeshStandardMaterial({ color: PALETTE.rocketWhite, roughness: 0.5, metalness: 0.08, ...fill });
    const graphite = new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.55, metalness: 0.45, ...fill });
    const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, metalness: 0.1, ...fill });
    const nozzle = new MeshStandardMaterial({ color: '#1b1e25', roughness: 0.4, metalness: 0.7 });
    const glass = new MeshStandardMaterial({ color: '#0f1622', roughness: 0.18, metalness: 0.6, emissive: '#2a3a55', emissiveIntensity: 0.5 });
    const flame = new MeshBasicMaterial({ color: PALETTE.starGlow, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const core = new MeshBasicMaterial({ color: new Color('#fff4dc').multiplyScalar(1.7), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const navLight = new MeshBasicMaterial({ color: PALETTE.starGlow, toneMapped: false });
    return { body, graphite, accent, nozzle, glass, flame, core, navLight };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame(() => {
    const k = Math.max(0, Math.min(1.3, flight.thrust));
    mats.flame.opacity = Math.min(0.9, k * 0.85);
    mats.core.opacity = Math.min(1, k);
    if (flameRef.current) flameRef.current.scale.set(0.6 + k * 0.5, 0.6 + k * 0.5, 0.3 + k * 1.3);
    if (coreRef.current) coreRef.current.scale.set(0.5 + k * 0.3, 0.5 + k * 0.3, 0.3 + k * 0.9);
    if (lightRef.current) lightRef.current.intensity = k * 70;
  });

  const { body, graphite, accent, nozzle, glass, flame, core, navLight } = mats;
  const finAngles = [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3];

  return (
    <group name="ship-shuttle">
      {/* Hull */}
      <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={body}>
        <cylinderGeometry args={[0.55, 0.6, 2.8, 28]} />
      </mesh>
      <mesh position={[0, 0, -1.85]} rotation={[-Math.PI / 2, 0, 0]} material={body}>
        <coneGeometry args={[0.55, 1.5, 28]} />
      </mesh>
      <mesh position={[0, 0, -2.62]} rotation={[-Math.PI / 2, 0, 0]} material={accent}>
        <coneGeometry args={[0.1, 0.24, 12]} />
      </mesh>
      {/* Accent band and a graphite seam */}
      <mesh position={[0, 0, 0.95]} rotation={[Math.PI / 2, 0, 0]} material={accent}>
        <cylinderGeometry args={[0.575, 0.585, 0.16, 28, 1, true]} />
      </mesh>
      <mesh position={[0, 0, -1.0]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
        <cylinderGeometry args={[0.56, 0.56, 0.07, 28, 1, true]} />
      </mesh>
      {/* Cockpit canopy */}
      <mesh position={[0, 0.42, -0.7]} scale={[1, 0.6, 1.5]} material={glass}>
        <sphereGeometry args={[0.36, 24, 16]} />
      </mesh>
      {/* Side pods */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.68, -0.12, 0.85]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
            <cylinderGeometry args={[0.15, 0.17, 1.3, 14]} />
          </mesh>
          <mesh position={[s * 0.68, -0.12, 0.15]} rotation={[-Math.PI / 2, 0, 0]} material={body}>
            <coneGeometry args={[0.15, 0.32, 14]} />
          </mesh>
        </group>
      ))}
      {/* Fins */}
      {finAngles.map((a, i) => (
        <group key={i} rotation={[0, 0, a]} position={[0, 0, 1.3]}>
          <mesh position={[0.95, 0, 0.1]} rotation={[0, -0.32, 0]} material={i === 0 ? accent : body}>
            <boxGeometry args={[1.05, 0.06, 0.95]} />
          </mesh>
          {i === 0 && (
            <mesh position={[1.44, 0, 0.32]} material={navLight}>
              <sphereGeometry args={[0.05, 8, 6]} />
            </mesh>
          )}
        </group>
      ))}
      {/* Tail skirt + nozzle */}
      <mesh position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
        <cylinderGeometry args={[0.62, 0.5, 0.5, 28]} />
      </mesh>
      <mesh position={[0, 0, 2.32]} rotation={[Math.PI / 2, 0, 0]} material={nozzle}>
        <cylinderGeometry args={[0.46, 0.32, 0.45, 24, 1, true]} />
      </mesh>
      {/* Engine plume (length along +Z scales with thrust) */}
      <group position={[0, 0, 2.5]}>
        <mesh ref={flameRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={flame}>
          <coneGeometry args={[0.36, 2.4, 18, 1, true]} />
        </mesh>
        <mesh ref={coreRef} rotation={[-Math.PI / 2, 0, 0]} material={core}>
          <coneGeometry args={[0.2, 1.5, 14, 1, true]} />
        </mesh>
        <pointLight ref={lightRef} color={PALETTE.starEdge} intensity={0} distance={34} decay={2} position={[0, 0, 0.6]} />
      </group>
    </group>
  );
}

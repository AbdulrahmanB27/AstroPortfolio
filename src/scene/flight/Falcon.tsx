import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { PALETTE } from '../../lib/constants';
import { flight } from './flightState';

/**
 * Millennium Falcon-inspired hull (~7 units across): flat saucer, two forward mandibles,
 * the off-centre cockpit tube on the starboard side, a radar dish on top and the blue
 * engine strip across the stern. Stylized and procedural — nothing external.
 * Nose points -Z.
 */
export function Falcon() {
  const lightRef = useRef<PointLight>(null);
  const mats = useMemo(() => {
    // Same cool fill trick as the shuttle: the stern faces away from the star most of the time.
    const fill = { emissive: '#1a2540', emissiveIntensity: 0.55 };
    const hull = new MeshStandardMaterial({ color: '#c6c9ce', roughness: 0.62, metalness: 0.28, ...fill });
    const hullDark = new MeshStandardMaterial({ color: '#8c9198', roughness: 0.7, metalness: 0.3, ...fill });
    const graphite = new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.55, metalness: 0.5, ...fill });
    const glass = new MeshStandardMaterial({ color: '#0f1622', roughness: 0.18, metalness: 0.6, emissive: '#2a3a55', emissiveIntensity: 0.5 });
    const accent = new MeshStandardMaterial({ color: '#b5674a', roughness: 0.7, metalness: 0.1 });
    const strip = new MeshBasicMaterial({ color: new Color('#8fc3ff'), toneMapped: false });
    return { hull, hullDark, graphite, glass, accent, strip };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const stripBase = useMemo(() => new Color('#8fc3ff'), []);

  useFrame(() => {
    const k = Math.max(0, Math.min(1.3, flight.thrust));
    mats.strip.color.copy(stripBase).multiplyScalar(0.5 + k * 0.85);
    if (lightRef.current) lightRef.current.intensity = 6 + k * 60;
  });

  const { hull, hullDark, graphite, glass, accent, strip } = mats;
  const greebles: [number, number, number, number, number][] = [
    [-1.6, 0.62, 0.9, 0.5, 0.3],
    [1.2, 0.7, -0.4, 0.4, 0.4],
    [0.4, 0.66, 1.6, 0.7, 0.28],
    [-0.6, 0.72, -1.4, 0.35, 0.35],
    [1.9, 0.5, 1.4, 0.45, 0.25],
    [-2.0, 0.55, -0.6, 0.3, 0.5],
  ];

  return (
    <group name="ship-falcon">
      {/* Saucer */}
      <mesh material={hull}>
        <cylinderGeometry args={[3.0, 3.0, 0.55, 64]} />
      </mesh>
      <mesh position={[0, 0.26, 0]} scale={[1, 0.25, 1]} material={hull}>
        <sphereGeometry args={[3.0, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, -0.26, 0]} scale={[1, 0.25, 1]} material={hullDark}>
        <sphereGeometry args={[3.0, 48, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
      {/* Central hub with the top turret */}
      <mesh position={[0, 0.98, 0]} material={graphite}>
        <cylinderGeometry args={[0.95, 1.05, 0.22, 32]} />
      </mesh>
      <mesh position={[0, 1.16, 0]} material={hullDark}>
        <cylinderGeometry args={[0.4, 0.45, 0.22, 20]} />
      </mesh>
      <mesh position={[0, 1.2, -0.55]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
      </mesh>
      {/* Bottom turret */}
      <mesh position={[0, -1.0, 0]} material={graphite}>
        <cylinderGeometry args={[0.55, 0.65, 0.2, 24]} />
      </mesh>
      {/* Forward mandibles (tapered toward the tip) */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 1.08, 0, -3.65]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]} material={hull}>
            <cylinderGeometry args={[0.74, 0.6, 2.7, 4, 1, false, Math.PI / 4]} />
          </mesh>
          <mesh position={[s * 1.08, 0.24, -3.4]} material={hullDark}>
            <boxGeometry args={[0.5, 0.1, 1.6]} />
          </mesh>
          <mesh position={[s * 0.62, 0, -3.2]} material={graphite}>
            <boxGeometry args={[0.1, 0.34, 1.7]} />
          </mesh>
        </group>
      ))}
      {/* Cockpit tube on the starboard side */}
      <group position={[2.55, 0.12, -0.9]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={hull}>
          <cylinderGeometry args={[0.46, 0.5, 3.4, 20]} />
        </mesh>
        <mesh position={[0, 0, -1.85]} scale={[1, 1, 0.7]} material={glass}>
          <sphereGeometry args={[0.44, 20, 14]} />
        </mesh>
        <mesh position={[0, 0, -1.55]} rotation={[Math.PI / 2, 0, 0]} material={graphite}>
          <cylinderGeometry args={[0.48, 0.48, 0.1, 20, 1, true]} />
        </mesh>
      </group>
      {/* Port docking ring */}
      <mesh position={[-3.0, 0, 0.35]} rotation={[0, 0, Math.PI / 2]} material={graphite}>
        <cylinderGeometry args={[0.55, 0.55, 0.5, 24]} />
      </mesh>
      {/* Radar dish */}
      <group position={[-1.05, 0.95, 0.35]}>
        <mesh position={[0, 0.25, 0]} material={graphite}>
          <cylinderGeometry args={[0.06, 0.08, 0.5, 8]} />
        </mesh>
        <group position={[0, 0.55, 0]} rotation={[-0.85, 0.35, 0]}>
          <mesh material={hullDark}>
            <cylinderGeometry args={[0.6, 0.62, 0.05, 24]} />
          </mesh>
          <mesh position={[0, 0.1, 0]} material={graphite}>
            <cylinderGeometry args={[0.02, 0.02, 0.24, 6]} />
          </mesh>
        </group>
      </group>
      {/* Panel greebles and two accent stripes on the upper hull */}
      {greebles.map(([x, y, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]} material={i % 2 ? hullDark : graphite}>
          <boxGeometry args={[w, 0.12, d]} />
        </mesh>
      ))}
      <mesh position={[0.9, 0.78, 0.9]} rotation={[0, 0.3, 0]} material={accent}>
        <boxGeometry args={[0.16, 0.03, 1.1]} />
      </mesh>
      <mesh position={[-1.9, 0.6, 1.5]} rotation={[0, -0.5, 0]} material={accent}>
        <boxGeometry args={[0.14, 0.03, 0.8]} />
      </mesh>
      {/* Stern: engine housing + glowing strip */}
      <mesh material={graphite}>
        <cylinderGeometry args={[3.1, 3.1, 0.72, 48, 1, true, -1.05, 2.1]} />
      </mesh>
      <mesh material={strip}>
        <cylinderGeometry args={[3.16, 3.16, 0.26, 48, 1, true, -0.95, 1.9]} />
      </mesh>
      <pointLight ref={lightRef} color="#8fc3ff" intensity={6} distance={36} decay={2} position={[0, 0, 3.8]} />
    </group>
  );
}

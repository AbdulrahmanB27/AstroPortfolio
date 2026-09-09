import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { WORLD } from '../../lib/constants';
import { DEATH_STAR_POSITION } from './flightState';
import { DISH_CONE, DISH_DIR, getDeathStarAssets } from './deathStarAssets';

/**
 * The distant Death Star-inspired station. Lit by the star's point light like every
 * orbital body: from the system it reads as a small grey moon; up close the concave
 * dish, the equatorial trench and the plating give it away.
 */
export function DeathStar() {
  const assets = useMemo(() => getDeathStarAssets(), []);
  const hull = useMemo(
    () =>
      new MeshStandardMaterial({
        map: assets.map,
        bumpMap: assets.map,
        bumpScale: 1.6,
        emissiveMap: assets.emissiveMap,
        emissive: '#ffffff',
        emissiveIntensity: 0.8,
        color: '#b4bcc8',
        roughness: 0.86,
        metalness: 0.12,
      }),
    [assets],
  );
  const rimMat = useMemo(() => new MeshStandardMaterial({ color: '#6d7178', roughness: 0.6, metalness: 0.5 }), []);
  useEffect(
    () => () => {
      hull.dispose();
      rimMat.dispose();
    },
    [hull, rimMat],
  );

  const R = WORLD.deathStarRadius;
  const rim = useMemo(() => {
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), DISH_DIR);
    const pos = DISH_DIR.clone().multiplyScalar(R * Math.cos(DISH_CONE) + 0.4);
    return { q, pos, radius: R * Math.sin(DISH_CONE) };
  }, [R]);

  return (
    <group name="death-star" position={DEATH_STAR_POSITION}>
      <mesh geometry={assets.geometry} material={hull} name="death-star-hull" />
      {/* Crisp lip around the dish. */}
      <mesh position={rim.pos} quaternion={rim.q} material={rimMat} name="death-star-dish-rim">
        <torusGeometry args={[rim.radius, 1.5, 8, 96]} />
      </mesh>
    </group>
  );
}

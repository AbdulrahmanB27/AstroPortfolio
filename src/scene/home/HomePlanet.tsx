import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { PALETTE, WORLD } from '../../lib/constants';
import { noise3D } from '../../lib/noise';
import { handles } from '../rig';
import { stageView } from './stageState';
import { seg } from '../../lib/lowPoly';

/**
 * The small orbital body that represents home from space. It is not a project and has no
 * label.
 *
 * It cross-fades against the surface stage, because the two are the same place at
 * incompatible scales: the stage's terrain patch spans several times this sphere's radius,
 * so while both were drawn the sphere pushed up through the ground as an enormous smooth
 * ball sitting in the landscape, dwarfing the rocket beside it. Exactly one of them belongs
 * on screen — the body when you are away from home, the ground when you are on it — and the
 * hand-off rides the same value the stage fade already uses.
 */
export function HomePlanet() {
  const ref = useRef<Group>(null);
  const geometry = useMemo(() => {
    const g = new SphereGeometry(WORLD.homePlanetRadius, seg(72, 24), seg(48, 16));
    const pos = g.attributes.position!;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = noise3D(v.x * 0.35, v.y * 0.35, v.z * 0.35) - 0.5;
      v.multiplyScalar(1 + n * 0.05);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () => new MeshStandardMaterial({ color: PALETTE.terrain, roughness: 0.95, metalness: 0, transparent: true }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const o = 1 - stageView.opacity;
    material.opacity = o;
    group.visible = o > 0.01;
  });

  useEffect(() => {
    if (ref.current) handles.homeBody = ref.current;
    return () => {
      delete handles.homeBody;
    };
  }, []);

  return (
    <group ref={ref} name="home-planet" position={[WORLD.homeRingRadius, 0, 0]}>
      <mesh geometry={geometry} material={material} castShadow={false} receiveShadow={false} />
    </group>
  );
}

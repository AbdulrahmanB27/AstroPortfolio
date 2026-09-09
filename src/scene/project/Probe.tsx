import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, Material, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { PALETTE } from '../../lib/constants';
import { portfolio } from '../../data/loadPortfolio';
import { useApp } from '../../state/store';
import { planetWorldPositions } from '../system/planetRegistry';
import { probeView } from './probeState';

/**
 * Orbital research probe that appears beside a focused planet. It is the physical
 * anchor for the project display: a small instrument with a dish and solar wing, plus a
 * thin data-link line to the planet. Fades in with `setProbeOpacity` (see `probeState`).
 */
export function Probe() {
  const groupRef = useRef<Group>(null);
  const selectedId = useApp((s) => s.selectedProjectId);
  const scene = useApp((s) => s.scene);
  const active = (scene === 'project' || scene === 'focusingProject' || scene === 'returningToOrbit') && !!selectedId;
  const linkPoints = useMemo(() => [new Vector3(), new Vector3()], []);
  const lineRef = useRef<Object3D>(null);

  const mats = useMemo(() => {
    const body = new MeshStandardMaterial({ color: '#cfd3da', roughness: 0.45, metalness: 0.6, transparent: true });
    const dark = new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.6, metalness: 0.5, transparent: true });
    const panel = new MeshStandardMaterial({ color: '#1d2a4a', roughness: 0.35, metalness: 0.4, emissive: '#1a2a55', emissiveIntensity: 0.4, transparent: true });
    const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, transparent: true });
    return { body, dark, panel, accent };
  }, []);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    g.visible = active && probeView.opacity > 0.01;
    if (!g.visible) return;
    const planet = selectedId ? planetWorldPositions.get(selectedId) : undefined;
    const placement = selectedId ? portfolio.placementById.get(selectedId) : undefined;
    if (!planet || !placement) return;
    // Park the probe between the planet and the camera's right-hand side, slightly above the plane.
    const camPos = state.camera.position;
    const toCam = camPos.clone().sub(planet).normalize();
    // Camera-space basis: screen right / screen up, so the probe sits in the gap between
    // the planet (left) and the panel (right) regardless of where the planet is in orbit.
    const camRight = new Vector3().setFromMatrixColumn(state.camera.matrixWorld, 0).normalize();
    const camUp = new Vector3().setFromMatrixColumn(state.camera.matrixWorld, 1).normalize();
    const r = placement.planetRadius;
    const portrait = state.size.width < state.size.height;
    // Lower-left of the planet on desktop (clear of the panel on the right); upper-left on portrait.
    // Portrait keeps the probe tight to the planet. Pushing it toward the camera magnifies
    // its screen offset far more than the world offset suggests, and at the old values it
    // sat ~250px above the planet on a phone — off the top of the band the sheet leaves.
    const target = portrait
      ? planet.clone().addScaledVector(toCam, r * 0.45).addScaledVector(camRight, r * 1.0).addScaledVector(camUp, r * 0.6)
      : planet.clone().addScaledVector(toCam, r * 0.95).addScaledVector(camRight, r * 1.12).addScaledVector(camUp, -r * 0.62);
    g.position.lerp(target, Math.min(1, delta * 6));
    g.lookAt(planet);
    g.scale.setScalar(Math.max(0.6, r / 9));
    g.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.opacity = probeView.opacity;
    });
    // Data link from the dish to the planet surface.
    linkPoints[0]!.copy(g.position);
    linkPoints[1]!.copy(planet).addScaledVector(g.position.clone().sub(planet).normalize(), r * 1.02);
    const line = lineRef.current as unknown as { geometry?: { setPositions?: (arr: number[]) => void }; material?: { opacity: number } } | null;
    line?.geometry?.setPositions?.([linkPoints[0]!.x, linkPoints[0]!.y, linkPoints[0]!.z, linkPoints[1]!.x, linkPoints[1]!.y, linkPoints[1]!.z]);
    if (line?.material) line.material.opacity = 0.45 * probeView.opacity;
  });

  const { body, dark, panel, accent } = mats;

  return (
    <>
      <group ref={groupRef} name="probe" visible={false}>
        {/* Bus */}
        <mesh material={body}>
          <boxGeometry args={[1.6, 1.2, 1.6]} />
        </mesh>
        <mesh material={dark} position={[0, -0.72, 0]}>
          <cylinderGeometry args={[0.5, 0.65, 0.25, 12]} />
        </mesh>
        {/* Dish facing the planet (group looks at planet along -Z → dish on +Z side flips; place on -Z) */}
        <mesh material={body} position={[0, 0.1, -1.35]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.3, 0.35, 0.5, 24, 1, true]} />
        </mesh>
        <mesh material={accent} position={[0, 0.1, -1.05]}>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />
        </mesh>
        {/* Solar wings */}
        <mesh material={panel} position={[2.4, 0, 0]}>
          <boxGeometry args={[3.2, 0.06, 1.1]} />
        </mesh>
        <mesh material={panel} position={[-2.4, 0, 0]}>
          <boxGeometry args={[3.2, 0.06, 1.1]} />
        </mesh>
        <mesh material={dark} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 8.2, 8]} />
        </mesh>
        {/* Instrument boom with a small beacon */}
        <mesh material={dark} position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />
        </mesh>
        <mesh position={[0, 1.75, 0]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshBasicMaterial color={PALETTE.rimCool} toneMapped={false} />
        </mesh>
      </group>
      <Line ref={lineRef as never} points={linkPoints} color={PALETTE.rimCool} transparent opacity={0} lineWidth={1} depthWrite={false} dashed dashSize={2} gapSize={2} />
    </>
  );
}

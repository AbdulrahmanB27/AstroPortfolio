import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, DoubleSide, Group, LatheGeometry, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, SRGBColorSpace, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from '../../lib/noise';
import { PALETTE } from '../../lib/constants';
import { portfolio } from '../../data/loadPortfolio';
import { useApp } from '../../state/store';
import { planetWorldPositions } from '../system/planetRegistry';
import { probeView } from './probeState';

/** Solar cells: a dark blue grid with fine bus bars, the texture that says "solar panel". */
function buildCellTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d1a3a';
  ctx.fillRect(0, 0, 256, 96);
  const cols = 8;
  const rows = 3;
  const cw = 256 / cols;
  const ch = 96 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const g = ctx.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      g.addColorStop(0, '#1d3570');
      g.addColorStop(1, '#14275a');
      ctx.fillStyle = g;
      ctx.fillRect(i * cw + 2, j * ch + 2, cw - 4, ch - 4);
      ctx.fillStyle = 'rgba(160, 190, 255, 0.18)';
      for (let k = 1; k < 4; k++) ctx.fillRect(i * cw + 2, j * ch + (k * ch) / 4, cw - 4, 1);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Crinkled foil: random facets as a bump map, so the gold catches light unevenly. */
function buildFoilBump(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(77);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    const v = Math.floor(70 + rand() * 120);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    const x = rand() * 128;
    const y = rand() * 128;
    ctx.moveTo(x, y);
    for (let k = 0; k < 3; k++) ctx.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 40);
    ctx.closePath();
    ctx.fill();
  }
  return new CanvasTexture(canvas);
}

/**
 * Orbital research probe that appears beside a focused planet. It is the physical
 * anchor for the project display: a small instrument with a dish and solar wings, plus a
 * thin data-link line to the planet. Fades in with `setProbeOpacity` (see `probeState`).
 *
 * Modelled on the probes that actually fly: a bus wrapped in gold foil, a parabolic dish with
 * its feed held at the focus on struts, solar wings in hinged segments with visible cells,
 * thrusters on the corners and a beacon that blinks. It was a box with two slabs, which read
 * as a box with two slabs.
 */
export function Probe() {
  const groupRef = useRef<Group>(null);
  const selectedId = useApp((s) => s.selectedProjectId);
  const scene = useApp((s) => s.scene);
  const active = (scene === 'project' || scene === 'focusingProject' || scene === 'returningToOrbit') && !!selectedId;
  const linkPoints = useMemo(() => [new Vector3(), new Vector3()], []);
  const lineRef = useRef<Object3D>(null);

  const textures = useMemo(() => ({ cells: buildCellTexture(), foil: buildFoilBump() }), []);
  const mats = useMemo(() => {
    const body = new MeshStandardMaterial({ color: '#cfd3da', roughness: 0.45, metalness: 0.6, transparent: true, side: DoubleSide });
    const foil = new MeshStandardMaterial({ color: '#c9973a', roughness: 0.32, metalness: 0.9, bumpMap: textures.foil, bumpScale: 2.5, transparent: true });
    const dark = new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.6, metalness: 0.5, transparent: true });
    const panel = new MeshStandardMaterial({ map: textures.cells, roughness: 0.3, metalness: 0.5, emissive: '#1a2a55', emissiveIntensity: 0.25, transparent: true });
    const accent = new MeshStandardMaterial({ color: PALETTE.starGlow, roughness: 0.5, transparent: true });
    const beacon = new MeshBasicMaterial({ color: new Color(PALETTE.rimCool).multiplyScalar(1.3), toneMapped: false, transparent: true });
    return { body, foil, dark, panel, accent, beacon };
  }, [textures]);

  const geo = useMemo(() => {
    // A paraboloid, opening along +Y before the mesh turns it to face out of the bus.
    const dishPts: Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const r = (i / 12) * 1.25;
      dishPts.push(new Vector2(Math.max(0.0001, r), 0.32 * (r / 1.25) ** 2));
    }
    return {
      bus: new RoundedBoxGeometry(1.6, 1.2, 1.6, 3, 0.08),
      dish: new LatheGeometry(dishPts, 36),
    };
  }, []);
  // y = r^2 / 4f through the rim (1.25, 0.32) puts the focus at f ≈ 1.22; the feed sits there,
  // and each strut runs from the rim to it.
  const DISH_FOCUS = 1.22;
  const struts = useMemo(
    () =>
      [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const rim = new Vector3(Math.cos(a) * 1.22, 0.31, Math.sin(a) * 1.22);
        const focus = new Vector3(0, DISH_FOCUS - 0.1, 0);
        const dir = focus.clone().sub(rim);
        return {
          key: i,
          position: rim.clone().add(focus).multiplyScalar(0.5),
          quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
          length: dir.length(),
        };
      }),
    [],
  );

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

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
    // The beacon blinks over the fade, not instead of it.
    const blink = useApp.getState().reducedMotion || state.clock.elapsedTime % 2 < 0.2 ? 1 : 0.3;
    mats.beacon.opacity = probeView.opacity * blink;
    // Data link from the dish to the planet surface.
    linkPoints[0]!.copy(g.position);
    linkPoints[1]!.copy(planet).addScaledVector(g.position.clone().sub(planet).normalize(), r * 1.02);
    const line = lineRef.current as unknown as { geometry?: { setPositions?: (arr: number[]) => void }; material?: { opacity: number } } | null;
    line?.geometry?.setPositions?.([linkPoints[0]!.x, linkPoints[0]!.y, linkPoints[0]!.z, linkPoints[1]!.x, linkPoints[1]!.y, linkPoints[1]!.z]);
    if (line?.material) line.material.opacity = 0.45 * probeView.opacity;
  });

  const { body, foil, dark, panel, accent, beacon } = mats;
  const wing = (side: 1 | -1) => (
    <group position={[side * 0.95, 0, 0]}>
      {/* Three hinged segments with gaps between them, on a yoke. */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[side * (0.75 + i * 1.08), 0, 0]}>
          <mesh material={panel}>
            <boxGeometry args={[1.0, 0.05, 1.15]} />
          </mesh>
          <mesh material={dark} position={[0, -0.035, 0]}>
            <boxGeometry args={[1.04, 0.02, 1.19]} />
          </mesh>
        </group>
      ))}
    </group>
  );

  return (
    <>
      <group ref={groupRef} name="probe" visible={false}>
        {/* Bus in gold foil, with a graphite adapter ring underneath */}
        <mesh geometry={geo.bus} material={foil} />
        <mesh material={dark} position={[0, -0.72, 0]}>
          <cylinderGeometry args={[0.5, 0.65, 0.25, 20]} />
        </mesh>
        {/* Thrusters on the four lower corners */}
        {[
          [0.72, 0.72],
          [-0.72, 0.72],
          [0.72, -0.72],
          [-0.72, -0.72],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} material={dark} position={[x!, -0.62, z!]}>
            <cylinderGeometry args={[0.04, 0.09, 0.14, 10]} />
          </mesh>
        ))}
        {/* High-gain dish, opening away from the bus, with its feed at the focus on three struts */}
        <group position={[0, 0.1, -0.95]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={geo.dish} material={body} />
          {struts.map((st) => (
            <mesh key={st.key} material={dark} position={st.position} quaternion={st.quaternion}>
              <cylinderGeometry args={[0.018, 0.018, st.length, 6]} />
            </mesh>
          ))}
          <mesh material={accent} position={[0, DISH_FOCUS - 0.05, 0]}>
            <cylinderGeometry args={[0.07, 0.11, 0.2, 12]} />
          </mesh>
        </group>
        {/* Solar wings on a boom through the bus */}
        <mesh material={dark} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 2.4, 10]} />
        </mesh>
        {wing(1)}
        {wing(-1)}
        {/* Instrument boom with a magnetometer and a beacon */}
        <mesh material={dark} position={[0, 1.2, 0.3]}>
          <cylinderGeometry args={[0.035, 0.035, 1.4, 8]} />
        </mesh>
        <mesh material={body} position={[0, 1.5, 0.3]}>
          <cylinderGeometry args={[0.09, 0.09, 0.16, 12]} />
        </mesh>
        <mesh material={beacon} position={[0, 1.95, 0.3]}>
          <sphereGeometry args={[0.1, 12, 10]} />
        </mesh>
      </group>
      <Line ref={lineRef as never} points={linkPoints} color={PALETTE.rimCool} transparent opacity={0} lineWidth={1} depthWrite={false} dashed dashSize={2} gapSize={2} />
    </>
  );
}

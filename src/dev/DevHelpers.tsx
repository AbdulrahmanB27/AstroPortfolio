import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Group, Material, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { portfolio } from '../data/loadPortfolio';
import type { PlanetPlacement } from '../data/orbitLayout';
import { PALETTE, WORLD } from '../lib/constants';
import { orbitClock } from '../scene/system/orbitClock';
import { useApp } from '../state/store';
import { devStats, resetDevStats } from './devStats';
import { useDevStore } from './devStore';

/**
 * In-canvas debug helpers. Mounted only while dev mode is on; every helper restores what
 * it touched on unmount so switching dev mode off leaves the scene exactly as it was.
 * The AB constellation lines are handled by the starfield itself (visible in dev mode).
 */
export function DevHelpers() {
  const devMode = useApp((s) => s.devMode);
  if (!devMode) return null;
  return <Helpers />;
}

const NAMED_OBJECTS = ['star', 'home-planet', 'rocket', 'astronaut'] as const;

interface ChipTarget {
  name: string;
  placement?: PlanetPlacement;
  /** World units below the object's origin where the chip is anchored (clears the body and its label). */
  dropY: number;
}

const FIXED_DROP: Record<(typeof NAMED_OBJECTS)[number], number> = {
  star: WORLD.starRadius * 1.25,
  'home-planet': WORLD.homePlanetRadius * 1.4,
  rocket: 0,
  astronaut: 0,
};

function Helpers() {
  const showHitAreas = useDevStore((s) => s.showHitAreas);
  const showNames = useDevStore((s) => s.showNames);
  const showOrbitValues = useDevStore((s) => s.showOrbitValues);

  // Dev mode off → helper toggles start clean next time; nothing lingers in the scene.
  useEffect(() => () => useDevStore.getState().reset(), []);

  const targets = useMemo<ChipTarget[]>(() => {
    const list: ChipTarget[] = [];
    if (showNames) for (const name of NAMED_OBJECTS) list.push({ name, dropY: FIXED_DROP[name] });
    if (showNames || showOrbitValues) {
      for (const p of portfolio.data.projects) {
        const placement = portfolio.placementById.get(p.id);
        list.push({ name: `planet-${p.id}`, placement, dropY: placement ? placement.planetRadius * 1.3 : 0 });
      }
    }
    return list;
  }, [showNames, showOrbitValues]);

  return (
    <group name="dev-helpers">
      <StatsCollector />
      {showHitAreas && <HitAreas />}
      {targets.map((t) => (
        <NameChip key={t.name} target={t} showName={showNames} showOrbit={showOrbitValues} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Renderer stats → shared ref
// ---------------------------------------------------------------------------

/**
 * Reads `gl.info` once per frame. Auto-reset is disabled while mounted so the counters
 * accumulate across every pass of the frame (scene render + post-processing) and are
 * reset here, right before the next frame's renders begin (this runs at priority 0,
 * ahead of the composer's render subscription).
 */
function StatsCollector() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previous;
      gl.info.reset();
      resetDevStats();
    };
  }, [gl]);

  useFrame(() => {
    const info = gl.info;
    devStats.drawCalls = info.render.calls;
    devStats.triangles = info.render.triangles;
    devStats.points = info.render.points;
    devStats.lines = info.render.lines;
    devStats.geometries = info.memory.geometries;
    devStats.textures = info.memory.textures;
    devStats.programs = info.programs?.length ?? 0;
    devStats.updatedAt = performance.now();
    info.reset();
  });

  return null;
}

// ---------------------------------------------------------------------------
// Hit-area visualization
// ---------------------------------------------------------------------------

interface SavedMeshState {
  material: Material | Material[];
  visible: boolean;
}

/**
 * Makes every `planet-hit-<id>` sphere visible with a transparent wireframe. Originals
 * are remembered per mesh and put back when the toggle turns off (this unmounts).
 */
function HitAreas() {
  const scene = useThree((s) => s.scene);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: PALETTE.rimCool,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const tracked = useRef(new Map<Mesh, SavedMeshState>());
  const rootRef = useRef<Object3D | null>(null);
  const frame = useRef(0);

  const scan = () => {
    if (!rootRef.current || !rootRef.current.parent) rootRef.current = scene.getObjectByName('solar-system') ?? null;
    const root = rootRef.current;
    if (!root) return;
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.name.startsWith('planet-hit-') || tracked.current.has(mesh)) return;
      tracked.current.set(mesh, { material: mesh.material, visible: mesh.visible });
      mesh.material = material;
      mesh.visible = true;
    });
  };

  // Re-scan occasionally so planets mounted later (or remounted) are picked up too.
  useFrame(() => {
    if (frame.current++ % 30 === 0) scan();
  });

  useEffect(() => {
    const map = tracked.current;
    scan();
    return () => {
      for (const [mesh, saved] of map) {
        if (mesh.material === material) mesh.material = saved.material;
        mesh.visible = saved.visible;
      }
      map.clear();
      material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, material]);

  return null;
}

// ---------------------------------------------------------------------------
// Object name / orbit value chips
// ---------------------------------------------------------------------------

function effectivelyVisible(obj: Object3D): boolean {
  for (let o: Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function orbitText(placement: PlanetPlacement): string {
  const speed = useApp.getState().settings.motion.orbitSpeedScale;
  const theta = placement.angleDeg + (placement.angularSpeed * speed * orbitClock.t * 180) / Math.PI;
  const deg = ((theta % 360) + 360) % 360;
  return `ring ${placement.ring} · r ${placement.radius.toFixed(0)} · ${deg.toFixed(1)}°`;
}

interface ChipProps {
  target: ChipTarget;
  showName: boolean;
  showOrbit: boolean;
}

/** A small mono chip that follows a named scene object. Text is written directly to the DOM. */
function NameChip({ target, showName, showOrbit }: ChipProps) {
  const groupRef = useRef<Group>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLSpanElement>(null);
  const orbit = showOrbit && !!target.placement;

  return (
    <group ref={groupRef} name={`dev-chip-${target.name}`}>
      {/* Registered before <Html> so the group is moved before Html projects it. */}
      <ChipSync target={target} groupRef={groupRef} chipRef={chipRef} valuesRef={orbit ? valuesRef : null} />
      <Html wrapperClass="dev-chip-wrap" zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={chipRef} className="dev-chip" data-dev-chip={target.name} style={{ visibility: 'hidden' }}>
          {showName && <span className="dev-chip__name">{target.name}</span>}
          {orbit && <span ref={valuesRef} className="dev-chip__values" />}
        </div>
      </Html>
    </group>
  );
}

interface SyncProps {
  target: ChipTarget;
  groupRef: RefObject<Group | null>;
  chipRef: RefObject<HTMLDivElement | null>;
  valuesRef: RefObject<HTMLSpanElement | null> | null;
}

function ChipSync({ target, groupRef, chipRef, valuesRef }: SyncProps) {
  const scene = useThree((s) => s.scene);
  const objectRef = useRef<Object3D | null>(null);
  const frame = useRef(0);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame(() => {
    let obj = objectRef.current;
    if (!obj || !obj.parent) {
      // Not found yet (or detached): look it up every 30 frames, starting immediately.
      if (frame.current++ % 30 === 0) obj = objectRef.current = scene.getObjectByName(target.name) ?? null;
      else obj = null;
    }
    const chip = chipRef.current;
    const group = groupRef.current;
    if (!obj || !group) {
      if (chip) chip.style.visibility = 'hidden';
      return;
    }
    obj.getWorldPosition(tmp);
    tmp.y -= target.dropY;
    group.position.copy(tmp);
    const visible = effectivelyVisible(obj);
    if (chip) chip.style.visibility = visible ? 'visible' : 'hidden';
    if (visible && target.placement && valuesRef?.current) valuesRef.current.textContent = orbitText(target.placement);
  });

  return null;
}

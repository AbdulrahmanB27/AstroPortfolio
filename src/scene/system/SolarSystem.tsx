import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, Vector3 } from 'three';
import { portfolio } from '../../data/loadPortfolio';
import { PALETTE, WORLD } from '../../lib/constants';
import { handles } from '../rig';
import { useApp, isSystemScene } from '../../state/store';
import { orbitClock } from './orbitClock';

/** drei's `Line` renders with a `LineMaterial`, whose opacity lives in a uniform. */
interface RingMaterial {
  opacity: number;
  uniforms?: { opacity?: { value: number } };
}
import { setSystemDim, setSystemReveal, systemView } from './systemState';
import { ProjectPlanet } from './ProjectPlanet';
import { SchematicGrid } from './SchematicGrid';
import { focusProject } from '../../sequences/system';

/**
 * Orbit rings + project planets, driven entirely by the content layout. Orbit lines are
 * structural guides: thin and low contrast. A reveal value (0–1) fades everything in
 * during the launch and dims the rings while a project is focused.
 */
export function SolarSystem() {
  const groupRef = useRef<Group>(null);
  const scene = useApp((s) => s.scene);
  const gridSettings = useApp((s) => s.settings.grid);
  const visible = isSystemScene(scene);
  const { layout, data, placementById } = portfolio;

  // The values themselves live in `systemState`; the handle is only a convenience for
  // callers that already reach the scene through `handles`.
  useEffect(() => {
    handles.systemGroup = { setReveal: setSystemReveal, setDim: setSystemDim };
    return () => {
      delete handles.systemGroup;
    };
  }, []);

  const ringPoints = useMemo(
    () =>
      layout.rings.map((ring) => {
        const pts: Vector3[] = [];
        for (let i = 0; i <= 180; i++) {
          const a = (i / 180) * Math.PI * 2;
          pts.push(new Vector3(Math.cos(a) * ring.radius, 0, Math.sin(a) * ring.radius));
        }
        return { index: ring.index, pts };
      }),
    [layout.rings],
  );

  const homeRing = useMemo(() => {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * WORLD.homeRingRadius, 0, Math.sin(a) * WORLD.homeRingRadius));
    }
    return pts;
  }, []);

  const ringRefs = useRef<(import('three').Object3D | null)[]>([]);

  useFrame((_, delta) => {
    const s = useApp.getState().scene;
    orbitClock.running = s === 'system' || s === 'flight' || s === 'launching' || s === 'returningHome';
    if (orbitClock.running) orbitClock.t += delta;
    const ringOpacity = 0.14 * systemView.reveal * (1 - systemView.dim * 0.7);
    ringRefs.current.forEach((line, i) => {
      const mat = (line as { material?: RingMaterial } | null)?.material;
      if (!mat) return;
      // The last entry is the home planet's amber ring; amber reads far brighter than the
      // neutral project rings at the same opacity, so it is held back deliberately.
      const value = i === ringPoints.length ? ringOpacity * 0.55 : ringOpacity;
      mat.opacity = value;
      // `LineMaterial` renders from its uniform, and assigning the property does not reach
      // it. Without this the rings drew at ~92% against an authored 22%, which made the
      // scaffolding brighter than five of the seven planets it was supposed to sit behind.
      if (mat.uniforms?.opacity) mat.uniforms.opacity.value = value;
    });
  });

  return (
    <group ref={groupRef} name="solar-system" visible={visible}>
      {ringPoints.map((ring, i) => (
        <Line
          key={ring.index}
          ref={(el) => {
            ringRefs.current[i] = el as unknown as import('three').Object3D;
          }}
          points={ring.pts}
          color={PALETTE.ink500}
          transparent
          opacity={0}
          lineWidth={1}
          depthWrite={false}
        />
      ))}
      {/* The home planet's own ring, fainter and dashed: it is not a project. */}
      <Line
        ref={(el) => {
          ringRefs.current[ringPoints.length] = el as unknown as import('three').Object3D;
        }}
        points={homeRing}
        color={PALETTE.starGlow}
        transparent
        opacity={0}
        lineWidth={1}
        dashed
        dashSize={6}
        gapSize={8}
        depthWrite={false}
      />
      {gridSettings.enabled && <SchematicGrid settings={gridSettings} outerRadius={layout.outerRadius} />}
      {data.projects.map((p) => (
        <ProjectPlanet key={p.id} project={p} placement={placementById.get(p.id)!} onSelect={focusProject} />
      ))}
    </group>
  );
}

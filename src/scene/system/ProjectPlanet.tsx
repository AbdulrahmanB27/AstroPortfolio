import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Project } from '../../data/schema';
import type { PlanetPlacement } from '../../data/orbitLayout';
import { orbitPosition } from '../../data/orbitLayout';
import { PALETTE } from '../../lib/constants';
import { useApp } from '../../state/store';
import { orbitClock } from './orbitClock';
import { buildRingTexture, planetMaterialFor } from './planetMaterials';
import { buildRingGeometry } from './ringGeometry';
import { RING_INNER, RING_OUTER, moonOrbit, moonRadius } from './planetExtent';
import { planetWorldPositions } from './planetRegistry';
import { systemView } from './systemState';

interface Props {
  project: Project;
  placement: PlanetPlacement;
  onSelect: (id: string) => void;
}

/** One project as a planet: styled body, optional ring and moons, hover/selection ring. */
export function ProjectPlanet({ project, placement, onSelect }: Props) {
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const hovered = useApp((s) => s.hoveredProjectId === project.id);
  const selected = useApp((s) => s.selectedProjectId === project.id);
  const scene = useApp((s) => s.scene);
  const setHovered = useApp((s) => s.setHoveredProject);
  const speedScale = useApp((s) => s.settings.motion.orbitSpeedScale);
  const interactive = scene === 'system';
  const seed = useMemo(() => [...project.id].reduce((a, c) => a + c.charCodeAt(0) * 31, 7), [project.id]);

  const material = useMemo(
    () => planetMaterialFor(project.planet.style, project.planet.color, project.planet.accent, seed),
    [project.planet.style, project.planet.color, project.planet.accent, seed],
  );
  const ringTexture = useMemo(
    () => (project.planet.rings ? buildRingTexture(project.planet.accent ?? project.planet.color, seed) : null),
    [project.planet.rings, project.planet.accent, project.planet.color, seed],
  );
  const ringGeometry = useMemo(
    () => (project.planet.rings ? buildRingGeometry(placement.planetRadius * RING_INNER, placement.planetRadius * RING_OUTER, 128) : null),
    [project.planet.rings, placement.planetRadius],
  );
  const haloMaterial = useMemo(
    // Lifted off the flat token value, where the ring was a hard-edged slab with the
    // background luminance literally adjacent to it and nothing about the selected planet
    // glowed. Backed off from 1.7 once the hoop moved outside a ringed planet's band: at that
    // radius it circumscribes the whole drawing, and two reviewers independently called it the
    // most saturated thing in the frame after the star, pulling the eye off the project title.
    // It has to say "this one is selected", which is a highlight, not a HUD element.
    () => new MeshBasicMaterial({ color: new Color(PALETTE.rimCool).multiplyScalar(1.3), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    [],
  );
  useEffect(
    () => () => {
      material.dispose();
      material.map?.dispose();
      ringTexture?.dispose();
      ringGeometry?.dispose();
      haloMaterial.dispose();
    },
    [material, ringTexture, ringGeometry, haloMaterial],
  );

  const r = placement.planetRadius;
  const moonCount = project.planet.moons;
  const tmp = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const pos = orbitPosition(placement, orbitClock.t, speedScale);
    g.position.set(pos[0], pos[1], pos[2]);
    planetWorldPositions.set(project.id, tmp.set(pos[0], pos[1], pos[2]).clone());
    // Reveal: scale up from nothing during the launch's system-reveal phase.
    const s = 0.001 + systemView.reveal * 0.999;
    const emphasis = hovered || selected ? 1.05 : 1;
    g.scale.setScalar(s * emphasis);
    if (bodyRef.current) bodyRef.current.rotation.y += delta * 0.05;
    if (haloRef.current) {
      const target = selected ? 0.34 : hovered ? 0.2 : 0;
      haloMaterial.opacity += (target - haloMaterial.opacity) * Math.min(1, delta * 10);
      haloRef.current.visible = haloMaterial.opacity > 0.01;
    }
    // Moons orbit slowly around the planet.
    for (let i = 0; i < moonCount; i++) {
      const moon = g.getObjectByName(`moon-${i}`);
      if (!moon) continue;
      const a = orbitClock.t * (0.35 + i * 0.12) + i * 2.1;
      const d = r * moonOrbit(i);
      moon.position.set(Math.cos(a) * d, Math.sin(a * 0.7) * r * 0.25, Math.sin(a) * d);
    }
  });

  const tilt = project.planet.rings ? 0.35 : 0.12;
  // Clear of the rings where there are rings, close to the body where there are none.
  const haloInner = project.planet.rings ? RING_OUTER + 0.14 : 1.3;

  return (
    <group ref={groupRef} name={`planet-${project.id}`}>
      <group rotation={[tilt, 0, 0.1]}>
        <mesh ref={bodyRef} material={material} name={`planet-body-${project.id}`}>
          <sphereGeometry args={[r, 48, 32]} />
        </mesh>
        {ringTexture && ringGeometry && (
          <mesh
            geometry={ringGeometry}
            rotation={[-Math.PI / 2, 0, 0]}
            name={`planet-ring-${project.id}`}
            castShadow
            receiveShadow
          >
            {/* alphaTest + depthWrite keeps the near arc sorting in front of the planet;
                a fully transparent ring let background orbit lines composite over it. */}
            <meshStandardMaterial
              map={ringTexture}
              transparent
              alphaTest={0.04}
              depthWrite
              side={DoubleSide}
              roughness={0.85}
              metalness={0}
            />
          </mesh>
        )}
        {/*
          Selection / hover halo, in the planet's own ring plane and deliberately thin: a
          bright hoop at a contradictory tilt read as a neon HUD element.

          Its radius clears whatever the planet actually draws. At a flat 1.3 radii it sat in
          the gap between a ringed planet's surface (1.0) and its ring band (1.45-2.3), so
          two concentric ellipses crossed on the screen and the near arc ran straight across
          the lit face — reviewers read it as a stray wireframe rather than "this one is
          selected". Outside the whole drawing there is nothing for it to cut through.
        */}
        <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]} material={haloMaterial} visible={false}>
          <ringGeometry args={[r * haloInner, r * (haloInner + 0.035), 96]} />
        </mesh>
        {Array.from({ length: moonCount }, (_, i) => (
          <mesh key={i} name={`moon-${i}`}>
            <sphereGeometry args={[r * moonRadius(i), 16, 12]} />
            <meshStandardMaterial color={project.planet.accent ?? '#cfd6e0'} roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Generous hit target so small planets stay easy to click */}
      <mesh
        name={`planet-hit-${project.id}`}
        visible={false}
        onPointerOver={interactive ? (e) => { e.stopPropagation(); setHovered(project.id); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={interactive ? () => { setHovered(null); document.body.style.cursor = ''; } : undefined}
        onClick={interactive ? (e) => { e.stopPropagation(); onSelect(project.id); } : undefined}
      >
        <sphereGeometry args={[Math.max(r * 1.7, 22), 12, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

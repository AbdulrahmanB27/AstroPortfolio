import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import type { Project } from '../../data/schema';
import type { PlanetPlacement } from '../../data/orbitLayout';
import { orbitPosition } from '../../data/orbitLayout';
import { PALETTE } from '../../lib/constants';
import { useApp } from '../../state/store';
import { orbitClock } from './orbitClock';
import { ATMOSPHERE, atmosphereMaterial, buildRingTexture, createPlanetLook, sharedMoonTexture } from './planetMaterials';
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
  const cloudRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const hovered = useApp((s) => s.hoveredProjectId === project.id);
  const selected = useApp((s) => s.selectedProjectId === project.id);
  const scene = useApp((s) => s.scene);
  const setHovered = useApp((s) => s.setHoveredProject);
  const speedScale = useApp((s) => s.settings.motion.orbitSpeedScale);
  // A phone draws these a few dozen pixels across: a quarter of the texels is plenty there.
  const tier = useApp((s) => s.quality.tier);
  const textureWidth = tier === 'high' ? 512 : tier === 'medium' ? 384 : 256;
  const interactive = scene === 'system';
  const seed = useMemo(() => [...project.id].reduce((a, c) => a + c.charCodeAt(0) * 31, 7), [project.id]);

  // The surface arrives from a worker; until then the body is its flat base colour. Clouds
  // drift a little faster than the ground under them, which is most of what makes a world
  // read as having weather rather than as a painted ball.
  const look = useMemo(
    () => createPlanetLook(project.planet.style, project.planet.color, project.planet.accent, seed, textureWidth),
    [project.planet.style, project.planet.color, project.planet.accent, seed, textureWidth],
  );
  const { material, cloudMaterial } = look;
  const atmosphereStrength = ATMOSPHERE[project.planet.style];
  const atmosphere = useMemo(
    () => (atmosphereStrength ? atmosphereMaterial(project.planet.accent ?? project.planet.color, atmosphereStrength) : null),
    [atmosphereStrength, project.planet.accent, project.planet.color],
  );
  const moonCount = project.planet.moons;
  const moonMaterial = useMemo(
    () => new MeshStandardMaterial({ color: project.planet.accent ?? '#cfd6e0', roughness: 0.95 }),
    [project.planet.accent],
  );
  useEffect(() => {
    if (!moonCount) return;
    let alive = true;
    void sharedMoonTexture().then((tex) => {
      if (!alive) return;
      moonMaterial.map = tex;
      moonMaterial.needsUpdate = true;
    });
    return () => {
      alive = false;
    };
  }, [moonMaterial, moonCount]);
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
      look.dispose();
      atmosphere?.dispose();
      // The moon texture is shared across planets and outlives any one of them.
      moonMaterial.dispose();
      ringTexture?.dispose();
      ringGeometry?.dispose();
      haloMaterial.dispose();
    },
    [look, atmosphere, moonMaterial, ringTexture, ringGeometry, haloMaterial],
  );

  const r = placement.planetRadius;
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
    if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.075;
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
          <sphereGeometry args={[r, 64, 40]} />
        </mesh>
        {cloudMaterial && (
          <mesh ref={cloudRef} material={cloudMaterial} name={`planet-clouds-${project.id}`}>
            <sphereGeometry args={[r * 1.018, 64, 40]} />
          </mesh>
        )}
        {atmosphere && (
          <mesh material={atmosphere} name={`planet-atmosphere-${project.id}`} renderOrder={1}>
            <sphereGeometry args={[r * 1.045, 64, 40]} />
          </mesh>
        )}
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
          <mesh key={i} name={`moon-${i}`} material={moonMaterial}>
            <sphereGeometry args={[r * moonRadius(i), 24, 16]} />
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

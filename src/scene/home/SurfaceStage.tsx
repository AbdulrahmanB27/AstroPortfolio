import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, Group, Material, Mesh, Object3D } from 'three';
import { PALETTE, STAGE, WORLD } from '../../lib/constants';
import { STAGE_FRAME } from '../../lib/stageFrame';
import { handles } from '../rig';
import { useApp, isSurfaceScene } from '../../state/store';
import { buildTerrainGeometry } from './terrainGeometry';
import { Rocks } from './Rocks';
import { Astronaut } from './Astronaut';
import { Rocket } from './Rocket';
import { setStageOpacity, stageView } from './stageState';
import { seg } from '../../lib/lowPoly';

/**
 * Everything that only exists while standing on the home planet: terrain patch, rocks,
 * astronaut, rocket on its pad, horizon glow. Positioned by the stage frame so the local
 * -Z axis points at the star.
 */

const horizonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const horizonFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;
    float band = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.28, 1.0, vUv.y));
    float wide = 1.0 - smoothstep(0.35, 1.0, x);
    float a = band * wide * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function SurfaceStage() {
  const groupRef = useRef<Group>(null);
  const groundRef = useRef<Group>(null);
  const scene = useApp((s) => s.scene);
  const quality = useApp((s) => s.quality);
  const geometry = useMemo(() => buildTerrainGeometry(seg(quality.tier === 'low' ? 120 : 190, 40)), [quality.tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const sceneAllows = isSurfaceScene(scene);
  const appliedRef = useRef(-1);

  // `handles` is kept for the dev tools; the value itself lives at module scope so a
  // sequence that runs before this component mounts is not silently ignored.
  useEffect(() => {
    handles.surfaceStage = { setOpacity: setStageOpacity };
    return () => {
      delete handles.surfaceStage;
    };
  }, []);

  // Read every frame. Sequences fade the stage around the launch and the return-home glide.
  useFrame(() => {
    const group = groupRef.current;
    const ground = groundRef.current;
    if (!group || !ground) return;
    const o = stageView.opacity;
    ground.visible = o > 0.001;
    // The intro hides the whole stage, not just the ground: with the ground faded out and
    // the rocket still drawn, the opening cinematic showed a planet with a rocket and an
    // astronaut floating in space beside it.
    group.visible = sceneAllows && (scene !== 'intro' || o > 0.001);
    if (appliedRef.current === o) return;
    appliedRef.current = o;
    ground.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as (Material & { userData: { baseOpacity?: number } })[]) {
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
        m.transparent = true;
        m.opacity = (m.userData.baseOpacity ?? 1) * o;
      }
    });
  });

  const horizonUniforms = useMemo(
    () => ({ uColor: { value: new Color(PALETTE.starEdge) }, uOpacity: { value: 0.42 } }),
    [],
  );

  return (
    <group ref={groupRef} name="surface-stage" position={STAGE_FRAME.origin} quaternion={STAGE_FRAME.quaternion}>
      <group ref={groundRef} name="ground">
      <mesh geometry={geometry} receiveShadow name="terrain">
        <meshStandardMaterial vertexColors roughness={0.98} metalness={0} />
      </mesh>
      <Rocks count={quality.rockCount} castShadow={quality.shadows} />
      {/* Warm horizon haze where the star meets the ground. */}
      <mesh position={[0, -3.5, -WORLD.surfaceExtent * 0.62]} name="horizon-glow" renderOrder={-2}>
        <planeGeometry args={[WORLD.surfaceExtent * 2.6, 34]} />
        <shaderMaterial
          vertexShader={horizonVertex}
          fragmentShader={horizonFragment}
          uniforms={horizonUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      </group>
      <Astronaut position={STAGE.astronaut} rotation={[0, STAGE.astronautYaw, 0]} />
      <Rocket position={STAGE.rocket} rotation={[0, STAGE.rocketYaw, 0]} />
    </group>
  );
}

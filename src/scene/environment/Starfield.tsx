import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Vector2, Vector3 } from 'three';
import { PALETTE, WORLD } from '../../lib/constants';
import { mulberry32 } from '../../lib/noise';
import { stageDirToWorld } from '../../lib/stageFrame';
import { useApp } from '../../state/store';

/**
 * Background stars on a distant sphere plus the "AB" constellation signature.
 * The constellation is a handful of slightly brighter stars in the sky above the home
 * planet; faint connecting lines appear only while the pointer rests on that patch of
 * sky (or in dev mode). It is never called out.
 */

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aTwinkle;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aTwinkle * 1.4) + aTwinkle * 40.0);
    vAlpha = tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * tw;
    gl_Position = projectionMatrix * mv;
  }
`;

const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
  }
`;

// Letter strokes in a local sky plane (u right, v up), roughly 1 unit tall.
const LETTER_A: [number, number][] = [
  [0.0, 0.0],
  [0.27, 0.52],
  [0.5, 1.0],
  [0.73, 0.5],
  [1.0, 0.0],
];
const LETTER_A_LINES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [1, 3],
];
const LETTER_B: [number, number][] = [
  [0.0, 0.0],
  [0.0, 0.5],
  [0.0, 1.0],
  [0.55, 0.86],
  [0.6, 0.55],
  [0.66, 0.18],
];
const LETTER_B_LINES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 1],
  [1, 5],
  [5, 0],
];

interface ConstellationData {
  positions: Vector3[];
  segments: [Vector3, Vector3][];
  center: Vector3;
}

function buildConstellation(): ConstellationData {
  const rand = mulberry32(2027);
  // Direction in stage space: up-left of the star as seen from the home camera.
  // ~25° left of the star and ~17° up: upper-left of the home frame, above the rocks.
  const dir = stageDirToWorld([-0.4, 0.3, -0.86]);
  const R = WORLD.starfieldRadius * 0.96;
  const center = dir.clone().multiplyScalar(R);
  // Tangent basis at that direction.
  const worldUp = new Vector3(0, 1, 0);
  // The sky is read from inside the sphere, so the horizontal tangent has to be negated
  // or the letters come out mirrored and in the wrong order.
  const u = new Vector3().crossVectors(worldUp, dir).normalize().negate();
  const v = new Vector3().crossVectors(dir, u).normalize().negate();
  const scale = R * 0.075;
  const positions: Vector3[] = [];
  const segments: [Vector3, Vector3][] = [];
  const place = (pts: [number, number][], lines: [number, number][], offsetU: number) => {
    const base = positions.length;
    for (const [x, y] of pts) {
      const jx = (rand() - 0.5) * 0.09;
      const jy = (rand() - 0.5) * 0.09;
      const p = center
        .clone()
        .addScaledVector(u, (x + offsetU + jx) * scale)
        .addScaledVector(v, (y - 0.5 + jy) * scale);
      positions.push(p);
    }
    for (const [a, b] of lines) segments.push([positions[base + a]!, positions[base + b]!]);
  };
  place(LETTER_A, LETTER_A_LINES, -1.25);
  place(LETTER_B, LETTER_B_LINES, 0.35);
  return { positions, segments, center };
}

export function Starfield({ count }: { count: number }) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const devMode = useApp((s) => s.devMode);
  const scene = useApp((s) => s.scene);
  const [revealed, setRevealed] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const { camera, size } = useThree();

  const constellation = useMemo(buildConstellation, []);

  const geometry = useMemo(() => {
    const rand = mulberry32(31337);
    const total = count + constellation.positions.length;
    const pos = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const twinkle = new Float32Array(total);
    const warm = new Color('#ffe2c2');
    const cool = new Color('#cfe0ff');
    const white = new Color('#ffffff');
    const tmp = new Color();
    for (let i = 0; i < count; i++) {
      // Uniform on sphere.
      const z = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const rxy = Math.sqrt(1 - z * z);
      const r = WORLD.starfieldRadius * (0.9 + rand() * 0.1);
      pos[i * 3] = rxy * Math.cos(phi) * r;
      pos[i * 3 + 1] = z * r;
      pos[i * 3 + 2] = rxy * Math.sin(phi) * r;
      const mag = Math.pow(rand(), 2.4);
      sizes[i] = 1.2 + mag * 3.2;
      const t = rand();
      tmp.copy(t < 0.2 ? warm : t < 0.45 ? cool : white).multiplyScalar(0.55 + mag * 0.6);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
      twinkle[i] = rand();
    }
    constellation.positions.forEach((p, k) => {
      const i = count + k;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      sizes[i] = 5.4;
      colors[i * 3] = 1.25;
      colors[i * 3 + 1] = 1.2;
      colors[i * 3 + 2] = 1.1;
      twinkle[i] = 0.5 + k * 0.03;
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    g.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
    g.setAttribute('aTwinkle', new Float32BufferAttribute(twinkle, 1));
    return g;
  }, [count, constellation]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    }),
    [],
  );

  // Discoverability: hovering the patch of sky holding the constellation for a moment
  // fades the connecting lines in. Only active on the home planet.
  useEffect(() => {
    if (scene !== 'home') {
      setRevealed(false);
      return;
    }
    const projected = new Vector3();
    const screen = new Vector2();
    const onMove = (e: PointerEvent) => {
      projected.copy(constellation.center).project(camera);
      screen.set(((projected.x + 1) / 2) * size.width, ((1 - projected.y) / 2) * size.height);
      const inFront = projected.z < 1;
      const dist = Math.hypot(e.clientX - screen.x, e.clientY - screen.y);
      const near = inFront && dist < Math.min(size.width, size.height) * 0.16;
      if (near && hoverTimer.current === null) {
        hoverTimer.current = window.setTimeout(() => setRevealed(true), 900);
      } else if (!near) {
        if (hoverTimer.current !== null) {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = null;
        }
        setRevealed(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    };
  }, [scene, camera, size, constellation]);

  useFrame((_, delta) => {
    if (materialRef.current) materialRef.current.uniforms.uTime!.value += delta;
  });

  const showLines = devMode || revealed;

  return (
    <group name="starfield">
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={starVertex}
          fragmentShader={starFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <group name="ab-constellation">
        {constellation.segments.map(([a, b], i) => (
          <Line
            key={i}
            points={[a, b]}
            color={PALETTE.rimCool}
            transparent
            opacity={showLines ? 0.35 : 0}
            lineWidth={1}
            depthWrite={false}
          />
        ))}
      </group>
    </group>
  );
}

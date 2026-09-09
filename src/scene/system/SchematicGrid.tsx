import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, LineSegments, ShaderMaterial } from 'three';
import type { Settings } from '../../data/schema';
import { PALETTE, WORLD } from '../../lib/constants';
import { systemView } from './systemState';

/**
 * Optional radial schematic grid: concentric circles at the orbit spacing plus a few
 * spokes, fading with distance from the star. Very subtle by design; off by default.
 */

const vertex = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor * uOpacity * vFade, uOpacity * vFade);
  }
`;

export function SchematicGrid({ settings, outerRadius }: { settings: Settings['grid']; outerRadius: number }) {
  const ref = useRef<LineSegments>(null);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const fades: number[] = [];
    const maxR = settings.radius;
    const fadeAt = (r: number) => Math.max(0, 1 - Math.pow(r / maxR, 2.2));
    // Concentric circles, half-spacing between orbit rings for a finer schematic feel.
    const step = WORLD.orbitRingSpacing / 2;
    for (let r = step; r <= maxR; r += step) {
      const seg = 96;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        positions.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
        fades.push(fadeAt(r), fadeAt(r));
      }
    }
    // Spokes
    for (let i = 0; i < settings.density; i++) {
      const a = (i / settings.density) * Math.PI * 2;
      const inner = WORLD.starRadius * 1.6;
      const steps = 24;
      for (let k = 0; k < steps; k++) {
        const r0 = inner + ((maxR - inner) * k) / steps;
        const r1 = inner + ((maxR - inner) * (k + 1)) / steps;
        positions.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
        fades.push(fadeAt(r0) * 0.7, fadeAt(r1) * 0.7);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('aFade', new Float32BufferAttribute(fades, 1));
    return g;
  }, [settings.radius, settings.density]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uColor: { value: new Color(PALETTE.rimCool) }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  useFrame(() => {
    material.uniforms.uOpacity!.value = settings.opacity * systemView.reveal;
  });

  return <lineSegments ref={ref} geometry={geometry} material={material} name="schematic-grid" position={[0, -0.5, 0]} userData={{ outerRadius }} />;
}

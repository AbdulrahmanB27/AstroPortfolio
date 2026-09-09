import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Object3D, Vector3 } from 'three';
import { tetherView } from './tetherState';

/**
 * The comedic-launch tether: a line from a landing leg to the astronaut's hip ring.
 *
 * Drawn as a shallow catenary rather than a straight segment — a taut straight line at this
 * scale reads as a rendering artifact, whereas a rope that sags and straightens as the
 * rocket accelerates is legible as a rope. Sag falls off with distance, so it pulls tight
 * exactly when the climb speeds up.
 */
const SEGMENTS = 12;

export function Tether() {
  const ref = useRef<Object3D>(null);
  const points = useMemo(() => Array.from({ length: SEGMENTS + 1 }, () => new Vector3()), []);
  const initial = useMemo(() => points.map((p) => p.clone()), [points]);

  useFrame(() => {
    const line = ref.current as unknown as
      | (Object3D & { geometry?: { setPositions?: (arr: number[]) => void } })
      | null;
    if (!line) return;
    line.visible = tetherView.visible;
    if (!tetherView.visible) return;

    const { a, b } = tetherView;
    const span = a.distanceTo(b);
    // Slack shrinks as the rope is stretched: taut by the time the rocket is moving.
    const sag = Math.max(0, 0.55 - span * 0.09);
    const flat = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = points[i]!;
      p.lerpVectors(a, b, t);
      // Parabolic droop, perpendicular-ish to the span, strongest at the middle.
      p.y -= sag * 4 * t * (1 - t);
      flat.push(p.x, p.y, p.z);
    }
    line.geometry?.setPositions?.(flat);
  });

  return <Line ref={ref as never} points={initial} color="#f2ead8" lineWidth={2.6} depthWrite={false} />;
}

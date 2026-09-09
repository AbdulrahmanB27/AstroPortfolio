import { describe, expect, it } from 'vitest';
import { computeOrbitLayout, angularDistanceDeg, type LayoutProjectInput } from '../../src/data/orbitLayout';

function project(id: string, order: number, extra: Partial<LayoutProjectInput> = {}): LayoutProjectInput {
  return { id, order, featured: false, size: 1, orbit: {}, ...extra };
}

const seven = [
  project('a', 1, { featured: true, size: 2 }),
  project('b', 2, { featured: true, size: 1.6 }),
  project('c', 3),
  project('d', 4),
  project('e', 5),
  project('f', 6, { size: 0.7 }),
  project('g', 7),
];

describe('computeOrbitLayout', () => {
  it('is deterministic and keeps every project', () => {
    const a = computeOrbitLayout(seven);
    const b = computeOrbitLayout(seven);
    expect(a).toEqual(b);
    expect(a.placements.map((p) => p.id).sort()).toEqual(seven.map((p) => p.id).sort());
  });

  it('gives the first rings a single planet each, then shares rings as the count grows', () => {
    const layout = computeOrbitLayout(seven, { soloRings: 3 });
    const byRing = new Map<number, string[]>();
    for (const p of layout.placements) byRing.set(p.ring, [...(byRing.get(p.ring) ?? []), p.id]);
    expect(byRing.get(0)).toHaveLength(1);
    expect(byRing.get(1)).toHaveLength(1);
    expect(byRing.get(2)).toHaveLength(1);
    expect((byRing.get(3) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(layout.rings.length).toBeLessThanOrEqual(5);
  });

  it('orders projects inward-out by `order` (order 1 is the innermost ring)', () => {
    const layout = computeOrbitLayout(seven);
    const a = layout.placements.find((p) => p.id === 'a')!;
    const g = layout.placements.find((p) => p.id === 'g')!;
    expect(a.ring).toBe(0);
    expect(g.ring).toBeGreaterThan(a.ring);
  });

  it('computes ring radii from base radius and spacing', () => {
    const layout = computeOrbitLayout(seven, { baseRadius: 240, ringSpacing: 70 });
    for (const p of layout.placements) expect(p.radius).toBe(240 + p.ring * 70);
    expect(layout.outerRadius).toBe(240 + (layout.rings.length - 1) * 70);
  });

  it('spaces planets on a shared ring at least the minimum angular separation apart', () => {
    const many = Array.from({ length: 12 }, (_, i) => project(`p${i}`, i + 1));
    const layout = computeOrbitLayout(many);
    for (const ring of layout.rings) {
      const angles = ring.ids.map((id) => layout.placements.find((p) => p.id === id)!.angleDeg);
      for (let i = 0; i < angles.length; i++) {
        for (let j = i + 1; j < angles.length; j++) {
          expect(angularDistanceDeg(angles[i]!, angles[j]!)).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });

  it('keeps initial angles out of the sector directly behind the star', () => {
    const many = Array.from({ length: 12 }, (_, i) => project(`p${i}`, i + 1));
    const layout = computeOrbitLayout(many, { avoidSectorCenterDeg: 270, avoidSectorHalfWidthDeg: 25 });
    for (const p of layout.placements) {
      expect(angularDistanceDeg(p.angleDeg, 270)).toBeGreaterThanOrEqual(25);
    }
  });

  it('honors explicit ring and angle overrides', () => {
    const layout = computeOrbitLayout([
      project('x', 1, { orbit: { ring: 4, angle: 45 } }),
      project('y', 2),
    ]);
    const x = layout.placements.find((p) => p.id === 'x')!;
    expect(x.ring).toBe(4);
    expect(x.angleDeg).toBe(45);
  });

  it('turns relative size into world radius and gives featured planets a boost', () => {
    const layout = computeOrbitLayout(seven, { planetUnit: 12 });
    const a = layout.placements.find((p) => p.id === 'a')!;
    const f = layout.placements.find((p) => p.id === 'f')!;
    expect(a.planetRadius).toBeGreaterThan(f.planetRadius);
    expect(f.planetRadius).toBeGreaterThanOrEqual(8);
    expect(a.planetRadius).toBeLessThanOrEqual(26);
  });

  it('slows the outer rings down (inner rings orbit faster)', () => {
    const layout = computeOrbitLayout(seven);
    const inner = layout.placements.find((p) => p.ring === 0)!;
    const outer = layout.placements.reduce((m, p) => (p.ring > m.ring ? p : m));
    expect(inner.angularSpeed).toBeGreaterThan(outer.angularSpeed);
    expect(outer.angularSpeed).toBeGreaterThan(0);
  });

  it('scales to many projects without exceeding the max ring count', () => {
    const many = Array.from({ length: 20 }, (_, i) => project(`p${i}`, i + 1));
    const layout = computeOrbitLayout(many, { maxRings: 8 });
    expect(layout.rings.length).toBeLessThanOrEqual(8);
    expect(layout.placements).toHaveLength(20);
  });
});

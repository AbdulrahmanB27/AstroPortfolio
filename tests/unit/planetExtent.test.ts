import { describe, expect, it } from 'vitest';
import { drawnExtent, moonOrbit, moonRadius, RING_OUTER } from '../../src/scene/system/planetExtent';

/**
 * The label solver keeps its labels off a planet by inflating a disc to the planet's drawn
 * extent. That number used to be hand-tuned in the label code while the geometry was built
 * from different constants in the scene, and they disagreed: a planet with one moon reaches
 * 1.96 body radii, the keep-out was set at 1.9, and the moon was drawn over the last letter
 * of a project name. These tests pin the extent to the geometry that is actually drawn.
 */
describe('drawnExtent', () => {
  it('clears a bare planet by a small margin', () => {
    expect(drawnExtent({ rings: false, moons: 0 })).toBeGreaterThan(1);
    expect(drawnExtent({ rings: false, moons: 0 })).toBeLessThan(1.3);
  });

  it('clears the outer edge of the ring annulus', () => {
    expect(drawnExtent({ rings: true, moons: 0 })).toBeGreaterThanOrEqual(RING_OUTER);
  });

  it('covers the far side of the outermost moon, not just its orbit', () => {
    for (const moons of [1, 2, 3]) {
      const last = moons - 1;
      const far = moonOrbit(last) + moonRadius(last);
      expect(drawnExtent({ rings: false, moons }), `${moons} moon(s)`).toBeGreaterThanOrEqual(far);
    }
  });

  it('grows with the moon count', () => {
    const one = drawnExtent({ rings: false, moons: 1 });
    const three = drawnExtent({ rings: false, moons: 3 });
    expect(three).toBeGreaterThan(one);
    // The old single multiplier (1.9) was below even the one-moon case.
    expect(one).toBeGreaterThan(1.9);
  });

  it('takes whichever of rings and moons reaches further', () => {
    // Three moons reach past the ring annulus; one moon does not.
    expect(drawnExtent({ rings: true, moons: 3 })).toBeGreaterThan(RING_OUTER);
    expect(drawnExtent({ rings: true, moons: 1 })).toBe(RING_OUTER);
  });
});

import type { Project } from '../../data/schema';

/**
 * How far a planet's drawing reaches past its own body, in body radii.
 *
 * This exists because the number was written down twice: `ProjectPlanet` built the rings
 * and moons from one set of constants, and `PlanetLabels` inflated its label keep-out disc
 * from a different, hand-tuned set. They disagreed, and the label solver believed the
 * smaller one — so a moon was drawn across the last letter of MYKITCHEN. Anything that
 * needs to know how much room a planet occupies reads it from here, and the geometry is
 * built from the same constants, so the two cannot drift apart again.
 */

/** Ring annulus, in body radii. Must match the geometry built in `ProjectPlanet`. */
export const RING_INNER = 1.45;
export const RING_OUTER = 2.3;

/** Moon `i`: orbit distance and its own radius, in body radii. */
export const moonOrbit = (i: number): number => 1.8 + i * 0.5;
export const moonRadius = (i: number): number => 0.16 + i * 0.05;

/**
 * Outermost drawn extent in body radii, including the far side of the outermost moon.
 * The small constant on the bare-body case keeps a label off the terminator.
 */
export function drawnExtent(planet: Pick<Project['planet'], 'rings' | 'moons'>): number {
  let extent = 1.1;
  if (planet.rings) extent = Math.max(extent, RING_OUTER);
  if (planet.moons > 0) {
    const last = planet.moons - 1;
    extent = Math.max(extent, moonOrbit(last) + moonRadius(last));
  }
  return extent;
}

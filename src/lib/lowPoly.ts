import { MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial } from 'three';

/**
 * `?lowpoly`: the same universe in a faceted, low-poly style, so the two looks can be shown
 * side by side and compared. Add it to any address on the site — `/?lowpoly`,
 * `/?lowpoly#/projects` — and every hash route keeps it.
 *
 * Two things make the look. Curved forms are built from about a quarter of the segments, so a
 * sphere or a cylinder shows its facets, and every lit material is flat-shaded, so each facet
 * catches the light as one plane instead of being smoothed into a curve. Nothing else about
 * the scene changes: the same layout, palette, lighting and motion.
 */
export const LOW_POLY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lowpoly');

/** A segment count for the current style: about a quarter in low-poly, never below `min`. */
export function seg(n: number, min: number): number {
  return LOW_POLY ? Math.max(min, Math.round(n / 4)) : n;
}

/*
 * Flat shading for every lit material, wherever and however it is created.
 *
 * The materials are built in a dozen places, most of them with `new` rather than JSX, so this
 * is done once, at the class: three's constructors assign `this.flatShading = false`, and an
 * accessor on the prototype turns that assignment, and any later one, into a no-op that
 * reads back true.
 */
if (LOW_POLY) {
  for (const Material of [MeshStandardMaterial, MeshPhongMaterial, MeshLambertMaterial]) {
    Object.defineProperty(Material.prototype, 'flatShading', {
      configurable: true,
      get: () => true,
      set: () => {},
    });
  }
}

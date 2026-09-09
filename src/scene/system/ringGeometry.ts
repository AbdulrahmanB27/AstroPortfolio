import { RingGeometry } from 'three';

/**
 * A ring with *radial* UVs.
 *
 * three.js maps `RingGeometry` UVs planar-ly across the bounding box, so a 1-D band
 * texture ends up drawn as straight bars across the annulus instead of following the
 * circumference — the ring reads as a plank rather than dust and ice. Rewriting the
 * attribute so `u` runs from the inner edge to the outer edge fixes both the banding and
 * the alpha falloff that depends on it.
 */
export function buildRingGeometry(inner: number, outer: number, segments = 128): RingGeometry {
  const geometry = new RingGeometry(inner, outer, segments, 2);
  const pos = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  const span = outer - inner || 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const radius = Math.hypot(x, y);
    // u = radial position across the band, v = angle around it.
    uv.setXY(i, (radius - inner) / span, (Math.atan2(y, x) / (Math.PI * 2) + 0.5) % 1);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Pure orbital layout: turns the project list into rings, angles, speeds and sizes.
 * No three.js here so it can be unit tested and reused by the admin preview.
 *
 * Coordinate convention used by the scene: a planet at angle θ (degrees) sits at
 * (r·cos θ, 0, r·sin θ). The system camera looks from +Z toward the origin, so the
 * sector around θ = 270° is "behind the star" from the default viewpoint; initial
 * angles avoid it so labels never start out crossing the star.
 */

export interface LayoutProjectInput {
  id: string;
  order: number;
  featured: boolean;
  /** Relative size from the content file (0.5–3). */
  size: number;
  orbit: { ring?: number; angle?: number; speed?: number };
}

export interface OrbitLayoutOptions {
  baseRadius?: number;
  ringSpacing?: number;
  /** How many innermost rings hold exactly one planet. */
  soloRings?: number;
  maxRings?: number;
  /** Minimum angular distance between planets sharing a ring. */
  minSeparationDeg?: number;
  avoidSectorCenterDeg?: number;
  avoidSectorHalfWidthDeg?: number;
  /** World radius of a size-1 planet. */
  planetUnit?: number;
  featuredBoost?: number;
  /** Radians per second for the innermost ring (default: one revolution per 12 minutes). */
  baseAngularSpeed?: number;
}

export interface PlanetPlacement {
  id: string;
  ring: number;
  radius: number;
  angleDeg: number;
  angularSpeed: number;
  planetRadius: number;
}

export interface OrbitRing {
  index: number;
  radius: number;
  ids: string[];
}

export interface OrbitLayout {
  placements: PlanetPlacement[];
  rings: OrbitRing[];
  outerRadius: number;
}

const GOLDEN_ANGLE = 137.50776405;

export function angularDistanceDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

function normalizeDeg(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Ring capacities: solo rings first, then growing capacity, expanded if the count demands it. */
function ringCapacities(count: number, soloRings: number, maxRings: number, maxPerRing: number): number[] {
  const caps: number[] = [];
  let total = 0;
  for (let k = 0; k < maxRings && total < count; k++) {
    const natural = k < soloRings ? 1 : k < soloRings + 2 ? 2 : 3;
    caps.push(natural);
    total += natural;
  }
  // If the natural pattern cannot hold everything within maxRings, widen the outer rings first.
  let k = caps.length - 1;
  while (total < count && k >= 0) {
    let grew = false;
    for (let i = caps.length - 1; i >= 0 && total < count; i--) {
      if (caps[i]! < maxPerRing) {
        caps[i]!++;
        total++;
        grew = true;
      }
    }
    if (!grew) break;
    k--;
  }
  return caps;
}

function inAvoidSector(angle: number, center: number, halfWidth: number): boolean {
  return angularDistanceDeg(angle, center) < halfWidth;
}

/**
 * Chooses a rotation offset for a ring so that none of its evenly spaced planets start
 * inside the avoided sector. Because planets are ≥ minSeparation apart and the sector is
 * narrower than that gap, such an offset always exists.
 */
function chooseRingOffset(ringIndex: number, count: number, avoidCenter: number, avoidHalf: number): number {
  const step = 360 / count;
  const preferred = normalizeDeg(ringIndex * GOLDEN_ANGLE + 22);
  for (let t = 0; t < 72; t++) {
    const offset = normalizeDeg(preferred + t * 5);
    let clear = true;
    for (let i = 0; i < count; i++) {
      if (inAvoidSector(normalizeDeg(offset + i * step), avoidCenter, avoidHalf)) {
        clear = false;
        break;
      }
    }
    if (clear) return offset;
  }
  return preferred;
}

export function computeOrbitLayout(projects: LayoutProjectInput[], options: OrbitLayoutOptions = {}): OrbitLayout {
  const {
    baseRadius = 240,
    ringSpacing = 70,
    soloRings = 3,
    maxRings = 8,
    minSeparationDeg = 60,
    avoidSectorCenterDeg = 270,
    avoidSectorHalfWidthDeg = 25,
    planetUnit = 12,
    featuredBoost = 1.15,
    baseAngularSpeed = (Math.PI * 2) / 720,
  } = options;

  const sorted = [...projects].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const maxPerRing = Math.max(1, Math.floor(360 / minSeparationDeg));

  // 1. Explicit ring overrides are honored first; the rest fill rings inward-out.
  const ringMembers = new Map<number, LayoutProjectInput[]>();
  const auto: LayoutProjectInput[] = [];
  for (const p of sorted) {
    if (p.orbit.ring !== undefined) {
      const ring = Math.min(p.orbit.ring, maxRings - 1);
      ringMembers.set(ring, [...(ringMembers.get(ring) ?? []), p]);
    } else {
      auto.push(p);
    }
  }
  const caps = ringCapacities(auto.length + [...ringMembers.values()].flat().length, soloRings, maxRings, maxPerRing);
  let ringIndex = 0;
  for (const p of auto) {
    while (ringIndex < caps.length - 1 && (ringMembers.get(ringIndex)?.length ?? 0) >= (caps[ringIndex] ?? 1)) {
      ringIndex++;
    }
    ringMembers.set(ringIndex, [...(ringMembers.get(ringIndex) ?? []), p]);
  }

  // 2. Angles: even spacing per ring with a golden-angle offset, steered out of the avoid sector.
  const placements: PlanetPlacement[] = [];
  const rings: OrbitRing[] = [];
  const ringIndices = [...ringMembers.keys()].sort((a, b) => a - b);
  for (const ring of ringIndices) {
    const members = ringMembers.get(ring)!;
    const radius = baseRadius + ring * ringSpacing;
    const offset = chooseRingOffset(ring, members.length, avoidSectorCenterDeg, avoidSectorHalfWidthDeg);
    const step = 360 / members.length;
    const speed = baseAngularSpeed * Math.pow(baseRadius / radius, 0.75);
    members.forEach((p, i) => {
      const angleDeg = p.orbit.angle !== undefined ? normalizeDeg(p.orbit.angle) : normalizeDeg(offset + i * step);
      const sizeFactor = Math.pow(Math.max(0.5, p.size), 0.85) * (p.featured ? featuredBoost : 1);
      const planetRadius = Math.min(26, Math.max(10, planetUnit * sizeFactor));
      placements.push({
        id: p.id,
        ring,
        radius,
        angleDeg,
        angularSpeed: speed * (p.orbit.speed ?? 1),
        planetRadius,
      });
    });
    rings.push({ index: ring, radius, ids: members.map((m) => m.id) });
  }

  const outerRadius = rings.length ? rings[rings.length - 1]!.radius : baseRadius;
  return { placements, rings, outerRadius };
}

/** World position for a placement at a given elapsed time (seconds). */
export function orbitPosition(p: PlanetPlacement, elapsedSeconds: number, speedScale = 1): [number, number, number] {
  const theta = (p.angleDeg * Math.PI) / 180 + p.angularSpeed * speedScale * elapsedSeconds;
  return [p.radius * Math.cos(theta), 0, p.radius * Math.sin(theta)];
}

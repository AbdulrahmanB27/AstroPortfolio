/**
 * World scale and shared constants. Every scene component reads from here so the four
 * environments stay in one coordinate system. See docs/ART_DIRECTION.md → Scale.
 */
export const WORLD = {
  /** Central star radius; the star sits at the origin. */
  starRadius: 30,
  /** Home planet (not a project). */
  homeRingRadius: 190,
  homePlanetRadius: 9,
  /**
   * Angle (degrees) from the sub-stellar point to the standing spot on the home planet.
   * ~77° puts the star about 10° above the local horizon, so it sits right on top of the
   * horizon line and dominates the upper-middle of the home frame.
   */
  homeStageAngleDeg: 77.3,
  /**
   * The surface "stage" uses a larger tangent sphere so the horizon reads as a gentle
   * curve at eye height. It is only visible in home/launch/return states; the launch
   * sequence hides the swap to the small orbital body.
   */
  surfaceRadius: 400,
  surfaceExtent: 170,
  /** Project orbit rings. */
  orbitBaseRadius: 300,
  orbitRingSpacing: 70,
  /** Starfield sphere radius. */
  starfieldRadius: 7000,
  /** Flight-mode easter egg. */
  deathStarDistance: 3200,
  deathStarAngleDeg: 200,
  deathStarRadius: 120,
} as const;

export const PALETTE = {
  space900: '#05070d',
  space700: '#0b1020',
  ink100: '#eef2f8',
  ink300: '#a9b4c7',
  ink500: '#67718a',
  starCore: '#fff6dc',
  starGlow: '#ffb454',
  starEdge: '#ff7a2a',
  rimCool: '#6fa3ff',
  keyLight: '#ffd9a0',
  cockpitGraphite: '#14171d',
  cockpitPanel: '#1e232b',
  screenGlow: '#cfe8ff',
  terrain: '#6f665d',
  terrainDark: '#4a433d',
  suitWhite: '#e9e6e0',
  rocketWhite: '#e6e3dc',
  graphite: '#2a2f38',
} as const;

/** Local positions on the surface stage (x right, y up, -z toward the star). */
export const STAGE = {
  cameraHeight: 2.0,
  astronaut: [-3.6, 0, -9] as const,
  astronautYaw: -0.5,
  rocket: [4.2, 0, -16] as const,
  rocketYaw: -0.3,
  /** Radius around the stage origin kept flat for the characters and the rocket pad. */
  flatRadius: 22,
} as const;

export const BREAKPOINTS = {
  mobile: 820,
  laptop: 1280,
  wide: 1800,
} as const;

export type Breakpoint = 'mobile' | 'laptop' | 'desktop' | 'wide';

export function breakpointFor(width: number, height: number): Breakpoint {
  if (width < BREAKPOINTS.mobile || (width < 1000 && height > width)) return 'mobile';
  if (width < BREAKPOINTS.laptop) return 'laptop';
  if (width >= BREAKPOINTS.wide) return 'wide';
  return 'desktop';
}

export const STORAGE_KEYS = {
  visited: 'astro.visited',
  falcon: 'astro.falcon',
  audio: 'astro.audio',
  settings: 'astro.settings',
} as const;

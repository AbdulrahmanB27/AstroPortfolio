/** Motion helpers shared by sequences (see docs/ART_DIRECTION.md → Motion table). */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Durations in seconds. Repeat variants are used after the first play. */
export const DURATIONS = {
  introFirst: 6.4,
  introReturning: 1.8,
  enterCockpit: 2.2,
  enterCockpitRepeat: 1.2,
  exitCockpit: 1.6,
  exitCockpitRepeat: 1.0,
  launch: 7.0,
  focusProject: 1.4,
  returnToOrbit: 1.0,
  returnHome: 3.0,
  reduced: 0.3,
} as const;

export function scaledDuration(seconds: number, reduced: boolean): number {
  return reduced ? DURATIONS.reduced : seconds;
}

export const EASES = {
  glide: 'power3.inOut',
  settle: 'power2.out',
  approach: 'power2.inOut',
  rocket: 'power2.in',
  soft: 'sine.inOut',
} as const;

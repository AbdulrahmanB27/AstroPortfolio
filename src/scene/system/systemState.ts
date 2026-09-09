/**
 * Reveal and dim state for the solar system, held at module scope.
 *
 * These are written by sequences (the launch reveal, focusing a project) and read every
 * frame by the scene. They deliberately do NOT live in component state: a sequence can
 * run before the scene has mounted — a deep link to `#/projects` does exactly that — and
 * a value written into a `useMemo` object is lost when the component remounts, which left
 * the projects page rendering an empty starfield. Same pattern as `rig` and `orbitClock`.
 */
export const systemView = {
  /** 0 = nothing drawn, 1 = the full system. Driven by the launch's reveal phase. */
  reveal: 0,
  /** 0 = normal, 1 = pushed back behind a focused project. */
  dim: 0,
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function setSystemReveal(value: number): void {
  systemView.reveal = clamp01(value);
}

export function setSystemDim(value: number): void {
  systemView.dim = clamp01(value);
}

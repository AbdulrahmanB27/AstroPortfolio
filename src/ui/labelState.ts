/** Shared label visibility multiplier (sequences fade labels during transitions). */
export const labelState = { alpha: 1 };

export function setLabelsAlpha(a: number): void {
  labelState.alpha = Math.max(0, Math.min(1, a));
}

/**
 * Opacity of the home planet's surface stage, held at module scope.
 *
 * Sequences set this before the scene exists — `playIntro` fades the ground out on its very
 * first line, during boot — so writing it through a handle dropped the value and left the
 * rocket and the astronaut drawn beside the home planet in the opening cinematic, with the
 * ground they stand on invisible. Third time this shape of bug appeared; the component now
 * reads the value every frame instead of being told once.
 *
 * See also `systemView`, `vehicleView` and `probeView`.
 */
export const stageView = { opacity: 1 };

export function setStageOpacity(value: number): void {
  stageView.opacity = Math.max(0, Math.min(1, value));
}

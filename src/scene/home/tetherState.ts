import { Vector3 } from 'three';

/**
 * The comedic launch's tether, held at module scope.
 *
 * The line is a drei `<Line>`, and its `visible` prop was being re-applied as `false` on
 * every React commit — including the ones the scene-state change fires mid-launch — which
 * silently undid the imperative `setVisible(true)`. The result was the astronaut trailing
 * the rocket completely unattached, so the joke read as a character falling off the pad
 * rather than being towed by the leg.
 *
 * Read every frame by the component, like `systemView`, `vehicleView`, `probeView` and
 * `stageView`.
 */
export const tetherView = {
  visible: false,
  /** Anchor on the landing leg. */
  a: new Vector3(),
  /** Anchor on the astronaut's hip ring. */
  b: new Vector3(),
};

export function setTether(a: Vector3, b: Vector3): void {
  tetherView.a.copy(a);
  tetherView.b.copy(b);
}

export function setTetherVisible(visible: boolean): void {
  tetherView.visible = visible;
}

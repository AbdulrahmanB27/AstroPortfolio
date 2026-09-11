import { Vector3 } from 'three';
import type { CockpitTab } from '../../state/store';

/**
 * Where each console screen actually is, published by the scene graph.
 *
 * The reading pose needs a screen's world centre and the direction it faces. Deriving those
 * a second time from the same numbers the geometry is built from looks equivalent and is
 * not: the mesh's transform passes through a group position, a stage quaternion and a
 * three.js Euler whose composition order is easy to get wrong. Re-deriving it put the camera
 * 8.9 degrees off the centre of the screen it was supposed to be reading, so the display
 * arrived skewed and pushed to one side of the frame.
 *
 * `Cockpit` writes these from `matrixWorld` once the group exists; `cockpitScreenPose` reads
 * them. Same reasoning as `planetExtent` — one definition of a physical fact, and the
 * consumer asks rather than recomputes. Module scope rather than the `handles` registry for
 * the usual reason: a deep link places the camera during boot, before the component mounts.
 */
export interface ScreenPlacement {
  centre: Vector3;
  /** Outward normal: the direction the screen faces. */
  normal: Vector3;
  /**
   * The screen's own up. Without it the reading camera keeps world up, and a display whose
   * up is not world up renders rolled in the frame — square-on and centred, and still
   * visibly tilted, which is a confusing thing to debug because every angle measures zero.
   */
  up: Vector3;
  width: number;
  height: number;
}

const placements = new Map<CockpitTab, ScreenPlacement>();

export function setScreenPlacement(id: CockpitTab, placement: ScreenPlacement): void {
  placements.set(id, placement);
}

export function getScreenPlacement(id: CockpitTab): ScreenPlacement | undefined {
  return placements.get(id);
}

export function clearScreenPlacements(): void {
  placements.clear();
}

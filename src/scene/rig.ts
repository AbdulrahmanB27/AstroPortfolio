import { Vector3 } from 'three';

/**
 * The camera rig is a plain mutable object that gsap sequences tween and the
 * `CameraRig` component copies onto the real camera every frame. Keeping it outside React
 * means sequences never trigger re-renders and can run at animation speed.
 */
export interface CameraRigState {
  position: Vector3;
  target: Vector3;
  fov: number;
  /** 0 = no idle sway, 1 = full sway (home/system idle). */
  sway: number;
  /** Extra roll in radians (used lightly during launch). */
  roll: number;
  /** Small camera-shake amplitude in world units (launch only, ≤ 0.06). */
  shake: number;
}

export const rig: CameraRigState = {
  position: new Vector3(0, 400, 1400),
  target: new Vector3(0, 0, 0),
  fov: 42,
  sway: 0,
  roll: 0,
  shake: 0,
};

/** Registry of scene objects that sequences animate (rocket, astronaut, lights…). */
export interface SceneHandles {
  rocket?: import('three').Group;
  rocketEngine?: { setThrust: (t: number) => void };
  rocketHatch?: { setOpen: (t: number) => void };
  astronaut?: import('three').Group;
  surfaceStage?: { setOpacity: (o: number) => void };
  cockpit?: { setPower: (p: number) => void };
  systemGroup?: { setReveal: (r: number) => void; setDim: (d: number) => void };
  /** Scene exposure: 1 = normal world, 0 = dimmed behind a focused project. */
  exposure?: { setLevel: (level: number) => void };
  homeBody?: import('three').Group;
  flightShip?: import('three').Group;
  /**
   * Flight-mode easter egg, mounted only while flying. `teleport` exists so automated
   * checks can reach the far side of the map without flying there in real time.
   */
  flight?: {
    teleport: (x: number, z: number, aimAt?: [number, number]) => void;
    getPosition: () => [number, number, number];
    getHeading: () => number;
    readonly ship: string;
  };
}

export const handles: SceneHandles = {};

/**
 * The live three.js camera and scene, registered by `CameraRig` on mount.
 *
 * Dev mode exposes these on `window.__astro` so framing questions ("is the star actually
 * inside the window aperture?") can be answered by projecting real world positions rather
 * than by eyeballing a screenshot. Nothing in the product reads them.
 */
export const live: { camera?: import('three').PerspectiveCamera; scene?: import('three').Scene } = {};

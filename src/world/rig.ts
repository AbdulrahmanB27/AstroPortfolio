import { Vector3 } from 'three'

/**
 * Mutable per-frame state. Never put these values in React or Zustand:
 * the director tweens them, scene components read them inside useFrame.
 */
export interface Pose {
  pos: Vector3
  target: Vector3
  fov: number
  /** Idle drift amplitude in metres at this shot. */
  sway?: number
}

export type ShotFn = (aspect: number) => Pose

export const rig = {
  pos: new Vector3(0, 2, 10),
  target: new Vector3(0, 1, 0),
  fov: 40,
  roll: 0,
  sway: 0.03,
  /** Shot the camera rests on; re-evaluated on resize while idle. */
  resting: null as ShotFn | null,
  /** User orbit offsets (system view only). */
  orbitAz: 24,
  orbitEl: 0,
  orbitZoom: 1,
}

export const fx = {
  time: 0,
  frozen: false,
  /** 0..1 main engine throttle. */
  engine: 0,
  /** Metres the rocket has climbed along its up axis. */
  lift: 0,
  /** Metres flown towards the star after the pitch-over, and the pitch itself (rad). */
  downrange: 0,
  pitch: 0,
  rocketVisible: 1,
  /** 0 closed .. 1 open. */
  hatch: 0,
  hatchGlow: 0,
  /** 0..1 cockpit power (lights + screen). */
  cockpitPower: 0,
  /** 0..1 black dip used to hide the doorway crossing. */
  blackout: 0,
  /** 0 = home presentation, 1 = system presentation (planet scale, globe scale, orbit line weight). */
  system: 0,
  /** 0..1 how strongly the orbit view is de-emphasised behind a focused project. */
  focusDim: 0,
  /** 0..1 probe deployment. */
  probe: 0,
  dust: 0,
  /** Tether gag progress 0..1, <0 when inactive. */
  gag: -1,
  /** Orbital clock (seconds), advanced unless paused. */
  orbitTime: 40,
  orbitPaused: false,
}

export function setPose(p: Pose) {
  rig.pos.copy(p.pos)
  rig.target.copy(p.target)
  rig.fov = p.fov
  if (p.sway !== undefined) rig.sway = p.sway
}

export const clonePose = (p: Pose): Pose => ({ pos: p.pos.clone(), target: p.target.clone(), fov: p.fov, sway: p.sway })
export const currentPose = (): Pose => ({ pos: rig.pos.clone(), target: rig.target.clone(), fov: rig.fov, sway: rig.sway })

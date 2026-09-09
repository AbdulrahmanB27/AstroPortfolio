import { Vector3 } from 'three';
import { WORLD } from '../../lib/constants';

/**
 * Mutable flight-mode state shared by the scene (physics + models), the sequences
 * (spawn, camera hand-off) and the HUD (compass, toast). Plain objects, no React state:
 * everything here is written per frame.
 */

export type ShipKind = 'rocket' | 'falcon';

export const FLIGHT = {
  /** Height of the ship above the orbital plane. */
  altitude: 8,
  /** The playfield edge; the ship is pushed back inside. */
  bounds: 4200,
  /** Distance from the Death Star centre that counts as "found". */
  discoveryRadius: 260,
  /** The compass breadcrumb only shows once the ship is this far from the star. */
  compassMinRadius: 900,
  maxSpeed: 320,
  boostSpeed: 560,
  reverseSpeed: 80,
  accel: 220,
  boostAccel: 330,
  brake: 260,
  /** Coast damping per second when no key is held. */
  drag: 0.8,
  /** Yaw rate in rad/s at rest; wider arcs at speed. */
  yawRate: 1.5,
} as const;

const dsAngle = (WORLD.deathStarAngleDeg * Math.PI) / 180;
export const DEATH_STAR_POSITION = new Vector3(
  Math.cos(dsAngle) * WORLD.deathStarDistance,
  0,
  Math.sin(dsAngle) * WORLD.deathStarDistance,
);

export interface FlightState {
  /** True from spawn until the exit sequence finishes. */
  active: boolean;
  position: Vector3;
  velocity: Vector3;
  /** Yaw in radians; forward = (-sin, 0, -cos) so heading 0 faces -Z like a three.js object. */
  heading: number;
  yawVel: number;
  /** Smoothed yaw the chase camera hangs from (lags the hull in turns, never sideways). */
  camYaw: number;
  /** |velocity| / boostSpeed, 0..1. */
  speedFactor: number;
  /** Smoothed engine output for the models, 0..1.3 (boost overshoots 1). */
  thrust: number;
  /** Visual bank (roll) and pitch of the hull, radians. */
  bank: number;
  pitch: number;
}

export const flight: FlightState = {
  active: false,
  position: new Vector3(0, FLIGHT.altitude, 0),
  velocity: new Vector3(),
  heading: 0,
  yawVel: 0,
  camYaw: 0,
  speedFactor: 0,
  thrust: 0,
  bank: 0,
  pitch: 0,
};

export function forwardOf(heading: number, out: Vector3): Vector3 {
  return out.set(-Math.sin(heading), 0, -Math.cos(heading));
}

export function rightOf(heading: number, out: Vector3): Vector3 {
  return out.set(Math.cos(heading), 0, -Math.sin(heading));
}

/** Heading whose forward vector points along (fx, fz). */
export function headingToward(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz);
}

/** Wrap an angle difference into (-π, π]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Park the ship just outside the home planet's ring, facing out across the system. */
export function spawnShip(): void {
  const a = (30 * Math.PI) / 180;
  const r = WORLD.homeRingRadius + 14;
  flight.position.set(Math.cos(a) * r, FLIGHT.altitude, Math.sin(a) * r);
  flight.heading = headingToward(Math.cos(a), Math.sin(a));
  flight.camYaw = flight.heading;
  flight.velocity.set(0, 0, 0);
  flight.yawVel = 0;
  flight.speedFactor = 0;
  flight.thrust = 0;
  flight.bank = 0;
  flight.pitch = 0;
  flight.active = true;
}

export interface ChaseParams {
  back: number;
  up: number;
  ahead: number;
  aheadUp: number;
  fov: number;
}

/** Chase-camera offsets per hull; the Falcon is wider so the camera sits further back. */
export const CHASE: Record<ShipKind, ChaseParams> = {
  rocket: { back: 26, up: 9, ahead: 34, aheadUp: 2, fov: 50 },
  falcon: { back: 32, up: 11.5, ahead: 36, aheadUp: 2.5, fov: 50 },
};

export interface ChasePose {
  position: Vector3;
  target: Vector3;
  fov: number;
}

const tmpF = new Vector3();

/**
 * Where the camera sits for the current ship state: rigid relative to the hull (so the
 * ship never slides out of frame when it is pushed sideways), hanging from the smoothed
 * `camYaw`. The enter sequence tweens to this pose; afterwards it is applied per frame.
 */
export function chasePose(p: ChaseParams, out: ChasePose, speedFactor = flight.speedFactor, kinetic = true): ChasePose {
  const f = forwardOf(flight.camYaw, tmpF);
  const s = kinetic ? speedFactor : 0;
  out.position.copy(flight.position).addScaledVector(f, -(p.back + s * 9)).add({ x: 0, y: p.up + s * 2, z: 0 } as Vector3);
  out.target.copy(flight.position).addScaledVector(f, p.ahead).add({ x: 0, y: p.aheadUp, z: 0 } as Vector3);
  out.fov = p.fov + s * 5;
  return out;
}

// ---------------------------------------------------------------------------
// Tiny event channel for HUD messages (kept out of the store: it is per-session UI).
// ---------------------------------------------------------------------------

type ToastListener = (text: string) => void;
const toastListeners = new Set<ToastListener>();

export function onFlightToast(fn: ToastListener): () => void {
  toastListeners.add(fn);
  return () => {
    toastListeners.delete(fn);
  };
}

export function emitFlightToast(text: string): void {
  toastListeners.forEach((fn) => fn(text));
}

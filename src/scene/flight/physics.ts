import { Vector3 } from 'three';
import { FLIGHT, flight, forwardOf } from './flightState';
import type { FlightInput } from './controls';

/**
 * Arcade flight on the orbital plane: velocity is steered toward the heading ("grip"),
 * thrust and brake act along the hull, everything damps when the keys are released.
 * Not a simulator — it only needs to feel pleasant and stay readable.
 */

export interface Obstacle {
  x: number;
  z: number;
  /** Keep-out radius in the plane (body radius + margin). */
  radius: number;
}

const fwd = new Vector3();
const tmp = new Vector3();
const n = new Vector3();

function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function stepFlight(dt: number, inp: FlightInput, obstacles: readonly Obstacle[]): void {
  const v = flight.velocity;
  const p = flight.position;
  const speed = v.length();
  const speedFactor = Math.min(1, speed / FLIGHT.boostSpeed);

  // Yaw: smoothed toward the input, slower at high speed for wider arcs.
  const turn = inp.left - inp.right;
  const targetYaw = turn * FLIGHT.yawRate * (1 - 0.35 * speedFactor);
  flight.yawVel += (targetYaw - flight.yawVel) * ease(8, dt);
  flight.heading += flight.yawVel * dt;
  forwardOf(flight.heading, fwd);

  // Grip: the velocity vector follows the nose (a little slip keeps turns fluid).
  if (speed > 0.01) {
    const along = v.dot(fwd);
    tmp.copy(fwd).multiplyScalar(along >= 0 ? speed : -speed);
    v.lerp(tmp, ease(5, dt));
  }

  const boosting = inp.boost > 0 && inp.thrust > 0;
  if (inp.thrust > 0) v.addScaledVector(fwd, (boosting ? FLIGHT.boostAccel : FLIGHT.accel) * inp.thrust * dt);
  if (inp.brake > 0) v.addScaledVector(fwd, -FLIGHT.brake * inp.brake * dt);
  if (inp.thrust === 0 && inp.brake === 0) v.multiplyScalar(Math.exp(-FLIGHT.drag * dt));

  // Speed limits along the hull; over-speed after a boost bleeds off smoothly.
  const max = boosting ? FLIGHT.boostSpeed : FLIGHT.maxSpeed;
  const along = v.dot(fwd);
  if (along > max) v.addScaledVector(fwd, (max - along) * ease(3, dt));
  if (along < -FLIGHT.reverseSpeed) v.addScaledVector(fwd, -FLIGHT.reverseSpeed - along);

  p.addScaledVector(v, dt);
  p.y = FLIGHT.altitude;

  // Playfield edge: slide back inside and drop the outward component.
  const r = Math.hypot(p.x, p.z);
  if (r > FLIGHT.bounds) {
    n.set(p.x / r, 0, p.z / r);
    p.x = n.x * FLIGHT.bounds;
    p.z = n.z * FLIGHT.bounds;
    const vn = v.dot(n);
    if (vn > 0) v.addScaledVector(n, -vn * 1.2);
  }

  // Soft collision: never enter a body; nudge out along the contact normal.
  for (const o of obstacles) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= o.radius) continue;
    if (d < 1e-3) n.copy(fwd).negate();
    else n.set(dx / d, 0, dz / d);
    p.x = o.x + n.x * o.radius;
    p.z = o.z + n.z * o.radius;
    const vn = v.dot(n);
    if (vn < 0) v.addScaledVector(n, -vn * 1.35);
  }

  // Visual state for the models and the camera.
  flight.speedFactor = Math.min(1, v.length() / FLIGHT.boostSpeed);
  const thrustTarget = inp.thrust > 0 ? (boosting ? 1.3 : 1) : inp.brake > 0 ? 0.15 : 0;
  flight.thrust += (thrustTarget - flight.thrust) * ease(6, dt);
  const bankTarget = Math.max(-0.32, Math.min(0.32, flight.yawVel * 0.22));
  flight.bank += (bankTarget - flight.bank) * ease(5, dt);
  const pitchTarget = inp.thrust > 0 ? -0.05 : inp.brake > 0 ? 0.04 : 0;
  flight.pitch += (pitchTarget - flight.pitch) * ease(4, dt);
}

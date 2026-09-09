import { Matrix4, Quaternion, Vector3 } from 'three';
import { STAGE, WORLD } from './constants';

/**
 * The surface stage is a local frame on the home planet: origin at the standing spot,
 * +Y = local up, -Z = horizontal direction toward the star, +X = right. Everything on
 * the surface (terrain, astronaut, rocket, cockpit, camera poses) is authored in this
 * frame and placed in the world through `stageToWorld`.
 */

const homeCenter = new Vector3(WORLD.homeRingRadius, 0, 0);

const alpha = (WORLD.homeStageAngleDeg * Math.PI) / 180;
// Up direction on the day side, tilted toward +Y so the stage sits "on top" of the planet
// from the system camera's point of view.
const up = new Vector3(-Math.cos(alpha), Math.sin(alpha), 0).normalize();
const origin = homeCenter.clone().addScaledVector(up, WORLD.homePlanetRadius);

const toStar = new Vector3(0, 0, 0).sub(origin).normalize();
const forward = toStar.clone().addScaledVector(up, -toStar.dot(up)).normalize();
const right = new Vector3().crossVectors(forward, up).normalize();
const back = forward.clone().negate();

const basis = new Matrix4().makeBasis(right, up, back);
const quaternion = new Quaternion().setFromRotationMatrix(basis);
const stageMatrix = new Matrix4().compose(origin, quaternion, new Vector3(1, 1, 1));

export const STAGE_FRAME = {
  origin: origin.clone(),
  up: up.clone(),
  forward: forward.clone(),
  right: right.clone(),
  quaternion: quaternion.clone(),
  matrix: stageMatrix.clone(),
  homeCenter: homeCenter.clone(),
  /** Elevation of the star above the local horizon, radians. */
  starElevation: Math.asin(toStar.dot(up)),
};

export function stageToWorld(local: readonly [number, number, number] | Vector3, target = new Vector3()): Vector3 {
  const v = local instanceof Vector3 ? target.copy(local) : target.set(local[0], local[1], local[2]);
  return v.applyMatrix4(stageMatrix);
}

export function stageDirToWorld(local: readonly [number, number, number] | Vector3, target = new Vector3()): Vector3 {
  const v = local instanceof Vector3 ? target.copy(local) : target.set(local[0], local[1], local[2]);
  return v.applyQuaternion(quaternion).normalize();
}

/**
 * Rocket-local → stage-local. The rocket site is rotated by `STAGE.rocketYaw` about Y,
 * so anything authored relative to the hull (hatch, cockpit seat) must go through here.
 */
export function rocketLocalToStage(x: number, y: number, z: number): [number, number, number] {
  const yaw = STAGE.rocketYaw;
  return [
    STAGE.rocket[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
    STAGE.rocket[1] + y,
    STAGE.rocket[2] - x * Math.sin(yaw) + z * Math.cos(yaw),
  ];
}

export function rocketLocalToWorld(x: number, y: number, z: number, target = new Vector3()): Vector3 {
  return stageToWorld(rocketLocalToStage(x, y, z), target);
}

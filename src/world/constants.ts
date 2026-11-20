import { Matrix4, Quaternion, Vector3 } from 'three'
import layoutJson from '../../public/models/home_layout.json'

/**
 * One world, true scale, metres. The landing site is the origin with +Y up; the star sits ahead (-Z).
 * The orbital plane is rolled relative to the local horizon so orbits read as diagonals in the home sky.
 */
type Anchor = { pos: number[]; up: number[] }
export const layout = layoutJson as {
  radius: number
  center: number[]
  astronaut: Anchor
  rocket: Anchor
  ground: Record<string, number[]>
}

const v3 = (a: number[]) => new Vector3(a[0], a[1], a[2])
const rad = (d: number) => (d * Math.PI) / 180

export const HOME_R = layout.radius
export const HOME_CENTER = v3(layout.center)
export const ASTRO_POS = v3(layout.astronaut.pos)
export const ASTRO_UP = v3(layout.astronaut.up).normalize()
export const ROCKET_POS = v3(layout.rocket.pos)
export const ROCKET_UP = v3(layout.rocket.up).normalize()
export const ROCKET_HEIGHT = 9.4

export const STAR_R = 1450
export const STAR_DIST = 5200
const STAR_ELEV = rad(-2.2)
export const STAR_DIR = new Vector3(0, Math.sin(STAR_ELEV), -Math.cos(STAR_ELEV))
export const STAR_POS = STAR_DIR.clone().multiplyScalar(STAR_DIST)

/** Direction the key light arrives from (raised above the true star centre: only its upper limb clears the horizon). */
const SUN_ELEV = rad(12)
export const SUN_DIR = new Vector3(Math.sin(rad(-4)) * Math.cos(SUN_ELEV), Math.sin(SUN_ELEV), -Math.cos(SUN_ELEV)).normalize()

// System frame: origin at the star, Y = plane normal, +Z points from the star to the home planet.
const ROLL = rad(35)
const right = new Vector3(Math.cos(ROLL), Math.sin(ROLL), 0)
right.addScaledVector(STAR_DIR, -right.dot(STAR_DIR)).normalize()
export const SYS_Z = STAR_DIR.clone().negate()
export const SYS_X = right
export const SYS_Y = new Vector3().crossVectors(SYS_Z, SYS_X).normalize()
export const SYS_MATRIX = new Matrix4().makeBasis(SYS_X, SYS_Y, SYS_Z).setPosition(STAR_POS)
export const SYS_QUAT = new Quaternion().setFromRotationMatrix(SYS_MATRIX)

/** System-space point -> world. Mutates and returns v. */
export const sysToWorld = (v: Vector3) => v.applyMatrix4(SYS_MATRIX)
export const sysDirToWorld = (v: Vector3) => v.applyQuaternion(SYS_QUAT)

export const LANE_FIRST = 7800
export const LANE_GAP = 2350
export const LANE_OUTER_MAX = 21500
export const PLANET_BASE_R = 1120
/** Planets are drawn smaller from the surface so they read as distant bodies, full size in the system view. */
export const PLANET_HOME_SCALE = 0.24
export const STAR_SYSTEM_SCALE = 1.4
export const HOME_GLOBE_ORBIT_SCALE = 3.2

export const FAR = 220000

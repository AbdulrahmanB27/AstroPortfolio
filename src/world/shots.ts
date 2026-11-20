import { Matrix4, Vector3 } from 'three'
import { ASTRO_POS, ROCKET_POS, ROCKET_UP, STAR_POS, SYS_MATRIX, layout } from './constants'
import type { Pose } from './rig'
import cockpitLayout from '../../public/models/cockpit_layout.json'

/**
 * Authored hero shots. Each takes the viewport aspect and returns a pose,
 * so wide, standard and portrait screens each get a composed frame.
 */
const V = (x: number, y: number, z: number) => new Vector3(x, y, z)
const rad = (d: number) => (d * Math.PI) / 180
const GROUND_CAM = layout.ground.camera[1]

/** Aim from `pos` using yaw (deg, + = right) and pitch (deg, + = up); the star is straight ahead at yaw 0. */
function aim(pos: Vector3, yaw: number, pitch: number, dist = 100): Vector3 {
  const y = rad(yaw)
  const p = rad(pitch)
  return V(pos.x + Math.sin(y) * Math.cos(p) * dist, pos.y + Math.sin(p) * dist, pos.z - Math.cos(y) * Math.cos(p) * dist)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

// ───────────────────────────────────────────────────────────────── HOME ──
export function homeShot(aspect: number): Pose {
  if (aspect < 0.8) {
    // Portrait: star mid-frame, astronaut lower-left and lander lower-right in front of it, ground left clear for the menu.
    const pos = V(-1.5, GROUND_CAM + 1.45, 11.0)
    return { pos, target: aim(pos, 5.0, -6.0), fov: 76, sway: 0.03 }
  }
  // 16:9 is the reference; narrower landscape screens pull back a little.
  const t = (aspect - 1.3) / (1.78 - 1.3)
  const pos = V(lerp(-0.2, -0.75, t), GROUND_CAM + 1.22, lerp(10.4, 8.9, t))
  return { pos, target: aim(pos, lerp(2.0, 3.6, t), 3.4), fov: lerp(46, 39, t), sway: 0.035 }
}

/** First frame of the opening: high above the planet, looking past it at the star. */
export function introStartShot(aspect: number): Pose {
  const pos = V(-260, 520, 1500)
  return { pos, target: V(0, -60, -400), fov: aspect < 0.8 ? 62 : 36, sway: 0 }
}

// ─────────────────────────────────────────────────────────────── ROCKET ──
const rocketPoint = (h: number) => ROCKET_POS.clone().addScaledVector(ROCKET_UP, h)
/** Horizontal direction the hatch faces (the lander is yawed so it greets the camera). */
export const ROCKET_YAW = rad(-32)
const HATCH_DIR = V(Math.sin(ROCKET_YAW), 0, Math.cos(ROCKET_YAW))

/** Standing in front of the hatch, used on the way into the cockpit. */
export function hatchShot(aspect: number): Pose {
  const hatch = rocketPoint(3.7)
  const pos = hatch.clone().addScaledVector(HATCH_DIR, aspect < 0.8 ? 11.5 : 8.6).add(V(0.4, 0.2, 0))
  return { pos, target: hatch.clone().add(V(0, aspect < 0.8 ? 0.6 : 0.2, 0)), fov: aspect < 0.8 ? 56 : 40, sway: 0.01 }
}

export function hatchInsideShot(aspect: number): Pose {
  const hatch = rocketPoint(3.65)
  const pos = hatch.clone().addScaledVector(HATCH_DIR, 2.75)
  return { pos, target: hatch.clone(), fov: aspect < 0.8 ? 60 : 46, sway: 0 }
}

// ───────────────────────────────────────────────────────────── COCKPIT ──
/**
 * The cockpit set sits in the capsule, facing the star, pitched a touch nose-up so the star's dome
 * clears the top of the monitor in the window. All cockpit shots are authored in the room's own frame.
 */
export const COCKPIT_ORIGIN = rocketPoint(5.05)
export const COCKPIT_MATRIX = new Matrix4().makeRotationX(rad(1.9)).setPosition(COCKPIT_ORIGIN)
const room = (v: number[]) => V(v[0], v[1], v[2]).applyMatrix4(COCKPIT_MATRIX)
const roomDir = (v: number[]) => V(v[0], v[1], v[2]).transformDirection(COCKPIT_MATRIX)
export const COCKPIT_SCREEN = cockpitLayout.screen as { center: number[]; normal: number[]; up: number[]; width: number; height: number }

/** Camera looks exactly along the screen normal, so the display projects as a true rectangle for the DOM layer. */
export function cockpitShot(aspect: number): Pose {
  const c = room(COCKPIT_SCREEN.center)
  const n = roomDir(COCKPIT_SCREEN.normal)
  const u = roomDir(COCKPIT_SCREEN.up)
  const portrait = aspect < 0.8
  // phones stand taller and closer: the display fills the lower half, the star's dome clears its top edge
  // (the phone monitor is a narrower unit, see CockpitSet: at this distance both of its bezels are in frame)
  const d = portrait ? 1.56 : lerp(2.62, 2.39, (aspect - 1.3) / (1.78 - 1.3))
  const lift = portrait ? 0.27 : 0.19
  const pos = c.clone().addScaledVector(n, d).addScaledVector(u, lift)
  return { pos, target: pos.clone().addScaledVector(n, -3), fov: portrait ? 66 : 46, sway: 0 }
}

export function cockpitEntryShot(_aspect: number): Pose {
  const c = room(COCKPIT_SCREEN.center)
  const n = roomDir(COCKPIT_SCREEN.normal)
  const u = roomDir(COCKPIT_SCREEN.up)
  const pos = c.clone().addScaledVector(n, 2.72).addScaledVector(u, 0.5).add(V(0.42, 0, 0))
  return { pos, target: c.clone().addScaledVector(u, 0.1), fov: 56, sway: 0 }
}

// ─────────────────────────────────────────────────────────────── SYSTEM ──
const sys = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(SYS_MATRIX)

export interface OrbitFraming {
  /** Outer orbit radius that has to fit. */
  outer: number
}

/** Three-quarter overview of the whole system. `outer` is the widest orbit radius. */
export function orbitShot(aspect: number, outer: number, az = 0, el = 0, zoom = 1): Pose {
  const portrait = aspect < 0.8
  const fov = portrait ? 46 : 32
  const elev = rad((portrait ? 56 : 33) + el)
  const half = Math.atan(Math.tan(rad(fov / 2)) * aspect)
  // distance so the full ring width fits with margin; portrait accepts the ring exceeding the sides
  const fitW = (outer * (portrait ? 1.16 : 1.24)) / Math.tan(half)
  const fitH = (outer * Math.sin(elev) * 1.42) / Math.tan(rad(fov / 2))
  const dist = Math.max(fitW, fitH) * zoom
  const a = rad(az)
  const pos = sys(Math.sin(a) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(a) * Math.cos(elev) * dist)
  // portrait: the camera looks at a point in front of the star, which lifts the map into the upper
  // part of the screen above the project list. The offset follows the azimuth so the map stays put while turning.
  const k = dist * 0.15
  const target = portrait ? sys(Math.sin(a) * k, 0, Math.cos(a) * k) : sys(0, 0, outer * 0.2)
  return { pos, target, fov, sway: dist * 0.0012 }
}

/** Mid-launch beat: above the home planet, watching it fall away with the star beyond. */
export function launchApexShot(_aspect: number): Pose {
  // high and behind the pad: the little planet low in frame, the lander climbing away towards the star
  const pos = V(-300, 700, 1900)
  return { pos, target: V(0, 150, -1500), fov: 46, sway: 0 }
}

// ────────────────────────────────────────────────────────────── PROJECT ──
/**
 * Frame one planet with the survey probe beside it. Returns the camera pose and where the probe
 * (and its display) must sit so that it faces the camera squarely.
 */
export function projectShot(aspect: number, planet: Vector3, radius: number, compact = false) {
  const portrait = aspect < 0.8
  const fov = portrait ? 50 : 34
  // view the planet from the sunlit three-quarter side, slightly above the plane
  const toStar = STAR_POS.clone().sub(planet).normalize()
  const up = V(0, 1, 0).applyMatrix4(SYS_MATRIX).sub(STAR_POS).normalize()
  const side = new Vector3().crossVectors(up, toStar).normalize()
  const viewDir = toStar.clone().multiplyScalar(0.62).addScaledVector(side, 0.72).addScaledVector(up, 0.28).normalize()
  const dist = radius * (portrait ? 7.0 : 4.3)
  const camRight = new Vector3().crossVectors(viewDir.clone().negate(), up).normalize()
  const camUp = new Vector3().crossVectors(camRight, viewDir.clone().negate()).normalize()
  // shift the look-at point so the planet sits left (or top on phones) and the probe takes the other side
  // phones: a full entry stands the display upright; a sparse one keeps a small landscape display and gives the planet the frame
  const upright = portrait && !compact
  const shift = portrait
    ? camUp.clone().multiplyScalar(-radius * (compact ? 1.35 : 2.0)).addScaledVector(camRight, -radius * (compact ? 0.2 : 0.95))
    : camRight.clone().multiplyScalar(radius * (compact ? 0.95 : 1.2))
  const target = planet.clone().add(shift)
  const pos = planet.clone().addScaledVector(viewDir, dist).add(shift)
  const fwd = target.clone().sub(pos).normalize()
  // the probe floats close to the camera on the free side, facing it
  const probeDist = radius * (portrait ? 1.75 : 1.45)
  const off = portrait ? camUp.clone().multiplyScalar(-probeDist * Math.tan(rad(fov / 2)) * (compact ? 0.52 : 0.36)) : camRight.clone().multiplyScalar(probeDist * Math.tan(rad(fov / 2)) * aspect * 0.42)
  const probePos = pos.clone().addScaledVector(fwd, probeDist).add(off)
  const half = Math.tan(rad(fov / 2)) * probeDist
  // physical width the display should cover (the screen mesh is 3.2 m wide)
  // on phones the probe rolls a quarter turn: its 3.2 x 2.0 m display stands upright and both bezels stay in frame
  const displayWidth = upright ? half * aspect * 2 * 0.72 : portrait ? half * aspect * 2 * 0.83 : half * aspect * 2 * 0.43 * (compact ? 0.7 : 1)
  return { pose: { pos, target, fov, sway: radius * 0.004 } as Pose, probePos, probeScale: displayWidth / (upright ? 2.0 : 3.2), camRight, camUp, fwd, roll: upright ? Math.PI / 2 : 0 }
}

export { ASTRO_POS }

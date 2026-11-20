import { Vector3 } from 'three'
import type { Project } from '../content/schema'
import { LANE_FIRST, LANE_GAP, LANE_OUTER_MAX, PLANET_BASE_R } from './constants'

/** One project planet with its resolved orbit. Positions are in system space (star at the origin, Y = plane normal). */
export interface Body {
  project: Project
  index: number
  lane: number
  orbitRadius: number
  phase: number
  /** rad / second of orbital clock */
  speed: number
  radius: number
}

export interface SystemLayout {
  bodies: Body[]
  lanes: number[]
  outer: number
}

const GOLDEN = 0.381966

/**
 * Resolve lanes and phases for any number of projects.
 * Explicit orbit/phase values are honoured; the rest are spread so that planets sharing a lane
 * sit apart and neighbouring lanes are staggered.
 */
export function layoutSystem(projects: Project[]): SystemLayout {
  const n = projects.length
  const explicitMax = Math.max(0, ...projects.map((p) => p.planet.orbit ?? 0))
  const auto = n <= 6 ? Math.max(n, 3) : Math.min(8, 4 + Math.ceil((n - 6) / 3))
  const laneCount = Math.min(8, Math.max(auto, explicitMax))
  const gap = Math.min(LANE_GAP, (LANE_OUTER_MAX - LANE_FIRST) / Math.max(1, laneCount - 1))
  const lanes = Array.from({ length: laneCount }, (_, i) => LANE_FIRST + i * gap)

  // lane membership
  const members: number[][] = lanes.map(() => [])
  const pending: number[] = []
  projects.forEach((p, i) => {
    const o = p.planet.orbit
    if (o !== null && o >= 1 && o <= laneCount) members[o - 1].push(i)
    else pending.push(i)
  })
  for (const i of pending) {
    // emptiest lane first; ties go outward so big systems fill evenly
    let best = 0
    for (let l = 1; l < laneCount; l++) if (members[l].length < members[best].length) best = l
    members[best].push(i)
  }

  const maxR = gap * 0.46
  const bodies: Body[] = []
  members.forEach((ids, lane) => {
    const count = ids.length
    ids.forEach((pi, k) => {
      const p = projects[pi]
      const autoPhase = (lane * GOLDEN + 0.07 + k / Math.max(1, count)) % 1
      // explicit phases are respected only when they do not collide with a lane-mate
      let phase = p.planet.phase ?? autoPhase
      const clash = bodies.some((b) => b.lane === lane && Math.abs(((b.phase - phase + 1.5) % 1) - 0.5) < 0.09)
      if (clash) phase = autoPhase
      const r = lanes[lane]
      bodies.push({
        project: p,
        index: pi,
        lane,
        orbitRadius: r,
        phase,
        speed: 0.0105 * Math.pow(LANE_FIRST / r, 1.5),
        radius: Math.min(maxR, PLANET_BASE_R * p.planet.size),
      })
    })
  })
  bodies.sort((a, b) => a.index - b.index)
  return { bodies, lanes, outer: lanes[lanes.length - 1] }
}

/** System-space position of a body at orbital time t. */
export function bodyPosition(b: Body, t: number, out = new Vector3()): Vector3 {
  const a = b.phase * Math.PI * 2 + b.speed * t
  return out.set(Math.cos(a) * b.orbitRadius, 0, Math.sin(a) * b.orbitRadius)
}

/** Live registry written every frame by the system set and read by labels, the director and flight mode. */
export const systemRefs = {
  layout: null as SystemLayout | null,
  /** World-space centre and drawn radius per project id. */
  world: new Map<string, { pos: Vector3; radius: number; ring?: boolean }>(),
}

import gsap from 'gsap'
import { CatmullRomCurve3, Quaternion, Vector3 } from 'three'
import { app, type Tab } from './store'
import { fx, rig, setPose, currentPose, type Pose, type ShotFn } from '../world/rig'
import {
  cockpitEntryShot,
  cockpitShot,
  hatchInsideShot,
  hatchShot,
  homeShot,
  introStartShot,
  launchApexShot,
  orbitShot,
  projectShot,
} from '../world/shots'
import { ASTRO_POS, ROCKET_POS, ROCKET_UP } from '../world/constants'
import { systemRefs } from '../world/orbits'
import { qa } from '../qa/params'

/**
 * The one place that owns transitions. Every move is a single GSAP timeline that:
 *  - locks input (`busy`) for its duration,
 *  - can be skipped (jumps to its end, which always calls the matching static state),
 *  - has a reduced-motion variant (a short dip to black instead of travel).
 */
const aspect = () => window.innerWidth / Math.max(1, window.innerHeight)
const outer = () => systemRefs.layout?.outer ?? 20000
const V = (x: number, y: number, z: number) => new Vector3(x, y, z)

let active: gsap.core.Timeline | null = null

/** Where the survey probe sits for the focused project (read by ProbeSet and the project panel). */
export const probeState = {
  pos: new Vector3(),
  quat: new Quaternion(),
  scale: 1,
  valid: false,
  /** true when the display stands on end (phones, full entries) */
  upright: false,
}

// ───────────────────────────────────────────────────────── static states ──
function resetFx() {
  fx.engine = 0
  fx.lift = 0
  fx.downrange = 0
  fx.pitch = 0
  fx.rocketVisible = 1
  fx.hatch = 0
  fx.hatchGlow = 0
  fx.cockpitPower = 0
  fx.blackout = 0
  fx.system = 0
  fx.focusDim = 0
  fx.probe = 0
  fx.dust = 0
  fx.gag = -1
  rig.roll = 0
}

/** Default overview is turned a little so the home planet shows a lit crescent beside the star. */
export const ORBIT_AZ = 24
const orbitResting: ShotFn = (a) => orbitShot(a, outer(), rig.orbitAz, rig.orbitEl, rig.orbitZoom)

function setHome() {
  resetFx()
  rig.resting = homeShot
  setPose(homeShot(aspect()))
  app().set({ mode: 'home', busy: false, skippable: false, projectId: null, hoverId: null })
}

function setCockpit(tab?: Tab) {
  resetFx()
  fx.cockpitPower = 1
  fx.rocketVisible = 0
  rig.resting = cockpitShot
  setPose(cockpitShot(aspect()))
  app().set({ mode: 'cockpit', busy: false, skippable: false, ...(tab ? { tab } : {}) })
}

function setOrbit() {
  resetFx()
  fx.system = 1
  fx.rocketVisible = 0
  rig.resting = orbitResting
  setPose(orbitResting(aspect()))
  app().set({ mode: 'orbit', busy: false, skippable: false, projectId: null, hoverId: null })
}

function projectFraming(id: string) {
  const b = systemRefs.world.get(id)
  if (!b) return null
  return projectShot(aspect(), b.pos, b.radius, isCompact(id))
}

/** Entries with almost nothing to show get a smaller display so the planet carries the frame. */
function isCompact(id: string) {
  const p = app().content?.projects.find((x) => x.id === id)
  return !!p && p.media.length === 0 && p.description.join(' ').length < 80
}

function placeProbe(f: NonNullable<ReturnType<typeof projectFraming>>) {
  probeState.pos.copy(f.probePos)
  // face the camera squarely: the probe's +Z looks back along the view direction
  const m = new Quaternion()
  const z = f.fwd.clone().negate()
  const x = f.camRight.clone()
  const y = f.camUp.clone()
  m.setFromRotationMatrix({ elements: [x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1] } as never)
  probeState.quat.copy(m)
  if (f.roll) probeState.quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), f.roll))
  probeState.scale = f.probeScale
  probeState.upright = !!f.roll
  probeState.valid = true
}

function setProject(id: string) {
  resetFx()
  fx.system = 1
  fx.rocketVisible = 0
  fx.focusDim = 1
  fx.probe = 1
  const f = projectFraming(id)
  if (!f) return setOrbit()
  placeProbe(f)
  rig.resting = (a) => {
    const b = systemRefs.world.get(id)
    if (!b) return orbitResting(a)
    const fr = projectShot(a, b.pos, b.radius, isCompact(id))
    placeProbe(fr)
    return fr.pose
  }
  setPose(f.pose)
  app().set({ mode: 'project', busy: false, skippable: false, projectId: id, hoverId: null })
}

// ───────────────────────────────────────────────────────── tween helpers ──
function begin(skippable: boolean) {
  active?.kill()
  rig.resting = null
  app().set({ busy: true, skippable, hoverId: null })
  document.body.style.cursor = ''
  const tl = gsap.timeline({
    onComplete: () => {
      if (active === tl) active = null
    },
  })
  active = tl
  return tl
}

function poseTo(tl: gsap.core.Timeline, to: Pose, duration: number, ease: string, at?: gsap.Position) {
  tl.to(rig.pos, { x: to.pos.x, y: to.pos.y, z: to.pos.z, duration, ease }, at)
  tl.to(rig.target, { x: to.target.x, y: to.target.y, z: to.target.z, duration, ease }, '<')
  tl.to(rig, { fov: to.fov, sway: to.sway ?? 0, duration, ease }, '<')
}

/** Fly the camera position along a smooth curve through `pts` while the look-at point follows `targets`. */
function flyCurve(tl: gsap.core.Timeline, pts: Vector3[], targets: Vector3[], fovTo: number, duration: number, ease: string, at?: gsap.Position) {
  const pc = new CatmullRomCurve3(pts, false, 'centripetal')
  const tc = new CatmullRomCurve3(targets, false, 'centripetal')
  const p = { t: 0 }
  const fov0 = { v: 0, set: false }
  tl.to(
    p,
    {
      t: 1,
      duration,
      ease,
      onStart: () => {
        fov0.v = rig.fov
        fov0.set = true
      },
      onUpdate: () => {
        pc.getPoint(p.t, rig.pos)
        tc.getPoint(p.t, rig.target)
        if (fov0.set) rig.fov = fov0.v + (fovTo - fov0.v) * p.t
      },
    },
    at,
  )
}

/** Like flyCurve, but the first control point is wherever the camera is when the segment starts. */
function flyFromHere(tl: gsap.core.Timeline, midOffset: Vector3, midTarget: Vector3, to: Pose, duration: number, ease: string, at?: gsap.Position) {
  const p = { t: 0 }
  let pc: CatmullRomCurve3 | null = null
  let tc: CatmullRomCurve3 | null = null
  let fov0 = 0
  tl.to(
    p,
    {
      t: 1,
      duration,
      ease,
      onStart: () => {
        const from = rig.pos.clone()
        pc = new CatmullRomCurve3([from, from.clone().add(midOffset), to.pos], false, 'centripetal')
        tc = new CatmullRomCurve3([rig.target.clone(), midTarget, to.target], false, 'centripetal')
        fov0 = rig.fov
      },
      onUpdate: () => {
        if (!pc || !tc) return
        pc.getPoint(p.t, rig.pos)
        tc.getPoint(p.t, rig.target)
        rig.fov = fov0 + (to.fov - fov0) * p.t
      },
    },
    at,
  )
}

/** Reduced-motion transition: dip to black, switch state, come back. */
function cut(apply: () => void) {
  const tl = begin(false)
  tl.to(fx, { blackout: 1, duration: 0.22, ease: 'power1.in' })
  tl.add(() => {
    apply()
    app().set({ busy: true })
    fx.blackout = 1
  })
  tl.to(fx, { blackout: 0, duration: 0.3, ease: 'power1.out' })
  tl.add(() => app().set({ busy: false }))
}

const reduced = () => app().reducedMotion
const launchTmp = new Vector3()
const rocketPoint = (h: number) => ROCKET_POS.clone().addScaledVector(ROCKET_UP, h)

// ─────────────────────────────────────────────────────────── transitions ──
function buildIntro(short: boolean) {
  const a = aspect()
  const end = homeShot(a)
  const tl = begin(true)
  resetFx()
  app().set({ mode: 'intro' })
  if (short) {
    const start: Pose = { pos: end.pos.clone().add(V(-0.6, 0.9, 3.4)), target: end.target.clone().add(V(0, 6, 0)), fov: end.fov + 5, sway: 0 }
    setPose(start)
    fx.blackout = 1
    tl.to(fx, { blackout: 0, duration: 0.7, ease: 'power1.out' }, 0)
    poseTo(tl, end, 1.5, 'power3.out', 0)
  } else {
    const start = introStartShot(a)
    setPose(start)
    fx.blackout = 1
    tl.to(fx, { blackout: 0, duration: 1.1, ease: 'power1.out' }, 0)
    flyCurve(
      tl,
      [start.pos, V(-150, 210, 640), V(-34, 44, 150), V(-5, 7.5, 34), end.pos],
      [start.target, V(0, -30, -420), V(2, 6, -160), V(2, 3.2, -70), end.target],
      end.fov,
      5.6,
      'power2.inOut',
      0,
    )
  }
  tl.add(() => {
    try {
      localStorage.setItem('ab-visited', '1')
    } catch {
      /* private mode */
    }
    setHome()
  })
  return tl
}

function buildLaunch(alt: boolean) {
  const a = aspect()
  const tl = begin(true)
  const home = currentPose()
  const end = orbitShot(a, outer(), ORBIT_AZ, 0, 1)
  rig.orbitAz = ORBIT_AZ
  rig.orbitEl = 0
  rig.orbitZoom = 1
  rig.orbitEl = 0
  rig.orbitZoom = 1
  app().set({ mode: 'launch', projectId: null })
  const follow = { h: 4.5 }
  // 1. settle on the rocket, engines catch
  const watch: Pose = { pos: home.pos.clone().add(V(0.9, 0.05, 2.4)), target: rocketPoint(4.5), fov: Math.min(home.fov + 6, 56), sway: 0 }
  poseTo(tl, watch, 1.0, 'power2.inOut', 0)
  tl.to(fx, { engine: 0.42, duration: 0.7, ease: 'power2.in' }, 0.25)
  tl.to(fx, { dust: 1, duration: 2.6, ease: 'power1.out' }, 0.5)
  let t = 1.0
  if (alt) {
    // the secret: the astronaut's leg is tied to the ship. Frame both of them for the moment the line goes taut.
    tl.add(() => {
      fx.gag = 0
    }, 0.05)
    tl.to(fx, { gag: 1, duration: 4.1, ease: 'none' }, 0.9)
    const wide = { x: home.pos.x - 1.6, y: home.pos.y + 0.9, z: home.pos.z + 9.5 }
    tl.to(rig.pos, { ...wide, duration: 1.4, ease: 'power2.inOut' }, 0.2)
    tl.to(rig, { fov: Math.min(home.fov + 12, 62), duration: 1.4, ease: 'power2.inOut' }, 0.2)
    tl.to(fx, { engine: 1, duration: 0.5, ease: 'power2.in' }, t)
    tl.to(fx, { lift: 24, duration: 3.1, ease: 'power2.in' }, t)
    const both = () => void rig.target.copy(rocketPoint(follow.h)).lerp(ASTRO_POS, 0.42)
    tl.to(follow, { h: 15, duration: 3.1, ease: 'power2.in', onUpdate: both }, t)
    t += 3.1
    tl.to(fx, { lift: 520, duration: 1.3, ease: 'power2.in' }, t)
  } else {
    tl.to(fx, { engine: 1, duration: 0.45, ease: 'power2.in' }, t)
    tl.to(fx, { lift: 70, duration: 1.7, ease: 'power2.in' }, t)
    // keep the climbing lander in frame: the look-at point rides just under it
    tl.to(follow, { h: 66, duration: 1.7, ease: 'power2.in', onUpdate: () => void rig.target.copy(rocketPoint(follow.h)) }, t)
    tl.to(rig.pos, { y: home.pos.y + 1.6, duration: 1.7, ease: 'power1.in' }, t)
    t += 1.55
    tl.to(fx, { lift: 620, duration: 1.2, ease: 'power1.in' }, t)
  }
  // gravity turn: the lander pitches over and heads for the system, staying in shot as a bright spark
  tl.to(fx, { pitch: 1.12, duration: 1.6, ease: 'power2.inOut' }, t + 0.5)
  tl.to(fx, { downrange: 5200, lift: 1500, duration: 3.6, ease: 'power2.in' }, t + 0.7)
  // 2. the camera leaves the ground: the planet falls away, the star beyond
  const apex = launchApexShot(a)
  flyFromHere(tl, V(-40, 120, 160), V(4, 40, -40), apex, 1.5, 'power2.in', t)
  // while the camera climbs it keeps watching the lander, and only lets go as the wide view takes over
  const track = { k: 1 }
  tl.to(
    track,
    {
      k: 0,
      duration: 1.5,
      ease: 'power2.in',
      onUpdate: () => {
        launchTmp.copy(ROCKET_POS).addScaledVector(ROCKET_UP, fx.lift + 4.5)
        launchTmp.z -= fx.downrange
        rig.target.lerp(launchTmp, track.k)
        // long lens on the climbing lander, opening up again as the wide view takes over
        const ramp = Math.min(1, tl.time() > t ? (tl.time() - t) / 0.35 : 0)
        rig.fov += (20 - rig.fov) * track.k * ramp
      },
    },
    t,
  )
  tl.add(() => {
    fx.gag = -1
  }, t + 1.35)
  // 3. pull out to the system overview
  tl.to(fx, { system: 1, duration: 2.0, ease: 'power2.inOut' }, t + 1.2)
  flyCurve(tl, [apex.pos, apex.pos.clone().lerp(end.pos, 0.42).add(V(0, 2400, 0)), end.pos], [apex.target, apex.target.clone().lerp(end.target, 0.6), end.target], end.fov, 2.3, 'power2.out', t + 1.5)
  tl.add(() => setOrbit())
  return tl
}

export const director = {
  /** Called once the scene has mounted. */
  boot() {
    const v = qa.view
    if (qa.t !== null) {
      fx.frozen = true
      fx.time = qa.t
    }
    if (v === 'cockpit') return setCockpit(qa.tab ?? 'about')
    if (v === 'orbit') return setOrbit()
    if (v === 'project') {
      setOrbit()
      const id = qa.project && systemRefs.world.has(qa.project) ? qa.project : app().content?.projects[0]?.id
      // planets register their positions on the first frame
      requestAnimationFrame(() => requestAnimationFrame(() => (id ? setProject(id) : undefined)))
      return
    }
    if (v === 'flight' || v === 'deathstar') {
      setOrbit()
      app().set({ flightUnlocked: true })
      requestAnimationFrame(() => requestAnimationFrame(() => director.enterFlight(v === 'deathstar')))
      return
    }
    if (v === 'home') return setHome()
    if (v === 'launch' || v === 'altlaunch') {
      setHome()
      const tl = buildLaunch(v === 'altlaunch')
      if (qa.t !== null) {
        tl.pause()
        tl.time(Math.min(qa.t, tl.duration() - 0.001), false)
      }
      return
    }
    let visited = false
    try {
      visited = localStorage.getItem('ab-visited') === '1'
    } catch {
      /* private mode */
    }
    if (v === 'intro') {
      const tl = buildIntro(false)
      if (qa.t !== null) {
        tl.pause()
        tl.time(Math.min(qa.t, tl.duration() - 0.001), false)
      }
      return
    }
    if (reduced()) {
      setHome()
      fx.blackout = 1
      gsap.to(fx, { blackout: 0, duration: 0.6 })
      return
    }
    buildIntro(visited)
  },

  skip() {
    if (active && app().skippable) active.progress(1, false)
  },

  openCockpit(tab: Tab) {
    const st = app()
    if (st.busy) return
    if (st.mode === 'cockpit') return st.set({ tab })
    if (st.mode !== 'home') return
    st.set({ tab })
    if (reduced()) return cut(() => setCockpit(tab))
    const a = aspect()
    const tl = begin(true)
    poseTo(tl, hatchShot(a), 1.25, 'power2.inOut', 0)
    tl.to(fx, { hatch: 1, duration: 0.7, ease: 'power2.inOut' }, 0.45)
    tl.to(fx, { hatchGlow: 1, duration: 0.6, ease: 'power1.out' }, 0.5)
    poseTo(tl, hatchInsideShot(a), 0.62, 'power2.in', 1.22)
    tl.to(fx, { blackout: 1, duration: 0.3, ease: 'power1.in' }, 1.5)
    tl.add(() => {
      // the doorway is black: swap exterior for interior
      fx.rocketVisible = 0
      fx.hatch = 0
      fx.hatchGlow = 0
      fx.cockpitPower = 0
      app().set({ mode: 'cockpit' })
      setPose(cockpitEntryShot(a))
    }, 1.84)
    tl.to(fx, { blackout: 0, duration: 0.45, ease: 'power1.out' }, 1.86)
    poseTo(tl, cockpitShot(a), 1.0, 'power2.out', 1.86)
    tl.to(fx, { cockpitPower: 1, duration: 0.75, ease: 'power2.out' }, 2.05)
    tl.add(() => setCockpit(tab))
  },

  exitCockpit() {
    const st = app()
    if (st.busy || st.mode !== 'cockpit') return
    if (reduced()) return cut(setHome)
    const a = aspect()
    const tl = begin(true)
    tl.to(fx, { cockpitPower: 0.25, duration: 0.26, ease: 'power1.in' }, 0)
    tl.to(fx, { blackout: 1, duration: 0.22, ease: 'power1.in' }, 0.06)
    tl.add(() => {
      resetFx()
      fx.blackout = 1
      fx.hatch = 1
      fx.hatchGlow = 1
      app().set({ mode: 'home', busy: true })
      setPose(hatchShot(a))
    }, 0.3)
    tl.to(fx, { blackout: 0, duration: 0.3, ease: 'power1.out' }, 0.31)
    poseTo(tl, homeShot(a), 1.4, 'power2.inOut', 0.36)
    tl.to(fx, { hatch: 0, duration: 0.6, ease: 'power2.inOut' }, 0.8)
    tl.to(fx, { hatchGlow: 0, duration: 0.5 }, 0.95)
    tl.add(() => setHome())
  },

  launch(alt = false) {
    const st = app()
    if (st.busy || st.mode !== 'home') return
    if (reduced()) return cut(setOrbit)
    buildLaunch(alt)
  },

  focusProject(id: string) {
    const st = app()
    if (st.busy || st.mode !== 'orbit') return
    const f = projectFraming(id)
    if (!f) return
    if (reduced()) return cut(() => setProject(id))
    const tl = begin(true)
    fx.orbitPaused = true
    st.set({ projectId: id })
    placeProbe(f)
    poseTo(tl, f.pose, 1.15, 'power3.inOut', 0)
    tl.to(fx, { focusDim: 1, duration: 0.8, ease: 'power1.out' }, 0.1)
    tl.to(fx, { probe: 1, duration: 0.7, ease: 'power2.out' }, 0.5)
    tl.add(() => setProject(id))
  },

  closeProject() {
    const st = app()
    if (st.busy || st.mode !== 'project') return
    if (reduced()) return cut(setOrbit)
    const tl = begin(true)
    st.set({ mode: 'orbit', busy: true })
    tl.to(fx, { probe: 0, duration: 0.35, ease: 'power2.in' }, 0)
    tl.to(fx, { focusDim: 0, duration: 0.7, ease: 'power1.inOut' }, 0.1)
    poseTo(tl, orbitResting(aspect()), 0.95, 'power3.inOut', 0.05)
    tl.add(() => setOrbit())
  },

  returnHome() {
    const st = app()
    if (st.busy || (st.mode !== 'orbit' && st.mode !== 'flight')) return
    if (reduced()) return cut(setHome)
    const a = aspect()
    const end = homeShot(a)
    const apex = launchApexShot(a)
    const tl = begin(true)
    st.set({ mode: 'launch', altShipActive: st.altShipActive })
    const from = currentPose()
    flyCurve(tl, [from.pos, from.pos.clone().lerp(apex.pos, 0.6).add(V(0, 1500, 0)), apex.pos], [from.target, from.target.clone().lerp(apex.target, 0.5), apex.target], apex.fov, 1.35, 'power2.inOut', 0)
    tl.to(fx, { system: 0, duration: 1.2, ease: 'power2.inOut' }, 0.15)
    tl.add(() => {
      fx.rocketVisible = 1
      fx.lift = 0
    }, 1.0)
    flyCurve(tl, [apex.pos, V(-150, 210, 640), V(-34, 44, 150), V(-5, 7.5, 34), end.pos], [apex.target, V(0, -30, -420), V(2, 6, -160), V(2, 3.2, -70), end.target], end.fov, 1.5, 'power2.out', 1.3)
    tl.add(() => setHome())
  },

  enterFlight(nearStation = false) {
    const st = app()
    if (st.busy || st.mode !== 'orbit') return
    st.set({ mode: 'flight', hoverId: null, busy: false })
    rig.resting = null
    flightRequest.pending = nearStation ? 'station' : 'start'
  },

  exitFlight() {
    const st = app()
    if (st.mode !== 'flight') return
    const tl = begin(false)
    st.set({ mode: 'orbit', busy: true })
    poseTo(tl, orbitResting(aspect()), 1.0, 'power3.inOut', 0)
    tl.add(() => setOrbit())
  },

  toggleGrid() {
    app().set({ gridOn: !app().gridOn })
  },

  /** Step back one level (Escape / back buttons). */
  back() {
    const st = app()
    if (st.busy) return director.skip()
    if (st.mode === 'project') director.closeProject()
    else if (st.mode === 'cockpit') director.exitCockpit()
    else if (st.mode === 'flight') director.exitFlight()
  },
}

/** Flight mode asks its set to (re)spawn the ship. */
export const flightRequest = { pending: null as null | 'start' | 'station' }

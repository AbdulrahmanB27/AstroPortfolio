import { Vector3 } from 'three';
import { portfolio } from '../data/loadPortfolio';
import { STAGE } from '../lib/constants';
import { stageDirToWorld, stageToWorld } from '../lib/stageFrame';
import { handles, rig } from '../scene/rig';
import { systemPose, type CameraPose } from '../scene/poses';
import { useApp } from '../state/store';
import { setLabelsAlpha } from '../ui/labelState';
import { setSystemDim, setSystemReveal } from '../scene/system/systemState';
import { begin, finish, reduced, tweenPose } from './index';
import { jumpToSystem } from './system';
import { setStageOpacity } from '../scene/home/stageState';
import { setTether, setTetherVisible } from '../scene/home/tetherState';

/**
 * The signature launch (≈7 s): pre-launch → liftoff → climb → space → system reveal →
 * camera release. Motion is predetermined. The camera is computed per frame from the
 * rocket's position: it starts on the ground looking up, rises below/behind the rocket,
 * swings above it so the home planet visibly falls away toward the star, then blends
 * into the solar-system pose while the rings and planets fade in.
 *
 * Shift+click triggers the comedic variant: the astronaut is tethered to a landing leg
 * and comes along, dangling, until everything fades into orbit.
 */

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpLeg = new Vector3();
const tmpHang = new Vector3();
const tmpAstro = new Vector3();

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function launch(options: { comedic?: boolean } = {}): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'home') return;
  const comedic = !!options.comedic;
  app.setComedicLaunch(comedic);
  app.bumpLaunches();
  if (reduced()) {
    jumpToSystem();
    return;
  }

  const rocket = handles.rocket;
  const astronaut = handles.astronaut;
  const astroStart = astronaut ? astronaut.position.clone() : null;
  const astroRotStart = astronaut ? astronaut.rotation.clone() : null;
  const tl = begin('launching');
  setSystemReveal(0);
  setSystemDim(0);
  handles.exposure?.setLevel(1);
  setLabelsAlpha(0);

  // Stage-space directions in world space.
  const up = stageDirToWorld([0, 1, 0]);
  const forward = stageDirToWorld([0, 0, -1]);
  const right = stageDirToWorld([1, 0, 0]);
  const padWorld = stageToWorld([STAGE.rocket[0], 0, STAGE.rocket[2]]).clone();
  const systemCam = systemPose(portfolio.layout.outerRadius);

  const state = {
    y: 0, // rocket altitude (stage units)
    drift: 0, // forward drift toward the star
    thrust: 0,
    shake: 0,
    stage: 1, // ground opacity
    reveal: 0,
    /** 0 = ground camera, 1 = below/behind follow, 2 = above/behind follow. */
    follow: 0,
    /** 0 = following the rocket, 1 = system pose. */
    release: 0,
  };

  const groundCam: CameraPose = {
    position: stageToWorld([STAGE.rocket[0] - 4.5, 2.4, STAGE.rocket[2] + 4.5]).clone(),
    target: stageToWorld([STAGE.rocket[0], 3.6, STAGE.rocket[2]]).clone(),
    fov: 46,
  };

  const rocketWorld = (): Vector3 => tmpA.copy(padWorld).addScaledVector(up, state.y).addScaledVector(forward, state.drift);

  /** Camera computed from the rocket each frame, blended across the follow phases. */
  const followPose = (): CameraPose => {
    const r = rocketWorld();
    // Phase 1: on the ground looking up at the pad.
    const p0 = groundCam.position;
    const t0 = tmpB.copy(r).addScaledVector(up, 3.5);
    // Phase 2: below and behind, looking up at the rocket against the sky. The camera
    // never goes under the terrain: it trails at most 16 units below the rocket.
    // Mostly beside the rocket rather than under it, so the hull is not foreshortened.
    const below = Math.min(9, Math.max(0, state.y - 2.2));
    const p1 = tmpC.copy(r).addScaledVector(up, -below).addScaledVector(forward, -13).addScaledVector(right, -9.5);
    const t1 = r.clone().addScaledVector(up, 3);
    // Phase 3: above and behind, looking down past the rocket at the shrinking planet.
    // The lateral offset is what keeps the rocket off the star: the rocket is tens of
    // units away and the star hundreds, so moving the camera sideways slides the hull
    // across the frame while the star barely moves. At the old offset the silhouette sat
    // grey-on-white in the middle of the disc with no rim to separate it.
    const p2 = r.clone().addScaledVector(up, 24).addScaledVector(forward, -30).addScaledVector(right, 14);
    const t2 = r.clone().addScaledVector(up, -11).addScaledVector(forward, 13).addScaledVector(right, 5);
    const f = state.follow;
    const a = smoothstep(Math.min(1, f));
    const b = smoothstep(Math.max(0, f - 1));
    const position = new Vector3().lerpVectors(p0, p1, a).lerp(p2, b);
    const target = new Vector3().lerpVectors(t0, t1, a).lerp(t2, b);
    // Phase 3 opens up: with only the rocket in shot the middle of the launch had no second
    // object to measure it against. The wider field brings the star's glow back into the
    // opposite corner as a fixed reference while keeping the hull whole.
    const fov = 46 + a * 6 + b * 10;
    return { position, target, fov };
  };

  const applyFrame = () => {
    if (rocket) {
      rocket.position.set(0, state.y, -state.drift);
      rocket.rotation.set(-Math.min(0.35, state.drift * 0.0045), 0, 0);
    }
    handles.rocketEngine?.setThrust(state.thrust);
    rig.shake = state.shake;

    const follow = followPose();
    const k = smoothstep(state.release);
    rig.position.lerpVectors(follow.position, systemCam.position, k);
    rig.target.lerpVectors(follow.target, systemCam.target, k);
    rig.fov = follow.fov + (systemCam.fov - follow.fov) * k;

    if (comedic && rocket && astronaut && astroStart && state.y > 0.6) {
      // Dragged by the leg: hangs below a landing leg, swinging as the rocket climbs.
      //
      // Both ends are read off the rocket itself. Re-deriving the anchor in stage
      // coordinates looked right on paper but drew the rope ending in empty space: the
      // rocket sits under a yaw, so its local drift axis is rotated away from the stage's,
      // and the two diverged as it climbed.
      const swing = Math.sin(state.y * 0.8) * 0.4;
      const anchor = tmpLeg.set(1.05 + swing * 0.12, 0.5, 0.35);
      rocket.localToWorld(anchor);
      const hang = tmpHang.set(1.25 + swing * 0.5, -2.6, 0.6);
      rocket.localToWorld(hang);
      astronaut.parent?.worldToLocal(tmpAstro.copy(hang));
      astronaut.position.copy(tmpAstro);
      astronaut.rotation.set(Math.PI - 0.35 + swing * 0.5, 0.4, 0.6 + swing * 0.7);
      setTether(anchor, hang);
      setTetherVisible(true);
    }
  };

  // Phase 1 — pre-launch (0 → 1.2 s): engines spool, ground camera pushes in.
  tl.to(state, { thrust: 0.35, duration: 1.2, ease: 'power2.in', onUpdate: () => { handles.rocketEngine?.setThrust(state.thrust); } }, 0);
  tweenPose(tl, groundCam, 1.2, 'power2.inOut', 0);
  tl.add(() => applyFrame(), 1.2);
  // Phase 2 — liftoff (1.2 → 2.6 s)
  tl.to(state, { thrust: 1, duration: 0.35, ease: 'power2.out', onUpdate: applyFrame }, 1.2);
  tl.to(state, { shake: 0.05, duration: 0.3 }, 1.2);
  tl.to(state, { y: 18, duration: 1.4, ease: 'power2.in', onUpdate: applyFrame }, 1.2);
  tl.to(state, { follow: 1, duration: 1.0, ease: 'power2.inOut', onUpdate: applyFrame }, 1.7);
  // Phase 3 — climb (2.6 → 4.2 s): the ground fades while the camera looks up.
  tl.to(state, { y: 190, drift: 24, duration: 1.7, ease: 'power2.in', onUpdate: applyFrame }, 2.6);
  tl.to(state, { shake: 0, duration: 1.0 }, 2.7);
  tl.to(state, { stage: 0, duration: 0.9, ease: 'power1.in', onUpdate: () => setStageOpacity(state.stage) }, 2.9);
  // Phase 4 — space (3.9 → 5.6 s): swing above the rocket; the planet falls away.
  tl.to(state, { follow: 2, duration: 1.5, ease: 'power2.inOut', onUpdate: applyFrame }, 3.9);
  tl.to(state, { y: 560, drift: 110, duration: 2.6, ease: 'power1.in', onUpdate: applyFrame }, 4.3);
  // Phase 5 + 6 — system reveal and camera release (4.9 → 7.0 s)
  tl.to(state, { reveal: 1, duration: 1.8, ease: 'power2.out', onUpdate: () => setSystemReveal(state.reveal) }, 4.9);
  tl.to(state, { release: 1, duration: 2.1, ease: 'power3.inOut', onUpdate: applyFrame }, 4.9);
  tl.to(state, { thrust: 0.4, duration: 0.8, onUpdate: applyFrame }, 6.0);
  tl.to({ a: 0 }, { a: 1, duration: 0.8, onUpdate: function () { setLabelsAlpha(this.progress()); } }, 6.2);

  tl.eventCallback('onComplete', () => {
    if (rocket) {
      rocket.position.set(0, 0, 0);
      rocket.rotation.set(0, 0, 0);
    }
    handles.rocketEngine?.setThrust(0);
    if (astronaut && astroStart && astroRotStart) {
      astronaut.position.copy(astroStart);
      astronaut.rotation.copy(astroRotStart);
    }
    setTetherVisible(false);
    setStageOpacity(1);
    setSystemReveal(1);
    setLabelsAlpha(1);
    rig.position.copy(systemCam.position);
    rig.target.copy(systemCam.target);
    rig.fov = systemCam.fov;
    useApp.getState().setComedicLaunch(false);
    finish('system', 0.6);
  });
}

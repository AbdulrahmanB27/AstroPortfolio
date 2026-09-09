import gsap from 'gsap';
import { Vector3 } from 'three';
import { rig, handles } from '../scene/rig';
import { cockpitPose, homeApproachPose, homePose, introStartPose, starApproachPose, type CameraPose } from '../scene/poses';
import { useApp, type CockpitTab, type SceneState } from '../state/store';
import { DURATIONS, EASES } from '../lib/motion';
import { rocketLocalToWorld } from '../lib/stageFrame';
import { setVehicleInterior } from '../scene/home/rocketState';
import { setStageOpacity } from '../scene/home/stageState';

/**
 * Camera + world sequences. Each one owns the rig for its duration, flips the scene
 * state at the right moments, and releases `busy` when done. Reduced motion collapses
 * every sequence to a short cross-fade.
 */

let current: gsap.core.Timeline | null = null;

export function begin(scene: SceneState): gsap.core.Timeline {
  current?.kill();
  const app = useApp.getState();
  app.setScene(scene);
  app.setBusy(true);
  rig.sway = 0;
  rig.shake = 0;
  const tl = gsap.timeline();
  current = tl;
  return tl;
}

export function finish(scene: SceneState, sway = 1): void {
  const app = useApp.getState();
  app.setScene(scene);
  app.setBusy(false);
  rig.sway = sway;
  rig.roll = 0;
  rig.shake = 0;
  current = null;
}

export function applyPose(pose: CameraPose): void {
  rig.position.copy(pose.position);
  rig.target.copy(pose.target);
  rig.fov = pose.fov;
}

function tweenPose(tl: gsap.core.Timeline, pose: CameraPose, duration: number, ease: string, at: number | string): void {
  tl.to(rig.position, { x: pose.position.x, y: pose.position.y, z: pose.position.z, duration, ease }, at);
  tl.to(rig.target, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration, ease }, at);
  tl.to(rig, { fov: pose.fov, duration, ease }, at);
}

function blackout(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('blackout');
}

function fadeBlackout(tl: gsap.core.Timeline, to: number, duration: number, at: number | string): void {
  const el = blackout();
  if (!el) return;
  tl.to(el, { opacity: to, duration, ease: 'power1.inOut' }, at);
}

function reduced(): boolean {
  return useApp.getState().reducedMotion;
}

/** Instant placement used for deep links and reduced motion. */
export function jumpTo(scene: 'home' | 'cockpit', tab?: CockpitTab): void {
  const app = useApp.getState();
  if (scene === 'home') {
    setStageOpacity(1);
    handles.cockpit?.setPower(0);
    setVehicleInterior(false);
    applyPose(homePose());
    finish('home');
  } else {
    if (tab) app.setCockpitTab(tab);
    setStageOpacity(1);
    handles.cockpit?.setPower(1);
    setVehicleInterior(true);
    applyPose(cockpitPose());
    finish('cockpit', 0.25);
  }
}

// ---------------------------------------------------------------------------
// Opening cinematic
// ---------------------------------------------------------------------------

export function playIntro(options: { returning: boolean }): gsap.core.Timeline {
  const app = useApp.getState();
  if (reduced()) {
    jumpTo('home');
    app.markIntroSeen();
    return gsap.timeline();
  }
  const tl = begin('intro');
  const home = homePose();
  const stage = { opacity: 0 };
  const applyStage = () => setStageOpacity(stage.opacity);

  if (options.returning) {
    stage.opacity = 1;
    applyStage();
    const above = homeApproachPose();
    applyPose(above);
    tweenPose(tl, home, DURATIONS.introReturning, EASES.glide, 0);
  } else {
    applyStage();
    applyPose(introStartPose());
    const star = starApproachPose();
    const above = homeApproachPose();
    // Compressed from 7.5s: the old first leg spent 3.2s crossing empty space before
    // anything was large enough to look at. The legs now overlap so the move is continuous.
    tweenPose(tl, star, 2.0, 'power2.inOut', 0);
    tweenPose(tl, above, 2.6, 'power2.inOut', 1.8);
    tl.to(stage, { opacity: 1, duration: 0.9, ease: 'power1.out', onUpdate: applyStage }, 3.3);
    tweenPose(tl, home, 2.3, EASES.glide, 4.1);
  }
  tl.eventCallback('onComplete', () => {
    stage.opacity = 1;
    applyStage();
    app.markIntroSeen();
    finish('home');
  });
  return tl;
}

export function skipIntro(): void {
  if (current && useApp.getState().scene === 'intro') current.progress(1);
}

/**
 * Skip the launch or the glide home.
 *
 * The intro offers an escape and these did not, which is the wrong asymmetry: the launch is
 * seven seconds and a returning visitor sees it every time they open the projects. Running
 * the timeline to its end rather than cutting keeps every side effect — the reveal, the
 * exposure, the pose — in the state the sequence's own completion leaves them in.
 */
export function skipSequence(): void {
  const scene = useApp.getState().scene;
  if (current && (scene === 'launching' || scene === 'returningHome')) current.progress(1);
}

// ---------------------------------------------------------------------------
// Cockpit
// ---------------------------------------------------------------------------

const rocketDoorWorld = (): { approach: Vector3; close: Vector3; look: Vector3 } => ({
  // Hatch sits at rocket-local (0, 3.15, 1.0).
  approach: rocketLocalToWorld(0, 3.2, 4.2),
  // Stops well out from the hatch. Pressed up against it the last frame before the cut
  // was a flat cream wash — the brightest and lowest-contrast frame in the whole product,
  // with no contour anywhere. From here the dark opening stays in shot as a hard
  // silhouette against the lit cabin, so the cut reads as passing through a door.
  close: rocketLocalToWorld(0, 3.15, 3.05),
  look: rocketLocalToWorld(0, 3.15, 1.0),
});

export function enterCockpit(tab: CockpitTab): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'home') {
    if (app.scene === 'cockpit') app.setCockpitTab(tab);
    return;
  }
  app.setCockpitTab(tab);
  const repeat = app.visited.cockpitEntries > 0;
  app.bumpCockpitEntries();
  if (reduced()) {
    jumpTo('cockpit', tab);
    return;
  }
  const tl = begin('enteringCockpit');
  const total = repeat ? DURATIONS.enterCockpitRepeat : DURATIONS.enterCockpit;
  const door = rocketDoorWorld();
  const cockpit = cockpitPose();
  const hatch = { open: 0 };
  const power = { value: 0 };
  handles.cockpit?.setPower(0);

  // Fly to the hatch (it slides open as we arrive), cut to black at the frame, power on
  // inside. The blackout is deliberately brief: at a 12% fade starting at 62% there was
  // most of a second in a 2.2s move with nothing on screen at all, which reads as a stall
  // rather than as a cut. It now covers only the frame either side of the jump, and the
  // cabin lights come up under the black so the interior is already lit when it lifts.
  tweenPose(tl, { position: door.approach, target: door.look, fov: 44 }, total * 0.44, 'power2.inOut', 0);
  tl.to(hatch, { open: 1, duration: total * 0.3, ease: 'power2.out', onUpdate: () => handles.rocketHatch?.setOpen(hatch.open) }, total * 0.22);
  tweenPose(tl, { position: door.close, target: door.look, fov: 40 }, total * 0.32, 'power2.in', total * 0.44);
  fadeBlackout(tl, 1, total * 0.07, total * 0.72);
  tl.add(() => {
    applyPose(cockpit);
    handles.rocketHatch?.setOpen(0);
    setVehicleInterior(true);
  }, total * 0.8);
  fadeBlackout(tl, 0, total * 0.1, total * 0.82);
  tl.to(power, { value: 1, duration: total * 0.26, ease: 'power2.out', onUpdate: () => handles.cockpit?.setPower(power.value) }, total * 0.7);
  tl.eventCallback('onComplete', () => {
    handles.cockpit?.setPower(1);
    finish('cockpit', 0.25);
  });
}

export function exitCockpit(): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'cockpit') return;
  if (reduced()) {
    jumpTo('home');
    return;
  }
  const tl = begin('exitingCockpit');
  const repeat = app.visited.cockpitEntries > 1;
  const total = repeat ? DURATIONS.exitCockpitRepeat : DURATIONS.exitCockpit;
  const door = rocketDoorWorld();
  const home = homePose();
  const power = { value: 1 };

  tl.to(power, { value: 0.12, duration: total * 0.3, ease: 'power2.in', onUpdate: () => handles.cockpit?.setPower(power.value) }, 0);
  fadeBlackout(tl, 1, total * 0.14, total * 0.26);
  tl.add(() => {
    applyPose({ position: door.approach, target: door.look, fov: 44 });
    handles.cockpit?.setPower(0);
    setVehicleInterior(false);
  }, total * 0.42);
  fadeBlackout(tl, 0, total * 0.18, total * 0.44);
  tweenPose(tl, home, total * 0.56, EASES.glide, total * 0.44);
  tl.eventCallback('onComplete', () => finish('home'));
}


export { tweenPose, fadeBlackout, reduced };

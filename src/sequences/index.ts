import gsap from 'gsap';
import { Vector3 } from 'three';

/** Default camera up, restored by any pose that does not name one. */
const WORLD_UP = new Vector3(0, 1, 0);
import { rig, handles } from '../scene/rig';
import { cockpitPose, cockpitScreenPose, homeApproachPose, homePose, introStartPose, starApproachPose, type CameraPose } from '../scene/poses';
import { useApp, type CockpitTab, type CockpitView, type SceneState } from '../state/store';
import { DURATIONS, EASES } from '../lib/motion';
import { rocketLocalToWorld } from '../lib/stageFrame';
import { setVehicleInterior } from '../scene/home/rocketState';
import { setStageOpacity } from '../scene/home/stageState';
import { crossfade } from '../scene/crossfade';

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
  rig.shake = 0;
  const tl = gsap.timeline();
  current = tl;
  return tl;
}

export function finish(scene: SceneState): void {
  const app = useApp.getState();
  app.setScene(scene);
  app.setBusy(false);
  rig.roll = 0;
  rig.shake = 0;
  current = null;
}

export function applyPose(pose: CameraPose): void {
  rig.position.copy(pose.position);
  rig.target.copy(pose.target);
  rig.fov = pose.fov;
  // Poses that do not name an up get world up back, so a reading pose's roll cannot leak
  // into the next shot.
  rig.up.copy(pose.up ?? WORLD_UP);
}

/** The same shot, `by` units further back along its line of sight and a little wider. */
function backedOff(pose: CameraPose, by: number): CameraPose {
  const back = pose.position.clone().sub(pose.target).normalize().multiplyScalar(by);
  return { ...pose, position: pose.position.clone().add(back), fov: pose.fov + 3 };
}

function tweenPose(tl: gsap.core.Timeline, pose: CameraPose, duration: number, ease: string, at: number | string): void {
  tl.to(rig.position, { x: pose.position.x, y: pose.position.y, z: pose.position.z, duration, ease }, at);
  tl.to(rig.target, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration, ease }, at);
  tl.to(rig, { fov: pose.fov, duration, ease }, at);
  const up = pose.up ?? WORLD_UP;
  tl.to(rig.up, { x: up.x, y: up.y, z: up.z, duration, ease }, at);
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
    // Someone who followed a link to `#/about` asked to read About, so they arrive reading it.
    app.setCockpitView('full');
    setStageOpacity(1);
    handles.cockpit?.setPower(1);
    setVehicleInterior(true);
    applyPose(cockpitScreenPose(tab ?? app.cockpitTab));
    finish('cockpit');
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
  // The menu item said "About", so the cockpit opens on About rather than on a room with
  // About somewhere in it.
  app.setCockpitView('full');
  const repeat = app.visited.cockpitEntries > 0;
  app.bumpCockpitEntries();
  if (reduced()) {
    jumpTo('cockpit', tab);
    return;
  }
  const tl = begin('enteringCockpit');
  const total = repeat ? DURATIONS.enterCockpitRepeat : DURATIONS.enterCockpit;
  const door = rocketDoorWorld();
  const cockpit = cockpitScreenPose(tab);
  const hatch = { open: 0 };
  const power = { value: 0 };
  handles.cockpit?.setPower(0);

  /*
   * Fly to the hatch (it slides open as we arrive) and keep accelerating into it; at the door
   * the view dissolves into the cabin, already moving, and settles on the display.
   *
   * The cut used to dip to black either side, which read as the screen flashing. Now the
   * timeline pauses at the door while `crossfade` holds the last frame outside, switches to
   * the cabin underneath it and resumes once the switch has happened, so the push-in inside
   * starts from where the camera really is. The cabin lights come up as it dissolves.
   */
  const settleFrom = backedOff(cockpit, 0.42);
  tweenPose(tl, { position: door.approach, target: door.look, fov: 44 }, total * 0.44, 'power2.inOut', 0);
  tl.to(hatch, { open: 1, duration: total * 0.3, ease: 'power2.out', onUpdate: () => handles.rocketHatch?.setOpen(hatch.open) }, total * 0.22);
  tweenPose(tl, { position: door.close, target: door.look, fov: 40 }, total * 0.3, 'power2.in', total * 0.44);
  tl.addPause(total * 0.74, () =>
    crossfade(() => {
      // Replaced by another move while the frame was being held: leave the view to that one.
      if (current !== tl) return;
      applyPose(settleFrom);
      handles.rocketHatch?.setOpen(0);
      setVehicleInterior(true);
      tl.resume();
    }, 0.55),
  );
  // Just after the pause, so its start values are read once the switch has happened.
  tweenPose(tl, cockpit, total * 0.26, 'power3.out', total * 0.74 + 0.01);
  tl.to(power, { value: 1, duration: total * 0.3, ease: 'power2.out', onUpdate: () => handles.cockpit?.setPower(power.value) }, total * 0.7);
  tl.eventCallback('onComplete', () => {
    handles.cockpit?.setPower(1);
    finish('cockpit');
  });
}

/**
 * Push in to read the console screen, or sit back to see the cabin again.
 *
 * The content is on the rocket either way — this only moves the camera. Short, because it
 * happens every time someone wants to read something, and a cinematic here would wear out
 * in about three uses.
 */
export function setCockpitView(view: CockpitView, tab?: CockpitTab): void {
  const app = useApp.getState();
  if (app.scene !== 'cockpit') return;
  const target = tab ?? app.cockpitTab;
  if (app.cockpitView === view && target === app.cockpitTab) return;
  if (tab) app.setCockpitTab(tab);

  /*
   * Opening the reader is a move INTO a display, so the camera makes that move — and then the
   * reader opens.
   *
   * It used to open on the click, with its own fade running over the camera's flight, so the
   * move into the display happened behind a page that was already up and nobody saw it. The
   * flight now plays first, with the cabin's controls stood down (`busy`), and the reader
   * opens when the camera arrives; its `cockpit-full-in` scale-up then reads as the display
   * filling the frame. Closing is the reverse: the reader goes first, then the camera pulls
   * back to the cabin. Switching section inside the reader keeps it open and moves the camera
   * underneath, so closing it lands on the display you were reading.
   *
   * The reading dim lives in `Exposure`, derived from this state — a deep link never runs this
   * function, so that rule cannot live here.
   */
  const pose = view === 'full' ? cockpitScreenPose(target) : cockpitPose();
  const opening = view === 'full' && app.cockpitView !== 'full';
  // Switching section inside the reader: nobody is looking at the camera, so do not spend a
  // transition on it.
  if (!opening || reduced()) app.setCockpitView(view);
  if (view === 'full' && !opening) {
    applyPose(pose);
    return;
  }
  if (reduced()) {
    applyPose(pose);
    return;
  }
  current?.kill();
  const tl = gsap.timeline();
  current = tl;
  if (opening) app.setBusy(true);
  tweenPose(tl, pose, DURATIONS.cockpitView, EASES.glide, 0);
  tl.eventCallback('onComplete', () => {
    if (opening) {
      useApp.getState().setCockpitView('full');
      useApp.getState().setBusy(false);
    }
    current = null;
  });
}

export function exitCockpit(): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'cockpit') return;
  // Whatever the reading view dimmed, the world outside gets back.
  handles.exposure?.setLevel(1);
  if (reduced()) {
    jumpTo('home');
    return;
  }
  app.setCockpitView('room');
  const tl = begin('exitingCockpit');
  const repeat = app.visited.cockpitEntries > 1;
  const total = repeat ? DURATIONS.exitCockpitRepeat : DURATIONS.exitCockpit;
  const door = rocketDoorWorld();
  const home = homePose();
  const power = { value: 1 };
  const hatch = { open: 1 };

  // The reverse: the cabin powers down, dissolves to the open door from outside, and the
  // camera pulls back home while the door slides shut behind it.
  tl.to(power, { value: 0.12, duration: total * 0.3, ease: 'power2.in', onUpdate: () => handles.cockpit?.setPower(power.value) }, 0);
  tl.addPause(total * 0.3, () =>
    crossfade(() => {
      if (current !== tl) return;
      applyPose({ position: door.close, target: door.look, fov: 40 });
      handles.cockpit?.setPower(0);
      handles.rocketHatch?.setOpen(1);
      setVehicleInterior(false);
      tl.resume();
    }, 0.5),
  );
  tweenPose(tl, home, total * 0.7, EASES.glide, total * 0.3 + 0.01);
  tl.to(hatch, { open: 0, duration: total * 0.4, ease: 'power2.inOut', onUpdate: () => handles.rocketHatch?.setOpen(hatch.open) }, total * 0.4);
  tl.eventCallback('onComplete', () => finish('home'));
}


export { tweenPose, fadeBlackout, reduced };

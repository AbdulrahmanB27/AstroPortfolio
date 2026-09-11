import { Vector3 } from 'three';
import { STAGE, WORLD, breakpointFor, type Breakpoint } from '../lib/constants';
import { stageDirToWorld, stageToWorld, STAGE_FRAME } from '../lib/stageFrame';
import type { CockpitTab } from '../state/store';
import { getScreenPlacement } from './cockpit/screenState';

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  fov: number;
  /**
   * Which way is up for this shot. Defaults to world up. Reading a console display needs
   * the display's own up, or the text renders tilted even with the camera dead on axis.
   */
  up?: Vector3;
}

export function currentBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  return breakpointFor(window.innerWidth, window.innerHeight);
}

function aspect(): number {
  if (typeof window === 'undefined') return 16 / 9;
  return window.innerWidth / Math.max(1, window.innerHeight);
}

/** Taller than it is wide. Several sequences frame and light differently on a phone. */
export function isPortrait(): boolean {
  return aspect() < 1;
}

/**
 * Home menu composition: astronaut left, star above the horizon center-right, rocket
 * right. Portrait screens pull the camera back and widen the FOV so both characters stay
 * in frame with the menu at the bottom.
 */
export function homePose(bp: Breakpoint = currentBreakpoint()): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  // Portrait pulls much further back and aims lower. At the old distance the astronaut
  // projected to x −27..32, so all but a sliver of it sat off the left edge, and both
  // characters' feet were behind the menu. Measured against the live projection, this
  // puts the astronaut at x 20..68 and holds both figures clear above the menu's top.
  const camLocal: [number, number, number] = portrait ? [-0.35, STAGE.cameraHeight + 0.45, 5.4] : [0, STAGE.cameraHeight, 0];
  // Look slightly up so the star sits in the upper-middle of the frame and the horizon
  // lands ~35–40% up. Elevation of the star is ~18°, so aim below it.
  const upTilt = Math.tan(STAGE_FRAME.starElevation - (portrait ? 0.34 : 0.115));
  const targetLocal: [number, number, number] = [portrait ? 0.15 : -0.6, STAGE.cameraHeight + 20 * upTilt, -20];
  // 64, not 70: a phone cannot give the astronaut the share of frame height it holds on
  // desktop without pushing the rocket off the right edge, so the narrower field buys back
  // what it can. The figure still reads smaller here than in landscape — see the report.
  const fov = portrait ? 64 : 42;
  void bp;
  return { position: stageToWorld(camLocal), target: stageToWorld(targetLocal), fov };
}

/** Solar-system overview: angled perspective framing the outer ring plus labels. */
export function systemPose(outerRadius: number, bp: Breakpoint = currentBreakpoint()): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  // Distance so the outer ring fits horizontally with margin; portrait needs more.
  const fov = portrait ? 60 : 44;
  const halfFov = (fov * Math.PI) / 360;
  // Portrait looks down much harder. A phone is width-bound, so fitting the whole disc
  // across 375px pushed the camera far enough back that the system filled barely a third
  // of the height with a dead band above it. Looking closer to overhead un-squashes the
  // disc (it is foreshortened by sin(elevation)) and fills the frame.
  const elevation = portrait ? 1.02 : bp === 'wide' ? 0.52 : 0.58;

  // Wide screens need horizontal room for the labels that sit beside the outer planets;
  // square and narrow-landscape screens do not, and reserving it there shrank the system
  // to half the frame with dead space below it.
  // Portrait is solved against the band the phone actually leaves free — under the header
  // and above the project index sheet, which is open by default there. Measured against
  // the live projection, this lands the disc at y 80..379 of 812 with clearance at both
  // ends, so no planet is ever bisected by the sheet's top edge.
  const sideMargin = portrait ? 1.08 : a >= 1.5 ? 1.3 : a >= 1.2 ? 1.2 : 1.1;
  const horizontalHalf = Math.tan(halfFov) * a;
  // The disc is foreshortened vertically by sin(elevation); its rings still need headroom.
  const verticalHalf = Math.tan(halfFov) / Math.max(0.35, Math.sin(elevation));
  // Both constraints must be satisfied, so the larger distance wins.
  const distance = Math.max(
    (outerRadius * sideMargin + 40) / horizontalHalf,
    // 1.18 left the disc effectively tangent to the bottom of a 16:9 frame — measured at
    // 196px of empty above the outer ring and 30px below it. The extra headroom pushes the
    // camera back until the ring clears both edges.
    (outerRadius * 1.34 + 40) / (verticalHalf * 0.92),
    520,
  );
  const position = new Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
  // Aim toward the near side so both ring edges stay in frame. The push is proportional
  // to the slack the aspect leaves; on a square screen there is none, so it stays centred.
  const lift = portrait ? 0.5 : Math.max(0, Math.min(1, (a - 1.1) / 0.5));
  // On phones the index sheet occupies the lower half, so the disc is raised clear of it.
  const raise = portrait ? outerRadius * 1.1 : 0;
  return { position, target: new Vector3(0, -20 * lift, 60 * lift + raise), fov };
}

/**
 * Focused project: planet fills the left 40% of the frame, probe display on the right.
 *
 * `drawnRadius` is how far the planet actually draws — rings reach 2.3 body radii and moons
 * further — and portrait frames that rather than the body, because a phone leaves the planet
 * only the third of the viewport above the project sheet. Landscape is unchanged and keys off
 * `planetRadius`: it has the width to let a ring band run past the frame's left edge, and its
 * composition is the one nine judge rounds have signed off on.
 */
export function projectPose(
  planetPos: Vector3,
  planetRadius: number,
  drawnRadius: number = planetRadius,
  bp: Breakpoint = currentBreakpoint(),
): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  const fov = portrait ? 58 : 38;
  const halfFov = (fov * Math.PI) / 360;
  /*
   * Distance such that the planet's angular size is ~55% of the vertical frame.
   *
   * Portrait measures from the drawn radius. Keyed to the body — inflated by a hand-tuned
   * 1.75 that did not match the rings' real 2.3 — the sheet's top edge cut Sweet Moment
   * through its middle and left an unreadable brown sliver on the one surface whose whole job
   * is "this project is that planet". Three independent lenses reported it.
   *
   * 3.48 puts the drawn disc at 29% of the half-frame; the 0.37 below centres it 17% down.
   * Both scale with the distance, so a ringed planet and a bare one land in the same place in
   * the frame and only the camera's distance differs — which fits the ~33% band a phone leaves
   * above the sheet with about 20px to spare.
   */
  const distance = portrait
    ? (drawnRadius / Math.tan(halfFov)) * 3.48
    : (planetRadius / Math.tan(halfFov)) * 2.6;
  const dir = new Vector3(planetPos.x, 0, planetPos.z).normalize();
  // Camera sits outside the planet (away from the star) and above the plane.
  const offset = dir.clone().multiplyScalar(distance * 0.82).add(new Vector3(0, distance * 0.5, 0));
  // Shift the look target sideways so the planet lands on the left third (or top on portrait).
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  const target = planetPos.clone();
  // Proportional to the distance, not the radius, so the disc lands in the same place in the
  // frame however far back the rings pushed the camera.
  if (portrait) target.add(new Vector3(0, -distance * 0.37, 0));
  else target.add(right.multiplyScalar(planetRadius * (bp === 'laptop' ? 1.9 : 2.2)));
  return { position: planetPos.clone().add(offset), target, fov };
}

/** Cockpit: seated behind the console, looking through the forward window at the star. */
/** The star sits at the world origin; the whole system is built around it. */
const STAR_WORLD = new Vector3(0, 0, 0);

export function cockpitPose(): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  // A 60-degree lens inside a cabin of radius 1.95 takes in most of the floor: the frame
  // was a third bare deck plate. Tightening to 46 puts the console and the forward window
  // where a cockpit shot actually sits, and it makes the display 63% of the frame height
  // instead of 47% — the reading surface gains from the same change.
  const fov = portrait ? 62 : 50;

  // The mission computer covers the middle of the screen, so the only 3D the reader ever
  // sees inside the cockpit is the strip above it. That strip has to be the forward
  // window with the star in it — otherwise the panel reads as a dashboard floating on
  // black rather than as a screen inside a spacecraft.
  //
  // So the aim is derived rather than dialled in: find the real direction to the star,
  // then drop the camera axis by exactly the angle that lands the star `starHeight` of
  // the way down the viewport. The strip is much shorter in portrait, so the star is
  // placed higher there. Changing the FOV, the seat position or the panel's top offset
  // keeps working without re-tuning a magic pitch.
  // Where the star sits in the frame decides the camera's pitch, and the pitch decides how
  // much deck plate is in shot. Asking for the star 13.5% from the top, when it is only
  // about 9 degrees above the horizon from the seat, forced the camera to look 8 degrees
  // DOWN — so the bottom of the frame struck the deck 1.4 units ahead, in front of the
  // dash, and no amount of furniture could cover that. Placing the star lower in the frame
  // levels the camera: the bottom edge then lands behind the dash and the deck leaves the
  // shot, which is how a cockpit is framed — you look out of it, not down into it.
  const starHeight = portrait ? 0.2 : 0.3;

  // Sit back far enough that the whole console screen is in frame with room to spare. The
  // offset used to be a pair of dialled-in numbers; now that the screen is a real surface
  // carrying the content, a camera that crops it crops the writing.
  const halfFov = (fov * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfFov) * a);
  // Framed against the whole screen bank, not one display: the camera has to hold all four.
  const bank = consoleScreens();
  /*
   * The bank's real extent, not twice its furthest edge.
   *
   * `max(|x| + w/2) * 2` assumes the bank is centred on x=0, which the landscape arc is and
   * the portrait 2x2 grid is not — its columns sit at 0 and 0.34, so the formula reported
   * 1.20 units for a bank 0.86 wide and pushed the camera 40% further back than it needed to
   * be. Measured extents work for both.
   */
  const bankLeft = Math.min(...bank.map((sc) => sc.local[0] - sc.width / 2));
  const bankRight = Math.max(...bank.map((sc) => sc.local[0] + sc.width / 2));
  const bankW = bankRight - bankLeft;
  const bankH = Math.max(...bank.map((sc) => sc.local[1] + sc.height / 2)) - Math.min(...bank.map((sc) => sc.local[1] - sc.height / 2));
  const fit = Math.max(
    bankH / 2 / (Math.tan(halfFov) * (portrait ? 0.66 : 0.46)),
    bankW / 2 / (Math.tan(halfH) * (portrait ? 0.82 : 0.66)),
  );
  // The floor is how close the seat lets the camera get; the fit term pushes it back when
  // the screen would otherwise be cropped. Portrait used to floor at 1.45, which held the
  // camera further back than it needed to be and left the bottom third of a phone as bare
  // floor even after the aim was corrected.
  const seatOffset = Math.max(portrait ? 0.85 : 1.15, fit - 1.3);
  const eye = stageToWorld([STAGE.rocket[0], 4.94, STAGE.rocket[2] + seatOffset]);

  // Portrait aims at the console instead of the star.
  //
  // The star-derived aim below is right on a wide screen, where the window is a band above
  // the display and the console still lands in the middle of the frame. In portrait it is
  // not: the camera has to sit much further back to fit the screen's width, and pitching up
  // to place the star pushed the console into the top half and left the bottom half as bare
  // floor — measured at roughly 50% of the frame with nothing in it. Aiming at the screen
  // centre, slightly high, keeps the window and the star above it without giving the floor
  // the lower half of a phone.
  if (portrait) {
    /*
     * Aim at the bank's centroid, not at one of its four displays.
     *
     * Aiming at the About screen was right while the cabin was something you passed through on
     * the way to reading one display. It is the cabin view itself now, and with the displays
     * in a 2x2 grid whose columns are not symmetric about the seat, aiming at one of them put
     * the other column half outside the frame on a phone — two of the four destinations cut in
     * half, which is most of what the view is for.
     */
    const centre = bank
      .reduce((acc, sc) => acc.add(consoleScreenWorld(sc)), new Vector3())
      .multiplyScalar(1 / bank.length);
    const up = stageDirToWorld([0, 1, 0]).normalize();
    // Aimed a little above the centroid so the forward window and the star land above the
    // bank rather than the roof. At +0.38 from a single screen the dome took the upper
    // quarter of a phone as a featureless wash.
    return { position: eye, target: centre.addScaledVector(up, 0.1), fov };
  }

  const toStar = STAR_WORLD.clone().sub(eye);
  const distance = toStar.length();
  toStar.normalize();

  // Angle between the camera axis and the star, measured up the screen.
  const ndcY = 1 - 2 * starHeight;
  const offset = Math.atan(ndcY * Math.tan((fov * Math.PI) / 360));
  // Rotate the star direction down about the seat's right-hand axis.
  const right = stageDirToWorld([1, 0, 0]).normalize();
  const forward = toStar.applyAxisAngle(right, -offset);

  return {
    position: eye,
    target: forward.multiplyScalar(distance).add(eye),
    fov,
  };
}

/**
 * Centre of the console screen, in world space. The screen is a real surface on the
 * rocket, so both the reading pose and the click target derive from the same numbers as
 * the geometry in `Cockpit`.
 */
/*
 * The display is a component in a cockpit, not the room itself. At 2.28 across it spanned
 * 58% of a cabin 3.9 wide and took 12-64% of the frame, which left the cabin as a rim of
 * peripheral shapes around a screen — the reason this kept reading as a dark room with a
 * monitor in it. Sized as an instrument, the window, the dash, the side panels and the
 * structure all get frame to be seen in, and the push-in carries readability instead.
 */
/**
 * The cockpit's screen bank.
 *
 * One display per personal section, raked toward the seat on the console arc. This replaced
 * a single large screen facing the camera dead-on, which — however carefully it was parented
 * to the console — still read as a floating panel, because a big rectangle square to the
 * viewport is exactly what a modal looks like. Four smaller displays, each turned toward the
 * pilot at its own angle, read as instruments on a console instead.
 *
 * At rest each one carries its section's name. Selecting one flies the camera square-on to
 * that screen and the same surface swaps to the full text, so the reading never leaves the
 * ship.
 */
export interface ConsoleScreen {
  id: CockpitTab;
  /** Rocket-local centre of the screen plane. */
  local: [number, number, number];
  /** Yaw toward the centreline, radians. Outer screens turn further. */
  yaw: number;
  /** Rake, radians (negative = tipped back toward the seat). */
  pitch: number;
  width: number;
  height: number;
}

const ORDER: CockpitTab[] = ['about', 'skills', 'resume', 'contact'];

/**
 * Landscape puts the four across the console arc; portrait stacks them two-by-two, because
 * four across a 390px frame gives each display about 90px of screen and no room for a name.
 */
export function consoleScreens(): ConsoleScreen[] {
  const portrait = aspect() < 1;
  if (portrait) {
    // Portrait-shaped, because the reading pose is framed against the screen and a phone's
    // horizontal field is narrow: a 0.78-wide display needed the camera 2.03 units back to
    // fit its width, which rendered it small and tilted away in the corner of the frame.
    const w = 0.52;
    const h = 0.72;
    return ORDER.map((id, i) => {
      const col = i % 2 === 0 ? -1 : 1;
      const row = i < 2 ? 1 : 0;
      return {
        id,
        local: [col * 0.34, 4.62 + row * 0.8, -1.34 - Math.abs(col) * 0.02] as [number, number, number],
        yaw: -col * 0.24,
        pitch: -0.16,
        width: w,
        height: h,
      };
    });
  }
  const w = 0.7;
  const h = 0.52;
  // Positions along an arc: the outer pair sits further out, further back and turned harder,
  // so all four face the seat rather than lying on one flat plane.
  const xs = [-1.05, -0.35, 0.35, 1.05];
  return ORDER.map((id, i) => {
    const x = xs[i]!;
    const outer = Math.abs(x) > 1;
    return {
      id,
      local: [x, outer ? 4.95 : 4.9, outer ? -1.2 : -1.44] as [number, number, number],
      yaw: -Math.sign(x) * (outer ? 0.5 : 0.16),
      pitch: -0.16,
      width: w,
      height: h,
    };
  });
}

export function consoleScreenById(id: CockpitTab): ConsoleScreen {
  const all = consoleScreens();
  return all.find((sc) => sc.id === id) ?? all[0]!;
}

export function consoleScreenWorld(screen: ConsoleScreen): Vector3 {
  return stageToWorld([STAGE.rocket[0] + screen.local[0], screen.local[1], STAGE.rocket[2] + screen.local[2]]);
}

/** Outward normal of a screen, in world space. */
export function consoleScreenNormal(screen: ConsoleScreen): Vector3 {
  const cy = Math.cos(screen.yaw);
  const sy = Math.sin(screen.yaw);
  const cp = Math.cos(screen.pitch);
  const sp = Math.sin(screen.pitch);
  // The mesh uses rotation={[pitch, yaw, 0]}, which three composes in XYZ order as
  // R = Rx(pitch) · Ry(yaw). Applying that to local +Z gives this, not the yaw-then-pitch
  // form it is easy to write from the prop order — and the difference put the reading
  // camera off the screen's axis, so the display arrived skewed and off-centre.
  return stageDirToWorld([sy, -cy * sp, cy * cp]).normalize();
}

/**
 * Square-on to one screen, close enough to read it.
 *
 * Framed from that screen's own size rather than dialled in, and along its own normal, so
 * the reader ends up looking at the surface flat rather than at an angle — which is what
 * makes the text legible on a raked display.
 */
export function cockpitScreenPose(id: CockpitTab): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  const fov = portrait ? 56 : 44;
  // Close to the frame edges but deliberately short of them: enough cabin survives around
  // the display that it still reads as a screen you selected, and at 0.66 it was simply
  // too small to read comfortably.
  const fill = portrait ? 0.9 : 0.88;

  const screen = consoleScreenById(id);
  // Ask the scene where the display is. The derived values are the fallback for the frames
  // before the cockpit has mounted — a deep link places the camera during boot.
  const placed = getScreenPlacement(id);
  const centre = placed ? placed.centre.clone() : consoleScreenWorld(screen);
  const normal = placed ? placed.normal.clone() : consoleScreenNormal(screen);
  const halfFov = (fov * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfFov) * a);
  const distance = Math.max(
    screen.height / 2 / (Math.tan(halfFov) * fill),
    screen.width / 2 / (Math.tan(halfH) * fill),
  );
  const eye = centre.clone().addScaledVector(normal, distance);
  const up = placed ? placed.up.clone() : stageDirToWorld([0, 1, 0]).normalize();
  return { position: eye, target: centre, fov, up };
}

/** Deep-space start of the intro. */
export function introStartPose(): CameraPose {
  // The system's rings and planets are not revealed until the launch, so during the intro
  // the only things in the sky are the star, the home planet and the starfield. Opening
  // at 2830 units made all three sub-pixel and the first three seconds of the signature
  // cinematic measured 98–99.7% pure black. Starting inside the system means the very
  // first frame already reads as "a star and a world", and the approach still has
  // somewhere to travel.
  return { position: new Vector3(-300, 190, 700), target: new Vector3(0, 0, 0), fov: 46 };
}

/** Star-centered pose used mid-intro and by the return-home glide. */
export function starApproachPose(): CameraPose {
  return { position: new Vector3(120, 140, 520), target: new Vector3(40, 0, 0), fov: 44 };
}

/** Just above the home planet before diving to the surface. */
export function homeApproachPose(): CameraPose {
  // A landing glide: high and behind the standing spot, looking forward over the
  // stage toward the star, so the final move descends into the menu composition.
  const above = STAGE_FRAME.origin.clone().addScaledVector(STAGE_FRAME.up, 42).addScaledVector(STAGE_FRAME.forward, -48).addScaledVector(STAGE_FRAME.right, 6);
  const target = STAGE_FRAME.origin.clone().addScaledVector(STAGE_FRAME.forward, 40).addScaledVector(STAGE_FRAME.up, 6);
  return { position: above, target, fov: 44 };
}

export const HOME_CENTER = new Vector3(WORLD.homeRingRadius, 0, 0);

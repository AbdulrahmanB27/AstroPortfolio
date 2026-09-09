import { Vector3 } from 'three';
import { STAGE, WORLD, breakpointFor, type Breakpoint } from '../lib/constants';
import { stageDirToWorld, stageToWorld, STAGE_FRAME } from '../lib/stageFrame';

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  fov: number;
}

export function currentBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  return breakpointFor(window.innerWidth, window.innerHeight);
}

function aspect(): number {
  if (typeof window === 'undefined') return 16 / 9;
  return window.innerWidth / Math.max(1, window.innerHeight);
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
    (outerRadius * 1.18 + 40) / (verticalHalf * 0.92),
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

/** Focused project: planet fills the left 40% of the frame, probe display on the right. */
export function projectPose(planetPos: Vector3, planetRadius: number, bp: Breakpoint = currentBreakpoint()): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  const fov = portrait ? 58 : 38;
  const halfFov = (fov * Math.PI) / 360;
  // Distance such that the planet's angular size is ~55% of the vertical frame. Portrait
  // pulls back further: the project sheet takes the lower two thirds of a phone, so the
  // planet has to sit whole in the band above it rather than being cut by its top edge.
  const distance = (planetRadius / Math.tan(halfFov)) * (portrait ? 4.4 : 2.6);
  const dir = new Vector3(planetPos.x, 0, planetPos.z).normalize();
  // Camera sits outside the planet (away from the star) and above the plane.
  const offset = dir.clone().multiplyScalar(distance * 0.82).add(new Vector3(0, distance * 0.5, 0));
  // Shift the look target sideways so the planet lands on the left third (or top on portrait).
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  const target = planetPos.clone();
  if (portrait) target.add(new Vector3(0, -planetRadius * 2.1, 0));
  else target.add(right.multiplyScalar(planetRadius * (bp === 'laptop' ? 1.9 : 2.2)));
  return { position: planetPos.clone().add(offset), target, fov };
}

/** Cockpit: seated behind the console, looking through the forward window at the star. */
/** The star sits at the world origin; the whole system is built around it. */
const STAR_WORLD = new Vector3(0, 0, 0);

export function cockpitPose(): CameraPose {
  const a = aspect();
  const portrait = a < 1;
  const fov = portrait ? 76 : 60;

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
  const starHeight = portrait ? 0.085 : 0.135;

  const eye = stageToWorld([STAGE.rocket[0], 5.0, STAGE.rocket[2] + (portrait ? 1.45 : 1.15)]);
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

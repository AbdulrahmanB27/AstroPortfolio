import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BackSide, CatmullRomCurve3, Color, DoubleSide, Group, MeshBasicMaterial, MeshStandardMaterial, PointLight, TubeGeometry, Vector3 } from 'three';
import { PALETTE, STAGE } from '../../lib/constants';
import { STAGE_FRAME } from '../../lib/stageFrame';
import { handles } from '../rig';
import { useApp, isCockpitScene } from '../../state/store';
import { consoleScreens } from '../poses';
import { ScreenTitle } from '../../ui/ScreenTitle';
import { getVehicleInterior, subscribeVehicleView, vehicleView } from '../home/rocketState';
import { setScreenPlacement } from './screenState';
import { batchStatic } from '../staticBatch';
import { applyPose } from '../../sequences';
import { cockpitScreenPose } from '../poses';

/**
 * Rocket cockpit interior. Lives at the rocket's position on the stage (window facing
 * the star) so the forward window shows the real horizon. The cabin is wider than the
 * rocket hull — the exterior is hidden while inside, so nothing ever overlaps.
 *
 * Rocket-local frame: origin at the pad, +Y up, -Z toward the window/star.
 * The main screen sits where the DOM mission-computer panel is overlaid.
 */

const CABIN_R = 1.95;
/**
 * Pixel budgets for the console displays.
 *
 * The card is rasterised at this width and then scaled to whatever the display occupies on
 * screen, so the budget has to match the job: a phone reads its display at roughly 300 device
 * pixels wide, and authoring at twice that halves every stroke on the way to the glass.
 *
 * There used to be a second, larger pair of these for when a display carried the full text.
 * It does not any more — the reader is flat — so there is one budget per orientation.
 */
const TITLE_PX_LANDSCAPE = 340;
const TITLE_PX_PORTRAIT = 260;
/**
 * drei renders `Html transform` content at 400 / (distanceFactor ?? 10) = 40 CSS pixels per
 * world unit. The group scale has to undo that before the content lands on a plane of the
 * screen's width; without it the panel renders at 1/40 size — a legible-looking speck.
 */
const HTML_PX_PER_UNIT = 40;
const FLOOR_Y = 4.05;
const CEIL_Y = 6.55;

export function Cockpit() {
  // Subscribing to the canvas size is what makes the console re-proportion when a phone is
  // rotated: CONSOLE_SCREEN reports different dimensions for portrait and landscape, and
  // without this the geometry would keep whatever it was built with at mount.
  useThree((s) => s.size);
  // Whether the camera is inside the cabin, as React state rather than only a per-frame
  // read. The console's content is DOM in a portal, so hiding the 3D group leaves it on
  // screen — it was being drawn over the rocket's hull from outside on the home planet.
  const interior = useSyncExternalStore(subscribeVehicleView, getVehicleInterior, getVehicleInterior);
  const screens = consoleScreens();
  // The bank is stacked two-by-two on a phone; its displays are authored at a lower
  // resolution because they land on far fewer device pixels.
  const portraitBank = screens[0] !== undefined && screens[0].height > screens[0].width;
  const tab = useApp((st) => st.cockpitTab);
  const view = useApp((st) => st.cockpitView);
  const groupRef = useRef<Group>(null);
  // One-shot: a deep link to `#/about` places the camera during boot, before this
  // component exists to publish where its displays are, so that first pose comes from the
  // derived fallback. Re-apply it once the real transforms are known.
  const correctedRef = useRef(false);
  const anchorRef = useRef<Group>(null);
  const stripLightA = useRef<PointLight>(null);
  const stripLightB = useRef<PointLight>(null);
  const cabinLightRef = useRef<PointLight>(null);
  const footLightRef = useRef<PointLight>(null);
  const dashLightRef = useRef<PointLight>(null);
  const dashLightB = useRef<PointLight>(null);
  const crownLightRef = useRef<PointLight>(null);
  const scene = useApp((s) => s.scene);
  const inCockpitScene = isCockpitScene(scene);
  /*
   * Every lit surface in the cabin evaluates every point light in it, whether or not the light
   * reaches that surface, so the light count is the fragment cost of the whole room. Below the
   * top tier the two lamp glows go (they light a few centimetres of panel); on the lowest the
   * per-display lights go too, and the displays' own glow and the panel floods carry the bank.
   */
  const tier = useApp((s) => s.quality.tier);
  const lampGlows = tier === 'high';
  const displayLights = tier !== 'low';

  // Only once the camera is actually through the hatch. During the approach the cabin is
  // hidden so the rocket it lives inside can be seen; see `vehicleView`.
  useFrame(() => {
    const group = anchorRef.current;
    if (group) group.visible = inCockpitScene && vehicleView.interior;

    // Publish where each display actually ended up, so the reading pose can ask instead of
    // re-deriving the transform. See `screenState`.
    if (!group) return;
    for (const sc of screens) {
      const node = group.getObjectByName(`screen-${sc.id}`);
      if (!node) continue;
      node.updateWorldMatrix(true, false);
      const e = node.matrixWorld.elements;
      const normal = new Vector3(e[8]!, e[9]!, e[10]!).normalize();
      const up = new Vector3(e[4]!, e[5]!, e[6]!).normalize();
      setScreenPlacement(sc.id, {
        centre: new Vector3(e[12]!, e[13]!, e[14]!),
        normal,
        up,
        width: sc.width,
        height: sc.height,
      });
    }

    if (!correctedRef.current) {
      const app = useApp.getState();
      if (app.scene === 'cockpit' && !app.busy && app.cockpitView === 'full') {
        correctedRef.current = true;
        applyPose(cockpitScreenPose(app.cockpitTab));
      }
    }
  });

  const mats = useMemo(() => {
    const shell = new MeshStandardMaterial({ color: PALETTE.cockpitGraphite, roughness: 0.82, metalness: 0.25, side: BackSide });
    // Lifted off the palette's darkest value and warmed a little: at #1e232b the dash took
    // the flood and still rendered below the scene's black point.
    const panel = new MeshStandardMaterial({ color: '#2b2f36', roughness: 0.62, metalness: 0.28 });
    const rib = new MeshStandardMaterial({ color: '#3a4048', roughness: 0.5, metalness: 0.5 });
    const floor = new MeshStandardMaterial({ color: '#080a0e', roughness: 0.98, metalness: 0.05 });
    const seat = new MeshStandardMaterial({ color: '#23272e', roughness: 0.85, metalness: 0.05 });
    const strip = new MeshBasicMaterial({ color: PALETTE.starGlow, toneMapped: false, transparent: true, opacity: 0 });
    const screen = new MeshBasicMaterial({ color: PALETTE.screenGlow, toneMapped: false, transparent: true, opacity: 0 });
    const sideScreen = new MeshBasicMaterial({ color: new Color(PALETTE.screenGlow).multiplyScalar(0.17), toneMapped: false, transparent: true, opacity: 0 });
    /*
     * The same display, powered down.
     *
     * A phone's frame cannot be filled by a display whose own proportions are 1:1.38, so
     * reading one screen in portrait always leaves a sibling display in shot — and a sibling's
     * emissive plane, at the shared material's value, rendered as a flat mid-grey rectangle
     * with a measured mean of 76 luminance against a peak of 93. That made it the brightest
     * large AREA in the frame while containing nothing, and two review lenses read it as a
     * half-rendered layer rather than as set dressing. Hiding its title card alone made it
     * worse: a blank lit panel reads as a broken display.
     *
     * So on a phone an idle display is genuinely off. Its own point light is already down to
     * 0.25 while a sibling is being read; this is the surface.
     */
    const sideScreenOff = new MeshBasicMaterial({ color: new Color(PALETTE.screenGlow).multiplyScalar(0.17), toneMapped: false, transparent: true, opacity: 0 });
    // Traces drawn on the side displays: brighter than their ground, so the panels read
    // as instruments showing something rather than as lit rectangles.
    const trace = new MeshBasicMaterial({ color: new Color(PALETTE.screenGlow).multiplyScalar(0.62), toneMapped: false, transparent: true, opacity: 0 });
    const glass = new MeshStandardMaterial({ color: '#0b1220', roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.18, side: DoubleSide });
    // Switch bodies and lever grips: matte, near-black, so the metal around them reads.
    const grip = new MeshStandardMaterial({ color: '#1a1d22', roughness: 0.9, metalness: 0.08 });
    // Indicator lamps. Faint until the console powers up (see setPower).
    // Held below the display and the star: a status lamp is punctuation, and at full palette
    // value these read as flat discs of identical pixels with nothing around them.
    const lampWarm = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(0.8), toneMapped: false, transparent: true, opacity: 0 });
    const lampCool = new MeshBasicMaterial({ color: new Color(PALETTE.screenGlow).multiplyScalar(0.72), toneMapped: false, transparent: true, opacity: 0 });
    // Equipment the cabin carries rather than is built from: a red extinguisher, cable
    // conduit, the pale placards that label a panel, and a small amber readout.
    const extinguisher = new MeshStandardMaterial({ color: '#8f2a22', roughness: 0.45, metalness: 0.2 });
    const conduit = new MeshStandardMaterial({ color: '#24282f', roughness: 0.7, metalness: 0.2 });
    // Dark and matte: the wall panels sit beside the amber strip lights, and at the cabin's
    // own panel values they flooded to a pale board that out-shouted the displays.
    const placard = new MeshStandardMaterial({ color: '#4d4a44', roughness: 0.9, metalness: 0 });
    const wallFace = new MeshStandardMaterial({ color: '#1c2026', roughness: 0.85, metalness: 0.15 });
    const readout = new MeshBasicMaterial({ color: new Color(PALETTE.starGlow).multiplyScalar(0.4), toneMapped: false, transparent: true, opacity: 0 });
    return { shell, panel, rib, floor, seat, strip, screen, sideScreen, sideScreenOff, glass, grip, lampWarm, lampCool, trace, extinguisher, conduit, placard, wallFace, readout };
  }, []);

  useEffect(() => {
    handles.cockpit = {
      setPower: (p: number) => {
        const k = Math.max(0, Math.min(1, p));
        mats.strip.opacity = k * 0.9;
        // Scaled past 1.0 so the strips and the main screen actually cross the bloom
        // threshold: below it they were backlit stickers in a dark room rather than the
        // only light source in it.
        mats.strip.color.setRGB(1.5 * (0.6 + k * 1.4), 1.05 * (0.6 + k * 1.4), 0.5 * (0.6 + k * 1.4));
        // Deliberately under the bloom threshold. The content is rendered ON this plane now,
        // so the plane is the backlight rather than the display: at the old values — up to
        // (1.47, 1.73, 2.10) — a screen this size bloomed into a white rectangle that ate
        // the cabin and everything on it.
        mats.screen.color.setRGB(0.20 + k * 0.20, 0.26 + k * 0.24, 0.36 + k * 0.30);
        mats.screen.opacity = Math.pow(k, 1.6) * 0.9;
        // The side displays are the only cockpit screens the viewer actually sees — the main
        // one is behind the content panel — and at 42% they sat under the bloom threshold and
        // spilled nothing, so the cabin had no interior light source at all.
        mats.sideScreen.opacity = Math.pow(k, 2) * 0.8;
        mats.sideScreenOff.opacity = Math.pow(k, 2) * 0.1;
        mats.trace.opacity = Math.pow(k, 2.2) * 0.85;
        // Practicals pool rather than flood. At the old values — a 12-intensity screen lamp
        // over distance 5 and a 3.4 cabin lamp over distance 7 — every surface in the cabin
        // sat in the falloff of something, and a room built from #14171d graphite rendered
        // as flat pale grey. A spacecraft interior is mostly dark with a few things lit.
        if (stripLightA.current) stripLightA.current.intensity = k * 3.4;
        if (stripLightB.current) stripLightB.current.intensity = k * 3.4;
        if (cabinLightRef.current) cabinLightRef.current.intensity = k * 1.1 * (portraitBank ? 0.55 : 1);
        if (footLightRef.current) footLightRef.current.intensity = k * 0.8;
        /*
         * Panel flood. Without it the entire instrument bank sat below the scene's own black
         * point: 77% of the lower third measured darker than --space-900, so the gauges,
         * switch rows and breakers only appeared at 4x gain. A real cockpit floodlights its
         * panel from under the coaming, which is where these sit.
         *
         * Backed off in portrait, where they were the opposite failure. A phone's frame cannot
         * be filled by a display whose own proportions are 1:1.38 — the panel is as wide as
         * the frame allows and still leaves 177px of cabin above it and 177px below — so on a
         * phone these floods filled a third of the viewport with a featureless mid-grey wash.
         * Measured on the Contact frame: the top 140px had a mean of 79 against a peak of 95,
         * so it was both the brightest large AREA in the frame and had nothing in it, while
         * the panel it was competing with meaned 29-38. Two review lenses read the same wash
         * below the panel as "a half-rendered duplicate layer". A reading surface on a phone
         * has to be the only lit thing in the room.
         */
        /*
         * Backed off in portrait, but only a little.
         *
         * Taking these to 0.16 moved the band below the panel from a mean of 90 to 71, which
         * says most of that light is not coming from here — it is the star through the forward
         * window, landing on a console that faces up toward it. Dimming the practicals further
         * only flattened the cabin's own detail without fixing the brightness, so the frame's
         * exposure carries it instead (see setCockpitView) and these keep enough to model the
         * panel they exist for.
         */
        const flood = portraitBank ? 0.55 : 1;
        if (dashLightRef.current) dashLightRef.current.intensity = k * 1.9 * flood;
        if (dashLightB.current) dashLightB.current.intensity = k * 1.3 * flood;
        if (crownLightRef.current) crownLightRef.current.intensity = k * 1.5 * flood;
        // Indicator lamps come up last and stay dim: they are punctuation, not lighting.
        mats.lampWarm.opacity = Math.pow(k, 2.4) * 0.95;
        mats.lampCool.opacity = Math.pow(k, 2.4) * 0.9;
        mats.readout.opacity = Math.pow(k, 2) * 0.6;
      },
    };
    handles.cockpit.setPower(0);
    return () => {
      delete handles.cockpit;
    };
  }, [mats]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // The cabin's structure never changes after mount: one draw call per material instead of
  // one per bolt. The displays are left out — they resize with the viewport and swap
  // material when a sibling is being read. See `staticBatch`.
  useLayoutEffect(() => (groupRef.current ? batchStatic(groupRef.current) : undefined), []);

  /*
   * Cable runs: from the crown down each wall to the console, where everything in a cockpit
   * is wired to. Without them the walls were bare shell between the ribs, and the cabin read
   * as a room someone had put instruments into rather than a vehicle built around them.
   */
  const conduits = useMemo(() => {
    const run = (side: number, offset: number) => {
      const at = (a: number, y: number) => new Vector3(-Math.sin(side * a) * (CABIN_R - 0.06 - offset), y, -Math.cos(side * a) * (CABIN_R - 0.06 - offset));
      return new TubeGeometry(
        // Kept on the curved wall (the shell's forward gap, round the window, spans ±0.7 rad),
        // beside the wall panel rather than across it.
        new CatmullRomCurve3([at(0.8, CEIL_Y + 0.2), at(0.8, CEIL_Y - 0.3), at(0.8, 5.6), at(0.8, 5.0), at(0.78, 4.7)]),
        48,
        0.022 - offset * 0.2,
        8,
        false,
      );
    };
    return [run(1, 0), run(1, 0.05), run(-1, 0), run(-1, 0.05)];
  }, []);
  useEffect(() => () => conduits.forEach((g) => g.dispose()), [conduits]);

  const { shell, panel, rib, floor, seat, strip, sideScreen, sideScreenOff, glass, grip, lampWarm, lampCool, extinguisher, conduit, placard, wallFace, readout } = mats;
  const ribAngles = [-1.35, -0.75, 0.75, 1.35, 2.2, -2.2, Math.PI];

  return (
    <group ref={anchorRef} name="cockpit-anchor" position={STAGE_FRAME.origin} quaternion={STAGE_FRAME.quaternion} visible={false}>
      <group ref={groupRef} position={[STAGE.rocket[0], 0, STAGE.rocket[2]]} name="cockpit">
        {/* Cabin shell: cylinder with a gap at the front for the window, plus floor and ceiling dome. */}
        {/* Cylinder theta=0 faces +Z; the gap is centered on -Z (the window, toward the star). */}
        <mesh position={[0, (FLOOR_Y + CEIL_Y) / 2, 0]} material={shell} castShadow>
          <cylinderGeometry args={[CABIN_R, CABIN_R, CEIL_Y - FLOOR_Y, 48, 1, true, Math.PI + 0.7, Math.PI * 2 - 1.4]} />
        </mesh>
        <mesh position={[0, CEIL_Y, 0]} material={shell}>
          <sphereGeometry args={[CABIN_R, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, FLOOR_Y, 0]} material={floor} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[CABIN_R, 48]} />
        </mesh>
        {/* Structural ribs */}
        {/* Ribs stand proud of the shell and carry a chamfer along their inboard face, so
            they catch a highlight instead of reading as a stripe darker than the wall behind
            them. A rib that does not catch light is not structure, it is paint. */}
        {ribAngles.map((a, i) => (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0, (FLOOR_Y + CEIL_Y) / 2, -CABIN_R + 0.11]} material={rib} castShadow>
              <boxGeometry args={[0.15, CEIL_Y - FLOOR_Y, 0.2]} />
            </mesh>
            {/* Chamfered cap: the edge that takes the highlight. */}
            <mesh position={[0, (FLOOR_Y + CEIL_Y) / 2, -CABIN_R + 0.215]} material={panel}>
              <boxGeometry args={[0.09, CEIL_Y - FLOOR_Y, 0.02]} />
            </mesh>
            {/* Bolted to the shell at three stations. */}
            {[-0.85, 0, 0.85].map((dy) => (
              <mesh key={`bolt-${dy}`} position={[0, (FLOOR_Y + CEIL_Y) / 2 + dy, -CABIN_R + 0.215]} material={grip}>
                <cylinderGeometry args={[0.03, 0.03, 0.02, 6]} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh position={[0, CEIL_Y - 0.02, 0]} material={rib} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[CABIN_R - 0.16, CABIN_R - 0.04, 48]} />
        </mesh>
        {/*
          Ceiling structure.
          Portrait aims across the console, so the dome fills the top of a phone — and it was
          a featureless near-black wash over 23% of the frame. These are the formers the
          cabin's roof would actually be built from: four ribs running fore-aft over the
          crown, a spine down the centreline, and a strip light on it. They give the top of
          the frame something to be, and the strip gives the dome a source of its own.
        */}
        {[-0.62, -0.2, 0.2, 0.62].map((x) => (
          <mesh key={`crown-${x}`} position={[x, CEIL_Y + 0.42, -0.35]} material={rib} rotation={[0.16, 0, 0]}>
            <boxGeometry args={[0.075, 0.05, 2.5]} />
          </mesh>
        ))}
        <mesh position={[0, CEIL_Y + 0.5, -0.35]} material={panel} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[0.34, 0.06, 2.3]} />
        </mesh>
        <mesh position={[0, CEIL_Y + 0.44, -0.5]} material={strip} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[0.13, 0.02, 1.5]} />
        </mesh>
        <pointLight ref={crownLightRef} color="#ffd2a0" intensity={0} distance={2.6} decay={2} position={[0, CEIL_Y + 0.3, -0.5]} />
        {/* Cross members, so the ribs are tied together rather than four loose bars. */}
        {[-1.1, 0.25].map((z) => (
          <mesh key={`tie-${z}`} position={[0, CEIL_Y + 0.36, z]} material={rib} rotation={[0, 0, 0]}>
            <boxGeometry args={[1.5, 0.04, 0.07]} />
          </mesh>
        ))}
        {/* Forward window: frame + glass, cut into the front gap. */}
        <group position={[0, 5.72, -CABIN_R + 0.02]}>
          <mesh material={rib} position={[0, 0.56, 0]}>
            <boxGeometry args={[3.0, 0.12, 0.16]} />
          </mesh>
          <mesh material={rib} position={[0, -0.56, 0]}>
            <boxGeometry args={[3.0, 0.12, 0.16]} />
          </mesh>
          <mesh material={rib} position={[-1.5, 0, 0]}>
            <boxGeometry args={[0.12, 1.24, 0.16]} />
          </mesh>
          <mesh material={rib} position={[1.5, 0, 0]}>
            <boxGeometry args={[0.12, 1.24, 0.16]} />
          </mesh>
          <mesh material={rib} position={[0, 0, 0]}>
            <boxGeometry args={[0.05, 1.1, 0.1]} />
          </mesh>
          <mesh material={glass}>
            <planeGeometry args={[2.9, 1.0]} />
          </mesh>
          {/* Thin emissive edge along the window frame reads as an instrument outline. */}
          <mesh material={strip} position={[0, -0.5, 0.09]}>
            <boxGeometry args={[2.9, 0.012, 0.01]} />
          </mesh>
          {/* Bolts along the top and bottom of the frame: the glass is held in, not floating. */}
          {[-0.56, 0.56].map((y) =>
            Array.from({ length: 11 }, (_, i) => (
              <mesh key={`wb-${y}-${i}`} position={[-1.35 + i * 0.27, y, 0.085]} rotation={[Math.PI / 2, 0, 0]} material={grip}>
                <cylinderGeometry args={[0.016, 0.016, 0.014, 6]} />
              </mesh>
            )),
          )}
        </group>
        {/* Header panel above the window closes the shell gap up to the ceiling */}
        <mesh position={[0, 6.42, -CABIN_R + 0.06]} material={panel}>
          <boxGeometry args={[3.4, 0.34, 0.12]} />
        </mesh>
        {/* Lower front wall below the window */}
        <mesh position={[0, 4.6, -CABIN_R + 0.06]} material={panel} rotation={[0, 0, 0]}>
          <boxGeometry args={[3.2, 1.1, 0.12]} />
        </mesh>
        {/* Overhead panel with small indicator lights */}
        <mesh position={[0, CEIL_Y - 0.3, 0.55]} material={panel} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[1.8, 0.5, 0.08]} />
        </mesh>
        {[-0.6, -0.2, 0.2, 0.6].map((x) => (
          <mesh key={x} position={[x, CEIL_Y - 0.36, 0.4]} material={strip} rotation={[-0.35, 0, 0]}>
            <boxGeometry args={[0.16, 0.03, 0.02]} />
          </mesh>
        ))}
        {/* Console: curved desk with the main screen and two side displays */}
        <mesh position={[0, 4.62, -1.05]} material={panel} rotation={[-0.35, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.12, 0.9]} />
        </mesh>
        <mesh position={[0, 4.42, -0.72]} material={rib}>
          <boxGeometry args={[2.4, 0.5, 0.1]} />
        </mesh>
        {/*
          The screen bank: one display per personal section, raked toward the seat.

          This replaced a single large screen facing the camera dead-on. That version was
          genuinely parented to the console and genuinely tilted with it, and it still read
          as a floating popup — because a big rectangle square to the viewport is what a
          modal looks like, wherever it is attached. Four smaller displays, each turned to
          face the pilot at its own angle, read as instruments on a console.

          At rest each carries its section's name. Selecting one flies the camera square-on
          to that screen and the same surface swaps to the full text, so the reading never
          leaves the ship.
        */}
        {screens.map((sc) => {
          // The display the reader is open on: it no longer carries the text, but it is the
          // surface the camera is pointed at, so it stays lit while its siblings idle down.
          // The display the reader is open on. It no longer carries the text — the reader
          // does — but it is still the surface the camera is pointed at, so it stays lit while
          // its siblings idle down.
          const active = interior && view === 'full' && tab === sc.id;
          // A sibling display, while one is being read on a phone. In landscape the bank is a
          // composition and every screen stays lit; in portrait a sibling is a large blank
          // rectangle in the frame and has to be off, not merely blank.
          const idle = portraitBank && interior && view !== 'room' && tab !== sc.id;
          // The display's resolution. Only a title card is rendered on it now, so there is one
          // budget per orientation rather than one for the card and one for the body text.
          const px = portraitBank ? TITLE_PX_PORTRAIT : TITLE_PX_LANDSCAPE;
          const contentH = Math.round((sc.height / sc.width) * px);
          const scale = (sc.width * HTML_PX_PER_UNIT) / px;
          return (
            <group key={sc.id} name={`screen-${sc.id}`} position={sc.local} rotation={[sc.pitch, sc.yaw, 0]} userData={{ dynamic: true }}>
              {/* Bezel, with a lip that catches the panel flood. */}
              <mesh material={rib} position={[0, 0, -0.035]} castShadow>
                <boxGeometry args={[sc.width + 0.1, sc.height + 0.1, 0.06]} />
              </mesh>
              <mesh material={panel} position={[0, 0, -0.062]}>
                <boxGeometry args={[sc.width + 0.16, sc.height + 0.16, 0.05]} />
              </mesh>
              {/* Mounting arm down to the console, so the display is carried by something. */}
              <mesh material={rib} position={[0, -sc.height / 2 - 0.16, -0.08]}>
                <boxGeometry args={[0.09, 0.24, 0.09]} />
              </mesh>
              <mesh material={idle ? sideScreenOff : sideScreen} position={[0, 0, 0.004]}>
                <planeGeometry args={[sc.width, sc.height]} />
              </mesh>
              {inCockpitScene && interior && (
                <Html
                  transform
                  position={[0, 0, 0.01]}
                  scale={scale}
                  zIndexRange={[10, 0]}
                  className="screen-mount"
                  style={{ width: `${px}px`, height: `${contentH}px` }}
                >
                  {/* Always the title card. The reader is a flat surface now, mounted once by
                      `CockpitFullscreen`; for one build this branch still mounted a second
                      copy of it inside the CSS3D layer, so the document held two readers and
                      two "back to the cabin" buttons. */}
                  <ScreenTitle id={sc.id} />
                </Html>
              )}
              {displayLights && (
                <pointLight
                  color={PALETTE.screenGlow}
                  intensity={active ? 1.6 : view === 'full' ? 0.25 : 0.7}
                  distance={1.5}
                  decay={2}
                  position={[0, 0, 0.4]}
                />
              )}
            </group>
          );
        })}
        {/* Practical amber strips along the side ribs */}
        <mesh position={[-CABIN_R + 0.12, 5.55, -0.4]} material={strip} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.03, 1.4, 0.05]} />
        </mesh>
        <mesh position={[CABIN_R - 0.12, 5.55, -0.4]} material={strip} rotation={[0, -0.3, 0]}>
          <boxGeometry args={[0.03, 1.4, 0.05]} />
        </mesh>
        <pointLight ref={stripLightA} color={PALETTE.starGlow} intensity={0} distance={5} decay={2} position={[-CABIN_R + 0.4, 5.5, -0.4]} />
        <pointLight ref={stripLightB} color={PALETTE.starGlow} intensity={0} distance={5} decay={2} position={[CABIN_R - 0.4, 5.5, -0.4]} />
        <pointLight ref={cabinLightRef} color="#8fa6c8" intensity={0} distance={3.4} decay={2} position={[0, CEIL_Y - 0.35, 0.1]} />
        {/* Footwell wash, so the floor is lit from something rather than by ambient. */}
        <pointLight ref={footLightRef} color="#ffb454" intensity={0} distance={2.6} decay={2} position={[0, FLOOR_Y + 0.5, -0.95]} />
        {/* Under the coaming, washing down over the instrument bank. Warm, because the
            only other source in the cabin is amber and 63% of the structure was reading
            as untinted neutral grey. */}
        <pointLight ref={dashLightRef} color="#ffd2a0" intensity={0} distance={2.1} decay={2} position={[0, 4.62, -0.2]} />
        <pointLight ref={dashLightB} color="#ffd2a0" intensity={0} distance={2.4} decay={2} position={[0, 4.74, -0.95]} />

        {/*
          Everything from here down is sized against how close the camera is to it. The eye
          sits 0.95 above the floor and the display is 2.6 away, so a form one unit from the
          camera is about three times the apparent size of the same form on the console. A
          first pass put a full-height pedestal and long armrests at that distance and they
          filled the lower half of the frame as grey slabs. What belongs here is small, low
          and mostly out of frame: the parts of your own seat and console you actually see
          while sitting in them.
        */}

        {/* Knee panel: the wall under the dash, from the console down to the floor. A cockpit
            has structure here, not open floor — this is what was leaving the lower third of
            the frame as a bare plane. Angled back so the pilot's knees clear it. */}
        <mesh position={[0, 4.33, -0.52]} material={panel} rotation={[0.2, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.5, 0.68, 0.1]} />
        </mesh>
        {/* Kick strip along its foot, catching the footwell wash. */}
        <mesh position={[0, 4.06, -0.44]} material={rib} castShadow>
          <boxGeometry args={[2.5, 0.07, 0.18]} />
        </mesh>
        {/* Bolted-on access panels with their fasteners: a wall like this is assembled, and
            the fasteners are what say so at this distance. */}
        {[-0.74, 0.74].map((x) => (
          <group key={`hatch-${x}`} position={[x, 4.36, -0.47]} rotation={[0.2, 0, 0]}>
            <mesh material={rib}>
              <boxGeometry args={[0.56, 0.36, 0.022]} />
            </mesh>
            {[-0.23, 0.23].map((fx) =>
              [-0.14, 0.14].map((fy) => (
                <mesh key={`f-${fx}-${fy}`} position={[fx, fy, 0.016]} material={grip}>
                  <cylinderGeometry args={[0.016, 0.016, 0.012, 6]} />
                </mesh>
              )),
            )}
          </group>
        ))}
        {/* Rudder pedals in the footwell — the last thing between the dash and the deck, and
            the part that says a person flies this rather than reads it. */}
        {[-0.34, 0.34].map((x) => (
          <group key={`pedal-${x}`} position={[x, FLOOR_Y + 0.16, -0.32]}>
            <mesh rotation={[0.55, 0, 0]} material={grip} castShadow>
              <boxGeometry args={[0.2, 0.26, 0.03]} />
            </mesh>
            <mesh position={[0, -0.13, 0.06]} material={rib}>
              <boxGeometry args={[0.05, 0.05, 0.24]} />
            </mesh>
          </group>
        ))}

        {/*
          Lower instrument panel.

          What a pilot sees below the main display is more panel, not deck: switch banks,
          gauges and breakers running the full width down to the knees. Building this out of
          free-standing furniture instead — a pedestal on an open floor — left a third of the
          frame as bare plate with a black box sitting on it, because at this distance a
          0.4-wide box is 300px of unlit face. Panel all the way down is both what the real
          thing looks like and what fills the frame.
        */}
        {/* Mounted on the dash, not behind the display. Built at z -1.3 it sat behind the
            console and never reached the frame at all — 60 meshes of gauges and breakers
            rendering where nothing could see them. */}
        <group position={[0, 4.42, -0.45]} rotation={[0.2, 0, 0]}>
          {/* Bezel only: the knee panel behind it is the backing. */}
          <mesh position={[0, 0, 0.055]} material={rib}>
            <boxGeometry args={[2.3, 0.34, 0.02]} />
          </mesh>

          {/* Two round gauges, recessed behind their own rings. */}
          {[-0.82, 0.82].map((x) => (
            <group key={`gauge-${x}`} position={[x, 0.02, 0.07]}>
              <mesh material={rib}>
                <torusGeometry args={[0.085, 0.014, 8, 20]} />
              </mesh>
              <mesh position={[0, 0, -0.012]} material={grip}>
                <circleGeometry args={[0.08, 20]} />
              </mesh>
              {/* Needle, parked off-centre so the two gauges do not read as identical. */}
              <mesh position={[0, 0, 0.002]} rotation={[0, 0, x < 0 ? 0.7 : -1.1]} material={lampWarm}>
                <boxGeometry args={[0.007, 0.065, 0.002]} />
              </mesh>
            </group>
          ))}

          {/* Switch banks: three rows of toggles with their guards. */}
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <mesh key={`ls-${row}-${col}`} position={[-0.3 + col * 0.12, 0.09 - row * 0.075, 0.075]} material={grip}>
                <boxGeometry args={[0.032, 0.032, 0.026]} />
              </mesh>
            )),
          )}

          {/* Breaker strip along the bottom edge. */}
          {Array.from({ length: 14 }, (_, i) => (
            <mesh key={`brk-${i}`} position={[-1.04 + i * 0.16, -0.12, 0.07]} material={rib}>
              <cylinderGeometry args={[0.019, 0.019, 0.022, 8]} />
            </mesh>
          ))}

          {/* Status lamps — the only saturated colour on the panel. */}
          {lampGlows && [-0.42, 0.42].map((x) => (
            <pointLight key={`lampglow-${x}`} color={PALETTE.starGlow} intensity={0.45} distance={0.5} decay={2} position={[x, 0.13, 0.11]} />
          ))}
          {[-0.5, -0.42, -0.34, 0.34, 0.42, 0.5].map((x, i) => (
            <mesh key={`ll-${x}`} position={[x, 0.13, 0.075]} material={i % 3 === 1 ? lampCool : lampWarm}>
              <circleGeometry args={[0.016, 10]} />
            </mesh>
          ))}
        </group>

        {/* Coaming: the lip between the display and the lower panel, angled up so it catches
            the display's glow and carries it down the front of the instruments. */}
        <mesh position={[0, 4.62, -1.28]} material={rib} rotation={[0.34, 0, 0]} castShadow>
          <boxGeometry args={[2.44, 0.06, 0.3]} />
        </mesh>

        {/* Seat: only the armrest tips and the cushion's front lip reach the frame, which is
            what you see of your own seat. The bracket carries the armrest rather than
            leaving it floating. */}
        {/* The seat, and the one thing in here a hand closes on. Previously the armrests sat
            just outside the frame at this lens, so the cabin had no seat in it at all — you
            were floating in front of a panel. Brought inboard and forward so their forward
            ends and the grab handles read in the lower corners. */}
        {[-0.74, 0.74].map((x) => (
          <group key={`arm-${x}`}>
            <mesh position={[x, 4.3, 0.55]} material={grip} castShadow>
              <boxGeometry args={[0.12, 0.06, 1.0]} />
            </mesh>
            {/* Padded top, proud of the frame so it catches the panel flood. */}
            <mesh position={[x, 4.34, 0.5]} material={seat} castShadow>
              <boxGeometry args={[0.135, 0.026, 0.84]} />
            </mesh>
            {/* Carried by a bracket rather than floating. */}
            <mesh position={[x, 4.17, 0.9]} material={rib}>
              <boxGeometry args={[0.045, 0.24, 0.08]} />
            </mesh>
            {/* Grab handle: a rail over the forward end of the armrest. */}
            <mesh position={[x, 4.4, 0.14]} material={rib} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.19, 8]} />
            </mesh>
            {[-0.08, 0.08].map((dz) => (
              <mesh key={`stan-${dz}`} position={[x, 4.36, 0.14 + dz]} material={rib}>
                <boxGeometry args={[0.022, 0.055, 0.022]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Behind the eye, not in front of it: at z 1.05 the pan's front half was 0.1 from
            the camera and filled the bottom of the frame as a pale wedge. */}
        <mesh position={[0, 4.22, 1.62]} material={seat} castShadow receiveShadow>
          <boxGeometry args={[1.16, 0.24, 1.0]} />
        </mesh>
        <mesh position={[0, 5.1, 1.55]} material={seat}>
          <boxGeometry args={[1.0, 1.6, 0.25]} />
        </mesh>

        {/* Side consoles under each wall display: switch rows and a lamp, so those panels
            read as equipment rather than as lit rectangles stuck to a wall. */}
        {[-1, 1].map((side) => (
          <group key={`side-${side}`} position={[side * 1.2, 4.6, -1.14]} rotation={[-0.12, side * 0.55, 0]}>
            <mesh material={panel} castShadow>
              <boxGeometry args={[0.58, 0.13, 0.34]} />
            </mesh>
            {[0, 1, 2].map((col) => (
              <mesh key={col} position={[-0.16 + col * 0.16, 0.08, 0.02]} material={grip}>
                <boxGeometry args={[0.045, 0.035, 0.05]} />
              </mesh>
            ))}
            <mesh position={[0.22, 0.075, 0.02]} material={lampWarm} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.018, 8]} />
            </mesh>
          </group>
        ))}

        {/*
          Wall equipment.

          Between the window posts and the side ribs the walls were bare graphite shell: the
          two largest unlit areas in the cabin view. Each now carries a systems panel turned to
          face the seat — a grid of guarded toggles, two rotary selectors, a small amber
          readout and a placard strip — which is what the side walls of a real cockpit are
          covered in, and which gives the panel flood something to land on.
        */}
        {[-1, 1].map((side) => {
          const a = side * 1.02;
          const r = CABIN_R - 0.05;
          return (
            <group key={`wall-${side}`} position={[-Math.sin(a) * r, 5.42, -Math.cos(a) * r]} rotation={[0, a, 0]}>
              <mesh material={rib} castShadow receiveShadow>
                <boxGeometry args={[0.62, 0.78, 0.05]} />
              </mesh>
              <mesh position={[0, 0, 0.028]} material={wallFace}>
                <boxGeometry args={[0.56, 0.72, 0.008]} />
              </mesh>
              {/* Toggle grid, three rows of four, each with its guard bar. */}
              {[0, 1, 2].map((row) =>
                [0, 1, 2, 3].map((col) => (
                  <group key={`t-${row}-${col}`} position={[-0.18 + col * 0.12, 0.2 - row * 0.12, 0.04]}>
                    <mesh material={grip}>
                      <boxGeometry args={[0.03, 0.03, 0.02]} />
                    </mesh>
                    <mesh position={[0, 0.012, 0.02]} rotation={[0.5, 0, 0]} material={rib}>
                      <cylinderGeometry args={[0.006, 0.006, 0.04, 6]} />
                    </mesh>
                    <mesh position={[0, -0.03, 0.006]} material={placard}>
                      <boxGeometry args={[0.05, 0.009, 0.003]} />
                    </mesh>
                  </group>
                )),
              )}
              {/* Two rotary selectors. */}
              {[-0.12, 0.12].map((x) => (
                <group key={`knob-${x}`} position={[x, -0.18, 0.045]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]} material={rib}>
                    <torusGeometry args={[0.042, 0.007, 6, 18]} />
                  </mesh>
                  <mesh rotation={[Math.PI / 2, 0, 0]} material={grip}>
                    <cylinderGeometry args={[0.032, 0.036, 0.03, 16]} />
                  </mesh>
                  <mesh position={[0, 0.016, 0.018]} material={lampWarm}>
                    <boxGeometry args={[0.005, 0.022, 0.002]} />
                  </mesh>
                </group>
              ))}
              {/* Readout and its bezel. */}
              <mesh position={[0, -0.31, 0.034]} material={grip}>
                <boxGeometry args={[0.36, 0.08, 0.012]} />
              </mesh>
              <mesh position={[0, -0.31, 0.041]} material={readout}>
                <planeGeometry args={[0.26, 0.032]} />
              </mesh>
              {/* Placard strip across the top. */}
              <mesh position={[0, 0.33, 0.034]} material={placard}>
                <boxGeometry args={[0.36, 0.024, 0.004]} />
              </mesh>
              {/* Corner fasteners. */}
              {[-0.27, 0.27].map((fx) =>
                [-0.35, 0.35].map((fy) => (
                  <mesh key={`wf-${fx}-${fy}`} position={[fx, fy, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={grip}>
                    <cylinderGeometry args={[0.014, 0.014, 0.01, 6]} />
                  </mesh>
                )),
              )}
            </group>
          );
        })}

        {/* Grab bars over the wall panels: in a cabin that can be weightless, every wall has
            something to hold. Steel bars on two standoffs. */}
        {[-1, 1].map((side) => {
          const a = side * 1.02;
          const r = CABIN_R - 0.09;
          return (
            <group key={`grab-${side}`} position={[-Math.sin(a) * r, 6.02, -Math.cos(a) * r]} rotation={[0, a, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]} material={rib}>
                <cylinderGeometry args={[0.018, 0.018, 0.46, 10]} />
              </mesh>
              {[-0.2, 0.2].map((x) => (
                <mesh key={x} position={[x, 0, -0.035]} rotation={[Math.PI / 2, 0, 0]} material={rib}>
                  <cylinderGeometry args={[0.012, 0.012, 0.07, 8]} />
                </mesh>
              ))}
            </group>
          );
        })}

        {/* Cable conduits down both walls, clipped to the shell. */}
        {conduits.map((g, i) => (
          <mesh key={`conduit-${i}`} geometry={g} material={conduit} castShadow />
        ))}

        {/* Fire extinguisher in its bracket, low on the right wall below the systems panel. */}
        <group position={[-Math.sin(-1.22) * 1.78, 4.72, -Math.cos(-1.22) * 1.78]} rotation={[0, -1.22, 0]}>
          <mesh material={extinguisher} castShadow>
            <capsuleGeometry args={[0.07, 0.3, 6, 16]} />
          </mesh>
          <mesh position={[0, 0.27, 0]} material={grip}>
            <cylinderGeometry args={[0.03, 0.04, 0.06, 10]} />
          </mesh>
          <mesh position={[0.04, 0.3, 0]} rotation={[0, 0, -1.1]} material={grip}>
            <boxGeometry args={[0.1, 0.018, 0.03]} />
          </mesh>
          {[-0.08, 0.1].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={rib}>
              <torusGeometry args={[0.074, 0.01, 6, 20]} />
            </mesh>
          ))}
        </group>

        {/* Throttle quadrant on the left armrest, opposite the stick: two levers in a slotted
            housing. On the desk it sat behind the coaming where the camera never reaches. */}
        <group position={[-0.74, 4.37, 0.04]}>
          <mesh material={grip} castShadow>
            <boxGeometry args={[0.13, 0.05, 0.2]} />
          </mesh>
          {[-0.05, 0.05].map((x, i) => (
            <group key={x} position={[x * 0.6, 0.02, i === 0 ? -0.02 : 0.03]} rotation={[i === 0 ? -0.35 : -0.1, 0, 0]}>
              <mesh position={[0, 0.08, 0]} material={rib}>
                <cylinderGeometry args={[0.009, 0.009, 0.16, 8]} />
              </mesh>
              <mesh position={[0, 0.17, 0]} rotation={[0, 0, Math.PI / 2]} material={i === 0 ? extinguisher : grip}>
                <capsuleGeometry args={[0.018, 0.04, 4, 10]} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Side stick at the front of the right armrest. */}
        <group position={[0.74, 4.36, 0.02]}>
          <mesh material={rib}>
            <cylinderGeometry args={[0.03, 0.04, 0.03, 12]} />
          </mesh>
          <mesh position={[0, 0.08, 0]} rotation={[-0.15, 0, 0]} material={grip} castShadow>
            <capsuleGeometry args={[0.024, 0.11, 6, 12]} />
          </mesh>
          <mesh position={[0, 0.15, -0.014]} material={lampWarm}>
            <sphereGeometry args={[0.009, 8, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

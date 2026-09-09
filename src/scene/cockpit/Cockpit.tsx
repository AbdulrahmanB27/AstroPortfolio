import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, DoubleSide, Group, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { PALETTE, STAGE } from '../../lib/constants';
import { STAGE_FRAME } from '../../lib/stageFrame';
import { handles } from '../rig';
import { useApp, isCockpitScene } from '../../state/store';
import { vehicleView } from '../home/rocketState';

/**
 * Rocket cockpit interior. Lives at the rocket's position on the stage (window facing
 * the star) so the forward window shows the real horizon. The cabin is wider than the
 * rocket hull — the exterior is hidden while inside, so nothing ever overlaps.
 *
 * Rocket-local frame: origin at the pad, +Y up, -Z toward the window/star.
 * The main screen sits where the DOM mission-computer panel is overlaid.
 */

const CABIN_R = 1.95;
const FLOOR_Y = 4.05;
const CEIL_Y = 6.55;

export function Cockpit() {
  const groupRef = useRef<Group>(null);
  const anchorRef = useRef<Group>(null);
  const screenLightRef = useRef<PointLight>(null);
  const stripLightA = useRef<PointLight>(null);
  const stripLightB = useRef<PointLight>(null);
  const cabinLightRef = useRef<PointLight>(null);
  const sideLightA = useRef<PointLight>(null);
  const sideLightB = useRef<PointLight>(null);
  const scene = useApp((s) => s.scene);
  const inCockpitScene = isCockpitScene(scene);

  // Only once the camera is actually through the hatch. During the approach the cabin is
  // hidden so the rocket it lives inside can be seen; see `vehicleView`.
  useFrame(() => {
    const group = anchorRef.current;
    if (group) group.visible = inCockpitScene && vehicleView.interior;
  });

  const mats = useMemo(() => {
    const shell = new MeshStandardMaterial({ color: PALETTE.cockpitGraphite, roughness: 0.82, metalness: 0.25, side: BackSide });
    const panel = new MeshStandardMaterial({ color: PALETTE.cockpitPanel, roughness: 0.7, metalness: 0.3 });
    const rib = new MeshStandardMaterial({ color: '#2a3038', roughness: 0.6, metalness: 0.5 });
    const floor = new MeshStandardMaterial({ color: '#191d24', roughness: 0.9, metalness: 0.1 });
    const seat = new MeshStandardMaterial({ color: '#23272e', roughness: 0.85, metalness: 0.05 });
    const strip = new MeshBasicMaterial({ color: PALETTE.starGlow, toneMapped: false, transparent: true, opacity: 0 });
    const screen = new MeshBasicMaterial({ color: PALETTE.screenGlow, toneMapped: false, transparent: true, opacity: 0 });
    const sideScreen = new MeshBasicMaterial({ color: new Color(PALETTE.screenGlow).multiplyScalar(1.25), toneMapped: false, transparent: true, opacity: 0 });
    const glass = new MeshStandardMaterial({ color: '#0b1220', roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.18, side: DoubleSide });
    return { shell, panel, rib, floor, seat, strip, screen, sideScreen, glass };
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
        mats.screen.color.setRGB(0.62 + k * 0.85, 0.78 + k * 0.95, 1.0 + k * 1.1);
        mats.screen.opacity = Math.pow(k, 1.6) * 0.95;
        // The side displays are the only cockpit screens the viewer actually sees — the main
        // one is behind the content panel — and at 42% they sat under the bloom threshold and
        // spilled nothing, so the cabin had no interior light source at all.
        mats.sideScreen.opacity = Math.pow(k, 2) * 0.92;
        if (screenLightRef.current) screenLightRef.current.intensity = k * 12;
        if (sideLightA.current) sideLightA.current.intensity = k * 3.2;
        if (sideLightB.current) sideLightB.current.intensity = k * 3.2;
        if (stripLightA.current) stripLightA.current.intensity = k * 6.0;
        if (stripLightB.current) stripLightB.current.intensity = k * 6.0;
        if (cabinLightRef.current) cabinLightRef.current.intensity = k * 3.4;
      },
    };
    handles.cockpit.setPower(0);
    return () => {
      delete handles.cockpit;
    };
  }, [mats]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const { shell, panel, rib, floor, seat, strip, screen, sideScreen, glass } = mats;
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
        {ribAngles.map((a, i) => (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0, (FLOOR_Y + CEIL_Y) / 2, -CABIN_R + 0.05]} material={rib}>
              <boxGeometry args={[0.12, CEIL_Y - FLOOR_Y, 0.1]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, CEIL_Y - 0.02, 0]} material={rib} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[CABIN_R - 0.16, CABIN_R - 0.04, 48]} />
        </mesh>
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
        {/* Floor grille lines */}
        {[-1.2, -0.6, 0, 0.6, 1.2].map((x) => (
          <mesh key={x} position={[x, FLOOR_Y + 0.01, 0.2]} material={rib} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.03, 2.6]} />
          </mesh>
        ))}
        {/* Console: curved desk with the main screen and two side displays */}
        <mesh position={[0, 4.62, -1.05]} material={panel} rotation={[-0.35, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.12, 0.9]} />
        </mesh>
        <mesh position={[0, 4.42, -0.72]} material={rib}>
          <boxGeometry args={[2.4, 0.5, 0.1]} />
        </mesh>
        {/* Main screen bezel + emissive surface (the DOM panel overlays this region). */}
        {/* Kept below the window line: enlarged to frame the DOM panel, this bezel grew
            tall enough to occlude the forward window and the star beyond it. The panel is
            opaque and covers the screen anyway, so the screen only has to light the room. */}
        <group position={[0, 4.72, -1.46]} rotation={[-0.14, 0, 0]}>
          <mesh material={rib} position={[0, 0, -0.04]}>
            <boxGeometry args={[2.16, 1.02, 0.07]} />
          </mesh>
          <mesh material={screen} position={[0, 0, 0.006]}>
            <planeGeometry args={[2.02, 0.9]} />
          </mesh>
          <pointLight ref={screenLightRef} color={PALETTE.screenGlow} intensity={0} distance={5} decay={2} position={[0, 0, 0.5]} />
        </group>
        <group position={[-1.18, 4.9, -1.28]} rotation={[-0.15, 0.55, 0]}>
          <mesh material={rib} position={[0, 0, -0.03]}>
            <boxGeometry args={[0.62, 0.42, 0.06]} />
          </mesh>
          {/* Held 6mm proud of the bezel. The bezel is 0.06 deep at z=-0.03, so its front
              face is exactly z=0: coplanar with this quad, which the depth buffer resolves
              as a dithered stipple with a hard diagonal edge across the brightest surface
              in the room. Any non-zero separation fixes it; this one is invisible. */}
          <mesh material={sideScreen} position={[0, 0, 0.006]}>
            <planeGeometry args={[0.54, 0.34]} />
          </mesh>
          {/* So the screen washes the console lip and the nearest rib rather than sitting
              on the wall as a backlit sticker. */}
          <pointLight ref={sideLightA} color={PALETTE.screenGlow} intensity={0} distance={2.6} decay={2} position={[0, 0, 0.35]} />
        </group>
        <group position={[1.18, 4.9, -1.28]} rotation={[-0.15, -0.55, 0]}>
          <mesh material={rib} position={[0, 0, -0.03]}>
            <boxGeometry args={[0.62, 0.42, 0.06]} />
          </mesh>
          <mesh material={sideScreen} position={[0, 0, 0.006]}>
            <planeGeometry args={[0.54, 0.34]} />
          </mesh>
          <pointLight ref={sideLightB} color={PALETTE.screenGlow} intensity={0} distance={2.6} decay={2} position={[0, 0, 0.35]} />
        </group>
        {/* Practical amber strips along the side ribs */}
        <mesh position={[-CABIN_R + 0.12, 5.55, -0.4]} material={strip} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.03, 1.4, 0.05]} />
        </mesh>
        <mesh position={[CABIN_R - 0.12, 5.55, -0.4]} material={strip} rotation={[0, -0.3, 0]}>
          <boxGeometry args={[0.03, 1.4, 0.05]} />
        </mesh>
        <pointLight ref={stripLightA} color={PALETTE.starGlow} intensity={0} distance={5} decay={2} position={[-CABIN_R + 0.4, 5.5, -0.4]} />
        <pointLight ref={stripLightB} color={PALETTE.starGlow} intensity={0} distance={5} decay={2} position={[CABIN_R - 0.4, 5.5, -0.4]} />
        <pointLight ref={cabinLightRef} color="#8fa6c8" intensity={0} distance={7} decay={2} position={[0, CEIL_Y - 0.4, 0.2]} />
        {/* Seat (camera sits in it): armrests and seat edge frame the bottom of the view. */}
        <mesh position={[-0.58, 4.72, 0.95]} material={seat} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.8]} />
        </mesh>
        <mesh position={[0.58, 4.72, 0.95]} material={seat} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.8]} />
        </mesh>
        <mesh position={[0, 4.35, 1.05]} material={seat}>
          <boxGeometry args={[1.1, 0.3, 0.9]} />
        </mesh>
        <mesh position={[0, 5.1, 1.55]} material={seat}>
          <boxGeometry args={[1.0, 1.6, 0.25]} />
        </mesh>
      </group>
    </group>
  );
}

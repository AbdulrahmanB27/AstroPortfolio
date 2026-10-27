import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { CameraRig } from './CameraRig';
import { Lights } from './environment/Lights';
import { Star } from './environment/Star';
import { Starfield } from './environment/Starfield';
import { HomePlanet } from './home/HomePlanet';
import { SurfaceStage } from './home/SurfaceStage';
import { Cockpit } from './cockpit/Cockpit';
import { SolarSystem } from './system/SolarSystem';
import { Probe } from './project/Probe';
import { Tether } from './home/Tether';
import { LabelBridge } from '../ui/PlanetLabels';
import { FlightMode } from './flight/FlightMode';
import { DevHelpers } from '../dev/DevHelpers';
import { PostFX } from './effects/PostFX';
import { Exposure } from './effects/Exposure';
import { Precompile } from './effects/Precompile';
import { useApp } from '../state/store';
import { returnHomeFromOrbit } from '../sequences/system';
import { installLowPolyCatalogue } from './lowPolyCatalogue';

/** Root of the single continuous scene graph. */
export function Scene({ onFirstFrame }: { onFirstFrame: () => void }) {
  installLowPolyCatalogue();
  const quality = useApp((s) => s.quality);
  const fired = useRef(false);

  useFrame(() => {
    if (!fired.current) {
      fired.current = true;
      onFirstFrame();
    }
  });

  return (
    <>
      <color attach="background" args={['#05070d']} />
      <CameraRig />
      <Lights />
      <Starfield count={quality.starCount} />
      <Star onSelect={() => returnHomeFromOrbit()} />
      <HomePlanet />
      <SurfaceStage />
      <Cockpit />
      <SolarSystem />
      <Probe />
      <Tether />
      <LabelBridge />
      <Exposure />
      <Precompile />
      <FlightMode />
      <DevHelpers />
      <PostFX />
    </>
  );
}

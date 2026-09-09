import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useState } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { Scene } from '../scene/Scene';
import { useApp } from '../state/store';
import { Loader } from '../ui/Loader';
import { HomeMenu } from '../ui/HomeMenu';
import { IntroOverlay } from '../ui/IntroOverlay';
import { MissionComputer } from '../ui/MissionComputer';
import { PlanetLabels } from '../ui/PlanetLabels';
import { SystemHud } from '../ui/SystemHud';
import { ProjectPanel } from '../ui/ProjectPanel';
import { FlightHud } from '../ui/FlightHud';
import { DevOverlay } from '../dev/DevOverlay';
import { AudioToggle } from '../ui/AudioToggle';
import { boot } from '../sequences/boot';
import { installRouter } from './router';
import { installDevModeHotkey } from '../lib/devMode';

/** Read once at module load: the Canvas `gl` options are not reactive. */
const DEV_QUERY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === 'true';

export function App() {
  const quality = useApp((s) => s.quality);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const uninstallRouter = installRouter();
    const uninstallDev = installDevModeHotkey();
    return () => {
      uninstallRouter();
      uninstallDev();
    };
  }, []);

  const onFirstFrame = useCallback(() => {
    // Give fonts a beat so the first visible frame includes the lockup typography.
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    const start = () => {
      setReady(true);
      boot();
    };
    if (fonts?.ready) fonts.ready.then(start, start);
    else start();
  }, []);

  return (
    <>
      <Canvas
        className="canvas-root"
        shadows={quality.shadows ? { type: PCFShadowMap } : false}
        dpr={quality.dpr}
        gl={{
          antialias: quality.antialias,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          stencil: false,
          // Only in developer mode: lets automated checks read the rendered frame back
          // and assert the scene actually drew something. It costs memory bandwidth, so
          // visitors never pay for it.
          preserveDrawingBuffer: DEV_QUERY,
        }}
        camera={{ fov: 42, near: 0.2, far: 20000, position: [0, 400, 1400] }}
        frameloop="always"
      >
        <Scene onFirstFrame={onFirstFrame} />
      </Canvas>
      <div id="blackout" className="blackout" aria-hidden="true" />
      <div className="overlay-root">
        <PlanetLabels />
        <HomeMenu />
        <MissionComputer />
        <SystemHud />
        <ProjectPanel />
        <FlightHud />
        <AudioToggle />
        <IntroOverlay />
        <DevOverlay />
      </div>
      <Loader ready={ready} />
    </>
  );
}

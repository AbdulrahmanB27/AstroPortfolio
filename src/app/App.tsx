import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useState } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { Scene } from '../scene/Scene';
import { useApp } from '../state/store';
import { Loader } from '../ui/Loader';
import { HomeMenu } from '../ui/HomeMenu';
import { IntroOverlay } from '../ui/IntroOverlay';
import { PlanetLabels } from '../ui/PlanetLabels';
import { SystemHud } from '../ui/SystemHud';
import { ProjectPanel } from '../ui/ProjectPanel';
import { FlightHud } from '../ui/FlightHud';
import { DevOverlay } from '../dev/DevOverlay';
import { AudioToggle } from '../ui/AudioToggle';
import { CockpitFullscreen } from '../ui/CockpitFullscreen';
import { CockpitHud } from '../ui/CockpitHud';
import { boot } from '../sequences/boot';
import { installRouter } from './router';
import { installDevModeHotkey } from '../lib/devMode';
import { returnToOrbit } from '../sequences/system';
import { hasWebGL, redirectToLite } from '../lib/webgl';

/** Read once at module load: the Canvas `gl` options are not reactive. */
const DEV_QUERY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === 'true';

/**
 * Checked once, before the Canvas is asked for a context. Without this the site mounted a
 * renderer that could never draw and the visitor sat looking at a black rectangle.
 */
const CAN_RENDER = hasWebGL();

/** Surfaces that can sit over the whole canvas: the cockpit reader, and a full-screen project. */
const COVERING = ['.cockpit-full', '.project-panel[data-full="true"]'];

function canvasCovered(): boolean {
  const area = window.innerWidth * window.innerHeight;
  return COVERING.some((selector) => {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    if (!r) return false;
    const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 && (w * h) / area > 0.97;
  });
}

/**
 * Whether the 3D frame can stop redrawing: a page is open over the whole canvas and has
 * settled.
 *
 * The cockpit reader covers the viewport with a dark, blurred backdrop, and so does a project
 * opened full screen on a phone. Behind either the camera is held still, so every frame drawn
 * while someone reads was the same frame — and a canvas redrawing under a `backdrop-filter`
 * makes the browser re-blur the viewport every frame as well. On a phone that is battery and
 * heat spent on nothing, during the longest time anyone spends on the site.
 *
 * Measured rather than assumed: on a desktop the full-screen project leaves the system visible
 * either side, with its planets moving, so there the loop keeps running. The wait lets the
 * reading dim and the page's own entrance finish before the last frame is kept; leaving starts
 * the loop again at once.
 */
function useRenderPaused(): boolean {
  const reading = useApp((s) => !s.busy && ((s.scene === 'cockpit' && s.cockpitView === 'full') || (s.scene === 'project' && s.projectFull)));
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    setCovered(false);
    if (!reading) return;
    /*
     * Checked again every second rather than once. On a deep link the reader is open from the
     * first frame, while the loader still holds the overlay back, so a single look found
     * nothing covering the canvas and the loop never stopped. Polling also follows a phone
     * turning to landscape, which can uncover the canvas.
     */
    let interval = 0;
    const check = () => setCovered(canvasCovered());
    const id = window.setTimeout(() => {
      check();
      interval = window.setInterval(check, 1000);
    }, 1500);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(interval);
    };
  }, [reading]);
  return reading && covered;
}

export function App() {
  const quality = useApp((s) => s.quality);
  const [ready, setReady] = useState(false);
  const paused = useRenderPaused();

  useEffect(() => {
    if (!CAN_RENDER) redirectToLite();
  }, []);

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
        frameloop={paused ? 'demand' : 'always'}
        // A click on empty space while a project is open steps back out: from the full-screen
        // write-up to the side panel, and from the panel to the orbit. Planets stop the event
        // themselves, and the panel is DOM above the canvas, so neither lands here.
        onPointerMissed={() => {
          const s = useApp.getState();
          if (s.scene !== 'project' || s.busy) return;
          if (s.projectFull) s.setProjectFull(false);
          else returnToOrbit();
        }}
      >
        <Scene onFirstFrame={onFirstFrame} />
      </Canvas>
      <div id="blackout" className="blackout" aria-hidden="true" />
      <div className="overlay-root">
        <PlanetLabels />
        <HomeMenu />
        <SystemHud />
        <ProjectPanel />
        <FlightHud />
        <CockpitFullscreen />
        <CockpitHud />
        <AudioToggle />
        <IntroOverlay />
        <DevOverlay />
      </div>
      <Loader ready={ready} />
    </>
  );
}

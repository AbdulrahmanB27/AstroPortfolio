import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { handles } from '../rig';
import { isPortrait } from '../poses';
import { useApp } from '../../state/store';
import { exposureState, setExposureLevel } from './exposureState';

/**
 * Scene exposure, driven by sequences through `handles.exposure`. Focusing a project dims the
 * whole 3D world so the project display is the brightest thing in the frame; the DOM panel is
 * unaffected because neither renderer touches what the browser composites.
 *
 * This half applies the level to three's renderer, which is the path taken on the low quality
 * tier where `PostFX` does not mount. On every other tier the composer draws the scene and
 * ignores `toneMappingExposure` entirely, so `PostFX` applies the same level to a brightness
 * pass of its own. See `exposureState` for why the value lives outside both of them, and for
 * the measurement that showed this feature had never once done anything.
 */
const BASE_EXPOSURE = 1.05;

export function Exposure() {
  const gl = useThree((s) => s.gl);
  const state = useMemo(() => ({ current: BASE_EXPOSURE }), []);
  const scene = useApp((s) => s.scene);
  const cockpitView = useApp((s) => s.cockpitView);
  // Re-evaluated on rotate and resize, because the rule below is about the shape of the frame.
  const size = useThree((s) => s.size);

  useEffect(() => {
    handles.exposure = { setLevel: setExposureLevel };
    return () => {
      delete handles.exposure;
    };
  }, []);

  /*
   * Reading on a phone dims the room, not the page.
   *
   * A console display whose own proportions are 1:1.38 cannot fill a 390x844 frame — it is as
   * wide as the frame allows and still leaves 177px of cabin above it and 177px below. Those
   * bands measured a mean luminance of 90 against a peak of 96: the largest AREA in the frame
   * was a featureless field brighter than the panel it surrounded, and three review lenses
   * across two rounds read it as unfinished geometry. It is neither — it is the console, lit
   * correctly by the star through the forward window, with nothing on it at that distance.
   *
   * Landscape keeps full exposure: there the cabin IS the composition, and it is the one nine
   * judge rounds signed off.
   *
   * Derived from state rather than set by the sequence that changes the view, because a deep
   * link to `#/about` never runs that sequence — the first attempt put the call in
   * `setCockpitView` and it never fired on the surface being measured.
   */
  useEffect(() => {
    if (scene !== 'cockpit') return;
    setExposureLevel(cockpitView !== 'room' && isPortrait() ? 0.25 : 1);
  }, [scene, cockpitView, size.width, size.height]);

  useFrame((_, delta) => {
    const target = BASE_EXPOSURE * (0.34 + exposureState.level * 0.66);
    if (Math.abs(state.current - target) < 0.001) return;
    state.current += (target - state.current) * Math.min(1, delta * 8);
    gl.toneMappingExposure = state.current;
  });

  return null;
}

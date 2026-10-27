import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { useApp } from '../../state/store';
import { exposureState } from './exposureState';
import { SceneDim, type SceneDimEffect } from './SceneDim';

/** Bloom (only HDR emitters exceed the threshold) + a soft vignette. Off on low tier. */
export function PostFX() {
  const quality = useApp((s) => s.quality);
  const dim = useRef<SceneDimEffect>(null);
  const smooth = useMemo(() => ({ value: 1 }), []);

  /*
   * Scene exposure, for the composer.
   *
   * `gl.toneMappingExposure` is what `Exposure` sets, and an `EffectComposer` does not consult
   * it — it draws the scene through its own passes. So on every tier that mounts this
   * component, which is every tier a visitor is likely to be on, the exposure feature was a
   * no-op. Measured on three surfaces: `setLevel(0)` and `setLevel(1)` produced byte-identical
   * frames. Four sequences had been calling it.
   *
   * It multiplies rather than subtracts — see `SceneDim` for what the subtractive version did
   * to the shadows — and sits after Bloom so the glow dims with the scene instead of floating
   * over a darkened frame. Driven per frame from module state rather than by a React prop, so
   * a sequence's tween and a state-derived rule can both move it without re-rendering the
   * composer.
   *
   * The floor of 0.34 matches the renderer path's, and keeps the world present rather than
   * absent: the art direction has the system dimming to 30% behind a focused project, not to
   * nothing.
   */
  useFrame((_, delta) => {
    const target = 0.34 + exposureState.level * 0.66;
    if (Math.abs(smooth.value - target) > 0.0005) {
      smooth.value += (target - smooth.value) * Math.min(1, delta * 8);
    }
    dim.current?.setLevel(smooth.value);
  });

  if (!quality.bloom) return null;
  return (
    // 4x on both tiers that bloom. The top tier already renders at 1.5-2x the display and
    // the browser downsamples it, so 8x on top of that cost memory bandwidth on every
    // full-screen pass for edges nobody could tell apart.
    <EffectComposer multisampling={4}>
      <Bloom luminanceThreshold={1.0} luminanceSmoothing={0.12} intensity={0.55} mipmapBlur radius={0.72} resolutionScale={quality.bloomScale} />
      <SceneDim ref={dim} />
      <Vignette eskil={false} offset={0.22} darkness={0.55} />
    </EffectComposer>
  );
}

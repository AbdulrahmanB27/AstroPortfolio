import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useApp } from '../../state/store';

/** Bloom (only HDR emitters exceed the threshold) + a soft vignette. Off on low tier. */
export function PostFX() {
  const quality = useApp((s) => s.quality);
  if (!quality.bloom) return null;
  return (
    <EffectComposer multisampling={quality.tier === 'high' ? 8 : quality.tier === 'medium' ? 4 : 0}>
      <Bloom luminanceThreshold={1.0} luminanceSmoothing={0.12} intensity={0.55} mipmapBlur radius={0.72} resolutionScale={quality.bloomScale} />
      <Vignette eskil={false} offset={0.22} darkness={0.55} />
    </EffectComposer>
  );
}

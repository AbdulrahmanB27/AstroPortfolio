import { Effect } from 'postprocessing';
import { Uniform } from 'three';
import { wrapEffect } from '@react-three/postprocessing';

/**
 * A multiplicative dim for the composed frame.
 *
 * The first attempt at giving `handles.exposure` a real implementation used
 * `BrightnessContrast`, whose brightness is **additive** — it subtracts a constant from every
 * channel. That is not what an exposure control does, and the difference is not subtle: an
 * independent review measured 41.5% of the focused-project frame at exactly `#000000` with the
 * starfield gone entirely, the orbital probe reduced to two stray blue pixels, and the cool
 * accent pushed from 56% to 69% saturation. Subtracting a constant clips everything dimmer
 * than the constant to black and leaves everything brighter only slightly changed, which
 * crushes shadows and raises saturation. The art direction says the canvas is `--space-900`
 * and "never pure black".
 *
 * Multiplying scales the whole range instead, which is what the renderer's
 * `toneMappingExposure` does on the tier that has no composer — so both paths now agree, and
 * a faint star at 4% stays a faint star at 3% rather than becoming nothing.
 *
 * The uniform is driven per frame from `exposureState`; see `PostFX`.
 */
const fragment = /* glsl */ `
  uniform float level;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor = vec4(inputColor.rgb * level, inputColor.a);
  }
`;

export class SceneDimEffect extends Effect {
  constructor() {
    super('SceneDim', fragment, { uniforms: new Map([['level', new Uniform(1)]]) });
  }

  setLevel(level: number): void {
    const u = this.uniforms.get('level');
    if (u) u.value = level;
  }
}

export const SceneDim = wrapEffect(SceneDimEffect);

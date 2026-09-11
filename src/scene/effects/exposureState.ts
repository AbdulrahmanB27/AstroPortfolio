/**
 * Scene exposure, as module state read per frame.
 *
 * There are two renderers in play. On the low quality tier the scene is drawn straight by
 * three's renderer, where `gl.toneMappingExposure` is the exposure control. On every other
 * tier `PostFX` mounts an `EffectComposer`, which draws through its own passes and does not
 * consult `toneMappingExposure` at all — so the one line that used to implement this feature
 * was a no-op wherever bloom was on, which is to say everywhere a visitor would see it.
 *
 * That was measured, not inferred: `setLevel(0)` and `setLevel(1)` produced byte-identical
 * frames on the cockpit, the project view and the solar system. Four sequences had been
 * calling it since it was written.
 *
 * So the level lives here, and each renderer reads it: `Exposure` applies it to the renderer,
 * `PostFX` applies it to a brightness pass inside the composer. Module state rather than
 * React state because both consumers read it inside a frame loop, and because a sequence can
 * set it before either component has mounted.
 */
export const exposureState = {
  /** 0 = fully dimmed behind a focused project or a phone reading surface, 1 = normal. */
  level: 1,
};

export function setExposureLevel(level: number): void {
  exposureState.level = Math.max(0, Math.min(1, level));
}

/**
 * Whether frames are arriving too slowly to keep the current quality tier.
 *
 * The tier is guessed at load from the user agent, core count and memory, and the guess is
 * worst exactly where it matters: a desktop with eight cores and a weak integrated GPU is
 * "high" by every number the browser exposes. This watches what actually happens instead.
 *
 * It judges windows of frames by their median, so the hitch of a shader compiling on first
 * sight of the cockpit, or a garbage collection, does not count against the device, and it
 * needs consecutive slow windows before it says so. The threshold sits just under 30fps rather
 * than under 60: a phone in low-power mode runs everything at 30 and is not struggling.
 */
export interface FrameBudget {
  /** Feed one frame's duration; true when the tier should step down. */
  push(frameMs: number): boolean;
  reset(): void;
}

export function createFrameBudget({ windowSize = 90, slowMs = 35, strikes = 2 } = {}): FrameBudget {
  let samples: number[] = [];
  let slow = 0;
  return {
    push(frameMs) {
      // A frame this long is a tab coming back from the background or a debugger pause,
      // not a measure of the scene.
      if (!(frameMs > 0) || frameMs > 250) return false;
      samples.push(frameMs);
      if (samples.length < windowSize) return false;
      const sorted = samples.sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1]!;
      samples = [];
      slow = median > slowMs ? slow + 1 : 0;
      if (slow < strikes) return false;
      slow = 0;
      return true;
    },
    reset() {
      samples = [];
      slow = 0;
    },
  };
}

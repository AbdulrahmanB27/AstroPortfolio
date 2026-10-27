export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityProfile {
  tier: QualityTier;
  dpr: [number, number];
  bloom: boolean;
  bloomScale: number;
  shadows: boolean;
  shadowMapSize: number;
  starCount: number;
  rockCount: number;
  /**
   * The canvas's own multisampling. Only the tier without bloom wants it: with bloom on, the
   * scene is drawn into the effect composer's multisampled target and the canvas only ever
   * receives one full-screen triangle, so a multisampled canvas was memory spent on nothing —
   * at 2x on a 1440p display, a lot of it.
   */
  antialias: boolean;
}

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Cheap heuristic; the dev overlay can override it at runtime. */
export function detectQuality(): QualityProfile {
  const mobile = isMobileUA() || (typeof window !== 'undefined' && window.innerWidth < 820);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  const memory = (typeof navigator !== 'undefined' && (navigator as { deviceMemory?: number }).deviceMemory) || 8;
  let tier: QualityTier = 'high';
  if (mobile) tier = cores >= 6 && memory >= 4 ? 'medium' : 'low';
  else if (cores <= 4 || memory <= 4) tier = 'medium';
  return profileFor(tier);
}

export function profileFor(tier: QualityTier): QualityProfile {
  switch (tier) {
    case 'high':
      return {
        tier,
        // Floor above 1: on a 1x display R3F clamps devicePixelRatio into this range and
        // lands on 1, so every silhouette in the scene came out with a one-pixel hard edge
        // even with MSAA requested. Rendering at 1.5x and letting the browser downsample
        // supersamples the whole frame, which is what actually removes the staircases.
        dpr: [1.5, 2],
        bloom: true,
        bloomScale: 1,
        shadows: true,
        shadowMapSize: 2048,
        starCount: 4200,
        rockCount: 90,
        antialias: false,
      };
    case 'medium':
      return {
        tier,
        dpr: [1.25, 1.5],
        bloom: true,
        bloomScale: 0.5,
        shadows: true,
        shadowMapSize: 1024,
        starCount: 2600,
        rockCount: 60,
        antialias: false,
      };
    case 'low':
      return {
        tier,
        dpr: [1, 1],
        bloom: false,
        bloomScale: 0.5,
        shadows: false,
        shadowMapSize: 512,
        starCount: 1600,
        rockCount: 40,
        // Nothing else smooths an edge on this tier, and on the tile-based GPUs phones use,
        // 4x MSAA is close to free.
        antialias: true,
      };
  }
}

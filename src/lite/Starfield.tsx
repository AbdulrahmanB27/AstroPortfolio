import { useMemo } from 'react';

/**
 * The space in the simple view: a fixed backdrop of the star's glow plus a scatter of
 * stars, drawn as one inline SVG.
 *
 * No canvas and no animation loop — this page exists to be fast and to work where the 3D
 * site cannot, so the background is a single static element the browser can composite once.
 * The seed is fixed so the sky is the same on every visit rather than reshuffling on reload.
 */
const STAR_COUNT = 90;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Starfield() {
  const stars = useMemo(() => {
    const rand = mulberry32(0xab27);
    return Array.from({ length: STAR_COUNT }, () => ({
      x: +(rand() * 100).toFixed(2),
      y: +(rand() * 100).toFixed(2),
      // Most stars are faint; a handful carry the eye.
      r: +(0.4 + rand() * rand() * 1.5).toFixed(2),
      o: +(0.18 + rand() * 0.55).toFixed(2),
    }));
  }, []);

  return (
    <div className="lite__sky" aria-hidden="true">
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          {/*
            Warm at the core, not white.

            Leading with `--star-core` (#fff6dc, the star's hot centre) at 30% over the page
            ground averaged out to #4E4B46 — a reviewer measured the wash at 10% saturation
            against the 3D site's sky at 74%, and read it as a grey smudge where the other
            version has a sunrise. What carries the warmth on the 3D frame is the corona, so
            that is what this leads with; a small `--star-core` hint at the very centre keeps
            it from reading as a flat amber disc.
          */}
          <radialGradient id="lite-star" cx="50%" cy="0%" r="62%">
            <stop offset="0%" stopColor="var(--star-core)" stopOpacity="0.16" />
            <stop offset="12%" stopColor="var(--star-glow)" stopOpacity="0.30" />
            <stop offset="40%" stopColor="var(--star-glow)" stopOpacity="0.19" />
            <stop offset="72%" stopColor="var(--star-edge)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--star-edge)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#lite-star)" />
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.09} fill="#eef2f8" opacity={s.o} />
        ))}
      </svg>
    </div>
  );
}

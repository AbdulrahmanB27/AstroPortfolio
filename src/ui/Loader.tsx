import { useEffect, useState } from 'react';
import { portfolio } from '../data/loadPortfolio';

/** Designed loading veil: name, a small star, a thin progress line. Never a fake boot. */
export function Loader({ ready }: { ready: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [progress, setProgress] = useState(0.15);

  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - started) / 1200;
      setProgress((p) => Math.max(p, Math.min(0.9, t)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setProgress(1);
    const minShow = 700;
    const id = window.setTimeout(() => setHidden(true), minShow);
    return () => window.clearTimeout(id);
  }, [ready]);

  return (
    <div className="loader" data-hidden={hidden} aria-hidden={hidden} role="status" aria-live="polite">
      <div className="loader__inner">
        <div className="loader__star" />
        <div className="loader__name">{portfolio.data.profile.name}</div>
        <div className="loader__bar">
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}

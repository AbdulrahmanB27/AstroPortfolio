import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { createFrameBudget } from '../../lib/frameBudget';
import { useApp } from '../../state/store';

/** Seconds to ignore after load or a tier change: shaders compile, render targets resize. */
const SETTLE_S = 3;

/**
 * Steps the quality tier down, one tier at a time, when the device cannot hold ~30fps.
 *
 * Never back up: a tier that flips between two settings every few seconds is worse to look
 * at than either. A tier picked by hand in the developer overlay switches this off.
 */
export function AdaptiveQuality() {
  const budget = useMemo(() => createFrameBudget(), []);
  const settle = useRef(SETTLE_S);
  const tier = useApp((s) => s.quality.tier);

  useEffect(() => {
    budget.reset();
    settle.current = SETTLE_S;
  }, [tier, budget]);

  useFrame((_, delta) => {
    const app = useApp.getState();
    if (!app.qualityAuto || app.quality.tier === 'low' || app.scene === 'loading') return;
    if (settle.current > 0) {
      settle.current -= delta;
      return;
    }
    if (budget.push(delta * 1000)) app.degradeQuality();
  });

  return null;
}

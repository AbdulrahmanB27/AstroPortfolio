import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { handles } from '../rig';

/**
 * Scene exposure, driven by sequences through `handles.exposure`. Focusing a project dims
 * the whole 3D world so the project display is the brightest thing in the frame; the DOM
 * panel is unaffected because tone mapping only touches what the renderer draws.
 */
const BASE_EXPOSURE = 1.05;

export function Exposure() {
  const gl = useThree((s) => s.gl);
  const state = useMemo(() => ({ target: BASE_EXPOSURE, current: BASE_EXPOSURE }), []);

  useEffect(() => {
    handles.exposure = {
      /** 0 = fully dimmed for a focused project, 1 = the normal world. */
      setLevel: (level: number) => {
        const k = Math.max(0, Math.min(1, level));
        state.target = BASE_EXPOSURE * (0.34 + k * 0.66);
      },
    };
    return () => {
      delete handles.exposure;
    };
  }, [state]);

  useFrame((_, delta) => {
    if (Math.abs(state.current - state.target) < 0.001) return;
    state.current += (state.target - state.current) * Math.min(1, delta * 8);
    gl.toneMappingExposure = state.current;
  });

  return null;
}

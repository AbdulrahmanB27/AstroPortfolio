import { create } from 'zustand';

/**
 * Session-only toggles for the in-canvas debug helpers. They live outside the app store
 * on purpose: nothing here is persisted, nothing here can leak into a visitor session.
 */
export interface DevToggles {
  showHitAreas: boolean;
  showNames: boolean;
  showOrbitValues: boolean;
}

interface DevStore extends DevToggles {
  set: (patch: Partial<DevToggles>) => void;
  reset: () => void;
}

const defaults: DevToggles = { showHitAreas: false, showNames: false, showOrbitValues: false };

export const useDevStore = create<DevStore>()((set) => ({
  ...defaults,
  set: (patch) => set(patch),
  reset: () => set({ ...defaults }),
}));

import { create } from 'zustand'

export const STAGE = {
  PROLOGUE: 'prologue',
  SURFACE: 'surface',
  LIFTOFF: 'liftoff',
  ORBIT: 'orbit',
  STAR_CORE: 'star_core',
  PLANET: 'planet',
  COCKPIT: 'cockpit',
}

export const VISUAL_MODE = {
  DEEP_SPACE: 'deep_space',
  SCHEMATIC: 'schematic',
}

export const VIEW_MODE = {
  THREED: '3d',
  SIMPLIFIED: 'simplified',
}

const useStore = create((set) => ({
  // ── Stage ──────────────────────────────────────────────────────────────────
  stage: STAGE.SURFACE,
  setStage: (stage) => set({ stage }),

  // ── Opening Sequence ───────────────────────────────────────────────────────
  openingSequenceComplete: false,
  setOpeningSequenceComplete: (v) => set({ openingSequenceComplete: v }),

  // ── Active content ─────────────────────────────────────────────────────────
  activePlanetId: null,
  setActivePlanetId: (id) => set({ activePlanetId: id }),

  activeStarSection: 'about',
  setActiveStarSection: (section) => set({ activeStarSection: section }),

  // ── Pending nav target — set on surface, consumed once orbit is reached ─────
  pendingNavTarget: null,
  setPendingNavTarget: (target) => set({ pendingNavTarget: target }),

  // ── Hover state for menu items to trigger 3D reactions ─────────────────────
  hoveredMenuItem: false,
  setHoveredMenuItem: (v) => set({ hoveredMenuItem: v }),

  // ── Animation lock — prevents clicks during camera transitions ──────────────
  isAnimating: false,
  setIsAnimating: (v) => set({ isAnimating: v }),

  // ── Orbit freeze — pauses planet movement when viewing a planet ─────────────
  orbitsFrozen: false,
  setOrbitsFrozen: (v) => set({ orbitsFrozen: v }),

  // ── Atmosphere flash transition ────────────────────────────────────────────
  atmosphereFlash: false,
  setAtmosphereFlash: (v) => set({ atmosphereFlash: v }),

  // ── Visual mode (3D environment aesthetic) ─────────────────────────────────
  visualMode: VISUAL_MODE.DEEP_SPACE,
  toggleVisualMode: () =>
    set((s) => ({
      visualMode:
        s.visualMode === VISUAL_MODE.DEEP_SPACE
          ? VISUAL_MODE.SCHEMATIC
          : VISUAL_MODE.DEEP_SPACE,
    })),

  // ── View mode (3D Solar System vs 2D Flat HTML) ────────────────────────────
  viewMode: VIEW_MODE.THREED,
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((s) => ({
    viewMode: s.viewMode === VIEW_MODE.THREED ? VIEW_MODE.SIMPLIFIED : VIEW_MODE.THREED,
  })),

  // ── HUD prompt ─────────────────────────────────────────────────────────────
  hudPrompt: '',
  setHudPrompt: (text) => set({ hudPrompt: text }),

  // ── Easter egg flags ───────────────────────────────────────────────────────
  flightModeUnlocked: false,
  setFlightModeUnlocked: (v) => set({ flightModeUnlocked: v }),
  milleniumFalconUnlocked: false,
  setMilleniumFalconUnlocked: (v) => set({ milleniumFalconUnlocked: v }),
  altLaunchTriggered: false,
  setAltLaunchTriggered: (v) => set({ altLaunchTriggered: v }),

  // ── Cockpit exit request — set by the HUD back button, consumed by CockpitScene
  cockpitExitRequested: false,
  setCockpitExitRequested: (v) => set({ cockpitExitRequested: v }),

  // ── Admin panel ────────────────────────────────────────────────────────────
  adminOpen: false,
  setAdminOpen: (v) => set({ adminOpen: v }),
}))

export default useStore


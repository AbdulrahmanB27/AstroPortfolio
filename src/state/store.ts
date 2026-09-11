import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { portfolio } from '../data/loadPortfolio';
import type { Settings } from '../data/schema';
import { STORAGE_KEYS } from '../lib/constants';
import { prefersReducedMotion } from '../lib/motion';
import { detectQuality, profileFor, type QualityProfile, type QualityTier } from '../lib/quality';

export type SceneState =
  | 'loading'
  | 'intro'
  | 'home'
  | 'enteringCockpit'
  | 'cockpit'
  | 'exitingCockpit'
  | 'launching'
  | 'system'
  | 'focusingProject'
  | 'project'
  | 'returningToOrbit'
  | 'returningHome'
  | 'flight';

export type CockpitTab = 'about' | 'skills' | 'resume' | 'contact';

/**
 * Where you are in the cockpit.
 *
 * 'room' is the cabin: four console displays, each carrying its section's name. 'full' is the
 * reader — selecting a display flies the camera into it and the reading surface opens flat
 * over the frame.
 *
 * There used to be a third state between them, which flew square-on to one display and swapped
 * that surface to the full text so the reading happened on the rocket. It was built twice and
 * rejected twice: a raked surface behind a perspective camera is a worse place to read than a
 * page, and no amount of framing changed that. The displays are still physically on the ship
 * and still carry the sections; the reading is flat, and getting there is an animation into it
 * rather than a different kind of zoom.
 */
export type CockpitView = 'room' | 'full';

export interface VisitedInfo {
  intro: boolean;
  cockpitEntries: number;
  launches: number;
}

function readVisited(): VisitedInfo {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.visited);
    if (raw) return { intro: false, cockpitEntries: 0, launches: 0, ...(JSON.parse(raw) as Partial<VisitedInfo>) };
  } catch {
    /* private mode or blocked storage */
  }
  return { intro: false, cockpitEntries: 0, launches: 0 };
}

function writeVisited(v: VisitedInfo): void {
  try {
    localStorage.setItem(STORAGE_KEYS.visited, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function readFalcon(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.falcon) === '1';
  } catch {
    return false;
  }
}

function readAudio(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.audio) === '1';
  } catch {
    return false;
  }
}

function readSettingsOverride(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

export interface AppState {
  scene: SceneState;
  /** True while a gsap sequence owns the camera; UI ignores clicks that would conflict. */
  busy: boolean;
  cockpitTab: CockpitTab;
  /**
   * Where the camera sits inside the cockpit. 'room' frames the whole cabin with the
   * console screen in it; 'full' opens the flat reader over the frame.
   * The content is the same either way — it lives on the console, not in an overlay.
   */
  cockpitView: CockpitView;
  selectedProjectId: string | null;
  hoveredProjectId: string | null;
  visited: VisitedInfo;
  settings: Settings;
  quality: QualityProfile;
  reducedMotion: boolean;
  devMode: boolean;
  audioEnabled: boolean;
  /** Set when the visitor triggers the comedic launch (Shift+click on Projects). */
  comedicLaunch: boolean;
  flightUnlocked: boolean;
  falconUnlocked: boolean;
  /** Ship used in flight mode; 'falcon' becomes available after the Death Star discovery. */
  flightShip: 'rocket' | 'falcon';
  deathStarFound: boolean;
  /** Deep-link the router resolved at boot; sequences consume it once. */
  bootTarget: { scene: 'home' | 'cockpit' | 'system' | 'project'; tab?: CockpitTab; projectId?: string } | null;

  setScene: (scene: SceneState) => void;
  setBusy: (busy: boolean) => void;
  setCockpitTab: (tab: CockpitTab) => void;
  setCockpitView: (view: CockpitView) => void;
  setSelectedProject: (id: string | null) => void;
  setHoveredProject: (id: string | null) => void;
  markIntroSeen: () => void;
  bumpCockpitEntries: () => void;
  bumpLaunches: () => void;
  updateSettings: (patch: Partial<Settings> | ((s: Settings) => Settings)) => void;
  setQualityTier: (tier: QualityTier) => void;
  setDevMode: (on: boolean) => void;
  setAudioEnabled: (on: boolean) => void;
  setComedicLaunch: (on: boolean) => void;
  unlockFlight: () => void;
  unlockFalcon: () => void;
  setFlightShip: (ship: 'rocket' | 'falcon') => void;
  setDeathStarFound: (found: boolean) => void;
  setBootTarget: (target: AppState['bootTarget']) => void;
}

function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  return {
    grid: { ...base.grid, ...(patch.grid ?? {}) },
    intro: { ...base.intro, ...(patch.intro ?? {}) },
    audio: { ...base.audio, ...(patch.audio ?? {}) },
    labels: { ...base.labels, ...(patch.labels ?? {}) },
    motion: { ...base.motion, ...(patch.motion ?? {}) },
  };
}

export const useApp = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    scene: 'loading',
    busy: false,
    cockpitTab: 'about',
    cockpitView: 'room',
    selectedProjectId: null,
    hoveredProjectId: null,
    visited: readVisited(),
    settings: mergeSettings(portfolio.data.settings, readSettingsOverride()),
    quality: detectQuality(),
    reducedMotion: prefersReducedMotion(),
    devMode: false,
    audioEnabled: readAudio(),
    comedicLaunch: false,
    flightUnlocked: false,
    falconUnlocked: readFalcon(),
    flightShip: readFalcon() ? 'falcon' : 'rocket',
    deathStarFound: false,
    bootTarget: null,

    setScene: (scene) => set({ scene }),
    setBusy: (busy) => set({ busy }),
    setCockpitTab: (cockpitTab) => set({ cockpitTab }),
    setCockpitView: (cockpitView) => set({ cockpitView }),
    setSelectedProject: (selectedProjectId) => set({ selectedProjectId }),
    setHoveredProject: (hoveredProjectId) => set({ hoveredProjectId }),
    markIntroSeen: () => {
      const visited = { ...get().visited, intro: true };
      writeVisited(visited);
      set({ visited });
    },
    bumpCockpitEntries: () => {
      const visited = { ...get().visited, cockpitEntries: get().visited.cockpitEntries + 1 };
      writeVisited(visited);
      set({ visited });
    },
    bumpLaunches: () => {
      const visited = { ...get().visited, launches: get().visited.launches + 1 };
      writeVisited(visited);
      set({ visited });
    },
    updateSettings: (patch) => {
      const next = typeof patch === 'function' ? patch(get().settings) : mergeSettings(get().settings, patch);
      try {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      set({ settings: next });
    },
    setQualityTier: (tier) => set({ quality: profileFor(tier) }),
    setDevMode: (devMode) => set({ devMode }),
    setAudioEnabled: (audioEnabled) => {
      try {
        localStorage.setItem(STORAGE_KEYS.audio, audioEnabled ? '1' : '0');
      } catch {
        /* ignore */
      }
      set({ audioEnabled });
    },
    setComedicLaunch: (comedicLaunch) => set({ comedicLaunch }),
    unlockFlight: () => set({ flightUnlocked: true }),
    setFlightShip: (flightShip) => set({ flightShip }),
    setDeathStarFound: (deathStarFound) => set({ deathStarFound }),
    unlockFalcon: () => {
      try {
        localStorage.setItem(STORAGE_KEYS.falcon, '1');
      } catch {
        /* ignore */
      }
      set({ falconUnlocked: true });
    },
    setBootTarget: (bootTarget) => set({ bootTarget }),
  })),
);

export const isCockpitScene = (s: SceneState): boolean =>
  s === 'enteringCockpit' || s === 'cockpit' || s === 'exitingCockpit';

export const isSurfaceScene = (s: SceneState): boolean =>
  s === 'intro' || s === 'home' || s === 'enteringCockpit' || s === 'cockpit' || s === 'exitingCockpit' || s === 'launching' || s === 'returningHome';

export const isSystemScene = (s: SceneState): boolean =>
  s === 'system' || s === 'focusingProject' || s === 'project' || s === 'returningToOrbit' || s === 'flight' || s === 'launching' || s === 'returningHome';

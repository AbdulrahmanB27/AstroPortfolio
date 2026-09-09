import { useApp, type SceneState } from '../state/store';
import {
  createBed,
  createOutputStage,
  measureOffline,
  playCueInto,
  type AmbienceFamily,
  type Bed,
  type CueName,
  type LevelReport,
} from './synth';

/**
 * Optional procedural sound (spec §53–54). Rules that never bend:
 *
 * - No AudioContext exists until the visitor turns sound on. The toggle click creates it;
 *   a persisted "on" preference only arms a one-time listener for the next real gesture.
 * - Everything is a safe no-op when the site setting is off, the visitor has sound off,
 *   the tab is hidden, or WebAudio is unavailable. Nothing here throws.
 * - Cues and ambience follow the scene state machine through store subscriptions, so no
 *   sequence or UI file needs to know audio exists (`docs/AUDIO.md` lists every trigger).
 */

export type AudioCue = CueName;

/** Master fader ramp (seconds) for enable/disable. */
const MASTER_FADE = 0.4;
/** Ambience crossfade (seconds): old bed out / new bed in. */
const BED_OUT = 1.6;
const BED_IN = 2.2;
/** Hover ticks are rate-limited to 12 per second. */
const HOVER_MIN_INTERVAL_MS = 1000 / 12;
/** Liftoff happens 1.3s into the launch sequence; the whoosh follows the ignition rumble. */
const LAUNCH_WHOOSH_DELAY_MS = 1300;

interface Engine {
  context: AudioContext;
  input: GainNode;
  master: GainNode;
  bed: Bed | null;
  family: AmbienceFamily;
  suspendTimer: number | null;
}

type AudioContextCtor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextCtor;
    __astroAudio?: AudioDebug;
  }
}

/** Dev-mode inspection hook (installed only while `window.__astro` exists). */
export interface AudioDebug {
  readonly context: AudioContext | null;
  readonly enabled: boolean;
  readonly ambience: AmbienceFamily;
  readonly masterGain: number;
  /** The last cues that actually played (newest last), with `performance.now()` stamps. */
  readonly log: readonly { cue: AudioCue; at: number }[];
  playCue: typeof playCue;
  setAmbience: typeof setAmbience;
  enableAudio: typeof enableAudio;
  disableAudio: typeof disableAudio;
  toggleAudio: typeof toggleAudio;
  measure: (kind: CueName | AmbienceFamily, seconds?: number) => Promise<LevelReport>;
}

let engine: Engine | null = null;
let currentFamily: AmbienceFamily = 'silence';
let lastHoverAt = -Infinity;
let launchTimer: number | null = null;
const cueLog: { cue: AudioCue; at: number }[] = [];
const CUE_LOG_MAX = 64;

const noop = (): void => {};

function contextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

/** True when this browser can make sound at all. */
export function isAudioSupported(): boolean {
  return contextCtor() !== null;
}

/** Site-level switch (admin) AND the visitor's own preference. */
function wanted(): boolean {
  const s = useApp.getState();
  return s.settings.audio.enabled && s.audioEnabled;
}

/** True when sound is wanted and the context is actually producing output. */
export function isAudioActive(): boolean {
  return !!engine && wanted() && engine.context.state === 'running';
}

export function familyFor(scene: string): AmbienceFamily {
  switch (scene as SceneState) {
    case 'loading':
    case 'intro':
      return 'silence';
    case 'cockpit':
      return 'cockpit';
    default:
      return 'space';
  }
}

// ---------------------------------------------------------------------------
// Engine lifecycle
// ---------------------------------------------------------------------------

function rampMaster(e: Engine, to: number): void {
  const t = e.context.currentTime;
  const g = e.master.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(to, t + MASTER_FADE);
}

function applyAmbience(e: Engine, family: AmbienceFamily): void {
  if (e.family === family) return;
  const t = e.context.currentTime;
  const old = e.bed;
  if (old) {
    old.out.gain.cancelScheduledValues(t);
    old.out.gain.setValueAtTime(old.out.gain.value, t);
    old.out.gain.linearRampToValueAtTime(0, t + BED_OUT);
    old.stop(t + BED_OUT + 0.1);
  }
  const next = createBed(e.context, e.input, family, t);
  if (next) {
    next.out.gain.setValueAtTime(0, t);
    next.out.gain.linearRampToValueAtTime(1, t + BED_IN);
  }
  e.bed = next;
  e.family = family;
}

function createEngine(): Engine | null {
  const Ctor = contextCtor();
  if (!Ctor) return null;
  const context = new Ctor({ latencyHint: 'interactive' });
  const stage = createOutputStage(context, context.destination, 0);
  const e: Engine = { context, input: stage.input, master: stage.master, bed: null, family: 'silence', suspendTimer: null };
  context.addEventListener('statechange', () => {
    if (context.state === 'running') disarm();
  });
  return e;
}

/**
 * Creates or resumes the engine and fades the master in. Meant to run inside a user
 * gesture (the toggle click, or the first gesture after a persisted "on"). Returns true
 * when an engine exists and sound is wanted.
 */
export function enableAudio(): boolean {
  try {
    if (!wanted()) return false;
    if (!engine) engine = createEngine();
    const e = engine;
    if (!e) return false;
    if (e.suspendTimer !== null) {
      window.clearTimeout(e.suspendTimer);
      e.suspendTimer = null;
    }
    const wasRunning = e.context.state === 'running';
    rampMaster(e, 1);
    applyAmbience(e, familyFor(useApp.getState().scene));
    if (!wasRunning) {
      e.context
        .resume()
        .then(() => {
          // A quiet confirmation tick once the fader is up, so "on" is audible.
          if (wanted() && e.context.state === 'running') playCueInto(e.context, e.input, 'select', e.context.currentTime + MASTER_FADE);
        })
        .catch(noop);
    }
    return true;
  } catch {
    return false;
  }
}

/** Fades the master out and suspends the context shortly after. Safe without an engine. */
export function disableAudio(): void {
  try {
    const e = engine;
    if (!e) return;
    rampMaster(e, 0);
    if (e.suspendTimer !== null) window.clearTimeout(e.suspendTimer);
    e.suspendTimer = window.setTimeout(() => {
      e.suspendTimer = null;
      if (!wanted()) e.context.suspend().catch(noop);
    }, (MASTER_FADE + 0.15) * 1000);
  } catch {
    /* never throw */
  }
}

/** Flips the visitor preference; the store subscription below starts or stops sound. */
export function toggleAudio(): void {
  try {
    const s = useApp.getState();
    s.setAudioEnabled(!s.audioEnabled);
  } catch {
    /* never throw */
  }
}

// ---------------------------------------------------------------------------
// Public cue / ambience API
// ---------------------------------------------------------------------------

export function playCue(cue: AudioCue): void {
  try {
    const e = engine;
    if (!e || !wanted() || e.context.state !== 'running') return;
    if (cue === 'hover') {
      const now = performance.now();
      if (now - lastHoverAt < HOVER_MIN_INTERVAL_MS) return;
      lastHoverAt = now;
    }
    playCueInto(e.context, e.input, cue, e.context.currentTime + 0.01);
    cueLog.push({ cue, at: performance.now() });
    if (cueLog.length > CUE_LOG_MAX) cueLog.splice(0, cueLog.length - CUE_LOG_MAX);
  } catch {
    /* never throw */
  }
}

/** Crossfades the ambience bed for a scene state (see `familyFor`). */
export function setAmbience(scene: string): void {
  try {
    currentFamily = familyFor(scene);
    if (engine) applyAmbience(engine, currentFamily);
  } catch {
    /* never throw */
  }
}

// ---------------------------------------------------------------------------
// First-gesture arming (persisted "on" preference)
// ---------------------------------------------------------------------------

const GESTURES = ['pointerup', 'keydown', 'click'] as const;
let armed = false;

function onGesture(): void {
  if (enableAudio() && engine?.context.state === 'running') disarm();
}

function arm(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  for (const ev of GESTURES) window.addEventListener(ev, onGesture, true);
}

function disarm(): void {
  if (!armed) return;
  armed = false;
  for (const ev of GESTURES) window.removeEventListener(ev, onGesture, true);
}

/** Arms the gesture listener when sound is wanted but the engine is not running yet. */
function armUnlessRunning(): void {
  if (!wanted() || engine?.context.state === 'running') return;
  arm();
}

// ---------------------------------------------------------------------------
// Store subscriptions and page hooks (installed once as a module side effect)
// ---------------------------------------------------------------------------

function onVisibility(): void {
  const e = engine;
  if (!e) return;
  if (document.hidden) e.context.suspend().catch(noop);
  else if (wanted()) e.context.resume().catch(noop);
}

const debugApi: AudioDebug = {
  get context() {
    return engine?.context ?? null;
  },
  get enabled() {
    return wanted();
  },
  get ambience() {
    return engine?.family ?? currentFamily;
  },
  get masterGain() {
    return engine?.master.gain.value ?? 0;
  },
  get log() {
    return cueLog;
  },
  playCue,
  setAmbience,
  enableAudio,
  disableAudio,
  toggleAudio,
  measure: measureOffline,
};

function syncDebug(): void {
  if (typeof window === 'undefined') return;
  if (window.__astro) window.__astroAudio = debugApi;
  else delete window.__astroAudio;
}

function onSceneChange(scene: SceneState, prev: SceneState): void {
  setAmbience(scene);
  if (scene === 'cockpit' && prev !== 'cockpit') playCue('cockpitOn');
  if (prev === 'cockpit' && scene !== 'cockpit') playCue('cockpitOff');
  if (scene === 'launching' && prev !== 'launching') {
    playCue('ignition');
    if (launchTimer !== null) window.clearTimeout(launchTimer);
    launchTimer = window.setTimeout(() => {
      launchTimer = null;
      if (useApp.getState().scene === 'launching') playCue('launch');
    }, LAUNCH_WHOOSH_DELAY_MS);
  }
}

const INSTALL_KEY = '__astroAudioUninstall';

function install(): void {
  if (typeof window === 'undefined') return;
  const g = globalThis as typeof globalThis & { [INSTALL_KEY]?: () => void };
  g[INSTALL_KEY]?.(); // a previous module instance (HMR) — tear it down first
  const unsubs = [
    useApp.subscribe((s) => s.scene, onSceneChange),
    useApp.subscribe(
      (s) => s.selectedProjectId,
      (id, prev) => {
        if (id && id !== prev) playCue('select');
      },
    ),
    useApp.subscribe(
      (s) => s.hoveredProjectId,
      (id) => {
        if (id) playCue('hover');
      },
    ),
    useApp.subscribe(
      (s) => s.cockpitTab,
      () => {
        if (useApp.getState().scene === 'cockpit') playCue('terminal');
      },
    ),
    useApp.subscribe(
      (s) => s.audioEnabled,
      (on) => {
        if (on) {
          enableAudio();
          armUnlessRunning();
        } else {
          disarm();
          disableAudio();
        }
      },
    ),
    useApp.subscribe(
      (s) => s.settings.audio.enabled,
      (on) => {
        if (on && wanted()) armUnlessRunning();
        else if (!on) {
          disarm();
          disableAudio();
        }
      },
    ),
    useApp.subscribe(
      (s) => s.devMode,
      () => queueMicrotask(syncDebug),
    ),
  ];
  document.addEventListener('visibilitychange', onVisibility);
  currentFamily = familyFor(useApp.getState().scene);
  syncDebug();
  // Returning visitor with sound on: wait for a real gesture, never autoplay.
  if (wanted()) arm();

  g[INSTALL_KEY] = () => {
    for (const u of unsubs) u();
    document.removeEventListener('visibilitychange', onVisibility);
    disarm();
    if (launchTimer !== null) window.clearTimeout(launchTimer);
    launchTimer = null;
    if (engine) {
      if (engine.suspendTimer !== null) window.clearTimeout(engine.suspendTimer);
      engine.context.close().catch(noop);
      engine = null;
    }
    delete window.__astroAudio;
    delete g[INSTALL_KEY];
  };
}

install();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    (globalThis as typeof globalThis & { [INSTALL_KEY]?: () => void })[INSTALL_KEY]?.();
  });
}

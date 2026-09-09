import { portfolio } from '../data/loadPortfolio';
import { STORAGE_KEYS } from '../lib/constants';
import { begin, jumpTo, playIntro } from '../sequences/index';
import { jumpToProject, jumpToSystem } from '../sequences/system';
import { useApp, type SceneState } from '../state/store';
import { setLabelsAlpha } from '../ui/labelState';
import { setSystemDim } from '../scene/system/systemState';
import { setProbeOpacity } from '../scene/project/probeState';

/**
 * Overlay actions. Jumps use the same instant placements the router uses for deep links;
 * before jumping we cancel any running sequence (so a half-finished tween cannot keep
 * driving the rig) and clear the project focus leftovers a direct jump would not touch.
 */

export type JumpTarget = 'home' | 'cockpit' | 'system' | 'project';

const sceneFor: Record<JumpTarget, SceneState> = {
  home: 'home',
  cockpit: 'cockpit',
  system: 'system',
  project: 'project',
};

export function firstProjectId(): string | null {
  return portfolio.data.projects[0]?.id ?? null;
}

function clearProjectFocus(): void {
  const app = useApp.getState();
  setProbeOpacity(0);
  setSystemDim(0);
  app.setSelectedProject(null);
  app.setHoveredProject(null);
  setLabelsAlpha(1);
}

export function devJump(target: JumpTarget): void {
  const app = useApp.getState();
  // `begin` kills the current timeline and sets busy; the jump's `finish` releases it.
  if (app.busy) begin(sceneFor[target]);
  clearProjectFocus();
  switch (target) {
    case 'home':
      jumpTo('home');
      return;
    case 'cockpit':
      jumpTo('cockpit', app.cockpitTab);
      return;
    case 'system':
      jumpToSystem();
      return;
    case 'project': {
      const id = firstProjectId();
      if (id) jumpToProject(id);
      else jumpToSystem();
      return;
    }
  }
}

/** Replays the first-visit cinematic. Only meaningful from the idle home state. */
export function canReplayIntro(): boolean {
  const app = useApp.getState();
  return app.scene === 'home' && !app.busy;
}

export function replayIntro(): void {
  if (!canReplayIntro()) return;
  playIntro({ returning: false });
}

/** Forgets everything the site remembers about this visitor, then reloads. */
export function resetVisitorFlags(): void {
  try {
    for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
  } catch {
    /* private mode or blocked storage */
  }
  window.location.reload();
}

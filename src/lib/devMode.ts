import { useApp } from '../state/store';
import { handles, live, rig } from '../scene/rig';
import { portfolio } from '../data/loadPortfolio';
import { systemView } from '../scene/system/systemState';
import { STAGE_FRAME, stageDirToWorld, stageToWorld } from './stageFrame';
import { STAGE } from './constants';

/**
 * Developer mode: Ctrl+Alt+Shift+D toggles the overlay; `?dev=true` enables it at boot.
 * While enabled, `window.__astro` exposes the store, rig, handles and data so automated
 * checks (Playwright) and manual debugging can read state without touching production
 * code paths. The hook is removed again when dev mode is switched off.
 */

declare global {
  interface Window {
    __astro?: {
      useApp: typeof useApp;
      rig: typeof rig;
      handles: typeof handles;
      portfolio: typeof portfolio;
      systemView: typeof systemView;
      live: typeof live;
      stage: { frame: typeof STAGE_FRAME; toWorld: typeof stageToWorld; dirToWorld: typeof stageDirToWorld; STAGE: typeof STAGE };
    };
  }
}

function applyHook(on: boolean): void {
  if (on) window.__astro = {
    useApp,
    rig,
    handles,
    portfolio,
    systemView,
    live,
    stage: { frame: STAGE_FRAME, toWorld: stageToWorld, dirToWorld: stageDirToWorld, STAGE },
  };
  else delete window.__astro;
}

export function installDevModeHotkey(): () => void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === 'true') useApp.getState().setDevMode(true);
  applyHook(useApp.getState().devMode);
  const unsubscribe = useApp.subscribe((s) => s.devMode, applyHook);
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      useApp.getState().setDevMode(!useApp.getState().devMode);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    unsubscribe();
    applyHook(false);
  };
}

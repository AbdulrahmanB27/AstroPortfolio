import { useApp, type CockpitTab } from '../state/store';
import { portfolio } from '../data/loadPortfolio';

/**
 * Hash routes mirror the scene state so deep links survive static hosting:
 *   #/            home
 *   #/about | #/skills | #/resume | #/contact   cockpit tab
 *   #/projects    solar system
 *   #/projects/<id>   focused project
 */

const TABS: CockpitTab[] = ['about', 'skills', 'resume', 'contact'];

export function parseHash(hash: string): NonNullable<ReturnType<typeof useApp.getState>['bootTarget']> {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (!path) return { scene: 'home' };
  if (TABS.includes(path as CockpitTab)) return { scene: 'cockpit', tab: path as CockpitTab };
  if (path === 'projects') return { scene: 'system' };
  const m = path.match(/^projects\/([a-z0-9-]+)$/);
  if (m && portfolio.projectById.has(m[1]!)) return { scene: 'project', projectId: m[1]! };
  return { scene: 'home' };
}

export function hashFor(state: { scene: string; cockpitTab: CockpitTab; selectedProjectId: string | null }): string {
  switch (state.scene) {
    case 'cockpit':
    case 'enteringCockpit':
      return `#/${state.cockpitTab}`;
    case 'system':
    case 'flight':
    case 'returningToOrbit':
      return '#/projects';
    case 'project':
    case 'focusingProject':
      return state.selectedProjectId ? `#/projects/${state.selectedProjectId}` : '#/projects';
    case 'home':
    case 'exitingCockpit':
    case 'returningHome':
      return '#/';
    default:
      return '';
  }
}

/** Keeps the URL hash in sync with the scene state (replaceState: no history spam). */
export function installRouter(): () => void {
  const initial = parseHash(window.location.hash);
  useApp.getState().setBootTarget(initial);

  const unsubscribe = useApp.subscribe(
    (s) => ({ scene: s.scene, cockpitTab: s.cockpitTab, selectedProjectId: s.selectedProjectId }),
    (state) => {
      const next = hashFor(state);
      if (!next || next === window.location.hash) return;
      history.replaceState(null, '', next === '#/' ? window.location.pathname + window.location.search : next);
    },
    { equalityFn: (a, b) => a.scene === b.scene && a.cockpitTab === b.cockpitTab && a.selectedProjectId === b.selectedProjectId },
  );
  return unsubscribe;
}

import { useApp, type CockpitTab } from '../state/store';
import { portfolio } from '../data/loadPortfolio';
import { currentJourney, navigateTo, type NavTarget } from '../sequences/navigate';

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

/** A parsed hash as somewhere `navigateTo` can go. */
export function targetFor(hash: string): NavTarget {
  const t = parseHash(hash);
  switch (t.scene) {
    case 'cockpit':
      return { scene: 'cockpit', tab: t.tab ?? 'about' };
    case 'project':
      return t.projectId ? { scene: 'project', projectId: t.projectId } : { scene: 'system' };
    default:
      return { scene: t.scene };
  }
}

/** `''`, `'#'` and `'#/'` all mean home; comparing them raw pushed a duplicate entry at boot. */
function normalise(hash: string): string {
  return hash === '' || hash === '#' ? '#/' : hash;
}

/**
 * Keeps the URL hash in sync with the scene state, and the scene in sync with the browser's
 * history.
 *
 * This used to `replaceState` on every move, so the whole visit was one history entry and
 * the Back button left the site — from a project three clicks deep, a visitor pressing Back
 * to return to the orbit landed on whatever tab they were on before. Each destination the
 * visitor chooses is now an entry of its own, and Back and Forward fly there through
 * `navigateTo`, the same as a click would.
 *
 * Three rules keep the history honest:
 *  - one entry per destination, not per scene: the transitional states a sequence passes
 *    through map to the hash of where it is going, and a multi-step journey pushes once;
 *  - a move caused by Back or Forward rewrites the entry it arrived at rather than stacking a
 *    new one, or Back would only ever bounce between the last two places;
 *  - nothing is pushed for the boot placement, which already matches the address bar.
 */
export function installRouter(): () => void {
  const initial = parseHash(window.location.hash);
  useApp.getState().setBootTarget(initial);
  let pushedJourney = -1;

  const unsubscribe = useApp.subscribe(
    (s) => ({ scene: s.scene, cockpitTab: s.cockpitTab, selectedProjectId: s.selectedProjectId }),
    (state) => {
      const next = hashFor(state);
      if (!next || next === normalise(window.location.hash)) return;
      const url = next === '#/' ? window.location.pathname + window.location.search : next;
      const journey = currentJourney();
      const replace = journey ? journey.fromHistory || journey.id === pushedJourney : false;
      if (journey) pushedJourney = journey.id;
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    },
    { equalityFn: (a, b) => a.scene === b.scene && a.cockpitTab === b.cockpitTab && a.selectedProjectId === b.selectedProjectId },
  );

  /*
   * Both events, each read from its own source of truth.
   *
   * A fragment navigation fires `popstate` synchronously and queues `hashchange` as a task
   * for later. The journey `popstate` starts rewrites the address bar on its very first step
   * — leaving the cockpit for the orbit passes through home, `#/` — so by the time
   * `hashchange` ran, `location.hash` already said home, and a link to the projects flew the
   * visitor home and stopped there. `hashchange` carries the URL it was fired for; that is the
   * one to go to. Going where a journey is already headed is a no-op in `navigateTo`.
   */
  const onPop = () => navigateTo(targetFor(window.location.hash), { fromHistory: true });
  const onHash = (e: HashChangeEvent) => navigateTo(targetFor(new URL(e.newURL).hash), { fromHistory: true });
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onHash);

  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('hashchange', onHash);
  };
}

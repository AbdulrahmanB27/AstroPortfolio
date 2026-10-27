import { useApp, type CockpitTab } from '../state/store';
import { portfolio } from '../data/loadPortfolio';
import { enterCockpit, exitCockpit } from '../sequences';
import { focusProject, returnHomeFromOrbit, returnToOrbit } from '../sequences/system';
import { launch } from '../sequences/launch';

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

/** How far into the site a place is: Back walks up this, one place at a time. */
const DEPTH: Record<Place['scene'], number> = { home: 0, cockpit: 1, system: 1, project: 2 };

type Place = NonNullable<ReturnType<typeof useApp.getState>['bootTarget']>;
/** What a history entry pushed by the site carries: the address it was pushed from. */
type Entry = { astro: true; from: string };

const here = (): string => window.location.hash || '#/';
const urlFor = (hash: string): string => (hash === '#/' ? window.location.pathname + window.location.search : hash);

/**
 * Keeps the address in sync with where the visitor is, and makes Back and Forward move
 * through the site.
 *
 * Every change used to be a `replaceState`, so the site was one history entry however far in
 * a visitor went, and Back from the resume or a project left the portfolio altogether. On a
 * phone, where Back is a swipe, that was the most likely way for a recruiter to lose the page.
 * Now going deeper (the menu into the cockpit or the orbit, the orbit into a project) pushes
 * an entry; moving sideways (another section, the next project) replaces it; and stepping
 * back out with the site's own controls goes back through history when the entry it would
 * return to is the one behind, so Back never lands on the page you are already on.
 *
 * Back and Forward drive the same sequences the controls do, one place at a time — a project
 * to the orbit to the menu — because each sequence only starts from its neighbour. The address
 * is already where they are headed, so nothing is written while they run.
 */
export function installRouter(): () => void {
  const initial = parseHash(window.location.hash);
  useApp.getState().setBootTarget(initial);

  /** Where a Back or Forward is taking the site; nothing is written to history until it arrives. */
  let restoring: string | null = null;
  /** The site called `history.back()` itself, so the next popstate is already handled. */
  let ownPop = false;

  const settleIfArrived = () => {
    if (restoring && hashFor(useApp.getState()) === restoring) restoring = null;
  };

  /** Starts the sequence that takes the site one place nearer `to`. */
  const hop = (to: Place) => {
    const app = useApp.getState();
    const s = app.scene;
    if (to.scene === 'home') {
      if (s === 'cockpit') exitCockpit();
      else if (s === 'project') returnToOrbit();
      else if (s === 'system') returnHomeFromOrbit();
    } else if (to.scene === 'cockpit') {
      if (s === 'home') enterCockpit(to.tab ?? 'about');
      else if (s === 'cockpit' && to.tab) app.setCockpitTab(to.tab);
      else if (s === 'project') returnToOrbit();
      else if (s === 'system') returnHomeFromOrbit();
    } else if (to.scene === 'system') {
      if (s === 'project') returnToOrbit();
      else if (s === 'home') launch();
      else if (s === 'cockpit') exitCockpit();
    } else if (to.projectId) {
      if (s === 'system' || s === 'project') focusProject(to.projectId);
      else if (s === 'home') launch();
      else if (s === 'cockpit') exitCockpit();
    }
  };

  /**
   * Steps towards `restoring` until it arrives. Runs again whenever a sequence finishes; with
   * reduced motion the sequences are instant, so it keeps stepping here instead.
   */
  const drive = () => {
    for (let step = 0; step < 4 && restoring; step++) {
      const app = useApp.getState();
      if (app.busy) return;
      settleIfArrived();
      if (!restoring) return;
      const before = app.scene + hashFor(app);
      hop(parseHash(restoring));
      settleIfArrived();
      const after = useApp.getState();
      if (after.busy) return;
      if (after.scene + hashFor(after) === before) break;
    }
    // Nothing could start from here (flight mode, say): stop, and let the address say where
    // the visitor actually is rather than where they asked to go.
    if (restoring && !useApp.getState().busy) {
      restoring = null;
      const actual = hashFor(useApp.getState());
      if (actual) history.replaceState(history.state, '', urlFor(actual));
    }
  };

  const onPop = () => {
    if (ownPop) {
      ownPop = false;
      settleIfArrived();
      return;
    }
    restoring = here();
    drive();
  };
  window.addEventListener('popstate', onPop);

  const unsubscribe = useApp.subscribe(
    (s) => ({ scene: s.scene, cockpitTab: s.cockpitTab, selectedProjectId: s.selectedProjectId }),
    (state) => {
      const next = hashFor(state);
      if (!next) return;
      const current = here();
      if (next === current) {
        settleIfArrived();
        return;
      }
      if (restoring) return;
      const from = DEPTH[parseHash(current).scene];
      const to = DEPTH[parseHash(next).scene];
      const entry = history.state as Entry | null;
      if (to > from) {
        history.pushState({ astro: true, from: current } satisfies Entry, '', urlFor(next));
      } else if (to < from && entry?.astro && entry.from === next) {
        restoring = next;
        ownPop = true;
        history.back();
      } else {
        history.replaceState(history.state, '', urlFor(next));
      }
    },
    { equalityFn: (a, b) => a.scene === b.scene && a.cockpitTab === b.cockpitTab && a.selectedProjectId === b.selectedProjectId },
  );
  const unsubscribeBusy = useApp.subscribe(
    (s) => s.busy,
    (busy) => {
      if (!busy) drive();
    },
  );
  return () => {
    unsubscribe();
    unsubscribeBusy();
    window.removeEventListener('popstate', onPop);
  };
}

import { useApp, type AppState, type CockpitTab } from '../state/store';
import { enterCockpit, exitCockpit, setCockpitView, skipIntro } from './index';
import { launch } from './launch';
import { exitFlight } from './flight';
import { focusProject, returnHomeFromOrbit, returnToOrbit } from './system';

/**
 * Go anywhere from anywhere.
 *
 * The universe is a tree — home at the root, the cockpit and the orbit as its two branches,
 * each project a leaf on the second — and every sequence only knows how to move one edge of
 * it. That made the site a maze for the one visitor it most needs to serve: someone reading
 * the About section who wants to see the projects had to find "Leave the rocket", sit through
 * the walk out, find Projects, and sit through the launch. Nothing told them that was the way.
 *
 * This walks the tree instead. It looks at where you are, takes the one step that gets
 * closer, and waits for that step's sequence to finish before taking the next. Every step is
 * an existing sequence, so a chained journey looks exactly like the same journey taken by
 * hand: the launch still launches, the cockpit door still opens.
 *
 * It is also what the browser's Back button drives (see `router.ts`), which is the reason a
 * target can arrive while a sequence is running: the newest one replaces whatever was pending
 * and the walk resumes when the camera is free.
 */

export type NavTarget =
  | { scene: 'home' }
  | { scene: 'cockpit'; tab: CockpitTab }
  | { scene: 'system' }
  | { scene: 'project'; projectId: string };

let pending: NavTarget | null = null;
let unsubscribe: (() => void) | null = null;
let journey = { id: 0, fromHistory: false };

/**
 * The journey under way, if any. The router reads this to decide how the address bar moves:
 * a journey the visitor started gets one history entry however many scenes it passes
 * through, and one the Back button started rewrites the entry it is going to.
 */
export function currentJourney(): { id: number; fromHistory: boolean } | null {
  return pending ? journey : null;
}

export function navigateTo(target: NavTarget, options: { fromHistory?: boolean } = {}): void {
  // Same destination, same trip: a second click on a link mid-journey is not a new entry.
  const same = pending !== null && JSON.stringify(pending) === JSON.stringify(target);
  if (!same) journey = { id: journey.id + 1, fromHistory: !!options.fromHistory };
  pending = target;
  if (!unsubscribe) {
    unsubscribe = useApp.subscribe(
      (s) => [s.scene, s.busy, s.cockpitTab, s.cockpitView, s.selectedProjectId] as const,
      () => {
        // Deferred: this listener runs inside zustand's `set`, and a step starts a sequence
        // that calls `set` again. Nested, the router's own listener would see the states out
        // of order and write a stale hash.
        queueMicrotask(step);
      },
      { equalityFn: (a, b) => a.every((v, i) => v === b[i]) },
    );
  }
  step();
}

function stop(): void {
  pending = null;
  unsubscribe?.();
  unsubscribe = null;
}

function arrived(t: NavTarget, s: AppState): boolean {
  switch (t.scene) {
    case 'home':
      return s.scene === 'home';
    case 'cockpit':
      return s.scene === 'cockpit' && s.cockpitTab === t.tab && s.cockpitView === 'full';
    case 'system':
      return s.scene === 'system';
    case 'project':
      return s.scene === 'project' && s.selectedProjectId === t.projectId;
  }
}

/** One edge of the tree, toward `t`. Returns false when there is no edge to take. */
function takeStep(t: NavTarget, s: AppState): boolean {
  const wantsSurface = t.scene === 'home' || t.scene === 'cockpit';
  switch (s.scene) {
    case 'intro':
      skipIntro();
      return true;
    case 'home':
      if (t.scene === 'cockpit') enterCockpit(t.tab);
      else if (!wantsSurface) launch();
      else return false;
      return true;
    case 'cockpit':
      if (t.scene === 'cockpit') setCockpitView('full', t.tab);
      else exitCockpit();
      return true;
    case 'system':
      if (t.scene === 'project') focusProject(t.projectId);
      else if (wantsSurface) returnHomeFromOrbit();
      else return false;
      return true;
    case 'project':
      if (t.scene === 'project') focusProject(t.projectId);
      else returnToOrbit();
      return true;
    case 'flight':
      exitFlight();
      return true;
    default:
      return false;
  }
}

function step(): void {
  const t = pending;
  if (!t) return;
  const s = useApp.getState();
  if (arrived(t, s)) return stop();
  // A sequence owns the camera; the subscription brings us back when it lets go.
  if (s.busy) return;
  const before = [s.scene, s.busy, s.cockpitTab, s.cockpitView, s.selectedProjectId].join('|');
  const moved = takeStep(t, s);
  const a = useApp.getState();
  const after = [a.scene, a.busy, a.cockpitTab, a.cockpitView, a.selectedProjectId].join('|');
  // A step that changed nothing was refused. Give up rather than leave a target armed that
  // would hijack the visitor's next unrelated click.
  if (!moved || before === after) stop();
}

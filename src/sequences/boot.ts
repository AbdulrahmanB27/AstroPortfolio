import gsap from 'gsap';
import { useApp } from '../state/store';
import { jumpTo, playIntro } from './index';
import { jumpToProject, jumpToSystem } from './system';

/**
 * Decides how the experience starts: first visit → full intro, returning → short intro,
 * deep link → direct placement. Runs once after the first rendered frame.
 */
export function boot(): void {
  const app = useApp.getState();
  const target = app.bootTarget ?? { scene: 'home' as const };
  const params = new URLSearchParams(window.location.search);
  // `?nointro` is used by automated captures and tests; it is not a visitor feature.
  const automated = params.has('nointro');
  const introEnabled = app.settings.intro.enabled && !automated;

  if (automated) {
    /*
     * Test harnesses render through a software rasteriser at a few frames a second. gsap's
     * lag smoothing treats any frame slower than 500 ms as a hiccup and advances the
     * timeline by only 33 ms for it, which is the right call for a visitor's stutter and the
     * wrong one for a harness: a 7 s launch becomes 212 rendered frames — minutes of wall
     * clock against a 30 s budget, and which machine crosses the cliff decides which tests
     * fail. Every sequence recomputes its state from the playhead, so letting the playhead
     * follow the clock is safe; the visitor path keeps the default.
     */
    gsap.ticker.lagSmoothing(0);
  }

  switch (target.scene) {
    case 'cockpit':
      jumpTo('cockpit', target.tab);
      return;
    case 'system':
      jumpToSystem();
      return;
    case 'project':
      if (target.projectId) jumpToProject(target.projectId);
      else jumpToSystem();
      return;
    default:
      if (!introEnabled) {
        jumpTo('home');
        app.markIntroSeen();
        return;
      }
      playIntro({ returning: app.visited.intro });
  }
}

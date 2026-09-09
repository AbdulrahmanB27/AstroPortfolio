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
  const introEnabled = app.settings.intro.enabled && !params.has('nointro');

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

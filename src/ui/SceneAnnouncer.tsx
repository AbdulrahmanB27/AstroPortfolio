import { useEffect, useState } from 'react';
import { portfolio } from '../data/loadPortfolio';
import { useApp, type AppState } from '../state/store';

const TAB_NAMES = { about: 'About', skills: 'Skills', resume: 'Resume', contact: 'Contact' } as const;

/** Where the visitor is, in words: the tab title and the announcement share it. */
export function placeName(s: Pick<AppState, 'scene' | 'cockpitTab' | 'cockpitView' | 'selectedProjectId'>): string | null {
  switch (s.scene) {
    case 'home':
      return 'Home planet';
    case 'cockpit':
      return s.cockpitView === 'full' ? TAB_NAMES[s.cockpitTab] : 'Cockpit';
    case 'system':
      return 'Projects';
    case 'project': {
      const p = s.selectedProjectId ? portfolio.projectById.get(s.selectedProjectId) : undefined;
      return p ? p.title : 'Projects';
    }
    case 'flight':
      return 'Flight mode';
    default:
      return null;
  }
}

/**
 * Says where you arrived.
 *
 * A sighted visitor watches the camera fly to the cockpit; a screen-reader user pressed a
 * button and then heard nothing at all, because nothing about the document changed except
 * which overlays were hidden. One polite announcement per arrival, after the sequence has
 * finished, so it never talks over a transition.
 *
 * It also names the browser tab after the place. Every destination is a history entry now,
 * and a Back menu full of identical "Abdulrahman Bahjat — Portfolio" entries is no help in
 * choosing one.
 */
export function SceneAnnouncer() {
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const tab = useApp((s) => s.cockpitTab);
  const view = useApp((s) => s.cockpitView);
  const projectId = useApp((s) => s.selectedProjectId);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (busy) return;
    const name = placeName({ scene, cockpitTab: tab, cockpitView: view, selectedProjectId: projectId });
    if (!name) return;
    const site = portfolio.data.meta.siteTitle;
    document.title = scene === 'home' ? site : `${name} — ${portfolio.data.profile.name}`;
    setMessage(scene === 'system' ? `Projects: ${portfolio.data.projects.length} planets. Use the project index to choose one.` : name);
  }, [scene, busy, tab, view, projectId]);

  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {message}
    </p>
  );
}

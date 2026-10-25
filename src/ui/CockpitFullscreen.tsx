import { useEffect } from 'react';
import { useApp } from '../state/store';
import { setCockpitView } from '../sequences';
import { MissionComputer } from './MissionComputer';
import { useRescueFocus } from './focus';

/**
 * The same content, flat.
 *
 * The console displays are the point of the cockpit, but a raked surface seen through a
 * perspective camera is never going to beat a page for reading a long resume on a small
 * screen. This is the escape hatch: identical markup, no CSS3D layer, no projection, the
 * whole viewport. Opt-in, so it never undermines the in-world reading it sits behind.
 *
 * Exactly one `MissionComputer` is mounted at a time — while this is open the console
 * displays fall back to their title cards — so there is never a second copy of the content
 * in the document.
 */
export function CockpitFullscreen() {
  const scene = useApp((s) => s.scene);
  const view = useApp((s) => s.cockpitView);
  const open = scene === 'cockpit' && view === 'full';
  // Into the reader, on the section that is open: the control that opened it is gone.
  useRescueFocus(open, () => document.querySelector<HTMLElement>('.cockpit-full .mc__tab[data-active="true"]'));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape steps back to the cabin rather than out of the ship: it is the surface that
      // changed, not where you are.
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setCockpitView('room');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;
  return (
    <div className="cockpit-full" role="dialog" aria-modal="true" aria-label="Mission computer, full screen">
      <MissionComputer />
    </div>
  );
}

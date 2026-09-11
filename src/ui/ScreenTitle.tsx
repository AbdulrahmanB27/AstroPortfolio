import { portfolio } from '../data/loadPortfolio';
import { useApp, type CockpitTab } from '../state/store';
import { setCockpitView } from '../sequences';

const LABELS: Record<CockpitTab, { name: string; sub: string; index: string }> = {
  about: { name: 'About', sub: 'Mission profile', index: '01' },
  skills: { name: 'Skills', sub: 'Capabilities', index: '02' },
  resume: { name: 'Resume', sub: 'Mission record', index: '03' },
  contact: { name: 'Contact', sub: 'Communications', index: '04' },
};

/** A one-line preview of what each section holds, so a screen is not just a word. */
function preview(id: CockpitTab): string {
  const { profile, skills, resume, projects } = portfolio.data;
  switch (id) {
    case 'about':
      return profile.title;
    case 'skills': {
      const count = skills.groups.reduce((n, g) => n + g.items.length, 0);
      return `${count} across ${skills.groups.length} areas`;
    }
    case 'resume':
      return `${resume.experience.length + resume.activities.length} entries · PDF`;
    case 'contact':
      return profile.contact.email;
    default:
      return `${projects.length} projects`;
  }
}

/**
 * What a console screen shows: the section's name, large enough to read across the cabin, and
 * one line of what is behind it.
 *
 * The whole card is the control. Selecting it flies the camera into this display and the
 * reader opens over the frame. The screens stay physically on the ship and stay the way in;
 * the reading itself is flat, because twice now a raked surface behind a perspective camera
 * has lost to a page.
 */
export function ScreenTitle({ id }: { id: CockpitTab }) {
  const scene = useApp((s) => s.scene);
  const view = useApp((s) => s.cockpitView);
  const label = LABELS[id];
  const reachable = scene === 'cockpit';
  // The reader is open over the frame: the displays behind it idle down.
  const idle = view === 'full';

  return (
    <button
      type="button"
      className="screen-card"
      data-idle={idle}
      onClick={() => setCockpitView('full', id)}
      tabIndex={reachable ? 0 : -1}
    >
      <span className="screen-card__index t-mono">{label.index}</span>
      <span className="screen-card__name">{label.name}</span>
      <span className="screen-card__sub t-mono">{label.sub}</span>
      <span className="screen-card__preview">{preview(id)}</span>
      <span className="screen-card__open t-mono" aria-hidden="true">
        Open
      </span>
    </button>
  );
}

import { portfolio } from '../data/loadPortfolio';
import { useApp, type CockpitTab } from '../state/store';
import { enterCockpit } from '../sequences';
import { launch } from '../sequences/launch';

interface MenuItem {
  id: CockpitTab | 'projects';
  label: string;
  sub: string;
}

const ITEMS: MenuItem[] = [
  { id: 'about', label: 'About', sub: 'Mission profile' },
  { id: 'projects', label: 'Projects', sub: 'Launch and explore' },
  { id: 'skills', label: 'Skills', sub: 'Capabilities' },
  { id: 'resume', label: 'Resume', sub: 'Mission record' },
  { id: 'contact', label: 'Contact', sub: 'Communications' },
];

/** Primary navigation on the home planet. Real buttons; keyboard and screen readers work. */
export function HomeMenu() {
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const visible = scene === 'home' && !busy;
  const profile = portfolio.data.profile;

  return (
    <>
      <div className="lockup" data-visible={visible}>
        <div className="lockup__name">{profile.name}</div>
        <div className="lockup__title">{profile.title}</div>
      </div>
      <nav className="home-menu" data-visible={visible} aria-label="Primary" aria-hidden={!visible}>
        {ITEMS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="home-menu__item"
            style={{ '--delay': `${i * 60}ms` } as React.CSSProperties}
            tabIndex={visible ? 0 : -1}
            onClick={(e) => {
              if (item.id === 'projects') launch({ comedic: e.shiftKey });
              else enterCockpit(item.id);
            }}
          >
            <span className="home-menu__tick" aria-hidden="true" />
            <span>
              <span className="home-menu__label">{item.label}</span>
              <span className="home-menu__sub">{item.sub}</span>
            </span>
          </button>
        ))}
        {/* A way out of the 3D for anyone who wants one — a slow connection, a machine that
            hates WebGL, a recruiter with thirty seconds. Deliberately quiet: it sits under
            the navigation rather than competing with it. */}
        <a className="home-menu__lite" href="lite/" tabIndex={visible ? 0 : -1}>
          Simple view
        </a>
      </nav>
    </>
  );
}

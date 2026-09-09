import { useEffect, useState } from 'react';
import { portfolio } from '../data/loadPortfolio';
import { useApp } from '../state/store';
import { focusProject, returnHomeFromOrbit } from '../sequences/system';

/**
 * Minimal controls while browsing the solar system: return home, and an accessible
 * project index (also the keyboard/screen-reader path to every project).
 */
export function SystemHud() {
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const setHovered = useApp((s) => s.setHoveredProject);
  const visible = scene === 'system' && !busy;
  // Phones do not render floating planet labels (they collide with rings and each other),
  // so the index is the only place project names exist there: it opens by default.
  const [indexOpen, setIndexOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 820);
  const profile = portfolio.data.profile;

  useEffect(() => {
    // Closing on every invisible frame also closed the phone default, because the HUD is
    // not visible while the launch sequence is still running.
    if (visible) {
      if (window.innerWidth <= 820) setIndexOpen(true);
    } else if (window.innerWidth > 820) {
      setIndexOpen(false);
    }
  }, [visible]);

  return (
    <div className="system-hud" data-visible={visible} aria-hidden={!visible}>
      <div className="system-hud__top">
        <div className="lockup lockup--static" data-visible="true" data-label-obstacle>
          <div className="lockup__name">{profile.name}</div>
          <div className="lockup__title">Projects · select a planet</div>
        </div>
        <button type="button" className="pill" onClick={returnHomeFromOrbit} tabIndex={visible ? 0 : -1} data-label-obstacle>
          <span aria-hidden="true">←</span> Home planet
        </button>
      </div>
      <div className="system-hud__bottom">
        <button
          type="button"
          className="pill"
          aria-expanded={indexOpen}
          aria-controls="project-index"
          onClick={() => setIndexOpen((v) => !v)}
          tabIndex={visible ? 0 : -1}
          data-label-obstacle
        >
          {indexOpen ? 'Hide index' : 'Project index'}
        </button>
        <ul id="project-index" className="project-index" data-open={indexOpen} aria-label="All projects">
          {portfolio.data.projects.map((p) => {
            const cat = portfolio.categoryById.get(p.category);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="project-index__item"
                  tabIndex={visible && indexOpen ? 0 : -1}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(p.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => focusProject(p.id)}
                >
                  <span className="project-index__dot" style={{ background: p.planet.color }} aria-hidden="true" />
                  <span className="project-index__title">{p.title}</span>
                  <span className="project-index__meta t-mono" style={{ color: cat?.color }}>
                    {cat?.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

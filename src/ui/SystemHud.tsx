import { useEffect, useRef, useState } from 'react';
import { portfolio } from '../data/loadPortfolio';
import { useApp } from '../state/store';
import { focusProject, returnHomeFromOrbit } from '../sequences/system';
import { useRescueFocus } from './focus';

const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'resume', label: 'Resume' },
  { id: 'contact', label: 'Contact' },
] as const;

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
  const indexToggleRef = useRef<HTMLButtonElement>(null);
  const lastProjectRef = useRef<string | null>(null);
  const selected = useApp((s) => s.selectedProjectId);
  useEffect(() => {
    if (selected) lastProjectRef.current = selected;
  }, [selected]);
  // Back from a project lands on that project's row in the index when it is open, so a
  // keyboard visitor browsing the list keeps their place; otherwise on the index control.
  useRescueFocus(visible, () => {
    const last = lastProjectRef.current;
    const row = last ? document.querySelector<HTMLElement>(`#project-index [data-project="${last}"]`) : null;
    return row && row.tabIndex >= 0 ? row : indexToggleRef.current;
  });

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
        <div className="system-hud__nav">
          {/*
            The cockpit's sections, from orbit.

            Contact and Resume were three moves away from the projects — fly home, then find
            the menu, then wait for the cockpit — which is backwards for a visitor who has just
            seen the work and wants to get in touch. Real links: `navigateTo` makes the same
            trip the visitor would, and a middle-click opens the section in a new tab.
          */}
          <nav className="system-hud__links" aria-label="Sections" data-label-obstacle>
            {SECTIONS.map((sct) => (
              <a key={sct.id} href={`#/${sct.id}`} tabIndex={visible ? 0 : -1}>
                {sct.label}
              </a>
            ))}
          </nav>
          <button type="button" className="pill" onClick={returnHomeFromOrbit} tabIndex={visible ? 0 : -1} data-label-obstacle>
            <span aria-hidden="true">←</span> Home planet
          </button>
        </div>
      </div>
      <div className="system-hud__bottom">
        <button
          ref={indexToggleRef}
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
                  data-project={p.id}
                  className="project-index__item"
                  tabIndex={visible && indexOpen ? 0 : -1}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(p.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => focusProject(p.id)}
                >
                  {/* The category's colour, not the planet's. Each row used to carry two
                      independent colour codes 250px apart — the dot took the planet material
                      and the tag took the category — so they agreed on some rows and
                      contradicted on others, which teaches a rule and then breaks it. */}
                  <span className="project-index__dot" style={{ background: cat?.color }} aria-hidden="true" />
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

import { useEffect, useState } from 'react';
import { useHasMoreBelow } from './useHasMoreBelow';
import { assetUrl, portfolio } from '../data/loadPortfolio';
import { useApp } from '../state/store';
import { focusProject, returnToOrbit } from '../sequences/system';

/** Four corners pointing out (expand) or in (collapse). */
function ExpandIcon({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" focusable="false">
      <path
        d={full ? 'M5 1v4H1M9 1v4h4M5 13V9H1M9 13V9h4' : 'M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Project display attached to the orbital probe. Conventional, readable content in a
 * thin-framed panel; the 3D probe and planet ground it in the world.
 */
export function ProjectPanel() {
  const scene = useApp((s) => s.scene);
  const selectedId = useApp((s) => s.selectedProjectId);
  const full = useApp((s) => s.projectFull);
  const setFull = useApp((s) => s.setProjectFull);
  // Full screen stays up while Previous/Next flies to the neighbouring planet: the camera move
  // is behind the page, and dropping the page for it and bringing it back read as a flicker.
  const visible = (scene === 'project' || (scene === 'focusingProject' && full)) && !!selectedId;
  const project = selectedId ? portfolio.projectById.get(selectedId) : undefined;
  const category = project ? portfolio.categoryById.get(project.category) : undefined;
  const [mediaIndex, setMediaIndex] = useState(0);
  const { more, ref: bodyRef, current: body } = useHasMoreBelow<HTMLDivElement>([mediaIndex, visible]);

  useEffect(() => {
    setMediaIndex(0);
    if (body.current) body.current.scrollTop = 0;
  }, [selectedId]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      // One step out at a time: full screen to the side panel, then the panel to orbit.
      if (e.key === 'Escape') {
        if (useApp.getState().projectFull) setFull(false);
        else returnToOrbit();
      }
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ordered = portfolio.data.projects.slice().sort((a, b) => a.order - b.order);
  const idx = project ? ordered.findIndex((p) => p.id === project.id) : -1;
  const step = (dir: 1 | -1) => {
    if (idx < 0) return;
    const next = ordered[(idx + dir + ordered.length) % ordered.length];
    if (next) focusProject(next.id);
  };

  const media = project?.media ?? [];
  const current = media[mediaIndex];

  return (
    <aside className="project-panel" data-visible={visible} data-full={full} aria-hidden={!visible} aria-label="Project details">
      {project && (
        <div className="project-panel__frame" data-more={more}>
          <header className="project-panel__header">
            <span className="t-mono project-panel__meta">
              <i className="project-panel__cat-dot" style={{ background: category?.color }} aria-hidden="true" />
              {category?.name}
              {project.year ? ` · ${project.year}` : ''}
              {project.status !== 'live' ? ` · ${project.status.replace('-', ' ')}` : ''}
            </span>
            <span className="project-panel__controls">
              <button
                type="button"
                className="pill project-panel__expand"
                onClick={() => setFull(!full)}
                tabIndex={visible ? 0 : -1}
                aria-pressed={full}
                aria-label={full ? 'Exit full screen' : 'Full screen'}
                title={full ? 'Exit full screen' : 'Full screen'}
              >
                <ExpandIcon full={full} />
              </button>
              <button type="button" className="pill" onClick={returnToOrbit} tabIndex={visible ? 0 : -1}>
                <span aria-hidden="true">←</span> Back to orbit
              </button>
            </span>
          </header>
          <div className="project-panel__body" ref={bodyRef}>
            <h1 className="project-panel__title">{project.title}</h1>
            <p className="project-panel__tagline">{project.tagline}</p>
            {(project.links.live || project.links.repo || project.links.other.length > 0) && (
              <div className="project-panel__links">
                {project.links.live && (
                  <a className="pill pill--accent" href={project.links.live} target="_blank" rel="noopener" tabIndex={visible ? 0 : -1}>
                    Open live site
                  </a>
                )}
                {project.links.repo && (
                  <a className="pill" href={project.links.repo} target="_blank" rel="noopener" tabIndex={visible ? 0 : -1}>
                    Source on GitHub
                  </a>
                )}
                {project.links.other.map((l) => (
                  <a key={l.url} className="pill" href={l.url} target="_blank" rel="noopener" tabIndex={visible ? 0 : -1}>
                    {l.label}
                  </a>
                ))}
              </div>
            )}
            {current && (
              <figure className="project-media">
                {current.type === 'video' ? (
                  <video src={assetUrl(current.src)} poster={current.poster ? assetUrl(current.poster) : undefined} controls playsInline muted />
                ) : (
                  <img src={assetUrl(current.src)} alt={current.alt} loading="lazy" />
                )}
                {(current.caption || media.length > 1) && (
                  <figcaption>
                    <span>{current.caption ?? current.alt}</span>
                    {media.length > 1 && (
                      <span className="project-media__nav">
                        {media.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            aria-label={`Show media ${i + 1}`}
                            data-active={i === mediaIndex}
                            onClick={() => setMediaIndex(i)}
                            tabIndex={visible ? 0 : -1}
                          />
                        ))}
                      </span>
                    )}
                  </figcaption>
                )}
              </figure>
            )}
            <p className="project-panel__summary">{project.summary}</p>
            {project.description.map((p, i) => (
              <p key={i} className="project-panel__p">
                {p}
              </p>
            ))}
            {project.technologies.length > 0 && (
              <>
                <h2 className="mc-doc__h2">Technologies</h2>
                <ul className="tags">
                  {project.technologies.map((t) => (
                    <li key={t} className="tag">
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {project.process.length > 0 && (
              <>
                <h2 className="mc-doc__h2">Process</h2>
                <ul className="mc-list">
                  {project.process.map((p) => (
                    <li key={p}>
                      <span className="mc-list__meta">{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <footer className="project-panel__footer">
            <button
              type="button"
              className="pill"
              onClick={() => step(-1)}
              tabIndex={visible ? 0 : -1}
              disabled={idx <= 0}
              aria-disabled={idx <= 0}
            >
              <span aria-hidden="true">←</span> Previous
            </button>
            <span className="t-mono">
              {idx + 1} / {ordered.length}
            </span>
            <button
              type="button"
              className="pill"
              onClick={() => step(1)}
              tabIndex={visible ? 0 : -1}
              disabled={idx >= ordered.length - 1}
              aria-disabled={idx >= ordered.length - 1}
            >
              Next <span aria-hidden="true">→</span>
            </button>
          </footer>
          <span className="scroll-cue" data-visible={more} aria-hidden="true" />
          <i className="mc__corner mc__corner--tl" aria-hidden="true" />
          <i className="mc__corner mc__corner--tr" aria-hidden="true" />
          <i className="mc__corner mc__corner--bl" aria-hidden="true" />
          <i className="mc__corner mc__corner--br" aria-hidden="true" />
        </div>
      )}
    </aside>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useHasMoreBelow } from './useHasMoreBelow';
import { assetUrl, portfolio } from '../data/loadPortfolio';
import { useApp } from '../state/store';
import { focusProject, returnToOrbit } from '../sequences/system';
import { CopyButton } from './CopyButton';
import { focusIsStranded } from './focus';

/**
 * Project display attached to the orbital probe. Conventional, readable content in a
 * thin-framed panel; the 3D probe and planet ground it in the world.
 */
export function ProjectPanel() {
  const scene = useApp((s) => s.scene);
  const selectedId = useApp((s) => s.selectedProjectId);
  const visible = scene === 'project' && !!selectedId;
  const project = selectedId ? portfolio.projectById.get(selectedId) : undefined;
  const category = project ? portfolio.categoryById.get(project.category) : undefined;
  const [mediaIndex, setMediaIndex] = useState(0);
  // The picture at full size. At 240px (96px on a phone) a CAD render or a storefront
  // screenshot is a thumbnail of the evidence, not the evidence.
  const [zoomed, setZoomed] = useState(false);
  const { more, ref: bodyRef, current: body } = useHasMoreBelow<HTMLDivElement>([mediaIndex, visible]);

  useEffect(() => {
    setMediaIndex(0);
    setZoomed(false);
    if (body.current) body.current.scrollTop = 0;
  }, [selectedId]);

  useEffect(() => {
    if (!visible) setZoomed(false);
  }, [visible]);

  /*
   * Focus follows the visitor to the project they chose. The planet label, index row or pager
   * button that was pressed is hidden (or, for the pager, re-labelled) by the time the panel
   * is up, so focus lands on the new title — which is also what a screen reader should read.
   * Pager presses keep focus where it is when that control is still on screen.
   */
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      if (focusIsStranded() || document.activeElement === document.body) titleRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, selectedId]);

  // Whatever was focused before the picture opened gets focus back when it closes.
  const zoomOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (zoomed) {
      zoomOpener.current = document.activeElement as HTMLElement | null;
      return;
    }
    zoomOpener.current?.focus({ preventScroll: true });
    zoomOpener.current = null;
  }, [zoomed]);

  const ordered = portfolio.data.projects.slice().sort((a, b) => a.order - b.order);
  const idx = project ? ordered.findIndex((p) => p.id === project.id) : -1;
  /*
   * Previous and Next wrap, the same as the arrow keys always have.
   *
   * The buttons used to stop at the ends while ←/→ went round, so the same intent did two
   * different things depending on how you asked — and on the first project "Previous" was a
   * greyed-out control on the one screen most visitors land on first. Seven planets in a ring
   * have no first or last; the pager now says which one it goes to instead.
   */
  const neighbour = (dir: 1 | -1) => (idx < 0 ? undefined : ordered[(idx + dir + ordered.length) % ordered.length]);
  const prev = neighbour(-1);
  const next = neighbour(1);
  const step = (dir: 1 | -1) => {
    const target = neighbour(dir);
    if (target && target.id !== project?.id) focusProject(target.id);
  };

  const media = project?.media ?? [];
  const current = media[mediaIndex];
  const stepMedia = (dir: 1 | -1) => {
    if (media.length > 1) setMediaIndex((i) => (i + dir + media.length) % media.length);
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      // Inside the enlarged picture the keys belong to the picture: Escape closes it rather
      // than flying back to orbit, and the arrows page through its media, not the planets.
      if (zoomed) {
        if (e.key === 'Escape') setZoomed(false);
        if (e.key === 'ArrowRight') stepMedia(1);
        if (e.key === 'ArrowLeft') stepMedia(-1);
        return;
      }
      if (e.key === 'Escape') returnToOrbit();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shareUrl = project
    ? `${window.location.origin}${window.location.pathname}#/projects/${project.id}`
    : '';

  return (
    <aside className="project-panel" data-visible={visible} aria-hidden={!visible} aria-label="Project details">
      {project && (
        <div className="project-panel__frame" data-more={more}>
          <header className="project-panel__header">
            <span className="t-mono project-panel__meta">
              <i className="project-panel__cat-dot" style={{ background: category?.color }} aria-hidden="true" />
              {category?.name}
              {project.year ? ` · ${project.year}` : ''}
              {project.status !== 'live' ? ` · ${project.status.replace('-', ' ')}` : ''}
            </span>
            <button type="button" className="pill" onClick={returnToOrbit} tabIndex={visible ? 0 : -1} aria-keyshortcuts="Escape">
              <span aria-hidden="true">←</span> Back to orbit
              <kbd className="kbd" aria-hidden="true">
                Esc
              </kbd>
            </button>
          </header>
          <div className="project-panel__body" ref={bodyRef}>
            <h1 className="project-panel__title" ref={titleRef} tabIndex={-1}>
              {project.title}
            </h1>
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
                  <button
                    type="button"
                    className="project-media__zoom"
                    onClick={() => setZoomed(true)}
                    tabIndex={visible ? 0 : -1}
                    aria-label={`Enlarge image: ${current.alt}`}
                  >
                    <img src={assetUrl(current.src)} alt="" loading="lazy" />
                    <span className="project-media__zoom-hint t-mono" aria-hidden="true">
                      Enlarge
                    </span>
                  </button>
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
            {/*
              The deep link to this planet, for pasting into a message. At the end of the
              write-up, where someone who has read it decides to pass it on — and not in the
              links row, where on a phone a third button wrapped to a second 44px row and
              pushed the description below the fold.
            */}
            <p className="project-panel__share">
              <span className="t-mono">Share this project</span>
              <CopyButton text={shareUrl} label="Copy link" />
            </p>
          </div>
          <footer className="project-panel__footer">
            <button
              type="button"
              className="pager"
              onClick={() => step(-1)}
              tabIndex={visible ? 0 : -1}
              aria-keyshortcuts="ArrowLeft"
              aria-label={prev ? `Previous project: ${prev.title}` : 'Previous project'}
            >
              <span className="pager__dir t-mono">
                <span aria-hidden="true">←</span> Previous
              </span>
              {prev && <span className="pager__title">{prev.title}</span>}
            </button>
            <span className="t-mono project-panel__count">
              {idx + 1} / {ordered.length}
            </span>
            <button
              type="button"
              className="pager pager--next"
              onClick={() => step(1)}
              tabIndex={visible ? 0 : -1}
              aria-keyshortcuts="ArrowRight"
              aria-label={next ? `Next project: ${next.title}` : 'Next project'}
            >
              <span className="pager__dir t-mono">
                Next <span aria-hidden="true">→</span>
              </span>
              {next && <span className="pager__title">{next.title}</span>}
            </button>
          </footer>
          <span className="scroll-cue" data-visible={more} aria-hidden="true" />
          <i className="mc__corner mc__corner--tl" aria-hidden="true" />
          <i className="mc__corner mc__corner--tr" aria-hidden="true" />
          <i className="mc__corner mc__corner--bl" aria-hidden="true" />
          <i className="mc__corner mc__corner--br" aria-hidden="true" />
        </div>
      )}
      {zoomed && current && current.type !== 'video' && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${project?.title ?? 'Project'} image ${mediaIndex + 1} of ${media.length}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomed(false);
          }}
        >
          <figure className="lightbox__figure">
            <img src={assetUrl(current.src)} alt={current.alt} />
            <figcaption className="lightbox__caption">
              <span>{current.caption ?? current.alt}</span>
              {media.length > 1 && (
                <span className="t-mono">
                  {mediaIndex + 1} / {media.length}
                </span>
              )}
            </figcaption>
          </figure>
          {media.length > 1 && (
            <>
              <button type="button" className="lightbox__nav lightbox__nav--prev" aria-label="Previous image" onClick={() => stepMedia(-1)}>
                <span aria-hidden="true">←</span>
              </button>
              <button type="button" className="lightbox__nav lightbox__nav--next" aria-label="Next image" onClick={() => stepMedia(1)}>
                <span aria-hidden="true">→</span>
              </button>
            </>
          )}
          <button type="button" className="pill lightbox__close" onClick={() => setZoomed(false)} autoFocus aria-keyshortcuts="Escape">
            Close
            <kbd className="kbd" aria-hidden="true">
              Esc
            </kbd>
          </button>
        </div>
      )}
    </aside>
  );
}

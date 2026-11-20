import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { director } from '../state/director'
import { bindScreen } from './screenAnchor'
import { useScrollCue } from './useScrollCue'
import { assetUrl } from '../content/load'
import { isSafeAsset, isSafeLink } from '../content/schema'

/** Project display: real DOM laid out on the survey probe's screen. */
export function ProjectPanel() {
  const mode = useApp((s) => s.mode)
  const busy = useApp((s) => s.busy)
  const id = useApp((s) => s.projectId)
  const content = useApp((s) => s.content)
  const ref = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLElement>(null)
  const [shot, setShot] = useState(0)
  const on = mode === 'project' && !busy
  const project = content?.projects.find((p) => p.id === id) ?? null

  useEffect(() => {
    bindScreen('probe', ref.current)
    return () => bindScreen('probe', null)
  }, [])
  useEffect(() => setShot(0), [id])
  useScrollCue(inner, [id, on])

  const media = project?.media.filter((m) => isSafeAsset(m.src)) ?? []
  const links = project?.links.filter((l) => isSafeLink(l.url)) ?? []
  const meta = project ? [project.category, project.year, project.role].filter(Boolean).join(' · ') : ''
  const current = media[Math.min(shot, Math.max(0, media.length - 1))]
  const facts: [string, string][] = project
    ? ([
        ['Category', project.category],
        ['Role', project.role],
        ['Year', project.year],
        ['Planet', project.planet.type],
      ].filter(([, v]) => v) as [string, string][])
    : []

  return (
    <>
      <button type="button" className={`backbtn${on ? ' is-on' : ''}`} onClick={() => director.closeProject()} tabIndex={on ? 0 : -1} aria-hidden={!on}>
        <span aria-hidden="true">←</span> Back to orbit
      </button>
      <div ref={ref} className={`screen project${on ? ' is-on' : ''}${media.length ? ' has-media' : ' no-media'}`} aria-hidden={!on}>
        {project && (
          <article ref={inner} className="project__inner scrollcue" aria-label={project.title} tabIndex={on ? 0 : -1}>
            {current && (
              <figure className="project__media">
                <img src={assetUrl(current.src)} alt={current.alt} loading="lazy" />
                {media.length > 1 && (
                  <div className="project__dots">
                    {media.map((m, i) => (
                      <button key={m.src} type="button" aria-label={`Image ${i + 1} of ${media.length}`} className={i === shot ? 'is-active' : ''} onClick={() => setShot(i)} tabIndex={on ? 0 : -1} />
                    ))}
                  </div>
                )}
                {current.caption && <figcaption>{current.caption}</figcaption>}
              </figure>
            )}
            {!current && (
              <dl className="project__facts">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="project__text">
              {project.placeholder && <span className="tag tag--placeholder">Placeholder entry</span>}
              <h2>{project.title}</h2>
              {meta && current && <p className="project__meta">{meta}</p>}
              {project.summary && <p className="project__summary">{project.summary}</p>}
              {project.description.map((t, i) => (
                <p key={i} className="project__desc">
                  {t}
                </p>
              ))}
            </div>
            {project.tags.length > 0 && (
              <ul className="chips project__chips">
                {project.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </article>
        )}
        {project && (
          <footer className="project__foot">
            {links.length > 0 && (
                <div className="project__links">
                  {links.map((l, i) => (
                    <a key={l.url} className={`btn${i === 0 ? ' btn--primary' : ''}`} href={l.url} target="_blank" rel="noopener noreferrer" tabIndex={on ? 0 : -1}>
                      {l.label} <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
            )}
            <span className="screen__more" aria-hidden="true">
              Scroll for more ↓
            </span>
          </footer>
        )}
      </div>
    </>
  )
}

import { useEffect, useRef } from 'react'
import { useApp } from '../state/store'
import { director } from '../state/director'
import { assetUrl } from '../content/load'
import { isEmail, isSafeAsset, isSafeLink, type Portfolio, type Project } from '../content/schema'

const span = (start: string, end: string) => [start, end].filter(Boolean).join(' – ')

const SECTIONS = [
  ['about', 'About'],
  ['projects', 'Projects'],
  ['experience', 'Experience'],
  ['skills', 'Skills'],
  ['contact', 'Contact'],
] as const

function ProjectEntry({ p }: { p: Project }) {
  const image = p.media.find((m) => isSafeAsset(m.src))
  const links = p.links.filter((l) => isSafeLink(l.url))
  const meta = [p.category, p.year, p.role].filter(Boolean).join(' · ')
  return (
    <article className={`sproject${image ? ' has-image' : ''}`}>
      {image && <img className="sproject__image" src={assetUrl(image.src)} alt={image.alt} loading="lazy" />}
      <div className="sproject__text">
        {p.placeholder && <span className="tag tag--placeholder">Placeholder entry</span>}
        <h3>{p.title}</h3>
        {meta && <p className="sproject__meta">{meta}</p>}
        {p.summary && <p className="sproject__summary">{p.summary}</p>}
        {p.description.length > 0 && (
          <details>
            <summary>Details</summary>
            {p.description.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </details>
        )}
        {p.tags.length > 0 && (
          <ul className="chips">
            {p.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {links.length > 0 && (
          <p className="sproject__links">
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label} <span aria-hidden="true">↗</span>
              </a>
            ))}
          </p>
        )}
      </div>
    </article>
  )
}

function Page({ c }: { c: Portfolio }) {
  const p = c.profile
  const email = isEmail(c.contact.email) ? c.contact.email : null
  const pdf = isSafeAsset(c.resume.pdf) ? assetUrl(c.resume.pdf) : null
  const links = c.contact.links.filter((l) => isSafeLink(l.url))
  return (
    <main className="simple__page">
      <header className="simple__hero">
        <h1>{p.name}</h1>
        <p className="simple__role">{p.role}</p>
        {p.tagline && <p className="simple__tagline">{p.tagline}</p>}
        <div className="simple__actions">
          {pdf && (
            <a className="btn btn--primary" href={pdf} download target="_blank" rel="noopener noreferrer">
              Download resume
            </a>
          )}
          {email && (
            <a className="btn" href={`mailto:${email}`}>
              Email
            </a>
          )}
          {links.map((l) => (
            <a key={l.id} className="btn" href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </header>

      <section id="simple-about" aria-labelledby="simple-about-h">
        <h2 id="simple-about-h">About</h2>
        <div>
          {p.about.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
          {p.goals.length > 0 && (
            <>
              <h4>Goals</h4>
              <ul className="slist">
                {p.goals.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {p.interests.length > 0 && (
            <>
              <h4>Interests</h4>
              <ul className="chips">
                {p.interests.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section id="simple-projects" aria-labelledby="simple-projects-h">
        <h2 id="simple-projects-h">Projects</h2>
        <div>
          {c.projects.map((x) => (
            <ProjectEntry key={x.id} p={x} />
          ))}
        </div>
      </section>

      <section id="simple-experience" aria-labelledby="simple-experience-h">
        <h2 id="simple-experience-h">Experience</h2>
        <div>
          {c.experience.map((e) => (
            <article key={e.id} className="sentry">
              <h3>{e.title}</h3>
              <p className="sentry__where">
                {e.org}
                {span(e.start, e.end) && <em>{span(e.start, e.end)}</em>}
              </p>
              {e.summary && <p>{e.summary}</p>}
              {e.highlights.length > 0 && (
                <ul className="slist">
                  {e.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {c.education.length > 0 && <h4>Education</h4>}
          {c.education.map((e) => (
            <article key={e.id} className="sentry">
              <h3>{e.school}</h3>
              <p className="sentry__where">
                {e.degree}
                {span(e.start, e.end) && <em>{span(e.start, e.end)}</em>}
              </p>
              {e.details.length > 0 && (
                <ul className="slist">
                  {e.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section id="simple-skills" aria-labelledby="simple-skills-h">
        <h2 id="simple-skills-h">Skills</h2>
        <div className="sskills">
          {c.skills.map((g) => (
            <div key={g.id}>
              <h4>{g.group}</h4>
              <ul className="chips">
                {g.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="simple-contact" aria-labelledby="simple-contact-h">
        <h2 id="simple-contact-h">Contact</h2>
        <div>
          {c.contact.note && <p>{c.contact.note}</p>}
          {email && (
            <p className="simple__email">
              <a href={`mailto:${email}`}>{email}</a>
            </p>
          )}
          {links.length > 0 && (
            <p className="sproject__links">
              {links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}

/**
 * The whole portfolio as one plain, scrolling page: for a quick read, a slow device or a screen reader.
 * It covers the 3D scene, which stops drawing while this is open.
 */
export function SimpleView() {
  const on = useApp((s) => s.simple)
  const content = useApp((s) => s.content)
  const root = useRef<HTMLDivElement>(null)
  const shown = on && !!content

  useEffect(() => {
    if (!shown) return
    root.current?.focus({ preventScroll: true })
    // back on the surface, the keyboard continues from the button that opened this page
    return () => void window.setTimeout(() => document.querySelector<HTMLElement>('.menu.is-on [data-key="simple"]')?.focus(), 60)
  }, [shown])

  if (!shown || !content) return null
  // Scrolls this page only. (scrollIntoView would also shift the fixed layers underneath, which can be
  // scrolled by script even though they never scroll by hand.)
  const jump = (id: string) => () => {
    const page = root.current
    const target = document.getElementById(`simple-${id}`)
    if (!page || !target) return
    const bar = page.querySelector<HTMLElement>('.simple__bar')?.offsetHeight ?? 0
    const top = target.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - bar
    page.scrollTo({ top, behavior: useApp.getState().reducedMotion ? 'auto' : 'smooth' })
  }
  return (
    <div ref={root} className="simple" tabIndex={-1} role="region" aria-label="Simple view">
      <div className="simple__bar">
        <span className="simple__mark" aria-hidden="true">
          {content.profile.initials || 'AB'}
        </span>
        <nav aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" onClick={jump(id)}>
              {label}
            </button>
          ))}
        </nav>
        <button type="button" className="simple__close" onClick={() => director.setSimple(false)}>
          <span aria-hidden="true">←</span> Back to the 3D site
        </button>
      </div>
      <Page c={content} />
    </div>
  )
}

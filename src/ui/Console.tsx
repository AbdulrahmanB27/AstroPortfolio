import { useCallback, useEffect, useRef, useState } from 'react'
import { TABS, useApp, type Tab } from '../state/store'
import { director } from '../state/director'
import { bindScreen } from './screenAnchor'
import { useScrollCue } from './useScrollCue'
import { assetUrl } from '../content/load'
import { isEmail, isSafeAsset, isSafeLink, type Portfolio } from '../content/schema'

const TAB_LABEL: Record<Tab, string> = { about: 'About', skills: 'Skills', resume: 'Resume', contact: 'Contact' }

const span = (start: string, end: string) => [start, end].filter(Boolean).join(' – ')

function About({ c }: { c: Portfolio }) {
  const p = c.profile
  return (
    <div className="pane pane--about">
      <div className="pane__lead">
        <h2>{p.name}</h2>
        <p className="pane__role">{p.role}</p>
        {p.tagline && <p className="pane__tagline">{p.tagline}</p>}
      </div>
      <div className="pane__cols">
        <section>
          {p.about.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </section>
        <section>
          {p.interests.length > 0 && (
            <>
              <h3>Interests</h3>
              <ul className="chips">
                {p.interests.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {p.goals.length > 0 && (
            <>
              <h3>Goals</h3>
              <ul className="plain">
                {p.goals.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      {p.placeholder && <p className="pane__note">Some details on this screen are placeholders and will be updated.</p>}
    </div>
  )
}

function Skills({ c }: { c: Portfolio }) {
  return (
    <div className="pane pane--skills">
      <div className="pane__lead">
        <h2>Skills</h2>
        <p className="pane__role">Grouped by area</p>
      </div>
      <div className="skillgrid">
        {c.skills.map((g) => (
          <section key={g.id} className="skillgroup">
            <h3>{g.group}</h3>
            <ul>
              {g.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {c.skills.some((g) => g.placeholder) && <p className="pane__note">Sample grouping based on stated interests; details to be updated.</p>}
    </div>
  )
}

function Resume({ c }: { c: Portfolio }) {
  const pdf = isSafeAsset(c.resume.pdf) ? assetUrl(c.resume.pdf) : null
  return (
    <div className="pane pane--resume">
      <div className="pane__lead pane__lead--row">
        <div>
          <h2>Resume</h2>
          <p className="pane__role">{c.profile.name}</p>
        </div>
        {pdf ? (
          <a className="btn btn--primary" href={pdf} download target="_blank" rel="noopener noreferrer">
            Download PDF
          </a>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            Print / save as PDF
          </button>
        )}
      </div>
      {c.resume.summary && <p className="pane__summary">{c.resume.summary}</p>}
      <div className="pane__cols">
        <section>
          <h3>Education</h3>
          <ol className="timeline">
            {c.education.map((e) => (
              <li key={e.id}>
                <strong>{e.school}</strong>
                <span>{e.degree}</span>
                {span(e.start, e.end) && <em>{span(e.start, e.end)}</em>}
                {e.details.map((d) => (
                  <small key={d}>{d}</small>
                ))}
              </li>
            ))}
          </ol>
          {c.experience.length > 0 && (
            <>
              <h3>Experience</h3>
              <ol className="timeline">
                {c.experience.map((e) => (
                  <li key={e.id}>
                    <strong>{e.title}</strong>
                    <span>{e.org}</span>
                    {span(e.start, e.end) && <em>{span(e.start, e.end)}</em>}
                    {e.summary && <small>{e.summary}</small>}
                    {e.highlights.map((h) => (
                      <small key={h}>· {h}</small>
                    ))}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
        <section>
          <h3>Projects</h3>
          <ul className="plain">
            {c.projects
              .filter((p) => !p.placeholder)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.title}</strong> — {p.summary}
                </li>
              ))}
          </ul>
          <h3>Skills</h3>
          <ul className="chips">
            {c.skills
              .flatMap((g) => g.items)
              .slice(0, 8)
              .map((s) => (
                <li key={s}>{s}</li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Contact({ c }: { c: Portfolio }) {
  const [copied, setCopied] = useState(false)
  const email = isEmail(c.contact.email) ? c.contact.email : null
  const copy = async () => {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable: the mail link still works */
    }
  }
  return (
    <div className="pane pane--contact">
      <div className="pane__lead">
        <h2>Contact</h2>
        {c.contact.note && <p className="pane__role">{c.contact.note}</p>}
      </div>
      {email ? (
        <div className="contact__email">
          <a href={`mailto:${email}`}>{email}</a>
          <div className="contact__actions">
            <a className="btn btn--primary" href={`mailto:${email}`}>
              Write an email
            </a>
            <button type="button" className="btn" onClick={copy}>
              {copied ? 'Copied' : 'Copy address'}
            </button>
          </div>
        </div>
      ) : (
        <p className="pane__missing">No email address has been published yet.</p>
      )}
      {c.contact.links.filter((l) => isSafeLink(l.url)).length > 0 && (
        <ul className="contact__links">
          {c.contact.links
            .filter((l) => isSafeLink(l.url))
            .map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

/** Mission computer: real DOM laid out on the cockpit's physical main screen. */
export function Console() {
  const mode = useApp((s) => s.mode)
  const busy = useApp((s) => s.busy)
  const tab = useApp((s) => s.tab)
  const content = useApp((s) => s.content)
  const ref = useRef<HTMLDivElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const on = mode === 'cockpit' && !busy

  // callback ref: the element only exists once content has loaded
  const bind = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
    bindScreen('console', el)
  }, [])
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [tab])
  useScrollCue(body, [tab, on, content])

  if (!content) return null
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab)
    if (e.key === 'ArrowRight') useApp.getState().set({ tab: TABS[(i + 1) % TABS.length] })
    if (e.key === 'ArrowLeft') useApp.getState().set({ tab: TABS[(i + TABS.length - 1) % TABS.length] })
  }
  return (
    <>
      <button type="button" className={`backbtn${on ? ' is-on' : ''}`} onClick={() => director.exitCockpit()} tabIndex={on ? 0 : -1} aria-hidden={!on}>
        <span aria-hidden="true">←</span> Exit cockpit
      </button>
      <div ref={bind} className={`screen console${on ? ' is-on' : ''}`} aria-hidden={!on}>
        <div className="console__head">
          <span className="console__title">Mission computer</span>
          <div className="console__tabs" role="tablist" aria-label="Personal information" onKeyDown={onKey}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls="console-panel"
                tabIndex={on && tab === t ? 0 : -1}
                className={tab === t ? 'is-active' : ''}
                onClick={() => useApp.getState().set({ tab: t })}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div ref={body} className="console__body scrollcue" id="console-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={on ? 0 : -1}>
          {tab === 'about' && <About c={content} />}
          {tab === 'skills' && <Skills c={content} />}
          {tab === 'resume' && <Resume c={content} />}
          {tab === 'contact' && <Contact c={content} />}
        </div>
        <div className="screen__more" aria-hidden="true">
          Scroll for more ↓
        </div>
      </div>
    </>
  )
}

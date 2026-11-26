import { useEffect, useState, type MouseEvent } from 'react'
import { useProgress } from '@react-three/drei'
import { useApp } from '../state/store'
import { director } from '../state/director'
import { Console } from './Console'
import { ProjectPanel } from './ProjectPanel'
import { OrbitHud } from './OrbitHud'
import { SimpleView } from './SimpleView'
import { qa } from '../qa/params'

/** Designed load state: never a half-built scene. */
function Loader() {
  const ready = useApp((s) => s.sceneReady)
  const mode = useApp((s) => s.mode)
  const error = useApp((s) => s.contentError)
  const initials = useApp((s) => s.content?.profile.initials) || 'AB'
  const { progress } = useProgress()
  const [gone, setGone] = useState(false)
  const done = ready && mode !== 'boot'
  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setGone(true), 900)
    return () => window.clearTimeout(id)
  }, [done])
  if (gone) return null
  return (
    <div className={`loader${done ? ' is-done' : ''}`} role="status" aria-live="polite">
      <div className="loader__mark" aria-hidden="true">
        <span className="loader__orbit" />
        <span className="loader__star" />
      </div>
      {error ? (
        <p className="loader__text loader__text--error">{error}. Check that data/portfolio.json is published.</p>
      ) : (
        <>
          <p className="loader__text">{initials} · preparing the system</p>
          <div className="loader__bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${Math.max(0.04, (ready ? 100 : progress) / 100)})` }} />
          </div>
        </>
      )}
    </div>
  )
}

function Identity() {
  const profile = useApp((s) => s.content?.profile)
  const mode = useApp((s) => s.mode)
  const busy = useApp((s) => s.busy)
  if (!profile) return null
  const show = (mode === 'home' && !busy) || mode === 'intro'
  return (
    <header className={`identity${show ? ' is-on' : ''}${mode === 'intro' ? ' is-intro' : ''}`}>
      <h1 className="identity__name">{profile.name}</h1>
      <p className="identity__role">{profile.role}</p>
    </header>
  )
}

/** One button per place: the system of project planets, the cockpit's computer, and the plain page. */
const MENU: { key: 'launch' | 'cockpit' | 'simple'; label: string; hint: string }[] = [
  { key: 'launch', label: 'Launch into orbit', hint: 'Explore the projects' },
  { key: 'cockpit', label: 'Enter the cockpit', hint: 'About · Skills · Resume · Contact' },
  { key: 'simple', label: 'Simple view', hint: 'Everything on one page' },
]

function HomeMenu() {
  const mode = useApp((s) => s.mode)
  const busy = useApp((s) => s.busy)
  const simple = useApp((s) => s.simple)
  const show = mode === 'home' && !busy && !simple
  const go = (key: (typeof MENU)[number]['key']) => (e: MouseEvent) => {
    if (key === 'launch') director.launch(e.altKey || e.shiftKey)
    else if (key === 'cockpit') director.openCockpit(useApp.getState().tab)
    else director.setSimple(true)
  }
  return (
    <nav className={`menu${show ? ' is-on' : ''}`} aria-label="Destinations" aria-hidden={!show}>
      <ul>
        {MENU.map((m, i) => (
          <li key={m.key} style={{ ['--i' as string]: i }}>
            <button type="button" className={`menu__item${m.key === 'launch' ? ' menu__item--primary' : ''}`} data-key={m.key} onClick={go(m.key)} tabIndex={show ? 0 : -1}>
              <span className="menu__tick" aria-hidden="true" />
              <span className="menu__label">{m.label}</span>
              <span className="menu__hint">{m.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Skip() {
  const skippable = useApp((s) => s.skippable)
  const busy = useApp((s) => s.busy)
  const mode = useApp((s) => s.mode)
  const simple = useApp((s) => s.simple)
  const show = busy && skippable && !simple && (mode === 'intro' || mode === 'launch')
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        director.skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])
  return (
    <button type="button" className={`skip${show ? ' is-on' : ''}`} onClick={() => director.skip()} tabIndex={show ? 0 : -1} aria-hidden={!show}>
      Skip
    </button>
  )
}

function Toast() {
  const toast = useApp((s) => s.toast)
  return (
    <div className={`toast${toast ? ' is-on' : ''}`} role="status" aria-live="polite">
      {toast}
    </div>
  )
}

function DraftBadge() {
  const draft = useApp((s) => s.draftPreview)
  if (!draft) return null
  return <div className="draft-badge">Previewing a local draft — not the published content</div>
}

const real = (t: string) => !/^placeholder/i.test(t.trim())

/** Hidden on screen. When the visitor prints (Resume → Print / save as PDF) this is the page they get. */
function PrintResume() {
  const c = useApp((s) => s.content)
  if (!c) return null
  const projects = c.projects.filter((p) => !p.placeholder)
  return (
    <article className="print-resume" aria-hidden="true">
      <h1>{c.profile.name}</h1>
      <p className="pr-role">{c.profile.role}</p>
      <p className="pr-contact">{[c.contact.email, ...c.contact.links.map((l) => l.url)].filter(Boolean).join('  ·  ')}</p>
      {c.resume.summary && <p>{c.resume.summary}</p>}
      {c.education.length > 0 && <h2>Education</h2>}
      {c.education.map((e) => (
        <section key={e.id}>
          <h3>
            {e.school}
            {[e.start, e.end].filter(Boolean).length > 0 && <span>{[e.start, e.end].filter(Boolean).join(' – ')}</span>}
          </h3>
          <p>{e.degree}</p>
          {e.details.filter(real).map((x) => (
            <p key={x}>{x}</p>
          ))}
        </section>
      ))}
      {c.experience.length > 0 && <h2>Experience</h2>}
      {c.experience.map((e) => (
        <section key={e.id}>
          <h3>
            {e.title} — {e.org}
            {[e.start, e.end].filter(Boolean).length > 0 && <span>{[e.start, e.end].filter(Boolean).join(' – ')}</span>}
          </h3>
          {e.summary && <p>{e.summary}</p>}
          <ul>
            {e.highlights.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ))}
      {projects.length > 0 && <h2>Projects</h2>}
      {projects.map((p) => (
        <section key={p.id}>
          <h3>
            {p.title}
            {p.year && <span>{p.year}</span>}
          </h3>
          <p>{p.summary}</p>
          {p.links[0] && <p>{p.links[0].url}</p>}
        </section>
      ))}
      {c.skills.length > 0 && <h2>Skills</h2>}
      {c.skills.map((g) => (
        <p key={g.id}>
          <strong>{g.group}:</strong> {g.items.join(', ')}
        </p>
      ))}
    </article>
  )
}

export function Chrome() {
  if (qa.bare) return <div id="veil" className="veil" />
  return (
    <div className="chrome">
      <div id="veil" className="veil" />
      <Identity />
      <HomeMenu />
      <Console />
      <OrbitHud />
      <ProjectPanel />
      <Skip />
      <Toast />
      <DraftBadge />
      <PrintResume />
      <Loader />
      <SimpleView />
    </div>
  )
}

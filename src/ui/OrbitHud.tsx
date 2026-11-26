import { useEffect, useRef } from 'react'
import { useScrollCue } from './useScrollCue'
import { useApp } from '../state/store'
import { director } from '../state/director'
import { registerLabel, remeasureLabels, unregisterLabel } from './labels'
import type { Project } from '../content/schema'
import { PLANET_LOOKS } from '../world/planetMaterial'

function Label({ id, title, sub, featured, badge, onPick }: { id: string; title: string; sub?: string; featured: boolean; badge: string; onPick: () => void }) {
  const el = useRef<HTMLButtonElement>(null)
  const line = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (el.current && line.current) registerLabel(id, el.current, line.current, featured)
    return () => unregisterLabel(id)
  }, [id, featured, title, sub])
  const hover = (on: boolean) => () => useApp.getState().set({ hoverId: on ? id : useApp.getState().hoverId === id ? null : useApp.getState().hoverId })
  return (
    <>
      <span ref={line} className="plabel__line" aria-hidden="true" />
      <button ref={el} type="button" className="plabel" data-id={id} aria-label={title} onClick={onPick} onPointerEnter={hover(true)} onPointerLeave={hover(false)} onFocus={hover(true)} onBlur={hover(false)}>
        <span className="plabel__num" aria-hidden="true">
          {badge}
        </span>
        <span className="plabel__title">{title}</span>
        {sub && <span className="plabel__sub">{sub}</span>}
      </button>
    </>
  )
}

const subline = (p: Project) => (p.placeholder ? 'Placeholder' : p.category)
const swatch = (p: Project) => (/^#[0-9a-fA-F]{6}$/.test(p.planet.palette[0] ?? '') ? p.planet.palette[0] : PLANET_LOOKS[p.planet.type].palette[0])
const setHover = (id: string | null) => useApp.getState().set({ hoverId: id })

/** System view chrome: anchored planet labels (the home planet's is the way back) and one line of hints. Flight mode banner lives here too. */
export function OrbitHud() {
  const mode = useApp((s) => s.mode)
  const busy = useApp((s) => s.busy)
  const projects = useApp((s) => s.content?.projects)
  const altUnlocked = useApp((s) => s.altShipUnlocked)
  const altActive = useApp((s) => s.altShipActive)
  const stationFound = useApp((s) => s.stationFound)
  const flightUnlocked = useApp((s) => s.flightUnlocked)
  const hoverId = useApp((s) => s.hoverId)
  const orbit = mode === 'orbit' && !busy
  const flight = mode === 'flight'
  const list = useRef<HTMLUListElement>(null)
  useScrollCue(list, [projects?.length, orbit])

  useEffect(() => {
    const on = () => remeasureLabels()
    window.addEventListener('resize', on)
    document.fonts?.ready.then(on).catch(() => undefined)
    return () => window.removeEventListener('resize', on)
  }, [])

  if (!projects) return null
  return (
    <>
      <div className={`labels${orbit || flight ? ' is-on' : ''}`} aria-hidden={!orbit}>
        {projects.map((p, i) => (
          <Label key={p.id} id={p.id} title={p.title} sub={subline(p)} featured={p.featured} badge={String(i + 1)} onPick={() => director.focusProject(p.id)} />
        ))}
        <Label id="__home" title="Home" sub="Return to the surface" featured={false} badge="Home" onPick={() => director.returnHome()} />
      </div>
      <p className={`hint${orbit ? ' is-on' : ''}`}>
        Select a planet to view its project <i aria-hidden="true">·</i> Select the home planet to land
      </p>
      {/* On narrow screens every project stays one tap away even when its label has no room in the scene. */}
      <nav className={`pindex${orbit ? ' is-on' : ''}`} aria-label="Projects" aria-hidden={!orbit}>
        <p className="pindex__head">
          Projects <span>{projects.length}</span>
          <em>Tap Home on the map to land</em>
        </p>
        <ul ref={list}>
          {projects.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className={hoverId === p.id ? 'is-hot' : undefined}
                tabIndex={orbit ? 0 : -1}
                onClick={() => {
                  setHover(p.id)
                  window.setTimeout(() => director.focusProject(p.id), 260)
                }}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover(null)}
              >
                <b style={{ borderColor: swatch(p) }} aria-hidden="true">
                  {i + 1}
                </b>
                <span>{p.title}</span>
                <em>{subline(p)}</em>
              </button>
            </li>
          ))}
        </ul>
        <p className="pindex__more" aria-hidden="true">
          Scroll for more ↓
        </p>
      </nav>
      {orbit && flightUnlocked && (
        <button type="button" className="flightbtn is-on" onClick={() => director.enterFlight()}>
          Flight mode
        </button>
      )}
      <div className={`flighthud${flight ? ' is-on' : ''}`} aria-hidden={!flight}>
        <span className="flighthud__title">Flight mode</span>
        <span className="flighthud__keys flighthud__keys--pointer">Hold the mouse to fly · WASD · Shift to boost</span>
        <span className="flighthud__keys flighthud__keys--touch">Touch and hold to fly towards your finger</span>
        {altUnlocked && (
          <button type="button" className="btn" tabIndex={flight ? 0 : -1} onClick={() => useApp.getState().set({ altShipActive: !altActive })}>
            {altActive ? 'Fly the scout' : 'Fly the freighter'}
          </button>
        )}
        {stationFound && !altUnlocked && <span className="flighthud__keys">Fly up to the station</span>}
        <button type="button" className="btn" tabIndex={flight ? 0 : -1} onClick={() => director.exitFlight()}>
          Exit
        </button>
      </div>
    </>
  )
}

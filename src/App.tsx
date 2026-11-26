import { useEffect, useRef } from 'react'
import { World } from './world/World'
import { Chrome } from './ui/Chrome'
import { useApp, app } from './state/store'
import { loadPortfolio } from './content/load'
import { activeTimeline, director } from './state/director'
import { useKeys } from './state/useKeys'
import { qa } from './qa/params'
import { fx, rig } from './world/rig'
import { systemRefs } from './world/orbits'
import { screenDiscs } from './ui/labels'
import { flightState } from './world/FlightSet'

// Test handle for automated QA (dev server and ?view= test states only; never a privileged API).
if (import.meta.env.DEV || import.meta.env.VITE_QA === '1' || qa.view !== null) {
  ;(window as unknown as Record<string, unknown>).__portfolio = { app: useApp, director, fx, rig, systemRefs, screenDiscs, timeline: activeTimeline, flight: flightState }
}

export function App() {
  const content = useApp((s) => s.content)
  const sceneReady = useApp((s) => s.sceneReady)
  const booted = useRef(false)
  useKeys()

  useEffect(() => {
    let alive = true
    loadPortfolio()
      .then(({ data, draft }) => {
        if (!alive) return
        document.title = data.site.title || document.title
        app().set({ content: data, draftPreview: draft, gridOn: data.site.settings.grid.enabled })
      })
      .catch((e: unknown) => alive && app().set({ contentError: e instanceof Error ? e.message : 'Could not load content' }))
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => app().set({ reducedMotion: mq.matches })
    mq.addEventListener('change', onMq)
    // the plain page follows the address bar, so Back closes it and Forward reopens it
    const onAddress = () => director.setSimple(window.location.hash === '#simple')
    window.addEventListener('popstate', onAddress)
    window.addEventListener('hashchange', onAddress)
    return () => {
      alive = false
      mq.removeEventListener('change', onMq)
      window.removeEventListener('popstate', onAddress)
      window.removeEventListener('hashchange', onAddress)
    }
  }, [])

  useEffect(() => {
    if (!content || !sceneReady || booted.current) return
    booted.current = true
    // let the first frames (shader compile, shadow map) land before the opening starts
    const id = window.setTimeout(() => director.boot(), qa.view ? 0 : 250)
    return () => window.clearTimeout(id)
  }, [content, sceneReady])

  return (
    <>
      {content && <World />}
      <Chrome />
    </>
  )
}

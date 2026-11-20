import { useEffect } from 'react'
import { app } from './store'
import { director } from './director'

const FLIGHT_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const ADMIN_WORD = 'admin'

const typingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Global keys: Escape steps back; the rest are the hidden shortcuts carried over from the first version. */
export function useKeys() {
  useEffect(() => {
    let word = ''
    let seq: string[] = []
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e.target)) return
      const st = app()
      if (e.key === 'Escape') {
        director.back()
        return
      }
      // Shift+G: schematic grid
      if (e.shiftKey && e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        director.toggleGrid()
        st.showToast(app().gridOn ? 'Schematic grid on' : 'Schematic grid off', 1600)
        return
      }
      // typing "admin" opens the content studio
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        word = (word + e.key.toLowerCase()).slice(-ADMIN_WORD.length)
        if (word === ADMIN_WORD) {
          window.location.href = new URL('admin/', document.baseURI).toString()
          return
        }
      }
      // up up down down left right: flight mode (system view only, one-time unlock)
      if (st.mode === 'orbit' && !st.busy) {
        seq = [...seq, e.key].slice(-FLIGHT_CODE.length)
        if (seq.length === FLIGHT_CODE.length && seq.every((k, i) => k === FLIGHT_CODE[i])) {
          seq = []
          e.preventDefault()
          st.set({ flightUnlocked: true })
          director.enterFlight()
          st.showToast('Flight mode — steer with the mouse or WASD. Esc to leave.', 4200)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

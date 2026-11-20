import { useEffect, useRef } from 'react'
import useStore from '../store/useStore'

const ADMIN_SEQUENCE  = ['a', 'd', 'm', 'i', 'n']
const FLIGHT_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

export function useKeyBindings() {
  const setAdminOpen          = useStore((s) => s.setAdminOpen)
  const adminOpen             = useStore((s) => s.adminOpen)
  const flightModeUnlocked    = useStore((s) => s.flightModeUnlocked)
  const setFlightModeUnlocked = useStore((s) => s.setFlightModeUnlocked)
  const setHudPrompt          = useStore((s) => s.setHudPrompt)
  const toggleVisualMode      = useStore((s) => s.toggleVisualMode)

  const adminBuf  = useRef([])
  const flightBuf = useRef([])

  useEffect(() => {
    function onKeyDown(e) {
      // ── Admin sequence: type "admin" ──────────────────────────────────────
      adminBuf.current.push(e.key.toLowerCase())
      if (adminBuf.current.length > ADMIN_SEQUENCE.length) adminBuf.current.shift()
      if (adminBuf.current.join('') === ADMIN_SEQUENCE.join('')) {
        setAdminOpen(!adminOpen)
        adminBuf.current = []
        return
      }

      // ── Flight mode: ↑↑↓↓←→ (only if not already unlocked) ─────────────
      if (!flightModeUnlocked) {
        flightBuf.current.push(e.key)
        if (flightBuf.current.length > FLIGHT_SEQUENCE.length) flightBuf.current.shift()
        if (JSON.stringify(flightBuf.current) === JSON.stringify(FLIGHT_SEQUENCE)) {
          setFlightModeUnlocked(true)
          setHudPrompt('// FLIGHT MODE UNLOCKED — Navigate to system edge')
          flightBuf.current = []
          return
        }
      }

      // ── Schematic toggle: Shift + G ──────────────────────────────────────
      if (e.shiftKey && e.key === 'G') {
        toggleVisualMode()
        return
      }

      // ── Escape: close admin ──────────────────────────────────────────────
      if (e.key === 'Escape' && adminOpen) {
        setAdminOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adminOpen, flightModeUnlocked, setAdminOpen, setFlightModeUnlocked, setHudPrompt, toggleVisualMode])
}

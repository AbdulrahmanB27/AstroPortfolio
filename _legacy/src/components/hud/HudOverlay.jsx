import { useEffect, useRef } from 'react'
import useStore, { STAGE, VISUAL_MODE } from '../../store/useStore'
import styles from './HudOverlay.module.css'

// Prompts that should auto-fade after display (transient messages during transitions)
const TRANSIENT_PROMPTS = [
  'Ignition sequence initiated...',
  'Engine ignition confirmed...',
  'Ascending...',
  'Leaving atmosphere...',
  'Entering orbit...',
  'Orbit established. Click celestial bodies to explore.',
  'Orbit established. Navigation ready.',
  'Returning to orbit...',
  'Entering system core...',
  'AB-01 // System Scan in Progress...',
  'Orbit established. Surface approach initiated.',
]

export default function HudOverlay() {
  const stage = useStore((s) => s.stage)
  const hudPrompt = useStore((s) => s.hudPrompt)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const visualMode = useStore((s) => s.visualMode)
  const schematic = visualMode === VISUAL_MODE.SCHEMATIC
  const viewMode = useStore((s) => s.viewMode)
  const isSimplified = viewMode === 'simplified'

  const clearTimerRef = useRef(null)

  // Auto-fade transient prompts after 3.5 s
  useEffect(() => {
    clearTimeout(clearTimerRef.current)
    if (!hudPrompt) return

    const isTransient = TRANSIENT_PROMPTS.some((t) => hudPrompt.includes(t.substring(0, 20)))
    if (isTransient) {
      clearTimerRef.current = setTimeout(() => {
        setHudPrompt('')
      }, 3500)
    }

    return () => clearTimeout(clearTimerRef.current)
  }, [hudPrompt, setHudPrompt])

  const stageLabel = {
    [STAGE.PROLOGUE]: 'SCAN // INITIALIZING',
    [STAGE.SURFACE]: 'SURFACE // LOC-01',
    [STAGE.LIFTOFF]: 'ASCENT // IN PROGRESS',
    [STAGE.COCKPIT]: 'COCKPIT // MISSION CONSOLE',
    [STAGE.ORBIT]: 'ORBIT // ACTIVE',
    [STAGE.STAR_CORE]: 'CORE // PERSONAL DATA',
    [STAGE.PLANET]: 'APPROACH // PROJECT DETAIL',
  }[stage] || ''

  const atmosphereFlash = useStore((s) => s.atmosphereFlash)

  if (isSimplified) return null

  return (
    <div className={`${styles.hud} ${schematic ? styles.schematic : ''}`}>
      {/* Atmosphere Flash overlay */}
      <div className={`${styles.atmosphereFlash} ${atmosphereFlash ? styles.active : ''}`} />

      {/* Top-left: Stage indicator */}
      <div className={styles.topLeft}>
        <span className={styles.label}>SYS</span>
        <span className={styles.value}>{stageLabel}</span>
      </div>

      {/* Bottom-left: Prompt text with fade */}
      <div className={styles.bottomLeft}>
        <div
          className={styles.prompt}
          style={{
            opacity: hudPrompt ? 1 : 0,
            transition: hudPrompt ? 'opacity 0.3s ease' : 'opacity 0.6s ease',
          }}
        >
          {hudPrompt && (
            <>
              <span className={styles.cursor}>▸</span>
              <span>{hudPrompt}</span>
            </>
          )}
        </div>
      </div>

      {/* Bottom-right: UTC clock */}
      <div className={styles.bottomRight}>
        <HudClock />
      </div>

      {/* Decorative corner brackets */}
      <div className={`${styles.corner} ${styles.cornerTL}`} />
      <div className={`${styles.corner} ${styles.cornerTR}`} />
      <div className={`${styles.corner} ${styles.cornerBL}`} />
      <div className={`${styles.corner} ${styles.cornerBR}`} />
    </div>
  )
}

function HudClock() {
  const ref = useRef()
  useEffect(() => {
    const tick = () => {
      if (!ref.current) return
      const now = new Date()
      const h = String(now.getUTCHours()).padStart(2, '0')
      const m = String(now.getUTCMinutes()).padStart(2, '0')
      const s = String(now.getUTCSeconds()).padStart(2, '0')
      ref.current.textContent = `UTC ${h}:${m}:${s}`
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      fontFamily: 'Space Mono, monospace',
      fontSize: '0.6rem',
      color: 'rgba(144,202,249,0.6)',
      letterSpacing: '0.1em',
    }} ref={ref} />
  )
}

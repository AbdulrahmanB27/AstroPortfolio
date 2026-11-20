import useStore from '../../store/useStore'

export default function FlightModeLayer() {
  const flightModeUnlocked = useStore((s) => s.flightModeUnlocked)

  if (!flightModeUnlocked) return null

  return (
    <>
      {/* Flight mode indicator */}
      <div style={{
        position: 'fixed',
        top: '50px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.6rem',
        color: 'rgba(79,195,247,0.7)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        zIndex: 20,
      }}>
        // FLIGHT MODE ACTIVE — Use WASD to navigate
        <br />
        <span
          style={{ fontSize: '0.45rem', opacity: 0.6, cursor: 'pointer', pointerEvents: 'auto' }}
          onClick={() => useStore.getState().setFlightModeUnlocked(false)}
        >
          [ESC] or Click to Exit
        </span>
      </div>
    </>
  )
}

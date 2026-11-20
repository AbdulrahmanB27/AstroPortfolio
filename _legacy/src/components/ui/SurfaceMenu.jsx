import { useState, useEffect, useRef } from 'react'
import useStore, { STAGE } from '../../store/useStore'

const MENU_ITEMS = [
  { label: 'About', target: 'about', section: 'about' },
  { label: 'Projects', target: 'orbit', section: null },
  { label: 'Skills', target: 'star', section: 'skills' },
  { label: 'Resume', target: 'star', section: 'resume' },
  { label: 'Contact', target: 'star', section: 'contact' },
]

export default function SurfaceMenu({ fading = false }) {
  const setStage = useStore((s) => s.setStage)
  const setPendingNavTarget = useStore((s) => s.setPendingNavTarget)
  const setActiveStarSection = useStore((s) => s.setActiveStarSection)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const setAltLaunchTriggered = useStore((s) => s.setAltLaunchTriggered)
  const setHoveredMenuItem = useStore((s) => s.setHoveredMenuItem)
  const altHeldRef = useRef(false)

  const setOpeningSequenceComplete = useStore((s) => s.setOpeningSequenceComplete)
  const openingSequenceComplete = useStore((s) => s.openingSequenceComplete)

  // Component only mounts when openingSequenceComplete is true (see App.jsx),
  // so we just need a short delay for the CSS entrance transition to kick in.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 150)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    function onKeyDown(e) { if (e.altKey) altHeldRef.current = true }
    function onKeyUp(e) { if (!e.altKey) altHeldRef.current = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  function handleSelect(item) {
    if (item.target === 'about') {
      setStage(STAGE.COCKPIT)
      return
    }
    if (item.section) setActiveStarSection(item.section)
    setPendingNavTarget(item.target)
    setHudPrompt('Ignition sequence initiated...')
    if (altHeldRef.current) {
      setAltLaunchTriggered(true)
    }
    setStage(STAGE.LIFTOFF)
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          right: '6vw',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '0px',
          zIndex: 20,
          opacity: fading ? 0 : 1,
          transition: fading ? 'opacity 0.8s ease' : 'none',
          pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* Title block */}
      <div style={{
        marginBottom: '24px',
        textAlign: 'right',
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{
          fontFamily: 'Space Mono, monospace',
          fontSize: '0.5rem',
          color: 'rgba(255,213,79,0.5)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: '6px',
        }}>
          Abdulrahman Bahjat
        </div>
        <div style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          lineHeight: 1.3,
          textShadow: '0 0 20px rgba(255,213,79,0.3)',
        }}>
          Mechanical Engineer
          <br />
          <span style={{ color: 'rgba(255,213,79,0.9)', textShadow: '0 0 30px rgba(255,213,79,0.5)' }}>&amp; Systems Developer</span>
        </div>
      </div>

      {/* SVG orbital guide lines connecting items to a hub point */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {/* Central hub connector dot */}
        <circle
          cx="-30"
          cy="50%"
          r="2"
          fill="rgba(255,213,79,0.3)"
          style={{
            opacity: entered ? 1 : 0,
            transition: 'opacity 1.5s ease 0.5s',
          }}
        />
      </svg>

      {/* Menu items with orbital dots and guide lines */}
      {MENU_ITEMS.map((item, i) => (
        <OrbitalMenuItem
          key={item.label}
          item={item}
          onSelect={handleSelect}
          entered={entered}
          index={i}
          setStoreHover={setHoveredMenuItem}
        />
      ))}

      {/* Footer */}
      <div style={{
        marginTop: '16px',
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.45rem',
        color: 'rgba(255,213,79,0.25)',
        letterSpacing: '0.15em',
        textAlign: 'right',
        opacity: entered ? 1 : 0,
        transition: `opacity 0.6s ease ${0.5 + MENU_ITEMS.length * 0.12}s`,
      }}>
        ◦ SELECT DESTINATION ◦
      </div>
      </div>

      {/* Skip button visible only during the opening sequence */}
      {!openingSequenceComplete && !fading && (
        <button
          onClick={() => setOpeningSequenceComplete(true)}
          style={{
            position: 'fixed',
            bottom: '40px',
            right: '6vw',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 213, 79, 0.3)',
            color: 'rgba(255, 255, 255, 0.6)',
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '0.8rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '8px 16px',
            cursor: 'pointer',
            borderRadius: '4px',
            transition: 'all 0.3s ease',
            zIndex: 30,
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 213, 79, 0.1)'
            e.target.style.color = '#FFFDE7'
            e.target.style.borderColor = 'rgba(255, 213, 79, 0.8)'
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.05)'
            e.target.style.color = 'rgba(255, 255, 255, 0.6)'
            e.target.style.borderColor = 'rgba(255, 213, 79, 0.3)'
          }}
        >
          Skip Intro ⇥
        </button>
      )}
    </>
  )
}

function OrbitalMenuItem({ item, onSelect, entered, index, setStoreHover }) {
  const [hovered, setHovered] = useState(false)
  const delay = 0.3 + index * 0.12

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateX(0)' : 'translateX(30px)',
        transition: `opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}s, transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}s`,
      }}
    >
      {/* Orbital guide line — sweeping connection to sun */}
      <svg
        width="80"
        height="40"
        viewBox="0 0 80 40"
        style={{
          overflow: 'visible',
          opacity: entered ? (hovered ? 0.9 : 0.4) : 0,
          transition: 'opacity 0.4s ease',
        }}
      >
        {/* Sweeping guide curve */}
        <path
          d={`M -20 -10 Q 30 ${15 + index * 2} 75 20`}
          stroke={hovered ? 'rgba(255,213,79,0.9)' : 'rgba(255,213,79,0.35)'}
          strokeWidth={hovered ? '1.5' : '1.0'}
          fill="none"
          strokeDasharray={hovered ? 'none' : '4 4'}
          style={{ transition: 'all 0.4s ease' }}
        />
        {/* Dot at terminal */}
        <circle
          cx="75"
          cy="20"
          r={hovered ? '4' : '2.5'}
          fill={hovered ? 'rgba(255,213,79,1.0)' : 'rgba(255,213,79,0.5)'}
          style={{ transition: 'all 0.4s ease' }}
        />
        {/* Expansion ring */}
        <circle
          cx="75"
          cy="20"
          r={hovered ? '8' : '5'}
          stroke={hovered ? 'rgba(255,213,79,0.6)' : 'rgba(255,213,79,0.15)'}
          strokeWidth="1"
          fill="none"
          style={{ transition: 'all 0.4s ease' }}
        />
      </svg>

      {/* Menu button — thick futuristic glowing text */}
      <button
        onClick={() => onSelect(item)}
        onMouseEnter={() => { setHovered(true); setStoreHover?.(true) }}
        onMouseLeave={() => { setHovered(false); setStoreHover?.(false) }}
        style={{
          background: 'transparent',
          border: 'none',
          color: hovered ? '#FFFDE7' : 'rgba(255,255,255,0.7)',
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '1.2rem',
          fontWeight: hovered ? 600 : 400,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          padding: '12px 0 12px 16px',
          cursor: 'pointer',
          textAlign: 'left',
          textShadow: hovered
            ? '0 0 15px rgba(255,213,79,0.8), 0 0 40px rgba(255,213,79,0.5), 0 0 80px rgba(255,213,79,0.2)'
            : '0 0 10px rgba(255,213,79,0.15)',
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          transform: hovered ? 'translateX(8px) scale(1.05)' : 'none',
          position: 'relative',
        }}
      >
        {item.label}
        {/* Subtle geometric underline that expands on hover */}
        <span style={{
          position: 'absolute',
          bottom: '8px',
          left: '16px',
          right: '0',
          height: hovered ? '2px' : '1px',
          background: hovered
            ? 'linear-gradient(90deg, rgba(255,213,79,0.9), rgba(255,213,79,0))'
            : 'linear-gradient(90deg, rgba(255,213,79,0.3), rgba(255,213,79,0))',
          boxShadow: hovered ? '0 0 10px rgba(255,213,79,0.6)' : 'none',
          transition: 'all 0.4s ease',
          transformOrigin: 'left',
          transform: hovered ? 'scaleX(1.1)' : 'scaleX(0.8)',
        }} />
      </button>
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import useStore, { STAGE } from '../store/useStore'
import IntroScene from './IntroScene'

const SURFACE_CAMERA_POS = new THREE.Vector3(-4, 2.2, 2.5)
const SURFACE_LOOK_TARGET = new THREE.Vector3(4, 1.5, -30)
const COCKPIT_POSITION = [8, 1.45, -14]
const HATCH_OPEN_ANGLE = -1.15

/* ── Screen zoom targets (cockpit-local coordinates) ─────────────────── */
const SCREEN_ZOOM = {
  profile: {
    cam: [0, 0.98, -0.62],
    look: [0, 0.93, -1.09],
    label: 'MISSION PROFILE',
  },
  skills: {
    cam: [-0.6, 0.98, -0.61],
    look: [-0.82, 0.93, -1.09],
    label: 'SYSTEMS CAPABILITY',
  },
  resume: {
    cam: [0.6, 0.98, -0.61],
    look: [0.82, 0.93, -1.09],
    label: 'MISSION RECORD',
  },
  comms: {
    cam: [0, 0.62, -0.12],
    look: [0, 0.56, -0.46],
    label: 'COMMUNICATIONS RELAY',
  },
}

function localToWorld([x, y, z]) {
  return [x + COCKPIT_POSITION[0], y + COCKPIT_POSITION[1], z + COCKPIT_POSITION[2]]
}

function playMechanicalTone(pitch = 1) {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  try {
    const audio = new AudioContextClass()
    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(140 * pitch, audio.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60 * pitch, audio.currentTime + 0.32)

    gain.gain.setValueAtTime(0.0001, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.02, audio.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.34)

    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.35)
    osc.onended = () => {
      audio.close().catch(() => {})
    }
  } catch {
    // Audio can fail in restricted autoplay contexts.
  }
}

import { ProfileScreen, SkillsScreen, ResumeScreen, CommsScreen, ExitButton } from '../components/ui/CockpitScreens'

/* ── Screen bezel frame ──────────────────────────────────────────────── */
function ScreenBezel({ width, height, position, rotation, highlighted }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[width + 0.06, height + 0.06, 0.025]} />
      <meshStandardMaterial
        color="#1A2230"
        roughness={0.35}
        metalness={0.5}
        emissive="#4FC3F7"
        emissiveIntensity={highlighted ? 0.22 : 0.06}
      />
    </mesh>
  )
}

/* ── Interactive screen wrapper (hover tooltip + click) ──────────────── */
const tooltipStyle = {
  position: 'absolute',
  top: '-52px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(6,8,16,0.95)',
  border: '1px solid rgba(79,195,247,0.7)',
  padding: '8px 20px',
  fontFamily: 'Space Mono, monospace',
  fontSize: '1.1rem',
  fontWeight: 600,
  color: '#4FC3F7',
  boxShadow: '0 0 24px rgba(79,195,247,0.25)',
  letterSpacing: '0.14em',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 10,
}

function InteractiveScreen({ name, label, focusedScreen, hoveredScreen, onHover, onClick, children }) {
  const isFocused = focusedScreen === name
  const isHovered = hoveredScreen === name

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onClick(name)
      }}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: 'relative',
        cursor: isFocused ? 'default' : 'pointer',
      }}
    >
      {/* Hover tooltip — only when not zoomed into any screen */}
      {isHovered && !focusedScreen && (
        <div style={tooltipStyle}>{label}</div>
      )}
      {/* Screen content — interactive only when zoomed in */}
      <div style={{ pointerEvents: isFocused ? 'auto' : 'none' }}>
        {children}
      </div>
    </div>
  )
}

/* ── Reusable panel material colors ──────────────────────────────────── */
const MAT = {
  dash: '#1A2030',
  frame: '#2A3545',
  panel: '#161C28',
  wall: '#151C28',
  floor: '#0E1320',
  ceiling: '#1A2030',
  seat: '#1A1D23',
  accent: '#4FC3F7',
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  CockpitInterior — realistic spacecraft cockpit layout                */
/* ═══════════════════════════════════════════════════════════════════════ */
function CockpitInterior({
  hatchRef,
  cabinKeyRef,
  cabinFillRef,
  consoleGlowRef,
  stripGlowRef,
  starPulseRef,
  hatchWaypointRef,
  hatchLookRef,
  insideWaypointRef,
  consoleLookRef,
  consoleActive,
  onExit,
  focusedScreen,
  hoveredScreen,
  onScreenClick,
  onScreenHover,
}) {
  return (
    <group position={COCKPIT_POSITION}>

      {/* ── Hatch (entry behind pilot) ─────────────────────────────── */}
      <group ref={hatchRef} position={[0.9, 1.1, 1.8]}>
        <mesh castShadow>
          <boxGeometry args={[0.7, 1.5, 0.04]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.4} />
        </mesh>
      </group>

      {/* ── Cockpit Shell ─────────────────────────────────────────── */}

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.8, 3.8]} />
        <meshStandardMaterial color={MAT.floor} roughness={0.85} metalness={0.2} />
      </mesh>

      {/* Floor grid lines */}
      <group position={[0, 0.002, 0]}>
        {[-0.8, 0, 0.8].map((x, i) => (
          <mesh key={`gx${i}`} position={[x, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.006, 3.8]} />
            <meshBasicMaterial color={MAT.accent} transparent opacity={0.08} />
          </mesh>
        ))}
      </group>

      {/* Ceiling */}
      <mesh position={[0, 2.2, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 3.5]} />
        <meshStandardMaterial color={MAT.ceiling} roughness={0.7} metalness={0.15} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-1.4, 1.1, -0.3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.8, 2.2]} />
        <meshStandardMaterial color={MAT.wall} roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Right wall */}
      <mesh position={[1.4, 1.1, -0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.8, 2.2]} />
        <meshStandardMaterial color={MAT.wall} roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Back wall (behind pilot) */}
      <mesh position={[0, 1.1, 1.9]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2.8, 2.2]} />
        <meshStandardMaterial color="#131920" roughness={0.75} metalness={0.2} />
      </mesh>

      {/* ── Main Instrument Panel (Dashboard) ─────────────────────── */}
      <group position={[0, 0.85, -1.05]} rotation={[-0.12, 0, 0]}>

        {/* Center dashboard panel */}
        <mesh>
          <boxGeometry args={[2.4, 1.25, 0.06]} />
          <meshStandardMaterial color={MAT.dash} roughness={0.5} metalness={0.35} />
        </mesh>

        {/* Left wing panel (angled inward) */}
        <mesh position={[-1.45, 0, 0.22]} rotation={[0, 0.32, 0]}>
          <boxGeometry args={[0.7, 1.25, 0.06]} />
          <meshStandardMaterial color={MAT.dash} roughness={0.5} metalness={0.35} />
        </mesh>

        {/* Right wing panel (angled inward) */}
        <mesh position={[1.45, 0, 0.22]} rotation={[0, -0.32, 0]}>
          <boxGeometry args={[0.7, 1.25, 0.06]} />
          <meshStandardMaterial color={MAT.dash} roughness={0.5} metalness={0.35} />
        </mesh>

        {/* Glare shield (coaming) — top of dashboard */}
        <mesh position={[0, 0.67, -0.06]}>
          <boxGeometry args={[2.6, 0.06, 0.18]} />
          <meshStandardMaterial color="#0D1018" roughness={0.6} metalness={0.3} />
        </mesh>

        {/* Lower dashboard lip */}
        <mesh position={[0, -0.64, 0.02]}>
          <boxGeometry args={[2.42, 0.04, 0.1]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.4} metalness={0.5} />
        </mesh>

        {/* Dashboard edge glow strip */}
        <mesh position={[0, -0.64, -0.04]}>
          <boxGeometry args={[2.42, 0.012, 0.005]} />
          <meshBasicMaterial color={MAT.accent} transparent opacity={0.45} />
        </mesh>

        {/* ── SCREENS on instrument panel ─────────────────── */}

        {/* PROFILE — Main MFD (center) */}
        {consoleActive && (
          <>
            <ScreenBezel
              width={1.15} height={0.65}
              position={[0, 0.08, -0.035]}
              highlighted={hoveredScreen === 'profile' || focusedScreen === 'profile'}
            />
            <Html
              transform
              position={[0, 0.08, -0.045]}
              scale={0.65}
              distanceFactor={0.85}
              zIndexRange={[100, 0]}
            >
              <InteractiveScreen
                name="profile"
                label={SCREEN_ZOOM.profile.label}
                focusedScreen={focusedScreen}
                hoveredScreen={hoveredScreen}
                onHover={onScreenHover}
                onClick={onScreenClick}
              >
                <ProfileScreen />
              </InteractiveScreen>
            </Html>
          </>
        )}

        {/* SKILLS — Left MFD */}
        {consoleActive && (
          <>
            <ScreenBezel
              width={0.82} height={0.58}
              position={[-0.82, 0.08, -0.035]}
              highlighted={hoveredScreen === 'skills' || focusedScreen === 'skills'}
            />
            <Html
              transform
              position={[-0.82, 0.08, -0.045]}
              scale={0.48}
              distanceFactor={0.85}
              zIndexRange={[100, 0]}
            >
              <InteractiveScreen
                name="skills"
                label={SCREEN_ZOOM.skills.label}
                focusedScreen={focusedScreen}
                hoveredScreen={hoveredScreen}
                onHover={onScreenHover}
                onClick={onScreenClick}
              >
                <SkillsScreen />
              </InteractiveScreen>
            </Html>
          </>
        )}

        {/* RESUME — Right MFD */}
        {consoleActive && (
          <>
            <ScreenBezel
              width={0.82} height={0.58}
              position={[0.82, 0.08, -0.035]}
              highlighted={hoveredScreen === 'resume' || focusedScreen === 'resume'}
            />
            <Html
              transform
              position={[0.82, 0.08, -0.045]}
              scale={0.48}
              distanceFactor={0.85}
              zIndexRange={[100, 0]}
            >
              <InteractiveScreen
                name="resume"
                label={SCREEN_ZOOM.resume.label}
                focusedScreen={focusedScreen}
                hoveredScreen={hoveredScreen}
                onHover={onScreenHover}
                onClick={onScreenClick}
              >
                <ResumeScreen />
              </InteractiveScreen>
            </Html>
          </>
        )}

        {/* ── Instrument gauge clusters (decorative) ──── */}
        {[-0.9, -0.55, -0.2, 0.2, 0.55, 0.9].map((x, i) => (
          <mesh key={`gauge${i}`} position={[x, -0.42, -0.035]}>
            <boxGeometry args={[0.22, 0.16, 0.02]} />
            <meshStandardMaterial color="#111822" roughness={0.5} metalness={0.4} emissive="#4FC3F7" emissiveIntensity={0.02} />
          </mesh>
        ))}

        {/* Status LEDs across dashboard */}
        {[
          { x: -1.05, color: '#66BB6A' },
          { x: -0.95, color: '#66BB6A' },
          { x: 0.95, color: '#FFA726' },
          { x: 1.05, color: '#66BB6A' },
        ].map((led, i) => (
          <mesh key={`led${i}`} position={[led.x, -0.5, -0.035]}>
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshBasicMaterial color={led.color} />
          </mesh>
        ))}

        {/* Vertical divider strips between screens */}
        {[-0.42, 0.42].map((x, i) => (
          <mesh key={`div${i}`} position={[x, 0.08, -0.04]}>
            <boxGeometry args={[0.025, 0.6, 0.015]} />
            <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* ── Windshield (3 panes above dashboard) ──────────────────── */}
      <group position={[0, 1.75, -1.3]} rotation={[-0.55, 0, 0]}>
        {/* Center pane */}
        <mesh>
          <planeGeometry args={[1.1, 0.95]} />
          <meshStandardMaterial
            color="#040810"
            roughness={0.05}
            metalness={0.9}
            transparent
            opacity={0.45}
          />
        </mesh>
        {/* Left pane */}
        <mesh position={[-0.78, 0, 0.12]} rotation={[0, 0.22, 0]}>
          <planeGeometry args={[0.55, 0.95]} />
          <meshStandardMaterial
            color="#040810"
            roughness={0.05}
            metalness={0.9}
            transparent
            opacity={0.4}
          />
        </mesh>
        {/* Right pane */}
        <mesh position={[0.78, 0, 0.12]} rotation={[0, -0.22, 0]}>
          <planeGeometry args={[0.55, 0.95]} />
          <meshStandardMaterial
            color="#040810"
            roughness={0.05}
            metalness={0.9}
            transparent
            opacity={0.4}
          />
        </mesh>

        {/* Window frame dividers */}
        <mesh position={[-0.44, 0, -0.01]}>
          <boxGeometry args={[0.05, 0.97, 0.04]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0.44, 0, -0.01]}>
          <boxGeometry args={[0.05, 0.97, 0.04]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
        </mesh>
        {/* Top frame */}
        <mesh position={[0, 0.49, -0.01]}>
          <boxGeometry args={[2.2, 0.05, 0.04]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
        </mesh>
        {/* Bottom frame */}
        <mesh position={[0, -0.49, -0.01]}>
          <boxGeometry args={[2.2, 0.05, 0.04]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
        </mesh>
      </group>

      {/* ── Overhead Panel ────────────────────────────────────────── */}
      <group position={[0, 2.1, -0.2]} rotation={[1.35, 0, 0]}>
        <mesh>
          <boxGeometry args={[2.2, 1.0, 0.04]} />
          <meshStandardMaterial color={MAT.ceiling} roughness={0.6} metalness={0.3} />
        </mesh>

        {[0, 1, 2].map((row) => (
          <group key={`ohrow${row}`} position={[0, -0.32 + row * 0.28, -0.025]}>
            {[-0.85, -0.45, -0.05, 0.35, 0.75].map((x, col) => (
              <mesh key={`ohsw${row}${col}`} position={[x, 0, 0]}>
                <boxGeometry args={[0.28, 0.12, 0.018]} />
                <meshStandardMaterial color="#222D3A" roughness={0.5} metalness={0.4} />
              </mesh>
            ))}
          </group>
        ))}

        {[-0.32, 0.0, 0.28].map((y, i) => (
          <mesh key={`ohlbl${i}`} position={[0, y + 0.15, -0.025]}>
            <boxGeometry args={[2.0, 0.008, 0.005]} />
            <meshBasicMaterial color={MAT.accent} transparent opacity={0.15} />
          </mesh>
        ))}
      </group>

      {/* ── Center Pedestal / Console ─────────────────────────────── */}
      <group position={[0, 0.32, -0.15]}>
        <mesh>
          <boxGeometry args={[0.38, 0.42, 1.4]} />
          <meshStandardMaterial color={MAT.panel} roughness={0.5} metalness={0.35} />
        </mesh>

        {/* Throttle quadrant plate */}
        <mesh position={[0, 0.24, 0.15]}>
          <boxGeometry args={[0.3, 0.05, 0.35]} />
          <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Throttle levers */}
        <mesh position={[-0.06, 0.32, 0.18]}>
          <boxGeometry args={[0.025, 0.1, 0.035]} />
          <meshStandardMaterial color="#3A4858" roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0.06, 0.30, 0.18]}>
          <boxGeometry args={[0.025, 0.1, 0.035]} />
          <meshStandardMaterial color="#3A4858" roughness={0.3} metalness={0.6} />
        </mesh>

        {/* Radio/nav panel */}
        <mesh position={[0, 0.12, -0.55]}>
          <boxGeometry args={[0.32, 0.18, 0.02]} />
          <meshStandardMaterial color="#111822" roughness={0.5} metalness={0.4} emissive="#4FC3F7" emissiveIntensity={0.02} />
        </mesh>

        {/* COMMS screen on center pedestal top */}
        {consoleActive && (
          <>
            <ScreenBezel
              width={0.6} height={0.42}
              position={[0, 0.24, -0.3]}
              rotation={[-0.35, 0, 0]}
              highlighted={hoveredScreen === 'comms' || focusedScreen === 'comms'}
            />
            <Html
              transform
              position={[0, 0.245, -0.31]}
              rotation={[-0.35, 0, 0]}
              scale={0.38}
              distanceFactor={0.7}
              zIndexRange={[100, 0]}
            >
              <InteractiveScreen
                name="comms"
                label={SCREEN_ZOOM.comms.label}
                focusedScreen={focusedScreen}
                hoveredScreen={hoveredScreen}
                onHover={onScreenHover}
                onClick={onScreenClick}
              >
                <CommsScreen />
              </InteractiveScreen>
            </Html>
          </>
        )}
      </group>

      {/* ── Side Consoles ─────────────────────────────────────────── */}
      {/* Left */}
      <group position={[-0.88, 0.52, 0.0]}>
        <mesh>
          <boxGeometry args={[0.45, 0.22, 1.6]} />
          <meshStandardMaterial color={MAT.panel} roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.12, -0.2]}>
          <boxGeometry args={[0.35, 0.02, 0.8]} />
          <meshStandardMaterial color="#1E2838" roughness={0.5} metalness={0.4} />
        </mesh>
        {[0, 1, 2].map((row) => (
          <group key={`lcb${row}`}>
            {[0, 1, 2, 3, 4].map((col) => (
              <mesh key={`lcbs${row}${col}`} position={[-0.1 + col * 0.06, 0.14, -0.45 + row * 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.015, 6]} />
                <meshStandardMaterial color="#2A3040" roughness={0.4} metalness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Right */}
      <group position={[0.88, 0.52, 0.0]}>
        <mesh>
          <boxGeometry args={[0.45, 0.22, 1.6]} />
          <meshStandardMaterial color={MAT.panel} roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.12, -0.2]}>
          <boxGeometry args={[0.35, 0.02, 0.8]} />
          <meshStandardMaterial color="#1E2838" roughness={0.5} metalness={0.4} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={`rsw${i}`} position={[0, 0.14, -0.4 + i * 0.25]}>
            <boxGeometry args={[0.18, 0.02, 0.12]} />
            <meshStandardMaterial color="#222D3A" roughness={0.5} metalness={0.4} />
          </mesh>
        ))}
      </group>

      {/* EXIT BUTTON — on right side console */}
      {consoleActive && (
        <Html
          transform
          position={[0.78, 0.7, 0.45]}
          rotation={[-0.25, -0.15, 0]}
          scale={0.8}
          distanceFactor={0.5}
        >
          <ExitButton onExit={onExit} />
        </Html>
      )}

      {/* ── Pilot Seat ────────────────────────────────────────────── */}
      <group position={[0, 0.18, 0.7]}>
        <mesh>
          <boxGeometry args={[0.55, 0.14, 0.55]} />
          <meshStandardMaterial color={MAT.seat} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.4, 0.2]} rotation={[-0.15, 0, 0]}>
          <boxGeometry args={[0.5, 0.58, 0.1]} />
          <meshStandardMaterial color="#232A35" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.82, 0.26]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.07]} />
          <meshStandardMaterial color="#232A35" roughness={0.7} />
        </mesh>
      </group>

      {/* ── Structural ribs ───────────────────────────────────────── */}
      {[-1.0, 0.0, 1.0].map((z, i) => (
        <group key={`rib${i}`}>
          <mesh position={[0, 2.18, z]}>
            <boxGeometry args={[2.82, 0.04, 0.04]} />
            <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[-1.39, 1.1, z]}>
            <boxGeometry args={[0.04, 2.2, 0.04]} />
            <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[1.39, 1.1, z]}>
            <boxGeometry args={[0.04, 2.2, 0.04]} />
            <meshStandardMaterial color={MAT.frame} roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      ))}

      {/* ── Edge glow strips ──────────────────────────────────────── */}
      {[[-1.39, 0.01, -0.3], [1.39, 0.01, -0.3]].map(([x, y, z], i) => (
        <mesh key={`fe${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, 3.8]} />
          <meshBasicMaterial color={MAT.accent} transparent opacity={0.2} />
        </mesh>
      ))}
      {[[-1.39, 2.19, -0.3], [1.39, 2.19, -0.3]].map(([x, y, z], i) => (
        <mesh key={`ce${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, 3.5]} />
          <meshBasicMaterial color={MAT.accent} transparent opacity={0.12} />
        </mesh>
      ))}

      {/* ── Wall detail panels ────────────────────────────────────── */}
      <mesh position={[-1.38, 1.3, 0.8]}>
        <boxGeometry args={[0.04, 0.5, 0.5]} />
        <meshStandardMaterial color="#1E2838" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[-1.38, 0.9, 0.8]}>
        <boxGeometry args={[0.04, 0.3, 0.5]} />
        <meshStandardMaterial color="#222D40" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[1.38, 1.3, 0.8]}>
        <boxGeometry args={[0.04, 0.5, 0.5]} />
        <meshStandardMaterial color="#1E2838" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* ── Camera Waypoints ──────────────────────────────────────── */}
      <object3D ref={hatchWaypointRef} position={[1.2, 1.3, 1.8]} />
      <object3D ref={hatchLookRef} position={[0, 1.0, -0.5]} />
      <object3D ref={insideWaypointRef} position={[0.0, 1.25, 0.5]} />
      <object3D ref={consoleLookRef} position={[0, 0.85, -1.0]} />

      {/* ── Cabin Lighting ────────────────────────────────────────────
          Physically-correct falloff (intensity/d²): lights sit 0.3–1m from
          surfaces, so intensities must stay small or everything blows out.
          Keep each light ≥0.4m away from the nearest surface. */}
      <pointLight ref={cabinKeyRef} position={[0, 1.75, -0.6]} color="#FFD54F" intensity={0} distance={6} decay={2} />
      <pointLight ref={cabinFillRef} position={[0, 1.7, 1.0]} color="#4FC3F7" intensity={0} distance={6} decay={2} />
      <pointLight ref={consoleGlowRef} position={[0, 1.15, -0.6]} color="#4FC3F7" intensity={0} distance={4} decay={2} />
      <pointLight ref={stripGlowRef} position={[0, 0.6, -0.2]} color="#FFD54F" intensity={0} distance={4} decay={2} />
      <pointLight ref={starPulseRef} position={[0, 1.6, -1.4]} color="#FFF59D" intensity={0} distance={5} decay={2} />
      <pointLight position={[0, 1.4, 0]} color="#4FC3F7" intensity={0.08} distance={10} decay={2} />
    </group>
  )
}


/* ═══════════════════════════════════════════════════════════════════════ */
/*  CockpitScene — orchestrates entry / idle / zoom / exit               */
/* ═══════════════════════════════════════════════════════════════════════ */
export default function CockpitScene() {
  const { camera } = useThree()
  const setStage = useStore((s) => s.setStage)
  const setHudPrompt = useStore((s) => s.setHudPrompt)

  /* ── Refs ─────────────────────────────────────────────────────── */
  const hatchRef = useRef()
  const cabinKeyRef = useRef()
  const cabinFillRef = useRef()
  const consoleGlowRef = useRef()
  const stripGlowRef = useRef()
  const starPulseRef = useRef()

  const hatchWaypointRef = useRef()
  const hatchLookRef = useRef()
  const insideWaypointRef = useRef()
  const consoleLookRef = useRef()

  const entryTimelineRef = useRef(null)
  const exitTimelineRef = useRef(null)
  const zoomTimelineRef = useRef(null)
  const panRef = useRef(0)

  const hatchStateRef = useRef({ angle: 0 })
  const powerStateRef = useRef({ value: 0 })
  const insideRef = useRef(false)
  const exitingRef = useRef(false)
  const zoomingRef = useRef(false)
  const focusedScreenRef = useRef(null)

  /* ── State ────────────────────────────────────────────────────── */
  const [consoleActive, setConsoleActive] = useState(false)
  const [cockpitVisible, setCockpitVisible] = useState(false)
  const [focusedScreen, setFocusedScreen] = useState(null)
  const [hoveredScreen, setHoveredScreen] = useState(null)

  /* ── Screen zoom / unzoom ─────────────────────────────────────── */
  const zoomToScreen = useCallback((screenName) => {
    if (zoomingRef.current || exitingRef.current || !insideRef.current) return

    const target = SCREEN_ZOOM[screenName]
    if (!target) return

    zoomTimelineRef.current?.kill()
    zoomingRef.current = true

    // Clear previous focus during transition
    focusedScreenRef.current = null
    setFocusedScreen(null)

    const [cx, cy, cz] = localToWorld(target.cam)
    const [lx, ly, lz] = localToWorld(target.look)

    // Derive current lookAt from camera direction
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const curLook = camera.position.clone().add(dir.multiplyScalar(1.8))
    const lookAnim = { x: curLook.x, y: curLook.y, z: curLook.z }

    const tl = gsap.timeline({
      onComplete: () => {
        zoomingRef.current = false
        focusedScreenRef.current = screenName
        setFocusedScreen(screenName)
        setHudPrompt('ESC to return')
      },
    })

    tl.to(camera.position, {
      x: cx, y: cy, z: cz,
      duration: 0.55,
      ease: 'power2.out',
      onUpdate: () => camera.lookAt(lookAnim.x, lookAnim.y, lookAnim.z),
    }, 0)

    tl.to(lookAnim, {
      x: lx, y: ly, z: lz,
      duration: 0.55,
      ease: 'power2.out',
    }, 0)

    zoomTimelineRef.current = tl
  }, [camera, setHudPrompt])

  const unzoom = useCallback(() => {
    if (zoomingRef.current || !focusedScreenRef.current) return

    zoomTimelineRef.current?.kill()
    zoomingRef.current = true

    const insidePoint = new THREE.Vector3()
    const consolePoint = new THREE.Vector3()
    insideWaypointRef.current?.getWorldPosition(insidePoint)
    consoleLookRef.current?.getWorldPosition(consolePoint)

    // Animate from current zoom lookAt
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const curLook = camera.position.clone().add(dir.multiplyScalar(1.2))
    const lookAnim = { x: curLook.x, y: curLook.y, z: curLook.z }

    focusedScreenRef.current = null
    setFocusedScreen(null)

    const tl = gsap.timeline({
      onComplete: () => {
        zoomingRef.current = false
        panRef.current = 0
        setHudPrompt('')
      },
    })

    tl.to(camera.position, {
      x: insidePoint.x, y: insidePoint.y, z: insidePoint.z,
      duration: 0.45,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookAnim.x, lookAnim.y, lookAnim.z),
    }, 0)

    tl.to(lookAnim, {
      x: consolePoint.x, y: consolePoint.y, z: consolePoint.z,
      duration: 0.45,
      ease: 'power2.inOut',
    }, 0)

    zoomTimelineRef.current = tl
  }, [camera, setHudPrompt])

  /* ── Screen click handler ─────────────────────────────────────── */
  const handleScreenClick = useCallback((screenName) => {
    if (focusedScreenRef.current === screenName) {
      unzoom()
    } else {
      zoomToScreen(screenName)
    }
  }, [zoomToScreen, unzoom])

  /* ── Escape key handler ───────────────────────────────────────── */
  const unzoomRef = useRef(unzoom)
  useEffect(() => {
    unzoomRef.current = unzoom
  })

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') unzoomRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* ── Entry animation ─────────────────────────────────────────── */
  useEffect(() => {
    camera.position.copy(SURFACE_CAMERA_POS)
    camera.lookAt(SURFACE_LOOK_TARGET)
    setHudPrompt('Cockpit systems waking...')

    const hatchPoint = new THREE.Vector3()
    const hatchLookPoint = new THREE.Vector3()
    const insidePoint = new THREE.Vector3()
    const consoleLookPoint = new THREE.Vector3()
 
    hatchWaypointRef.current?.getWorldPosition(hatchPoint)
    hatchLookRef.current?.getWorldPosition(hatchLookPoint)
    insideWaypointRef.current?.getWorldPosition(insidePoint)
    consoleLookRef.current?.getWorldPosition(consoleLookPoint)
 
    // approachPoint should be slightly outside the rocket model
    const approachPoint = new THREE.Vector3(
      hatchPoint.x + 2.0,
      hatchPoint.y + 0.5,
      hatchPoint.z + 1.5
    )
    const lookTarget = {
      x: SURFACE_LOOK_TARGET.x,
      y: SURFACE_LOOK_TARGET.y,
      z: SURFACE_LOOK_TARGET.z,
    }

    playMechanicalTone(1)

    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
    })

    /* Phase 1: Open hatch + start cabin power (cockpit still hidden) */
    timeline.to(hatchStateRef.current, {
      angle: HATCH_OPEN_ANGLE,
      duration: 1.5,
      ease: 'power2.inOut',
    }, 0)

    timeline.to(powerStateRef.current, {
      value: 0.34,
      duration: 1.5,
      ease: 'sine.out',
    }, 0)

    /* Phase 2: Approach cockpit from outside */
    timeline.to(camera.position, {
      x: approachPoint.x,
      y: approachPoint.y,
      z: approachPoint.z,
      duration: 0.95,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    }, 1.5)

    /* Phase 3: Move to hatch */
    timeline.to(camera.position, {
      x: hatchPoint.x,
      y: hatchPoint.y,
      z: hatchPoint.z,
      duration: 1.05,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    }, 2.45)

    /* Look target transitions toward hatch interior */
    timeline.to(lookTarget, {
      x: hatchLookPoint.x,
      y: hatchLookPoint.y,
      z: hatchLookPoint.z,
      duration: 2,
      ease: 'power2.inOut',
    }, 1.5)

    timeline.call(() => {
      setHudPrompt('Entering cockpit...')
    }, [], 2.7)

    /* ★ Make cockpit visible just before camera reaches hatch */
    timeline.call(() => {
      setCockpitVisible(true)
    }, [], 3.0)

    /* Phase 4: Settle into pilot seat */
    timeline.to(camera.position, {
      x: insidePoint.x,
      y: insidePoint.y,
      z: insidePoint.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    }, 3.5)

    /* Look target lands on dashboard */
    timeline.to(lookTarget, {
      x: consoleLookPoint.x,
      y: consoleLookPoint.y,
      z: consoleLookPoint.z,
      duration: 1.5,
      ease: 'power2.inOut',
    }, 3.5)

    /* Full power */
    timeline.to(powerStateRef.current, {
      value: 1,
      duration: 1.5,
      ease: 'power2.out',
    }, 3.5)

    timeline.call(() => {
      setHudPrompt('MISSION SYSTEM ONLINE')
      setConsoleActive(true)
    }, [], 4.75)

    timeline.call(() => {
      insideRef.current = true
      setHudPrompt('')
    }, [], 5.3)

    entryTimelineRef.current = timeline

    return () => {
      entryTimelineRef.current?.kill()
      exitTimelineRef.current?.kill()
      zoomTimelineRef.current?.kill()
    }
  }, [camera, setHudPrompt])

  /* ── Per-frame: power, sway, mouse-pan ──────────────────────── */
  useFrame((state) => {
    /* Hatch rotation */
    if (hatchRef.current) {
      hatchRef.current.rotation.y = hatchStateRef.current.angle
    }

    /* Light power ramp — small values: physical falloff amplifies
       anything at sub-meter distances (see cabin lighting note) */
    const power = powerStateRef.current.value
    if (cabinKeyRef.current) cabinKeyRef.current.intensity = power * 0.5
    if (cabinFillRef.current) cabinFillRef.current.intensity = power * 0.25
    if (consoleGlowRef.current) consoleGlowRef.current.intensity = power * 0.3
    if (stripGlowRef.current) stripGlowRef.current.intensity = power * 0.12
    if (starPulseRef.current) {
      const pulse = 0.15 + Math.sin(state.clock.elapsedTime * 1.3) * 0.06
      starPulseRef.current.intensity = power * pulse
    }

    if (!insideRef.current || exitingRef.current) return

    /* Skip idle pan when zoomed or animating zoom */
    if (focusedScreenRef.current || zoomingRef.current) return

    const t = state.clock.elapsedTime
    const swayX = Math.sin(t * 0.15) * 0.008
    const swayY = Math.sin(t * 0.11) * 0.005

    const targetPan = state.pointer.x * 0.45
    panRef.current = THREE.MathUtils.lerp(panRef.current, targetPan, 0.05)
    const pan = panRef.current

    const insidePoint = new THREE.Vector3()
    const consolePoint = new THREE.Vector3()
    insideWaypointRef.current?.getWorldPosition(insidePoint)
    consoleLookRef.current?.getWorldPosition(consolePoint)

    camera.position.set(
      insidePoint.x + swayX + pan * 0.04,
      insidePoint.y + swayY,
      insidePoint.z
    )

    camera.lookAt(
      consolePoint.x + pan * 0.8,
      consolePoint.y,
      consolePoint.z
    )
  })

  /* ── Exit animation ──────────────────────────────────────────── */
  function handleExit() {
    if (exitingRef.current) return

    // Clean up any in-flight entry / zoom state (exit can fire mid-entry)
    entryTimelineRef.current?.kill()
    zoomTimelineRef.current?.kill()
    zoomingRef.current = false
    focusedScreenRef.current = null
    setFocusedScreen(null)

    exitingRef.current = true
    insideRef.current = false
    setConsoleActive(false)
    setHudPrompt('Powering down cockpit...')
    playMechanicalTone(0.85)

    const hatchPoint = new THREE.Vector3()
    const hatchLookPoint = new THREE.Vector3()
    hatchWaypointRef.current?.getWorldPosition(hatchPoint)
    hatchLookRef.current?.getWorldPosition(hatchLookPoint)

    const lookTarget = {
      x: hatchLookPoint.x,
      y: hatchLookPoint.y,
      z: hatchLookPoint.z,
    }

    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        setHudPrompt('')
        setCockpitVisible(false)
        setStage(STAGE.SURFACE)
      },
    })

    timeline.to(powerStateRef.current, {
      value: 0.3,
      duration: 0.8,
      ease: 'power2.inOut',
    }, 0)

    timeline.to(camera.position, {
      x: hatchPoint.x,
      y: hatchPoint.y,
      z: hatchPoint.z,
      duration: 1,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    }, 0)

    timeline.to(camera.position, {
      x: SURFACE_CAMERA_POS.x,
      y: SURFACE_CAMERA_POS.y,
      z: SURFACE_CAMERA_POS.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    }, 1)

    timeline.to(lookTarget, {
      x: SURFACE_LOOK_TARGET.x,
      y: SURFACE_LOOK_TARGET.y,
      z: SURFACE_LOOK_TARGET.z,
      duration: 1.5,
      ease: 'power2.inOut',
    }, 1)

    timeline.to(hatchStateRef.current, {
      angle: 0,
      duration: 1.15,
      ease: 'power2.inOut',
    }, 1)

    timeline.to(powerStateRef.current, {
      value: 0,
      duration: 1.15,
      ease: 'power2.in',
    }, 1.2)

    /* Hide cockpit once camera is outside */
    timeline.call(() => {
      setCockpitVisible(false)
    }, [], 1.8)

    exitTimelineRef.current = timeline
  }

  /* ── External exit request (HUD back button) ──────────────────── */
  const exitRequested = useStore((s) => s.cockpitExitRequested)
  const handleExitRef = useRef(() => {})
  useEffect(() => {
    handleExitRef.current = handleExit
  })
  useEffect(() => {
    if (exitRequested) {
      useStore.getState().setCockpitExitRequested(false)
      handleExitRef.current()
    }
  }, [exitRequested])

  return (
    <>
      <ambientLight intensity={0.15} />
      {/* Hide the rocket exterior once inside — the interior shell is much
          larger than the hull, so the hull would otherwise fill the camera */}
      <IntroScene altMode={false} showCraft={!cockpitVisible} isLiftoff={true} />

      {/* Cockpit starts invisible — revealed during entry animation */}
      <group visible={cockpitVisible}>
        <CockpitInterior
          hatchRef={hatchRef}
          cabinKeyRef={cabinKeyRef}
          cabinFillRef={cabinFillRef}
          consoleGlowRef={consoleGlowRef}
          stripGlowRef={stripGlowRef}
          starPulseRef={starPulseRef}
          hatchWaypointRef={hatchWaypointRef}
          hatchLookRef={hatchLookRef}
          insideWaypointRef={insideWaypointRef}
          consoleLookRef={consoleLookRef}
          consoleActive={consoleActive}
          onExit={handleExit}
          focusedScreen={focusedScreen}
          hoveredScreen={hoveredScreen}
          onScreenClick={handleScreenClick}
          onScreenHover={setHoveredScreen}
        />
      </group>
    </>
  )
}

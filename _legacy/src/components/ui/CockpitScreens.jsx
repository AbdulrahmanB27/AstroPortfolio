import portfolioData from '../../data/data.json'

const { owner, skills } = portfolioData

/* ── Shared style tokens ─────────────────────────────────────────────────── */
const font = { mono: 'Space Mono, monospace', sans: 'Space Grotesk, sans-serif' }
const c = {
  cyan: '#4FC3F7',
  gold: '#FFD54F',
  text: 'rgba(255,255,255,0.8)',
  dim: 'rgba(255,255,255,0.4)',
  bg: 'rgba(6, 8, 16, 0.92)',
  border: 'rgba(79,195,247,0.25)',
}

function ScreenFrame({ children, width = 600, height = 400, title }) {
  return (
    <div style={{
      width: `${width}px`,
      height: `${height}px`,
      background: c.bg,
      border: `1px solid ${c.border}`,
      boxShadow: `0 0 20px rgba(0,0,0,0.6), inset 0 0 15px rgba(79,195,247,0.03)`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: font.sans,
      color: c.text,
    }}>
      {/* Top accent */}
      <div style={{
        height: '2px',
        background: `linear-gradient(90deg, transparent, ${c.cyan}88, ${c.gold}66, transparent)`,
      }} />
      {/* Header bar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${c.border}`,
        fontFamily: font.mono,
        fontSize: '0.5rem',
        color: c.cyan,
        letterSpacing: '0.18em',
      }}>
        {title}
      </div>
      {/* Body */}
      <div style={{
        flex: 1,
        padding: '14px 18px',
        overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROFILE SCREEN — Dashboard (front, angled)                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function ProfileScreen() {
  return (
    <ScreenFrame width={720} height={420} title="// MISSION_PROFILE">
      {/* Name */}
      <div style={{
        fontSize: '1.3rem',
        fontWeight: 600,
        color: '#ECEFF1',
        marginBottom: '2px',
      }}>
        {owner.name}
      </div>
      <div style={{
        fontFamily: font.mono,
        fontSize: '0.52rem',
        color: c.cyan,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: '14px',
      }}>
        {owner.title}
      </div>

      {/* About */}
      <p style={{
        fontSize: '0.78rem',
        lineHeight: 1.7,
        color: c.text,
        marginBottom: '16px',
        maxWidth: '95%',
      }}>
        {owner.about}
      </p>

      {/* Interests */}
      {owner.interests?.length > 0 && (
        <div>
          <div style={{
            fontFamily: font.mono,
            fontSize: '0.42rem',
            color: `${c.gold}88`,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Focus Areas
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {owner.interests.map((i) => (
              <span key={i} style={{
                fontFamily: font.mono,
                fontSize: '0.48rem',
                color: `${c.gold}dd`,
                background: `${c.gold}0d`,
                border: `1px solid ${c.gold}28`,
                padding: '2px 7px',
                letterSpacing: '0.06em',
              }}>{i}</span>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      {owner.goals?.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{
            fontFamily: font.mono,
            fontSize: '0.42rem',
            color: `${c.cyan}88`,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Mission Objectives
          </div>
          {owner.goals.map((g, i) => (
            <div key={i} style={{
              fontSize: '0.68rem',
              color: 'rgba(189,189,189,0.8)',
              lineHeight: 1.5,
              paddingLeft: '10px',
              borderLeft: `2px solid ${c.cyan}33`,
              marginBottom: '6px',
            }}>
              {g}
            </div>
          ))}
        </div>
      )}
    </ScreenFrame>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SKILLS SCREEN — Left wall                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function SkillsScreen() {
  return (
    <ScreenFrame width={520} height={380} title="// SYSTEMS_CAPABILITY">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {skills.map((group) => (
          <div key={group.category}>
            <div style={{
              fontFamily: font.mono,
              fontSize: '0.44rem',
              color: c.gold,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              // {group.category}
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {group.items.map((item) => (
                <span key={item} style={{
                  fontFamily: font.mono,
                  fontSize: '0.48rem',
                  color: 'rgba(144,202,249,0.85)',
                  background: `${c.cyan}0d`,
                  border: `1px solid ${c.cyan}28`,
                  padding: '3px 8px',
                  letterSpacing: '0.05em',
                }}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  RESUME SCREEN — Right wall                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function ResumeScreen() {
  const { education, experience } = owner.resume

  return (
    <ScreenFrame width={520} height={420} title="// MISSION_RECORD">
      {/* Download link */}
      <a
        href={owner.resume.downloadUrl}
        download
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: font.mono,
          fontSize: '0.48rem',
          color: c.cyan,
          border: `1px solid ${c.border}`,
          padding: '6px 12px',
          textDecoration: 'none',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: '16px',
        }}
      >
        Export Record (PDF)
      </a>

      {/* Education */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          fontFamily: font.mono,
          fontSize: '0.42rem',
          color: c.gold,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '10px',
        }}>
          // Education
        </div>
        {education.map((ed, i) => (
          <div key={i} style={{
            borderLeft: `2px solid ${c.gold}40`,
            paddingLeft: '12px',
            marginBottom: '12px',
          }}>
            <div style={{
              fontFamily: font.mono,
              fontSize: '0.4rem',
              color: `${c.gold}88`,
              letterSpacing: '0.1em',
              marginBottom: '2px',
            }}>{ed.year}</div>
            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#E0E0E0', marginBottom: '1px' }}>
              {ed.degree}
            </div>
            <div style={{
              fontFamily: font.mono,
              fontSize: '0.48rem',
              color: 'rgba(144,202,249,0.7)',
              marginBottom: '2px',
            }}>{ed.institution}</div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(189,189,189,0.6)' }}>
              GPA: {ed.gpa}
            </div>
          </div>
        ))}
      </div>

      {/* Experience */}
      <div>
        <div style={{
          fontFamily: font.mono,
          fontSize: '0.42rem',
          color: c.gold,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '10px',
        }}>
          // Experience
        </div>
        {experience.map((ex, i) => (
          <div key={i} style={{
            borderLeft: `2px solid ${c.gold}40`,
            paddingLeft: '12px',
            marginBottom: '12px',
          }}>
            <div style={{
              fontFamily: font.mono,
              fontSize: '0.4rem',
              color: `${c.gold}88`,
              letterSpacing: '0.1em',
              marginBottom: '2px',
            }}>{ex.period}</div>
            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#E0E0E0', marginBottom: '1px' }}>
              {ex.role}
            </div>
            <div style={{
              fontFamily: font.mono,
              fontSize: '0.48rem',
              color: 'rgba(144,202,249,0.7)',
              marginBottom: '4px',
            }}>{ex.company}</div>
            <div style={{ fontSize: '0.62rem', color: 'rgba(189,189,189,0.65)', lineHeight: 1.5 }}>
              {ex.description}
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  COMMS SCREEN — Back wall                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function CommsScreen() {
  const channels = [
    { label: 'EMAIL', value: owner.email, href: `mailto:${owner.email}` },
    { label: 'GITHUB', value: owner.github.replace('https://', ''), href: owner.github },
    { label: 'LINKEDIN', value: owner.linkedin.replace('https://', ''), href: owner.linkedin },
    { label: 'LOCATION', value: owner.location, href: null },
  ]

  return (
    <ScreenFrame width={440} height={340} title="// COMMUNICATIONS_RELAY">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {channels.map((ch) => (
          <div
            key={ch.label}
            onClick={() => ch.href && window.open(ch.href, ch.href.startsWith('mailto') ? '_self' : '_blank')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(255,255,255,0.02)',
              padding: '12px 14px',
              border: '1px solid rgba(255,255,255,0.04)',
              cursor: ch.href ? 'pointer' : 'default',
            }}
          >
            <div style={{
              width: '28px', height: '28px',
              background: `${c.cyan}14`,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: font.mono, fontSize: '0.48rem', color: c.cyan,
              flexShrink: 0,
            }}>
              {ch.label.charAt(0)}
            </div>
            <div>
              <div style={{
                fontFamily: font.mono,
                fontSize: '0.4rem',
                color: c.dim,
                letterSpacing: '0.1em',
                marginBottom: '2px',
              }}>
                {ch.label}
              </div>
              <div style={{
                fontSize: '0.72rem',
                color: ch.href ? '#ECEFF1' : 'rgba(189,189,189,0.8)',
              }}>
                {ch.value}
              </div>
            </div>
            {ch.href && (
              <div style={{
                marginLeft: 'auto',
                fontFamily: font.mono,
                fontSize: '0.6rem',
                color: `${c.cyan}66`,
              }}>
                ↗
              </div>
            )}
          </div>
        ))}
      </div>
    </ScreenFrame>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  EXIT BUTTON — Small clickable element near the window                    */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function ExitButton({ onExit }) {
  return (
    <div
      onClick={onExit}
      data-cockpit-exit
      style={{
        width: '140px',
        padding: '10px 0',
        background: 'rgba(6,8,16,0.9)',
        border: '1px solid rgba(255,61,0,0.4)',
        fontFamily: font.mono,
        fontSize: '0.52rem',
        color: 'rgba(255,61,0,0.85)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
      }}
    >
      Exit Cockpit
    </div>
  )
}

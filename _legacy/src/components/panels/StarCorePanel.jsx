import { useState, useEffect } from 'react'
import useStore, { STAGE } from '../../store/useStore'
import portfolioData from '../../data/data.json'

const { owner, skills } = portfolioData

const SECTIONS = ['about', 'skills', 'resume', 'contact']

export default function StarCorePanel() {
  const activeSection = useStore((s) => s.activeStarSection)
  const setActiveSection = useStore((s) => s.setActiveStarSection)
  const setStage = useStore((s) => s.setStage)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const [visible, setVisible] = useState(false)

  // Entrance animation on mount only — tab switches keep the panel in place
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  function handleBack() {
    setHudPrompt('Returning to orbit...')
    setStage(STAGE.ORBIT)
  }

  return (
    <div onClick={handleBack} style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 30,
      background: visible
        ? 'radial-gradient(ellipse at center, rgba(255,213,79,0.18) 0%, rgba(255,160,0,0.08) 25%, rgba(255,111,0,0.04) 45%, rgba(4,6,14,0.92) 80%)'
        : 'transparent',
      backdropFilter: visible ? 'blur(8px)' : 'none',
      WebkitBackdropFilter: visible ? 'blur(8px)' : 'none',
      transition: 'all 0.6s ease',
      pointerEvents: visible ? 'all' : 'none',
    }}>
      {/* ── Centered Panel ─────────────────────────────────────────── */}
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(620px, 90vw)',
        maxHeight: '85vh',
        background: 'rgba(6, 10, 18, 0.88)',
        border: '1px solid rgba(255, 213, 79, 0.2)',
        boxShadow: visible ? '0 0 100px rgba(255,213,79,0.08), 0 20px 60px rgba(0,0,0,0.5)' : 'none',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}>
        {/* Top golden accent line */}
        <div style={{
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(255,213,79,0.5), transparent)',
        }} />

        {/* Header */}
        <div style={{
          borderBottom: '1px solid rgba(255,213,79,0.15)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.45rem',
            color: 'rgba(255,213,79,0.4)',
            letterSpacing: '0.15em',
          }}>
            STELLAR CORE INTERFACE
          </div>
          <button onClick={handleBack} style={{
            background: 'none',
            border: '1px solid rgba(144,202,249,0.3)',
            color: 'rgba(144,202,249,0.7)',
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.55rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '6px 12px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(144,202,249,0.6)'
              e.currentTarget.style.color = 'rgba(144,202,249,1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(144,202,249,0.3)'
              e.currentTarget.style.color = 'rgba(144,202,249,0.7)'
            }}
          >
            ← EXIT CORE
          </button>
        </div>

        {/* Hero Area */}
        <div style={{ padding: '24px 32px 16px' }}>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.6rem',
            color: 'rgba(255,213,79,0.7)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            STELLAR CORE // OVERRIDE
          </div>
          <h1 style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            color: '#FFFFFF',
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em',
          }}>
            {owner.name}
          </h1>
        </div>

        {/* Navigation tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,213,79,0.1)',
          padding: '0 16px',
        }}>
          {SECTIONS.map((sec) => (
            <button
              key={sec}
              onClick={() => setActiveSection(sec)}
              style={{
                flex: 1,
                background: activeSection === sec ? 'rgba(255,213,79,0.06)' : 'transparent',
                border: 'none',
                borderBottom: activeSection === sec ? '2px solid #FFD54F' : '2px solid transparent',
                color: activeSection === sec ? '#FFD54F' : 'rgba(224,224,224,0.4)',
                fontFamily: 'Space Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '16px 8px',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              onMouseEnter={(e) => {
                if (activeSection !== sec) e.target.style.color = 'rgba(255,213,79,0.8)';
              }}
              onMouseLeave={(e) => {
                if (activeSection !== sec) e.target.style.color = 'rgba(224,224,224,0.4)';
              }}
            >
              {sec}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          {activeSection === 'about' && <AboutSection />}
          {activeSection === 'skills' && <SkillsSection />}
          {activeSection === 'resume' && <ResumeSection />}
          {activeSection === 'contact' && <ContactSection />}
        </div>

        {/* Bottom golden accent line */}
        <div style={{
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(255,213,79,0.3), transparent)',
        }} />
      </div>
    </div>
  )
}

function AboutSection() {
  return (
    <div>
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.65rem',
        color: '#4FC3F7',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        marginBottom: '20px',
      }}>
        {owner.title}
      </div>
      <p style={{
        fontSize: '0.95rem',
        lineHeight: 1.75,
        color: '#BDBDBD',
        marginBottom: '20px',
      }}>
        {owner.about}
      </p>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <DataPoint label="Location" value={owner.location} />
        <DataPoint label="Email" value={owner.email} />
      </div>
      <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
        <SocialLink href={owner.github} label="GitHub" />
        <SocialLink href={owner.linkedin} label="LinkedIn" />
      </div>

      {/* Interests */}
      {owner.interests && owner.interests.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{
            fontFamily: 'Space Mono, monospace', fontSize: '0.5rem',
            color: 'rgba(144,202,249,0.5)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '10px',
          }}>
            Interests
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {owner.interests.map((interest) => (
              <span key={interest} style={{
                fontFamily: 'Space Mono, monospace', fontSize: '0.58rem',
                color: 'rgba(255,213,79,0.85)', background: 'rgba(255,213,79,0.06)',
                border: '1px solid rgba(255,213,79,0.2)', padding: '3px 8px',
                letterSpacing: '0.06em',
              }}>{interest}</span>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      {owner.goals && owner.goals.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{
            fontFamily: 'Space Mono, monospace', fontSize: '0.5rem',
            color: 'rgba(144,202,249,0.5)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '10px',
          }}>
            Mission Objectives
          </div>
          {owner.goals.map((goal, i) => (
            <div key={i} style={{
              fontSize: '0.8rem', color: '#BDBDBD', lineHeight: 1.6,
              paddingLeft: '12px', borderLeft: '2px solid rgba(255,213,79,0.3)',
              marginBottom: '8px',
            }}>
              {goal}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SkillsSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {skills.map((group) => (
        <div key={group.category}>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.55rem',
            color: '#FFD54F',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: '10px',
          }}>
            // {group.category}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {group.items.map((item) => (
              <span key={item} style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: '0.62rem',
                color: 'rgba(144,202,249,0.85)',
                background: 'rgba(79,195,247,0.08)',
                border: '1px solid rgba(79,195,247,0.2)',
                padding: '4px 10px',
                letterSpacing: '0.06em',
              }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ResumeSection() {
  const { education, experience } = owner.resume

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Download */}
      <div>
        <a
          href={owner.resume.downloadUrl}
          download
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.62rem',
            color: '#FFD54F',
            border: '1px solid rgba(255,213,79,0.4)',
            padding: '10px 20px',
            textDecoration: 'none',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255,213,79,0.08)'
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'none'
          }}
        >
          ↓ Export Record (PDF)
        </a>
      </div>

      {/* Education */}
      <div>
        <SectionLabel>Education</SectionLabel>
        {education.map((e, i) => (
          <TimelineEntry
            key={i}
            title={e.degree}
            subtitle={e.institution}
            period={e.year}
            detail={`GPA: ${e.gpa}`}
          />
        ))}
      </div>

      {/* Experience */}
      <div>
        <SectionLabel>Experience</SectionLabel>
        {experience.map((e, i) => (
          <TimelineEntry
            key={i}
            title={e.role}
            subtitle={e.company}
            period={e.period}
            detail={e.description}
          />
        ))}
      </div>
    </div>
  )
}

function ContactSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SectionLabel>Transmission Channels</SectionLabel>
      <DataPoint label="Email" value={owner.email} />
      <DataPoint label="Location" value={owner.location} />
      <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
        <SocialLink href={owner.github} label="GitHub" />
        <SocialLink href={owner.linkedin} label="LinkedIn" />
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DataPoint({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.5rem',
        color: 'rgba(144,202,249,0.5)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#BDBDBD' }}>{value}</div>
    </div>
  )
}

function SocialLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.6rem',
        color: 'rgba(144,202,249,0.8)',
        border: '1px solid rgba(144,202,249,0.25)',
        padding: '6px 14px',
        textDecoration: 'none',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => { e.target.style.borderColor = 'rgba(144,202,249,0.7)' }}
      onMouseLeave={(e) => { e.target.style.borderColor = 'rgba(144,202,249,0.25)' }}
    >
      ↗ {label}
    </a>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'Space Mono, monospace',
      fontSize: '0.55rem',
      color: '#FFD54F',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      marginBottom: '14px',
    }}>
      // {children}
    </div>
  )
}

function TimelineEntry({ title, subtitle, period, detail }) {
  return (
    <div style={{
      borderLeft: '2px solid rgba(255,213,79,0.3)',
      paddingLeft: '16px',
      marginBottom: '18px',
    }}>
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.5rem',
        color: 'rgba(255,213,79,0.6)',
        letterSpacing: '0.1em',
        marginBottom: '3px',
      }}>
        {period}
      </div>
      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#E0E0E0', marginBottom: '2px' }}>
        {title}
      </div>
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.6rem',
        color: 'rgba(144,202,249,0.7)',
        marginBottom: '6px',
      }}>
        {subtitle}
      </div>
      {detail && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(189,189,189,0.7)', lineHeight: 1.6 }}>
          {detail}
        </div>
      )}
    </div>
  )
}

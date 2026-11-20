import { useEffect, useState } from 'react'
import useStore, { STAGE } from '../../store/useStore'
import portfolioData from '../../data/data.json'

export default function PlanetPanel() {
  const activePlanetId = useStore((s) => s.activePlanetId)
  const setStage = useStore((s) => s.setStage)
  const setHudPrompt = useStore((s) => s.setHudPrompt)
  const [visible, setVisible] = useState(false)

  const project = portfolioData.projects.find((p) => p.id === activePlanetId)

  // Slide-in on mount — the panel unmounts whenever the stage leaves PLANET,
  // so there is no need to reset visibility when the project changes
  useEffect(() => {
    if (!project) return
    const t = setTimeout(() => setVisible(true), 300)
    return () => clearTimeout(t)
  }, [project])

  if (!project) return null

  function handleBack() {
    setHudPrompt('Returning to orbit...')
    setStage(STAGE.ORBIT)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 30,
      display: 'flex',
      pointerEvents: 'none',
    }}>
      {/* Left side — transparent, planet visible through 3D canvas */}
      <div style={{
        flex: '1 1 55%',
        minWidth: 0,
      }} />

      {/* Right panel — slides in from right */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          pointerEvents: 'all',
          flex: '0 0 auto',
          width: 'min(480px, 45vw)',
          height: '100%',
          background: 'rgba(4,6,14,0.92)',
          borderLeft: `1px solid ${project.color}30`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease',
          overflowY: 'auto',
          boxShadow: visible ? `-20px 0 60px rgba(0,0,0,0.5)` : 'none',
        }}
      >
        {/* Close / Back button */}
        <div style={{
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${project.color}15`,
        }}>
          <button onClick={handleBack} style={{
            background: 'none',
            border: `1px solid ${project.color}30`,
            color: `${project.color}aa`,
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.55rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${project.color}60`
              e.currentTarget.style.color = project.color
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = `${project.color}30`
              e.currentTarget.style.color = `${project.color}aa`
            }}
          >
            ← Return to Orbit
          </button>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.42rem',
            color: 'rgba(144,202,249,0.3)',
            letterSpacing: '0.15em',
          }}>
            SYS // PROJECT RECORD
          </div>
        </div>

        {/* Header */}
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.48rem',
            color: `${project.color}70`,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            {project.domain} // {project.featured ? 'featured' : 'active'}
          </div>
          <h2 style={{
            fontSize: '1.4rem',
            fontWeight: 600,
            color: project.color,
            marginBottom: '8px',
            lineHeight: 1.2,
            letterSpacing: '0.02em',
          }}>
            {project.title}
          </h2>
          <p style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.62rem',
            color: 'rgba(224,224,224,0.55)',
            letterSpacing: '0.04em',
            lineHeight: 1.6,
          }}>
            {project.shortDesc}
          </p>
        </div>

        {/* Divider line */}
        <div style={{
          height: '1px',
          margin: '0 24px',
          background: `linear-gradient(90deg, ${project.color}25, transparent)`,
        }} />

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
        }}>
          {/* Overview */}
          <section>
            <SectionLabel color={project.color}>Overview</SectionLabel>
            <p style={{
              fontSize: '0.82rem',
              lineHeight: 1.8,
              color: 'rgba(189,189,189,0.9)',
            }}>
              {project.fullDesc}
            </p>
          </section>

          {/* Metadata */}
          <section>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <MetaStat label="Scale" value={project.size < 1.2 ? 'Small' : project.size < 1.6 ? 'Medium' : 'Large'} color={project.color} />
              <MetaStat label="Domain" value={project.domain} color={project.color} />
              <MetaStat label="Status" value={project.featured ? 'Featured' : 'Active'} color={project.color} />
            </div>
          </section>

          {/* Technology Stack */}
          <section>
            <SectionLabel color={project.color}>Technology Stack</SectionLabel>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {project.technologies.map((tech) => (
                <span key={tech} style={{
                  fontFamily: 'Space Mono, monospace',
                  fontSize: '0.58rem',
                  color: project.color,
                  background: `${project.color}0a`,
                  border: `1px solid ${project.color}25`,
                  padding: '4px 10px',
                  letterSpacing: '0.04em',
                }}>
                  {tech}
                </span>
              ))}
            </div>
          </section>

          {/* Images */}
          {project.images && project.images.length > 0 && (
            <section>
              <SectionLabel color={project.color}>Visuals</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {project.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`${project.title} visual ${i + 1}`}
                    style={{
                      width: '100%',
                      maxHeight: '180px',
                      objectFit: 'cover',
                      border: `1px solid ${project.color}20`,
                      opacity: 0.9,
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Links */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(project.links.repo || project.links.demo) && (
              <>
                <SectionLabel color={project.color}>Access Points</SectionLabel>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {project.links.repo && (
                    <ExternalLink href={project.links.repo} label="Repository" color={project.color} />
                  )}
                  {project.links.demo && (
                    <ExternalLink href={project.links.demo} label="Live Demo" color={project.color} />
                  )}
                </div>
              </>
            )}

            {/* More Info button */}
            {(project.links.repo || project.links.demo) && (
              <a
                href={project.links.demo || project.links.repo}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  marginTop: '8px',
                  fontFamily: 'Space Mono, monospace',
                  fontSize: '0.65rem',
                  color: '#04060e',
                  background: project.color,
                  padding: '12px 20px',
                  textDecoration: 'none',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.85'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                View Full Project →
              </a>
            )}
          </section>
        </div>

        {/* Bottom accent line */}
        <div style={{
          height: '2px',
          background: `linear-gradient(90deg, ${project.color}40, ${project.color}10, transparent)`,
        }} />
      </div>
    </div>
  )
}

function SectionLabel({ children, color }) {
  return (
    <div style={{
      fontFamily: 'Space Mono, monospace',
      fontSize: '0.48rem',
      color: color,
      opacity: 0.6,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      marginBottom: '10px',
    }}>
      // {children}
    </div>
  )
}

function MetaStat({ label, value, color }) {
  return (
    <div>
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.42rem',
        color: 'rgba(144,202,249,0.35)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.72rem',
        color,
      }}>
        {value}
      </div>
    </div>
  )
}

function ExternalLink({ href, label, color }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '0.58rem',
        color,
        border: `1px solid ${color}30`,
        padding: '8px 16px',
        textDecoration: 'none',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}10`
        e.currentTarget.style.borderColor = `${color}50`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.borderColor = `${color}30`
      }}
    >
      ↗ {label}
    </a>
  )
}

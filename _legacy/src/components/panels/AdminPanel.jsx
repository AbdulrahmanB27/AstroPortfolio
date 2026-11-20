import { useState, useEffect, useCallback } from 'react'
import useStore, { VISUAL_MODE, VIEW_MODE } from '../../store/useStore'
import initialData from '../../data/data.json'

const LS_KEY = 'portfolio_admin_draft'

const BLANK_PROJECT = {
  id: '',
  title: 'New Project',
  shortDesc: '',
  fullDesc: '',
  domain: 'software',
  color: '#90CAF9',
  texture: 'rocky',
  size: 1.0,
  featured: false,
  orbitRadius: 22,
  orbitSpeed: 0.1,
  orbitOffset: 0,
  technologies: [],
  moons: [],
  images: [],
  links: { repo: '', demo: '' },
  diagrams: [],
}

const BLANK_EDUCATION = { institution: '', degree: '', year: '', gpa: '' }
const BLANK_EXPERIENCE = { company: '', role: '', period: '', description: '' }

const ACCENT = '#4FC3F7'
const ACCENT_DIM = 'rgba(79,195,247,0.7)'
const ACCENT_BG = 'rgba(79,195,247,0.06)'
const DANGER = '#FF5252'
const SURFACE = 'rgba(6, 10, 20, 0.94)'
const SURFACE_CARD = 'rgba(12, 18, 36, 0.6)'
const BORDER = 'rgba(79, 195, 247, 0.15)'
const TEXT_PRIMARY = 'rgba(235, 245, 255, 0.95)'
const TEXT_DIM = 'rgba(144, 202, 249, 0.5)'
const TEXT_LABEL = 'rgba(79, 195, 247, 0.6)'
const MONO = 'Space Mono, monospace'
const SANS = 'Space Grotesk, sans-serif'

function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

export default function AdminPanel() {
  const adminOpen = useStore((s) => s.adminOpen)
  const setAdminOpen = useStore((s) => s.setAdminOpen)
  const visualMode = useStore((s) => s.visualMode)
  const toggleVisualMode = useStore((s) => s.toggleVisualMode)
  const viewMode = useStore((s) => s.viewMode)
  const toggleViewMode = useStore((s) => s.toggleViewMode)

  const [data, setData] = useState(() => {
    const draft = loadDraft()
    return draft || JSON.parse(JSON.stringify(initialData))
  })
  const [activeTab, setActiveTab] = useState('owner')
  const [saved, setSaved] = useState(false)
  const [hasDraft, setHasDraft] = useState(() => !!loadDraft())
  const [errors, setErrors] = useState([])
  const [panelVisible, setPanelVisible] = useState(false)

  // Delayed open lets the CSS entrance transition kick in; close is immediate
  useEffect(() => {
    const t = setTimeout(() => setPanelVisible(adminOpen), adminOpen ? 50 : 0)
    return () => clearTimeout(t)
  }, [adminOpen])

  const persistDraft = useCallback((newData) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(newData))
      setHasDraft(true)
    } catch { /* quota exceeded etc */ }
  }, [])

  function updateData(updater) {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      persistDraft(next)
      return next
    })
  }

  if (!adminOpen) return null

  // ── Owner helpers ─────────────────────────────────────────────────────────
  function handleOwnerChange(field, value) {
    updateData((d) => ({ ...d, owner: { ...d.owner, [field]: value } }))
  }

  function handleResumeUrlChange(value) {
    updateData((d) => ({
      ...d,
      owner: { ...d.owner, resume: { ...d.owner.resume, downloadUrl: value } },
    }))
  }

  function handleEducationChange(idx, field, value) {
    updateData((d) => {
      const education = [...d.owner.resume.education]
      education[idx] = { ...education[idx], [field]: value }
      return { ...d, owner: { ...d.owner, resume: { ...d.owner.resume, education } } }
    })
  }
  function addEducation() {
    updateData((d) => ({
      ...d,
      owner: {
        ...d.owner,
        resume: {
          ...d.owner.resume,
          education: [...d.owner.resume.education, { ...BLANK_EDUCATION }],
        },
      },
    }))
  }
  function removeEducation(idx) {
    updateData((d) => ({
      ...d,
      owner: {
        ...d.owner,
        resume: {
          ...d.owner.resume,
          education: d.owner.resume.education.filter((_, i) => i !== idx),
        },
      },
    }))
  }

  function handleExperienceChange(idx, field, value) {
    updateData((d) => {
      const experience = [...d.owner.resume.experience]
      experience[idx] = { ...experience[idx], [field]: value }
      return { ...d, owner: { ...d.owner, resume: { ...d.owner.resume, experience } } }
    })
  }
  function addExperience() {
    updateData((d) => ({
      ...d,
      owner: {
        ...d.owner,
        resume: {
          ...d.owner.resume,
          experience: [...d.owner.resume.experience, { ...BLANK_EXPERIENCE }],
        },
      },
    }))
  }
  function removeExperience(idx) {
    updateData((d) => ({
      ...d,
      owner: {
        ...d.owner,
        resume: {
          ...d.owner.resume,
          experience: d.owner.resume.experience.filter((_, i) => i !== idx),
        },
      },
    }))
  }

  // ── Skills helpers ────────────────────────────────────────────────────────
  function handleSkillChange(catIdx, field, value) {
    updateData((d) => {
      const skills = [...d.skills]
      if (field === 'category') {
        skills[catIdx] = { ...skills[catIdx], category: value }
      } else if (field === 'items') {
        skills[catIdx] = { ...skills[catIdx], items: value.split(',').map((s) => s.trim()).filter(Boolean) }
      }
      return { ...d, skills }
    })
  }
  function addSkillCategory() {
    updateData((d) => ({ ...d, skills: [...d.skills, { category: 'New Category', items: [] }] }))
  }
  function removeSkillCategory(idx) {
    updateData((d) => ({ ...d, skills: d.skills.filter((_, i) => i !== idx) }))
  }


  // ── Project helpers ───────────────────────────────────────────────────────
  function handleProjectChange(idx, field, value) {
    updateData((d) => {
      const projects = [...d.projects]
      projects[idx] = { ...projects[idx], [field]: value }
      return { ...d, projects }
    })
  }
  function handleProjectLinkChange(idx, linkField, value) {
    updateData((d) => {
      const projects = [...d.projects]
      projects[idx] = { ...projects[idx], links: { ...projects[idx].links, [linkField]: value } }
      return { ...d, projects }
    })
  }
  function addProject() {
    const id = `project-${Date.now()}`
    updateData((d) => ({ ...d, projects: [...d.projects, { ...BLANK_PROJECT, id }] }))
  }
  function removeProject(idx) {
    updateData((d) => ({ ...d, projects: d.projects.filter((_, i) => i !== idx) }))
  }
  function moveProject(idx, dir) {
    updateData((d) => {
      const projects = [...d.projects]
      const target = idx + dir
      if (target < 0 || target >= projects.length) return d
      ;[projects[idx], projects[target]] = [projects[target], projects[idx]]
      return { ...d, projects }
    })
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate() {
    const errs = []
    if (!data.owner.name?.trim()) errs.push('Owner name is required')
    if (!data.owner.email?.trim()) errs.push('Owner email is required')
    data.projects.forEach((p, i) => {
      if (!p.title?.trim()) errs.push(`Project ${i + 1}: title is required`)
      if (!p.fullDesc?.trim()) errs.push(`Project ${i + 1}: description is required`)
    })
    return errs
  }

  function handleExport() {
    const errs = validate()
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'data.json'
    a.click()
    URL.revokeObjectURL(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function discardDraft() {
    localStorage.removeItem(LS_KEY)
    setData(JSON.parse(JSON.stringify(initialData)))
    setHasDraft(false)
  }

  const tabs = [
    { id: 'owner', label: 'Owner' },
    { id: 'resume', label: 'Resume' },
    { id: 'skills', label: 'Skills' },
    { id: 'projects', label: 'Projects' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: panelVisible ? 1 : 0,
      transition: 'opacity 0.3s ease',
    }}>
      <div style={{
        width: 'min(1080px, 96vw)', maxHeight: '94vh',
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: '8px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: `0 0 100px rgba(0,0,0,0.8), 0 0 40px rgba(79,195,247,0.05), inset 0 0 1px ${ACCENT}30`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        transform: panelVisible ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(12px)',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: `linear-gradient(180deg, rgba(79,195,247,0.03) 0%, transparent 100%)`,
        }}>
          <div>
            <div style={{
              fontFamily: MONO, fontSize: '0.6rem',
              color: TEXT_DIM, letterSpacing: '0.2em', textTransform: 'uppercase',
              marginBottom: '4px',
            }}>
              restricted access // admin interface
            </div>
            <div style={{
              fontFamily: SANS, fontSize: '1.2rem', fontWeight: 600,
              color: '#FFFFFF', letterSpacing: '0.04em',
              textShadow: `0 0 20px ${ACCENT}80`,
            }}>
              Core <span style={{ color: ACCENT }}>Terminal</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {hasDraft && (
              <ActionBtn color={DANGER} onClick={discardDraft}>Discard Draft</ActionBtn>
            )}
            <ActionBtn color={saved ? '#66BB6A' : ACCENT} onClick={handleExport}>
              {saved ? '✓ Exported' : '↓ Export data.json'}
            </ActionBtn>
            <ActionBtn color={TEXT_DIM} onClick={() => setAdminOpen(false)}>Close</ActionBtn>
          </div>
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div style={{
            padding: '10px 24px',
            background: 'rgba(239,83,80,0.06)',
            borderBottom: `1px solid rgba(239,83,80,0.2)`,
          }}>
            {errors.map((e, i) => (
              <div key={i} style={{
                fontFamily: MONO, fontSize: '0.68rem',
                color: DANGER, marginBottom: '2px',
              }}>
                ▸ {e}
              </div>
            ))}
          </div>
        )}

        {/* Draft Indicator */}
        {hasDraft && (
          <div style={{
            padding: '6px 24px',
            background: 'rgba(255,213,79,0.04)',
            borderBottom: `1px solid rgba(255,213,79,0.1)`,
          }}>
            <div style={{
              fontFamily: MONO, fontSize: '0.62rem',
              color: 'rgba(255,213,79,0.6)', letterSpacing: '0.08em',
            }}>
              ◆ Editing from saved draft — changes auto-saved locally
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${BORDER}`,
          background: 'rgba(4,8,16,0.5)',
        }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1,
                background: active ? ACCENT_BG : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
                color: active ? ACCENT : TEXT_DIM,
                fontFamily: MONO,
                fontSize: '0.72rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '12px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '22px 24px',
          background: `linear-gradient(180deg, transparent 0%, rgba(79,195,247,0.01) 100%)`,
        }}>

          {/* ── Owner ──────────────────────────────────────────────────── */}
          {activeTab === 'owner' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <InfoBanner>Personal information displayed in the star core panel.</InfoBanner>
              <CardSection title="Identity">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {['name', 'title', 'tagline', 'email', 'location'].map((field) => (
                    <Field key={field} label={field} value={data.owner[field] || ''}
                      onChange={(v) => handleOwnerChange(field, v)}
                      required={field === 'name' || field === 'email'}
                    />
                  ))}
                </div>
              </CardSection>
              <CardSection title="Social Links">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {['github', 'linkedin'].map((field) => (
                    <Field key={field} label={field} value={data.owner[field] || ''}
                      onChange={(v) => handleOwnerChange(field, v)}
                    />
                  ))}
                </div>
              </CardSection>
              <CardSection title="Bio">
                <Field label="about" value={data.owner.about} multiline onChange={(v) => handleOwnerChange('about', v)} />
              </CardSection>
              <CardSection title="Metadata">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="interests (comma-separated)" value={(data.owner.interests || []).join(', ')}
                    onChange={(v) => handleOwnerChange('interests', v.split(',').map(s => s.trim()).filter(Boolean))}
                  />
                  <Field label="goals (comma-separated)" value={(data.owner.goals || []).join(', ')}
                    onChange={(v) => handleOwnerChange('goals', v.split(',').map(s => s.trim()).filter(Boolean))}
                  />
                </div>
              </CardSection>
            </div>
          )}

          {/* ── Resume ─────────────────────────────────────────────────── */}
          {activeTab === 'resume' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <InfoBanner>Education, experience, and resume download URL.</InfoBanner>

              <CardSection title="Download">
                <Field label="Resume PDF URL" value={data.owner.resume?.downloadUrl || ''}
                  onChange={(v) => handleResumeUrlChange(v)}
                />
              </CardSection>

              <CardSection title="Education" action={<ActionBtn color={ACCENT} onClick={addEducation}>+ Add</ActionBtn>}>
                {(data.owner.resume?.education || []).map((edu, idx) => (
                  <EntryCard key={idx} label={`Education #${idx + 1}`} color={ACCENT}
                    onRemove={() => removeEducation(idx)}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {['institution', 'degree', 'year', 'gpa'].map((f) => (
                        <Field key={f} label={f} value={edu[f] || ''} onChange={(v) => handleEducationChange(idx, f, v)} />
                      ))}
                    </div>
                  </EntryCard>
                ))}
              </CardSection>

              <CardSection title="Experience" action={<ActionBtn color={ACCENT} onClick={addExperience}>+ Add</ActionBtn>}>
                {(data.owner.resume?.experience || []).map((exp, idx) => (
                  <EntryCard key={idx} label={`Experience #${idx + 1}`} color={ACCENT}
                    onRemove={() => removeExperience(idx)}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {['company', 'role', 'period'].map((f) => (
                        <Field key={f} label={f} value={exp[f] || ''} onChange={(v) => handleExperienceChange(idx, f, v)} />
                      ))}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <Field label="description" value={exp.description || ''} multiline onChange={(v) => handleExperienceChange(idx, 'description', v)} />
                    </div>
                  </EntryCard>
                ))}
              </CardSection>
            </div>
          )}

          {/* ── Skills ─────────────────────────────────────────────────── */}
          {activeTab === 'skills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <InfoBanner>Skill categories displayed in the star core. Items are comma-separated.</InfoBanner>
              {data.skills.map((group, catIdx) => (
                <EntryCard key={catIdx} label={group.category || 'Untitled'} color={ACCENT}
                  onRemove={() => removeSkillCategory(catIdx)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <Field label="category name" value={group.category} onChange={(v) => handleSkillChange(catIdx, 'category', v)} />
                    <Field label="items (comma-separated)" value={group.items.join(', ')} onChange={(v) => handleSkillChange(catIdx, 'items', v)} />
                  </div>
                </EntryCard>
              ))}
              <ActionBtn color={ACCENT} onClick={addSkillCategory}>+ Add Skill Category</ActionBtn>
            </div>
          )}

          {/* ── Projects ───────────────────────────────────────────────── */}
          {activeTab === 'projects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <InfoBanner>Project planets in the solar system. Size = sphere radius (0.5-2.5). Use arrows to reorder.</InfoBanner>
              {data.projects.map((proj, idx) => (
                <div key={proj.id || idx} style={{
                  border: `1px solid ${proj.color}20`,
                  borderLeft: `3px solid ${proj.color}60`,
                  borderRadius: '3px',
                  background: SURFACE_CARD,
                  overflow: 'hidden',
                }}>
                  {/* Project header */}
                  <div style={{
                    padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: `1px solid ${proj.color}12`,
                    background: `${proj.color}06`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: proj.color, opacity: 0.8,
                      }} />
                      <span style={{
                        fontFamily: MONO, fontSize: '0.6rem',
                        color: proj.color, letterSpacing: '0.1em', textTransform: 'uppercase',
                      }}>
                        Planet {idx + 1}: {proj.title || proj.id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <SmallBtn color={proj.color} onClick={() => moveProject(idx, -1)}
                        disabled={idx === 0}>↑</SmallBtn>
                      <SmallBtn color={proj.color} onClick={() => moveProject(idx, 1)}
                        disabled={idx === data.projects.length - 1}>↓</SmallBtn>
                      <SmallBtn color={DANGER} onClick={() => removeProject(idx)}>✕</SmallBtn>
                    </div>
                  </div>

                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {['title', 'shortDesc', 'domain', 'color', 'texture'].map((field) => (
                        <Field key={field} label={field} value={String(proj[field] || '')}
                          onChange={(v) => handleProjectChange(idx, field, v)}
                          required={field === 'title'}
                          accentColor={proj.color}
                        />
                      ))}
                      {['size', 'orbitRadius', 'orbitSpeed', 'orbitOffset'].map((field) => (
                        <Field key={field} label={field} value={String(proj[field] || '')}
                          onChange={(v) => handleProjectChange(idx, field, parseFloat(v) || proj[field])}
                          accentColor={proj.color}
                        />
                      ))}
                    </div>

                    <Field label="Full Description" value={proj.fullDesc} multiline required
                      onChange={(v) => handleProjectChange(idx, 'fullDesc', v)}
                      accentColor={proj.color}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <Field label="technologies (comma-separated)"
                        value={(proj.technologies || []).join(', ')}
                        onChange={(v) => handleProjectChange(idx, 'technologies', v.split(',').map(s => s.trim()).filter(Boolean))}
                        accentColor={proj.color}
                      />
                      <Field label="moons (comma-separated)"
                        value={(proj.moons || []).join(', ')}
                        onChange={(v) => handleProjectChange(idx, 'moons', v.split(',').map(s => s.trim()).filter(Boolean))}
                        accentColor={proj.color}
                      />
                      <Field label="repo URL" value={proj.links?.repo || ''}
                        onChange={(v) => handleProjectLinkChange(idx, 'repo', v)}
                        accentColor={proj.color}
                      />
                      <Field label="demo URL" value={proj.links?.demo || ''}
                        onChange={(v) => handleProjectLinkChange(idx, 'demo', v)}
                        accentColor={proj.color}
                      />
                      <Field label="images (comma-separated URLs)"
                        value={(proj.images || []).join(', ')}
                        onChange={(v) => handleProjectChange(idx, 'images', v.split(',').map(s => s.trim()).filter(Boolean))}
                        accentColor={proj.color}
                      />
                    </div>

                    {/* Featured toggle */}
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      fontFamily: MONO, fontSize: '0.5rem',
                      color: TEXT_LABEL, letterSpacing: '0.1em', textTransform: 'uppercase',
                      cursor: 'pointer', padding: '4px 0',
                    }}>
                      <div style={{
                        width: '32px', height: '16px', borderRadius: '8px',
                        background: proj.featured ? `${proj.color}40` : 'rgba(255,255,255,0.08)',
                        border: `1px solid ${proj.featured ? proj.color : 'rgba(255,255,255,0.15)'}`,
                        position: 'relative', transition: 'all 0.2s',
                      }}>
                        <div style={{
                          width: '12px', height: '12px', borderRadius: '50%',
                          background: proj.featured ? proj.color : 'rgba(255,255,255,0.3)',
                          position: 'absolute', top: '1px',
                          left: proj.featured ? '17px' : '1px',
                          transition: 'all 0.2s',
                        }} />
                      </div>
                      <input type="checkbox" checked={proj.featured || false}
                        onChange={(e) => handleProjectChange(idx, 'featured', e.target.checked)}
                        style={{ display: 'none' }}
                      />
                      Featured Planet (orbital ring)
                    </label>
                  </div>
                </div>
              ))}
              <ActionBtn color={ACCENT} onClick={addProject}>+ Add Project Planet</ActionBtn>
            </div>
          )}

          {/* ── Settings ───────────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <InfoBanner>Visual and display settings for the portfolio.</InfoBanner>

              <SettingsCard
                title="Visual Environment"
                description={visualMode === VISUAL_MODE.SCHEMATIC ? 'Schematic Grid (Wireframe)' : 'Deep Space (Realistic)'}
                actionLabel={visualMode === VISUAL_MODE.SCHEMATIC ? 'Switch to Deep Space' : 'Switch to Schematic'}
                onAction={toggleVisualMode}
              />

              <SettingsCard
                title="View Mode"
                description={viewMode === VIEW_MODE.SIMPLIFIED ? 'Simplified View (2D HTML)' : 'Solar System (3D Interactive)'}
                actionLabel={viewMode === VIEW_MODE.SIMPLIFIED ? 'Return to 3D' : 'Enable Simplified'}
                onAction={toggleViewMode}
              />

              <div style={{
                fontFamily: MONO, fontSize: '0.62rem',
                color: TEXT_DIM, letterSpacing: '0.08em',
                padding: '8px 0',
              }}>
                Keyboard: Type "admin" to toggle this panel. Shift+G toggles schematic.
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div style={{
          padding: '8px 24px',
          borderTop: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(4,8,16,0.8)',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: '0.58rem',
            color: TEXT_DIM, letterSpacing: '0.1em',
          }}>
            {data.projects.length} planets · {data.skills.length} skill categories · {
              (data.owner.resume?.education?.length || 0) + (data.owner.resume?.experience?.length || 0)
            } timeline entries
          </div>
          <div style={{
            fontFamily: MONO, fontSize: '0.58rem',
            color: hasDraft ? 'rgba(255,213,79,0.5)' : 'rgba(102,187,106,0.5)',
            letterSpacing: '0.1em',
          }}>
            {hasDraft ? '◆ Draft' : '◇ Clean'}
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Reusable Sub-components ────────────────────────────────────────────────

function Field({ label, value, onChange, multiline, required, accentColor }) {
  const color = accentColor || ACCENT
  const isEmpty = required && !value?.toString().trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{
        fontFamily: MONO, fontSize: '0.6rem',
        color: TEXT_LABEL, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        {label}{required ? ' *' : ''}
      </label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
          style={{
            ...fieldStyle,
            borderColor: isEmpty ? DANGER : BORDER,
          }}
          onFocus={(e) => { e.target.style.borderColor = color; e.target.style.boxShadow = `0 0 0 1px ${color}20` }}
          onBlur={(e) => { e.target.style.borderColor = isEmpty ? DANGER : BORDER; e.target.style.boxShadow = 'none' }}
        />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          style={{
            ...fieldStyle,
            borderColor: isEmpty ? DANGER : BORDER,
          }}
          onFocus={(e) => { e.target.style.borderColor = color; e.target.style.boxShadow = `0 0 0 1px ${color}20` }}
          onBlur={(e) => { e.target.style.borderColor = isEmpty ? DANGER : BORDER; e.target.style.boxShadow = 'none' }}
        />
      )}
    </div>
  )
}

function CardSection({ title, children, action }) {
  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      borderRadius: '3px',
      background: SURFACE_CARD,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: ACCENT_BG,
      }}>
        <span style={{
          fontFamily: MONO, fontSize: '0.7rem',
          color: ACCENT_DIM, letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>
          // {title}
        </span>
        {action}
      </div>
      <div style={{ padding: '14px' }}>
        {children}
      </div>
    </div>
  )
}

function EntryCard({ label, color, onRemove, children }) {
  return (
    <div style={{
      border: `1px solid ${color}18`,
      borderLeft: `2px solid ${color}40`,
      borderRadius: '2px',
      padding: '12px 14px',
      marginBottom: '8px',
      background: 'rgba(4,8,16,0.4)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '10px',
      }}>
        <span style={{
          fontFamily: MONO, fontSize: '0.65rem',
          color: `${color}90`, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <SmallBtn color={DANGER} onClick={onRemove}>✕</SmallBtn>
      </div>
      {children}
    </div>
  )
}

function InfoBanner({ children }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: '0.68rem',
      color: ACCENT_DIM,
      border: `1px solid ${BORDER}`,
      borderLeft: `2px solid ${ACCENT}40`,
      borderRadius: '2px',
      padding: '10px 14px',
      letterSpacing: '0.04em',
      background: ACCENT_BG,
      marginBottom: '4px',
    }}>
      {children}
    </div>
  )
}

function SettingsCard({ title, description, actionLabel, onAction }) {
  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      borderRadius: '3px',
      background: SURFACE_CARD,
      padding: '16px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{
          fontFamily: MONO, fontSize: '0.68rem',
          color: ACCENT, letterSpacing: '0.12em', textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: '0.8rem',
          color: TEXT_PRIMARY,
        }}>
          {description}
        </div>
      </div>
      <ActionBtn color={ACCENT} onClick={onAction}>{actionLabel}</ActionBtn>
    </div>
  )
}

function ActionBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'none',
      border: `1px solid ${color}50`,
      color,
      fontFamily: MONO,
      fontSize: '0.65rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '6px 14px',
      cursor: 'pointer',
      borderRadius: '2px',
      transition: 'all 0.2s',
      whiteSpace: 'nowrap',
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}12`
        e.currentTarget.style.borderColor = `${color}80`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.borderColor = `${color}50`
      }}
    >
      {children}
    </button>
  )
}

function SmallBtn({ color, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'none',
      border: `1px solid ${color}40`,
      color: color,
      fontFamily: MONO,
      fontSize: '0.65rem',
      padding: '3px 8px',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.3 : 1,
      borderRadius: '2px',
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}

const fieldStyle = {
  background: 'rgba(4,8,16,0.6)',
  border: `1px solid ${BORDER}`,
  borderRadius: '2px',
  color: TEXT_PRIMARY,
  fontFamily: MONO,
  fontSize: '0.82rem',
  padding: '8px 10px',
  outline: 'none',
  resize: 'vertical',
  width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

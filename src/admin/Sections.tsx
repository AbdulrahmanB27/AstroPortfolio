import { useEffect, useRef, useState } from 'react'
import { LIMITS, uniqueId, type Portfolio } from '../content/schema'
import { siteAssetUrl } from './assets'
import { Range, Rows, Text, TextList, Toggle } from './fields'

type SectionProps<K extends keyof Portfolio> = {
  value: Portfolio[K]
  onChange: (value: Portfolio[K]) => void
}

export function SiteSection({ value, onChange }: SectionProps<'site'>) {
  const { settings } = value
  const { grid } = settings
  const updateGrid = (patch: Partial<typeof grid>) => onChange({ ...value, settings: { ...settings, grid: { ...grid, ...patch } } })
  return <>
    <Text name="site.title" label="Title" value={value.title} onChange={(title) => onChange({ ...value, title })} />
    <Text name="site.description" label="Description" value={value.description} multiline
      onChange={(description) => onChange({ ...value, description })} />
    <fieldset className="collection">
      <legend>Schematic grid</legend>
      <Toggle name="site.settings.grid.enabled" label="Show schematic grid" value={grid.enabled}
        onChange={(enabled) => updateGrid({ enabled })} />
      <div className="field-grid">
        <Range name="site.settings.grid.opacity" label="Grid opacity" value={grid.opacity} {...LIMITS.gridOpacity}
          step={0.01} onChange={(opacity) => updateGrid({ opacity })} />
        <Range name="site.settings.grid.density" label="Grid density" value={grid.density} {...LIMITS.gridDensity}
          step={1} onChange={(density) => updateGrid({ density })} />
      </div>
    </fieldset>
    <Range name="site.settings.orbitSpeed" label="Orbit speed" value={settings.orbitSpeed} {...LIMITS.orbitSpeed}
      step={0.05} onChange={(orbitSpeed) => onChange({ ...value, settings: { ...settings, orbitSpeed } })} />
  </>
}

export function ProfileSection({ value, onChange }: SectionProps<'profile'>) {
  return <>
    <div className="field-grid">
      <Text name="profile.name" label="Name" value={value.name} onChange={(name) => onChange({ ...value, name })} />
      <Text name="profile.initials" label="Initials" value={value.initials} onChange={(initials) => onChange({ ...value, initials })} />
      <Text name="profile.role" label="Role" value={value.role} onChange={(role) => onChange({ ...value, role })} />
      <Text name="profile.location" label="Location" value={value.location} onChange={(location) => onChange({ ...value, location })} />
    </div>
    <Text name="profile.tagline" label="Tagline" value={value.tagline} onChange={(tagline) => onChange({ ...value, tagline })} />
    <TextList name="profile.about" label="About" itemLabel="Paragraph" items={value.about} multiline
      onChange={(about) => onChange({ ...value, about })} />
    <TextList name="profile.goals" label="Goals" itemLabel="Goal" items={value.goals}
      onChange={(goals) => onChange({ ...value, goals })} />
    <TextList name="profile.interests" label="Interest tags" itemLabel="Interest" items={value.interests}
      onChange={(interests) => onChange({ ...value, interests })} />
    <Toggle name="profile.placeholder" label="Mark as placeholder" value={value.placeholder}
      onChange={(placeholder) => onChange({ ...value, placeholder })} />
  </>
}

const newId = (base: string, items: { id: string }[]) => uniqueId(base, items.map((item) => item.id))

export function EducationSection({ value, onChange }: SectionProps<'education'>) {
  return <Rows name="education" label="Entries" itemLabel="Education entry" items={value} onChange={onChange}
    create={() => ({ id: newId('education', value), school: '', degree: '', start: '', end: '', details: [], placeholder: false })}
    render={(entry, update, path) => <>
      <div className="field-grid">
        <Text name={`${path}.school`} label="School" value={entry.school} onChange={(school) => update({ ...entry, school })} />
        <Text name={`${path}.degree`} label="Degree" value={entry.degree} onChange={(degree) => update({ ...entry, degree })} />
        <Text name={`${path}.start`} label="Start" value={entry.start} onChange={(start) => update({ ...entry, start })} />
        <Text name={`${path}.end`} label="End" value={entry.end} onChange={(end) => update({ ...entry, end })} />
      </div>
      <Text name={`${path}.id`} label="ID" value={entry.id} onChange={(id) => update({ ...entry, id })} />
      <TextList name={`${path}.details`} label="Details" itemLabel="Detail" items={entry.details}
        onChange={(details) => update({ ...entry, details })} />
      <Toggle name={`${path}.placeholder`} label="Mark as placeholder" value={entry.placeholder}
        onChange={(placeholder) => update({ ...entry, placeholder })} />
    </>} />
}

export function ExperienceSection({ value, onChange }: SectionProps<'experience'>) {
  return <Rows name="experience" label="Entries" itemLabel="Experience entry" items={value} onChange={onChange}
    create={() => ({ id: newId('experience', value), title: '', org: '', start: '', end: '', summary: '', highlights: [], placeholder: false })}
    render={(entry, update, path) => <>
      <div className="field-grid">
        <Text name={`${path}.title`} label="Title" value={entry.title} onChange={(title) => update({ ...entry, title })} />
        <Text name={`${path}.org`} label="Organization" value={entry.org} onChange={(org) => update({ ...entry, org })} />
        <Text name={`${path}.start`} label="Start" value={entry.start} onChange={(start) => update({ ...entry, start })} />
        <Text name={`${path}.end`} label="End" value={entry.end} onChange={(end) => update({ ...entry, end })} />
      </div>
      <Text name={`${path}.id`} label="ID" value={entry.id} onChange={(id) => update({ ...entry, id })} />
      <Text name={`${path}.summary`} label="Summary" value={entry.summary} multiline onChange={(summary) => update({ ...entry, summary })} />
      <TextList name={`${path}.highlights`} label="Highlights" itemLabel="Highlight" items={entry.highlights}
        onChange={(highlights) => update({ ...entry, highlights })} />
      <Toggle name={`${path}.placeholder`} label="Mark as placeholder" value={entry.placeholder}
        onChange={(placeholder) => update({ ...entry, placeholder })} />
    </>} />
}

export function SkillsSection({ value, onChange }: SectionProps<'skills'>) {
  return <Rows name="skills" label="Skill groups" itemLabel="Group" items={value} onChange={onChange}
    create={() => ({ id: newId('skills', value), group: '', items: [], placeholder: false })}
    render={(entry, update, path) => <>
      <div className="field-grid">
        <Text name={`${path}.group`} label="Group name" value={entry.group} onChange={(group) => update({ ...entry, group })} />
        <Text name={`${path}.id`} label="ID" value={entry.id} onChange={(id) => update({ ...entry, id })} />
      </div>
      <TextList name={`${path}.items`} label="Items" itemLabel="Skill" items={entry.items}
        onChange={(items) => update({ ...entry, items })} />
      <Toggle name={`${path}.placeholder`} label="Mark as placeholder" value={entry.placeholder}
        onChange={(placeholder) => update({ ...entry, placeholder })} />
    </>} />
}

function ResumeCheck({ path }: { path: string }) {
  const [result, setResult] = useState({ message: '', open: false })
  const [checking, setChecking] = useState(false)
  const request = useRef<AbortController | null>(null)
  const href = siteAssetUrl(path)

  useEffect(() => () => request.current?.abort(), [])

  async function check() {
    if (!href) return
    const controller = new AbortController()
    request.current = controller
    setChecking(true)
    setResult({ message: 'Checking file…', open: false })
    try {
      const response = await fetch(href, { signal: controller.signal, cache: 'no-store' })
      const type = response.headers.get('content-type')
      const label = type ? `Content type ${type}.` : 'Content type unavailable.'
      const pdf = type?.split(';')[0].trim().toLowerCase() === 'application/pdf'
      void response.body?.cancel().catch(() => {})
      if (response.ok) {
        setResult({ message: `Found. ${label}${pdf ? '' : ' Expected a PDF.'}`, open: pdf })
      } else {
        setResult({ message: `File not found (HTTP ${response.status}). ${label}`, open: false })
      }
    } catch {
      if (!controller.signal.aborted) setResult({ message: 'Could not check the file. Check the URL and whether it permits browser requests.', open: false })
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  return <div className="file-check">
    <div className="actions">
      <button type="button" onClick={() => void check()} disabled={!href || checking}>Check file</button>
      {result.open && <a className="button" href={href} target="_blank" rel="noopener noreferrer">Open</a>}
    </div>
    <p className="muted" role="status">{result.message}</p>
  </div>
}

export function ResumeSection({ value, onChange }: SectionProps<'resume'>) {
  return <>
    <Text name="resume.pdf" label="PDF path" value={value.pdf} inputMode="url" onChange={(pdf) => onChange({ ...value, pdf })} />
    <p className="muted">Put the PDF in <code>public/</code>. For example, save it as <code>public/resume.pdf</code> and enter <code>resume.pdf</code>.</p>
    <ResumeCheck key={value.pdf} path={value.pdf.trim()} />
    <Text name="resume.updated" label="Updated" value={value.updated} onChange={(updated) => onChange({ ...value, updated })} />
    <Text name="resume.summary" label="Summary" value={value.summary} multiline onChange={(summary) => onChange({ ...value, summary })} />
  </>
}

export function ContactSection({ value, onChange }: SectionProps<'contact'>) {
  return <>
    <Text name="contact.email" label="Email" value={value.email} inputMode="email" onChange={(email) => onChange({ ...value, email })} />
    <Text name="contact.note" label="Note" value={value.note} multiline onChange={(note) => onChange({ ...value, note })} />
    <Rows name="contact.links" label="Links" itemLabel="Link" items={value.links}
      onChange={(links) => onChange({ ...value, links })}
      create={() => ({ id: newId('link', value.links), label: '', url: '' })}
      render={(link, update, path) => <>
        <div className="field-grid">
          <Text name={`${path}.label`} label="Label" value={link.label} onChange={(label) => update({ ...link, label })} />
          <Text name={`${path}.id`} label="ID" value={link.id} onChange={(id) => update({ ...link, id })} />
        </div>
        <Text name={`${path}.url`} label="URL" value={link.url} inputMode="url" onChange={(url) => update({ ...link, url })} />
      </>} />
  </>
}

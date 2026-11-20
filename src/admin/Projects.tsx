import { useState } from 'react'
import {
  LINK_KINDS, LIMITS, PLANET_TYPES, defaultProject, isHexColor, isSafeLink, uniqueId,
  type PlanetSpec, type PlanetType, type Project, type ProjectLink,
} from '../content/schema'
import { siteAssetUrl } from './assets'
import { Field, moveItem, Range, RowActions, Rows, Select, Text, TextList, Toggle } from './fields'

// Match the scene's PLANET_LOOKS without loading Three.js or shaders in the studio.
const typePalettes: Record<PlanetType, [string, string, string]> = {
  rock: ['#6b6965', '#8f8b84', '#454449'],
  gas: ['#b98a4e', '#e3c79a', '#7a4a26'],
  ice: ['#b3c3cc', '#e8eef1', '#6d8da2'],
  desert: ['#a4573a', '#cf8a5c', '#5a3628'],
  ocean: ['#1d6672', '#5d7648', '#b3a078'],
  ember: ['#2a2726', '#4c4541', '#ff6a1e'],
  moon: ['#96948e', '#c2bfb6', '#6b6966'],
}

const paletteLabels = ['Base colour', 'Secondary colour', 'Accent colour']
const suggestedIds = new WeakSet<Project>()
const randomSeed = () => Math.floor(Math.random() * 2_147_483_647)
const lanes = Array.from({ length: LIMITS.orbit.max }, (_, index) => index + 1)
const moonCounts = Array.from({ length: LIMITS.moons.max + 1 }, (_, index) => index)

function PlanetFields({ name, planet, onChange }: {
  name: string; planet: PlanetSpec; onChange: (planet: PlanetSpec) => void
}) {
  const defaults = typePalettes[planet.type]
  const updatePalette = (index: number, color: string | undefined) => {
    const palette = [...planet.palette]
    while (palette.length <= index) palette.push(defaults[palette.length])
    palette[index] = color ?? defaults[index]
    if (color === undefined) {
      while (palette.length && palette.at(-1) === defaults[palette.length - 1]) palette.pop()
    }
    onChange({ ...planet, palette })
  }

  return <fieldset className="collection">
    <legend>Planet settings</legend>
    <div className="field-grid">
      <Select name={`${name}.type`} label="Type" value={planet.type} options={PLANET_TYPES}
        onChange={(type) => onChange({ ...planet, type })} />
      <Range name={`${name}.size`} label="Size" value={planet.size} {...LIMITS.planetSize} step={0.01}
        onChange={(size) => onChange({ ...planet, size })} />
    </div>
    <fieldset className="collection">
      <legend>Palette</legend>
      <p className="muted">Clear the palette to use the selected type’s default colours.</p>
      <div className="palette-grid">
        {paletteLabels.map((label, index) => {
          const custom = planet.palette[index]
          return <div className="palette-entry" key={label}>
            <Field name={`${name}.palette[${index}]`} label={label}>
              {(attrs) => <input {...attrs} type="color" value={custom && isHexColor(custom) ? custom : defaults[index]}
                onChange={(event) => updatePalette(index, event.target.value)} />}
            </Field>
            <button type="button" disabled={!custom || custom === defaults[index]} onClick={() => updatePalette(index, undefined)}
              aria-label={`Use default ${label.toLowerCase()}`}>Use default</button>
          </div>
        })}
      </div>
      <button type="button" disabled={!planet.palette.length} onClick={() => onChange({ ...planet, palette: [] })}>Clear palette</button>
    </fieldset>
    <div className="field-grid">
      <Field name={`${name}.orbit`} label="Orbit lane">
        {(attrs) => <select {...attrs} value={planet.orbit ?? ''} onChange={(event) =>
          onChange({ ...planet, orbit: event.target.value === '' ? null : Number(event.target.value) })}>
          <option value="">Automatic</option>
          {planet.orbit !== null && !lanes.includes(planet.orbit) && <option value={planet.orbit}>{planet.orbit}</option>}
          {lanes.map((lane) => <option key={lane} value={lane}>{lane}</option>)}
        </select>}
      </Field>
      <Field name={`${name}.moons`} label="Moons">
        {(attrs) => <select {...attrs} value={planet.moons}
          onChange={(event) => onChange({ ...planet, moons: Number(event.target.value) })}>
          {moonCounts.map((count) => <option key={count} value={count}>{count}</option>)}
        </select>}
      </Field>
    </div>
    <div className="field-grid">
      <Field name={`${name}.phase-mode`} label="Phase mode">
        {(attrs) => <select {...attrs} value={planet.phase === null ? 'automatic' : 'manual'}
          onChange={(event) => onChange({ ...planet, phase: event.target.value === 'automatic' ? null : 0 })}>
          <option value="automatic">Automatic</option>
          <option value="manual">Manual</option>
        </select>}
      </Field>
      {planet.phase !== null && <Range name={`${name}.phase`} label="Phase" value={planet.phase} min={0} max={1} step={0.01}
        onChange={(phase) => onChange({ ...planet, phase })} />}
    </div>
    <Toggle name={`${name}.ring`} label="Show ring" value={planet.ring} onChange={(ring) => onChange({ ...planet, ring })} />
    <Field name={`${name}.seed`} label="Seed">
      {(attrs) => <div className="inline-control">
        <input {...attrs} type="number" step={1} value={planet.seed} onChange={(event) => {
          const seed = event.target.valueAsNumber
          onChange({ ...planet, seed: Number.isFinite(seed) ? Math.round(seed) : 0 })
        }} />
        <button type="button" onClick={() => onChange({ ...planet, seed: randomSeed() })}>Randomise</button>
      </div>}
    </Field>
  </fieldset>
}

function ProjectFields({ value, name, update, changeTitle, changeId }: {
  value: Project; name: string; update: (patch: Partial<Project>) => void
  changeTitle: (title: string) => void; changeId: (id: string) => void
}) {
  return <>
    <div className="field-grid">
      <Text name={`${name}.title`} label="Title" value={value.title} onChange={changeTitle} />
      <Text name={`${name}.id`} label="ID" value={value.id} onChange={changeId} />
      <Text name={`${name}.category`} label="Category" value={value.category} onChange={(category) => update({ category })} />
      <Text name={`${name}.year`} label="Year" value={value.year} onChange={(year) => update({ year })} />
      <Text name={`${name}.role`} label="Role" value={value.role} onChange={(role) => update({ role })} />
    </div>
    <Text name={`${name}.summary`} label="Summary" value={value.summary} multiline onChange={(summary) => update({ summary })} />
    <TextList name={`${name}.description`} label="Description" itemLabel="Paragraph" items={value.description} multiline
      onChange={(description) => update({ description })} />
    <TextList name={`${name}.tags`} label="Tags" itemLabel="Tag" items={value.tags} onChange={(tags) => update({ tags })} />
    <div className="actions flags">
      <Toggle name={`${name}.featured`} label="Featured project" value={value.featured}
        onChange={(featured) => update({ featured })} />
      <Toggle name={`${name}.placeholder`} label="Mark as placeholder" value={value.placeholder}
        onChange={(placeholder) => update({ placeholder })} />
    </div>
    <Rows name={`${name}.media`} label="Media" itemLabel="Media item" items={value.media} onChange={(media) => update({ media })}
      create={() => ({ src: '', alt: '', caption: '' })}
      render={(item, change, path) => <>
        <Text name={`${path}.src`} label="Source path or URL" value={item.src} inputMode="url"
          onChange={(src) => change({ ...item, src })} />
        <Text name={`${path}.alt`} label="Alt text" value={item.alt} onChange={(alt) => change({ ...item, alt })} />
        <Text name={`${path}.caption`} label="Caption" value={item.caption} onChange={(caption) => change({ ...item, caption })} />
      </>} />
    <Rows<ProjectLink> name={`${name}.links`} label="Links" itemLabel="Link" items={value.links} onChange={(links) => update({ links })}
      create={() => ({ label: '', url: '', kind: 'other' })}
      render={(item, change, path) => <>
        <div className="field-grid">
          <Text name={`${path}.label`} label="Label" value={item.label} onChange={(label) => change({ ...item, label })} />
          <Select name={`${path}.kind`} label="Kind" value={item.kind} options={LINK_KINDS} onChange={(kind) => change({ ...item, kind })} />
        </div>
        <Text name={`${path}.url`} label="URL" value={item.url} inputMode="url" onChange={(url) => change({ ...item, url })} />
      </>} />
    <PlanetFields name={`${name}.planet`} planet={value.planet} onChange={(planet) => update({ planet })} />
  </>
}

export function ProjectsSection({ items, selected, onSelect, onChange }: {
  items: Project[]; selected: number; onSelect: (index: number, field?: 'title' | 'id') => void; onChange: (items: Project[]) => void
}) {
  const [editorRevision, setEditorRevision] = useState(0)
  const active = items[selected]
  const nextId = (title: string, exclude = -1) => uniqueId(title, items.filter((_, index) => index !== exclude).map((item) => item.id))

  function add(project: Project, field: 'title' | 'id') {
    suggestedIds.add(project)
    onChange([...items, project])
    onSelect(items.length, field)
  }

  function update(patch: Partial<Project>, suggestId = suggestedIds.has(active)) {
    const next = { ...active, ...patch }
    if (suggestId) suggestedIds.add(next)
    onChange(items.map((item, index) => index === selected ? next : item))
  }

  return <>
    <div className="project-list">
      {items.length === 0 && <p className="muted">No projects yet.</p>}
      {items.length > 0 && <ul>
        {items.map((project, index) => <li key={index}>
          <button type="button" aria-pressed={selected === index} onClick={() => onSelect(index)}>
            {project.title || project.id || 'Untitled project'}
          </button>
        </li>)}
      </ul>}
      <div className="actions">
        <button type="button" onClick={() => add(defaultProject(nextId('New project'), randomSeed()), 'title')}>Add project</button>
        {active && <a href="#project-preview" className="mobile-export">Jump to preview</a>}
      </div>
    </div>
    {active && <div id={`projects[${selected}]`} className="project-editor" tabIndex={-1} key={`${editorRevision}:${selected}`}>
      <div className="project-editor-head">
        <h3>{active.title || 'Untitled project'}</h3>
        <RowActions label={active.title || 'project'} index={selected} length={items.length}
          move={(to) => {
            onChange(moveItem(items, selected, to))
            onSelect(to)
          }}
          remove={() => {
            onChange(items.filter((_, index) => index !== selected))
            setEditorRevision((current) => current + 1)
            onSelect(Math.max(0, Math.min(selected, items.length - 2)))
          }}>
          <button type="button" onClick={() => add({ ...active, id: nextId(active.title) }, 'id')}>Duplicate</button>
        </RowActions>
      </div>
      <ProjectFields value={active} name={`projects[${selected}]`} update={update}
        changeTitle={(title) => update({ title, ...(suggestedIds.has(active) ? { id: nextId(title, selected) } : {}) })}
        changeId={(id) => update({ id }, false)} />
    </div>}
  </>
}

export function ProjectPreview({ project }: { project: Project }) {
  const { planet } = project
  const palette = typePalettes[planet.type].map((fallback, index) =>
    isHexColor(planet.palette[index] ?? '') ? planet.palette[index] : fallback)
  const media = project.media.find((item) => siteAssetUrl(item.src))
  const image = media && siteAssetUrl(media.src)
  const metadata = [project.category, project.year, project.role].filter(Boolean).join(' · ')
  const links = project.links.filter((link) => isSafeLink(link.url))

  return <section className="panel rail-panel preview" id="project-preview" tabIndex={-1} aria-labelledby="preview-heading">
    <h2 id="preview-heading">Project preview</h2>
    <div className="preview-identity">
      <div className="swatch-stage" role="img" aria-label={`${planet.type} planet, size ${planet.size}${planet.ring ? ', with ring' : ''}`}>
        <span className={`swatch swatch-${planet.type}${planet.ring ? ' with-ring' : ''}`}
          style={{ width: planet.size * 29, backgroundColor: palette[0], color: palette[1], borderColor: palette[2] }} />
      </div>
      <div>
        {project.placeholder && <span className="badge warning">Placeholder</span>}
        <h3>{project.title}</h3>
        {metadata && <p className="muted">{metadata}</p>}
      </div>
    </div>
    {project.summary && <p className="preview-summary">{project.summary}</p>}
    {image && <figure>
      <img src={image} alt={media.alt} loading="lazy" />
      {media.caption && <figcaption>{media.caption}</figcaption>}
    </figure>}
    {project.description.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    {project.tags.length > 0 && <ul className="tags" aria-label="Tags">
      {project.tags.map((tag, index) => <li key={index}>{tag}</li>)}
    </ul>}
    {links.length > 0 && <div className="actions">
      {links.map((link, index) => <a key={index} className="button" href={link.url} target="_blank"
        rel="noopener noreferrer">{link.label || link.url}</a>)}
    </div>}
  </section>
}

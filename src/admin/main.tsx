import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DATA_FILENAME, normalizePortfolio, serializePortfolio, validatePortfolio, type Issue, type Portfolio,
} from '../content/schema'
import { IssuesContext } from './fields'
import { ProjectPreview, ProjectsSection } from './Projects'
import {
  ContactSection, EducationSection, ExperienceSection, ProfileSection, ResumeSection, SiteSection, SkillsSection,
} from './Sections'
import '../styles/tokens.css'
import './studio.css'

const DRAFT_KEY = 'portfolio-admin-draft-v1'
const SAVE_DELAY = 350
const sections = {
  site: 'Site & visuals',
  profile: 'Profile',
  education: 'Education',
  experience: 'Experience',
  skills: 'Skills',
  resume: 'Resume',
  contact: 'Contact',
  projects: 'Projects',
} as const
type Section = keyof typeof sections
type Draft = { savedAt: string; data: Portfolio }
type PublishedContent = { published: Portfolio; restored?: Draft; storageMessage: string }
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: PublishedContent }

const listFields = new Set(['about', 'goals', 'interests', 'details', 'highlights', 'items', 'description', 'tags', 'palette'])

function canRestoreDraft(value: unknown, normalized: unknown, field = ''): boolean {
  if (value === normalized) return true
  if (field === 'type' || field === 'kind' || field === 'schemaVersion') return false
  if (Array.isArray(normalized)) {
    if (!Array.isArray(value)) return false
    // Keep blank list rows and in-progress text even though the export trims them.
    if (listFields.has(field)) return value.every((item) => typeof item === 'string')
    return value.length === normalized.length && value.every((item, index) => canRestoreDraft(item, normalized[index]))
  }
  if (typeof normalized === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (normalized === null) return false
  if (typeof normalized !== 'object') return typeof value === typeof normalized
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(normalized)
  const raw = value as Record<string, unknown>
  return Object.keys(raw).length === entries.length
    && entries.every(([key, item]) => Object.hasOwn(raw, key) && canRestoreDraft(raw[key], item, key))
}

function readDraft(): { restored?: Draft; storageMessage: string } {
  try {
    const stored = localStorage.getItem(DRAFT_KEY)
    if (stored === null) return { storageMessage: '' }
    try {
      const value = JSON.parse(stored)
      if (!value || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))
          || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
        throw new Error('Invalid draft')
      }
      const normalized = normalizePortfolio(value.data)
      const data = canRestoreDraft(value.data, normalized) ? value.data as Portfolio : normalized
      return { restored: { savedAt: value.savedAt, data }, storageMessage: '' }
    } catch {
      return { storageMessage: 'The saved draft could not be read. Showing the published file.' }
    }
  } catch {
    return { storageMessage: 'Local storage is unavailable. Edits are kept in this tab until it closes.' }
  }
}

function StudioHeader({ children }: { children?: React.ReactNode }) {
  return <header className="studio-header">
    <div>
      <h1>Content Studio</h1>
      <p>This studio is public and has no sign-in. Edits stay in your browser. Export and commit the JSON to publish changes.</p>
    </div>
    {children}
  </header>
}

function ValidationPanel({ issues, goToIssue }: { issues: Issue[]; goToIssue: (path: string) => void }) {
  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.length - errors
  return <section className="panel rail-panel" aria-labelledby="validation-heading">
    <h2 id="validation-heading">Validation</h2>
    <div className="actions validation-counts" role="status">
      <span className={`badge${errors ? ' error' : ''}`}>{errors} {errors === 1 ? 'error' : 'errors'}</span>
      <span className={`badge${warnings ? ' warning' : ''}`}>{warnings} {warnings === 1 ? 'warning' : 'warnings'}</span>
    </div>
    {issues.length === 0
      ? <p className="muted">No issues found.</p>
      : <ul className="issue-list">
        {issues.map((issue) => <li key={`${issue.path}:${issue.message}`}>
          <button type="button" onClick={() => goToIssue(issue.path)}>
            <span className={issue.level}>{issue.level === 'error' ? 'Error' : 'Warning'}</span>
            <code>{issue.path}</code>
            <span>{issue.message}</span>
          </button>
        </li>)}
      </ul>}
  </section>
}

function ExportPanel({ data, errorCount }: { data: Portfolio; errorCount: number }) {
  const [copyMessage, setCopyMessage] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const fallback = useRef<HTMLTextAreaElement>(null)
  const blocked = errorCount > 0

  useEffect(() => {
    if (!manualCopy || blocked) return
    fallback.current?.focus()
    fallback.current?.select()
  }, [blocked, manualCopy])

  function download() {
    const url = URL.createObjectURL(new Blob([serializePortfolio(data)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = DATA_FILENAME
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(serializePortfolio(data))
      setManualCopy(false)
      setCopyMessage('JSON copied.')
    } catch {
      setManualCopy(true)
      setCopyMessage('Select and copy the JSON below.')
      fallback.current?.select()
    }
  }

  return <section className="panel rail-panel" id="export" aria-labelledby="export-heading">
    <h2 id="export-heading">Export & deploy</h2>
    <div className="actions export-actions">
      <button type="button" className="primary" onClick={download} disabled={blocked} aria-describedby={blocked ? 'export-blocked' : undefined}>
        Export portfolio.json
      </button>
      <button type="button" onClick={() => void copy()} disabled={blocked} aria-describedby={blocked ? 'export-blocked' : undefined}>Copy JSON</button>
    </div>
    {blocked && <p className="error" id="export-blocked">Fix {errorCount === 1 ? 'the validation error' : `all ${errorCount} validation errors`} to export or copy JSON.</p>}
    {!blocked && <p className="muted status-message" role="status">{copyMessage}</p>}
    {manualCopy && !blocked && <div className="field">
      <label htmlFor="copy-json-text">JSON to copy</label>
      <textarea id="copy-json-text" ref={fallback} value={serializePortfolio(data)} readOnly rows={4} />
    </div>}
    <ol className="deploy-steps">
      <li>Replace <code>public/data/portfolio.json</code> in the repository with the exported file.</li>
      <li>Commit and push.</li>
      <li>GitHub Pages rebuilds.</li>
    </ol>
    <p className="muted">Local drafts are not deployed until then.</p>
  </section>
}

function Studio({ content, onReset }: { content: PublishedContent; onReset: (storageMessage: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => content.restored ?? { savedAt: '', data: content.published })
  const [storageMessage, setStorageMessage] = useState(content.storageMessage)
  const [importMessage, setImportMessage] = useState({ text: '', error: false })
  const [section, setSection] = useState<Section>('site')
  const [selectedProject, setSelectedProject] = useState(0)
  const [editorRevision, setEditorRevision] = useState(0)
  const [focusRequest, setFocusRequest] = useState<{ path: string } | null>(null)
  const pending = useRef<Draft | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const importRequest = useRef(0)
  const mobileNav = useRef<HTMLDetailsElement>(null)

  const { data } = draft
  const normalized = useMemo(() => normalizePortfolio(data), [data])
  const publishedMode = JSON.stringify(content.published) === JSON.stringify(normalized)
  const issues = useMemo(() => {
    const live = validatePortfolio(data)
    const exported = validatePortfolio(normalized)
    return [...live, ...exported.filter((issue) => !live.some((other) =>
      issue.path === other.path && issue.message === other.message && issue.level === other.level))]
      .sort((left, right) => Number(right.level === 'error') - Number(left.level === 'error'))
  }, [data, normalized])
  const errorCount = issues.filter((issue) => issue.level === 'error').length
  const preview = section === 'projects' ? normalized.projects[selectedProject] : undefined

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!pending.current) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(pending.current))
      pending.current = null
      setStorageMessage('')
    } catch {
      setStorageMessage('Local storage could not save this draft. Export a copy before closing this tab.')
    }
  }, [])

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.clearTimeout(timer.current)
      importRequest.current++
    }
  }, [flush])

  useLayoutEffect(() => {
    if (!focusRequest) return
    const { path } = focusRequest
    const target = document.getElementById(path)
      ?? document.getElementById(path.match(/^projects\[\d+\]/)?.[0] ?? '')
      ?? document.getElementById('editor-heading')
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest' })
  }, [focusRequest])

  function edit(value: Portfolio) {
    const next = { savedAt: new Date().toISOString(), data: value }
    setDraft(next)
    pending.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY)
  }

  function update<K extends Section>(key: K, value: Portfolio[K]) {
    edit({ ...data, [key]: value })
  }

  function resetDraft() {
    if (!window.confirm('Discard your local draft and reload the published content?')) return
    pending.current = null
    window.clearTimeout(timer.current)
    importRequest.current++
    try {
      localStorage.removeItem(DRAFT_KEY)
      onReset('')
    } catch {
      onReset('Local storage could not remove the saved draft. The published file has been reloaded in this tab.')
    }
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const request = ++importRequest.current
    try {
      const imported = normalizePortfolio(JSON.parse(await file.text()))
      if (request !== importRequest.current) return
      edit(imported)
      setSelectedProject(0)
      setEditorRevision((current) => current + 1)
      setImportMessage({ text: `Imported ${file.name}.`, error: false })
    } catch {
      if (request === importRequest.current) setImportMessage({ text: 'Could not read the file as JSON.', error: true })
    }
  }

  function navigate(next: Section, path = 'editor-heading') {
    if (mobileNav.current) mobileNav.current.open = false
    setSection(next)
    setFocusRequest({ path })
  }

  function goToIssue(path: string) {
    const next = path.split(/[.[\]]/)[0]
    if (!Object.hasOwn(sections, next)) return
    const projectIndex = path.match(/^projects\[(\d+)\]/)?.[1]
    if (projectIndex !== undefined) setSelectedProject(Number(projectIndex))
    navigate(next as Section, path)
  }

  const links = (Object.keys(sections) as Section[]).map((key) =>
    <button type="button" key={key} aria-current={section === key ? 'true' : undefined}
      onClick={() => navigate(key)}>{sections[key]}</button>)

  return <>
    <StudioHeader>
      <div className="header-tools">
        <div className="actions">
          <label className="button file-input">
            Import JSON file…
            <input type="file" accept=".json,application/json" onChange={(event) => void importJson(event)} />
          </label>
          <a className="button" href="../?draft=1" target="_blank" rel="noopener noreferrer"
            onClick={flush} onAuxClick={flush}>Preview draft in the site</a>
        </div>
        {importMessage.text && <p className={importMessage.error ? 'error' : 'muted'} role="status">{importMessage.text}</p>}
      </div>
    </StudioHeader>

    <div className={`source-bar${publishedMode ? '' : ' draft-source'}`}>
      <p>
        <span className="status-dot" aria-hidden="true" />
        {publishedMode ? 'Showing published content' : <>
          Editing a local draft saved <time dateTime={draft.savedAt}>{new Date(draft.savedAt).toLocaleString()}</time> — this is not what is deployed
        </>}
      </p>
      {!publishedMode && <button type="button" onClick={resetDraft}>Reset draft to published</button>}
    </div>
    {storageMessage && <p className="storage-message" role="status">{storageMessage}</p>}

    <div className="studio-layout">
      <nav className="panel desktop-nav" aria-label="Editor sections">
        <div className="section-links">{links}</div>
      </nav>
      <details className="panel mobile-nav" ref={mobileNav}>
        <summary>Sections <span>{sections[section]}</span></summary>
        <nav className="section-links" aria-label="Editor sections">{links}</nav>
      </details>
      <section className="panel editor" aria-labelledby="editor-heading">
        <div className="editor-head">
          <h2 id="editor-heading" tabIndex={-1}>{sections[section]}</h2>
          <a href="#export" className="mobile-export">Export & deploy</a>
        </div>
        <div className="editor-fields" key={`${editorRevision}:${section}`}>
          <IssuesContext.Provider value={issues}>
            {section === 'site' && <SiteSection value={data.site} onChange={(value) => update('site', value)} />}
            {section === 'profile' && <ProfileSection value={data.profile} onChange={(value) => update('profile', value)} />}
            {section === 'education' && <EducationSection value={data.education} onChange={(value) => update('education', value)} />}
            {section === 'experience' && <ExperienceSection value={data.experience} onChange={(value) => update('experience', value)} />}
            {section === 'skills' && <SkillsSection value={data.skills} onChange={(value) => update('skills', value)} />}
            {section === 'resume' && <ResumeSection value={data.resume} onChange={(value) => update('resume', value)} />}
            {section === 'contact' && <ContactSection value={data.contact} onChange={(value) => update('contact', value)} />}
            {section === 'projects' && <ProjectsSection items={data.projects} selected={selectedProject} onChange={(value) => update('projects', value)}
              onSelect={(index, field) => {
                setSelectedProject(index)
                if (field) setFocusRequest({ path: `projects[${index}].${field}` })
              }} />}
          </IssuesContext.Provider>
        </div>
      </section>
      <aside className="studio-rail" aria-label="Export, preview and validation">
        <ExportPanel data={data} errorCount={errorCount} />
        {preview && <ProjectPreview project={preview} />}
        <ValidationPanel issues={issues} goToIssue={goToIssue} />
      </aside>
    </div>
  </>
}

function App() {
  const [request, setRequest] = useState({ key: 0, reset: false, storageMessage: '' })
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    async function loadPublished() {
      try {
        const response = await fetch(`../data/${DATA_FILENAME}?t=${Date.now()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const published = normalizePortfolio(await response.json())
        if (controller.signal.aborted) return
        const local = request.reset ? { storageMessage: request.storageMessage } : readDraft()
        setLoad({ status: 'ready', content: { ...local, published } })
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoad({ status: 'error', message: error instanceof Error ? error.message : 'Request failed' })
        }
      }
    }
    void loadPublished()
    return () => controller.abort()
  }, [request])

  return <main className="studio-shell">
    {load.status === 'ready' ? <Studio content={load.content} onReset={(storageMessage) => {
      setLoad({ status: 'loading' })
      setRequest((current) => ({ key: current.key + 1, reset: true, storageMessage }))
    }} /> : <>
      <StudioHeader />
      {load.status === 'loading'
        ? <p className="panel load-panel" role="status">Loading published content…</p>
        : <section className="panel load-panel" aria-labelledby="load-error">
          <h2 id="load-error">Published content unavailable</h2>
          <p role="alert">Could not load <code>../data/portfolio.json</code>. {load.message}</p>
          <button type="button" onClick={() => {
            setLoad({ status: 'loading' })
            setRequest((current) => ({ ...current, key: current.key + 1 }))
          }}>Retry</button>
        </section>}
    </>}
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)

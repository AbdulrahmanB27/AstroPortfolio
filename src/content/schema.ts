/**
 * Canonical content schema for public/data/portfolio.json.
 * Shared by the site (read only) and the /admin studio (edit + export).
 * `normalizePortfolio` never throws: unknown input becomes a safe, fully-populated document.
 * `validatePortfolio` reports problems; the site still renders with warnings.
 */

export const SCHEMA_VERSION = 1
export const DATA_FILENAME = 'portfolio.json'

export const PLANET_TYPES = ['rock', 'gas', 'ice', 'desert', 'ocean', 'ember', 'moon'] as const
export type PlanetType = (typeof PLANET_TYPES)[number]

export const LINK_KINDS = ['live', 'repo', 'doc', 'video', 'other'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const LIMITS = {
  planetSize: { min: 0.6, max: 1.6 },
  orbit: { min: 1, max: 8 },
  moons: { min: 0, max: 3 },
  gridOpacity: { min: 0, max: 0.6 },
  gridDensity: { min: 4, max: 24 },
  orbitSpeed: { min: 0, max: 3 },
} as const

export interface GridSettings {
  enabled: boolean
  opacity: number
  density: number
}

export interface SiteSettings {
  grid: GridSettings
  /** Multiplier for the idle orbital motion (0 pauses the planets). */
  orbitSpeed: number
}

export interface Site {
  title: string
  description: string
  settings: SiteSettings
}

export interface Profile {
  name: string
  initials: string
  role: string
  tagline: string
  location: string
  about: string[]
  goals: string[]
  interests: string[]
  placeholder: boolean
}

export interface EducationEntry {
  id: string
  school: string
  degree: string
  start: string
  end: string
  details: string[]
  placeholder: boolean
}

export interface ExperienceEntry {
  id: string
  title: string
  org: string
  start: string
  end: string
  summary: string
  highlights: string[]
  placeholder: boolean
}

export interface SkillGroup {
  id: string
  group: string
  items: string[]
  placeholder: boolean
}

export interface Resume {
  /** Path (relative to the site root) or https URL of the formal PDF. Empty = not provided. */
  pdf: string
  updated: string
  summary: string
}

export interface ContactLink {
  id: string
  label: string
  url: string
}

export interface Contact {
  email: string
  note: string
  links: ContactLink[]
}

export interface MediaItem {
  src: string
  alt: string
  caption: string
}

export interface ProjectLink {
  label: string
  url: string
  kind: LinkKind
}

export interface PlanetSpec {
  type: PlanetType
  /** Three hex colours: base, secondary, accent. Empty array = use the type's default palette. */
  palette: string[]
  size: number
  /** Orbit lane (1 = closest to the star). null = assign automatically. */
  orbit: number | null
  /** Position round the orbit, 0..1. null = spread automatically. */
  phase: number | null
  ring: boolean
  moons: number
  seed: number
}

export interface Project {
  id: string
  title: string
  category: string
  year: string
  role: string
  summary: string
  description: string[]
  tags: string[]
  media: MediaItem[]
  links: ProjectLink[]
  featured: boolean
  placeholder: boolean
  planet: PlanetSpec
}

export interface Portfolio {
  schemaVersion: number
  site: Site
  profile: Profile
  education: EducationEntry[]
  experience: ExperienceEntry[]
  skills: SkillGroup[]
  resume: Resume
  contact: Contact
  projects: Project[]
}

export interface Issue {
  level: 'error' | 'warning'
  path: string
  message: string
}

// ───────────────────────────────────────────────────────────── helpers ──
type Raw = Record<string, unknown>

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d)
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d)
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strList = (v: unknown): string[] =>
  list(v)
    .map((x) => str(x).trim())
    .filter(Boolean)
const paragraphs = (v: unknown): string[] => (typeof v === 'string' ? (v.trim() ? [v.trim()] : []) : strList(v))

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const root = slugify(base) || 'item'
  if (!used.has(root)) return root
  let i = 2
  while (used.has(`${root}-${i}`)) i++
  return `${root}-${i}`
}

const HEX = /^#[0-9a-fA-F]{6}$/
export const isHexColor = (v: string) => HEX.test(v)

/** http(s) and mailto links only. */
export function isSafeLink(url: string): boolean {
  if (!url) return false
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Media / PDF references: https URL, or a relative path inside the site with no traversal. */
export function isSafeAsset(src: string): boolean {
  if (!src) return false
  if (/^https:\/\//i.test(src)) return isSafeLink(src)
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false // any other scheme (javascript:, data:, file: ...)
  if (src.startsWith('//') || src.includes('\\')) return false
  const clean = src.replace(/^\.?\//, '')
  return !clean.split('/').some((seg) => seg === '..' || seg === '')
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// ─────────────────────────────────────────────────────────── defaults ──
export function defaultPlanet(seed = 1): PlanetSpec {
  return { type: 'rock', palette: [], size: 1, orbit: null, phase: null, ring: false, moons: 0, seed }
}

export function defaultProject(id: string, seed = 1): Project {
  return {
    id,
    title: 'New project',
    category: '',
    year: '',
    role: '',
    summary: '',
    description: [],
    tags: [],
    media: [],
    links: [],
    featured: false,
    placeholder: false,
    planet: defaultPlanet(seed),
  }
}

export function emptyPortfolio(): Portfolio {
  return {
    schemaVersion: SCHEMA_VERSION,
    site: {
      title: 'Portfolio',
      description: '',
      settings: { grid: { enabled: false, opacity: 0.16, density: 10 }, orbitSpeed: 1 },
    },
    profile: {
      name: '',
      initials: '',
      role: '',
      tagline: '',
      location: '',
      about: [],
      goals: [],
      interests: [],
      placeholder: false,
    },
    education: [],
    experience: [],
    skills: [],
    resume: { pdf: '', updated: '', summary: '' },
    contact: { email: '', note: '', links: [] },
    projects: [],
  }
}

// ────────────────────────────────────────────────────────── normalise ──
function normPlanet(raw: unknown, index: number): PlanetSpec {
  const r = isObj(raw) ? raw : {}
  const type = PLANET_TYPES.includes(r.type as PlanetType) ? (r.type as PlanetType) : 'rock'
  const orbit = typeof r.orbit === 'number' && Number.isFinite(r.orbit) ? Math.round(r.orbit) : null
  const phase = typeof r.phase === 'number' && Number.isFinite(r.phase) ? ((r.phase % 1) + 1) % 1 : null
  return {
    type,
    palette: strList(r.palette).slice(0, 3),
    size: clamp(num(r.size, 1), LIMITS.planetSize.min, LIMITS.planetSize.max),
    orbit,
    phase,
    ring: bool(r.ring),
    moons: Math.round(clamp(num(r.moons, 0), LIMITS.moons.min, LIMITS.moons.max)),
    seed: Math.round(num(r.seed, index * 37 + 11)),
  }
}

function normProject(raw: unknown, index: number): Project {
  const r = isObj(raw) ? raw : {}
  return {
    id: str(r.id).trim(),
    title: str(r.title).trim(),
    category: str(r.category).trim(),
    year: str(r.year).trim(),
    role: str(r.role).trim(),
    summary: str(r.summary).trim(),
    description: paragraphs(r.description),
    tags: strList(r.tags),
    media: list(r.media)
      .filter(isObj)
      .map((m) => ({ src: str(m.src).trim(), alt: str(m.alt).trim(), caption: str(m.caption).trim() })),
    links: list(r.links)
      .filter(isObj)
      .map((l) => ({
        label: str(l.label).trim(),
        url: str(l.url).trim(),
        kind: LINK_KINDS.includes(l.kind as LinkKind) ? (l.kind as LinkKind) : 'other',
      })),
    featured: bool(r.featured),
    placeholder: bool(r.placeholder),
    planet: normPlanet(r.planet, index),
  }
}

export function normalizePortfolio(input: unknown): Portfolio {
  const base = emptyPortfolio()
  const r = isObj(input) ? input : {}
  const site = isObj(r.site) ? r.site : {}
  const settings = isObj(site.settings) ? site.settings : {}
  const grid = isObj(settings.grid) ? settings.grid : {}
  const profile = isObj(r.profile) ? r.profile : {}
  const resume = isObj(r.resume) ? r.resume : {}
  const contact = isObj(r.contact) ? r.contact : {}

  return {
    schemaVersion: SCHEMA_VERSION,
    site: {
      title: str(site.title, base.site.title),
      description: str(site.description),
      settings: {
        grid: {
          enabled: bool(grid.enabled),
          opacity: clamp(num(grid.opacity, 0.16), LIMITS.gridOpacity.min, LIMITS.gridOpacity.max),
          density: Math.round(clamp(num(grid.density, 10), LIMITS.gridDensity.min, LIMITS.gridDensity.max)),
        },
        orbitSpeed: clamp(num(settings.orbitSpeed, 1), LIMITS.orbitSpeed.min, LIMITS.orbitSpeed.max),
      },
    },
    profile: {
      name: str(profile.name).trim(),
      initials: str(profile.initials).trim(),
      role: str(profile.role).trim(),
      tagline: str(profile.tagline).trim(),
      location: str(profile.location).trim(),
      about: paragraphs(profile.about),
      goals: strList(profile.goals),
      interests: strList(profile.interests),
      placeholder: bool(profile.placeholder),
    },
    education: list(r.education)
      .filter(isObj)
      .map((e) => ({
        id: str(e.id).trim(),
        school: str(e.school).trim(),
        degree: str(e.degree).trim(),
        start: str(e.start).trim(),
        end: str(e.end).trim(),
        details: strList(e.details),
        placeholder: bool(e.placeholder),
      })),
    experience: list(r.experience)
      .filter(isObj)
      .map((e) => ({
        id: str(e.id).trim(),
        title: str(e.title).trim(),
        org: str(e.org).trim(),
        start: str(e.start).trim(),
        end: str(e.end).trim(),
        summary: str(e.summary).trim(),
        highlights: strList(e.highlights),
        placeholder: bool(e.placeholder),
      })),
    skills: list(r.skills)
      .filter(isObj)
      .map((s) => ({
        id: str(s.id).trim(),
        group: str(s.group).trim(),
        items: strList(s.items),
        placeholder: bool(s.placeholder),
      })),
    resume: { pdf: str(resume.pdf).trim(), updated: str(resume.updated).trim(), summary: str(resume.summary).trim() },
    contact: {
      email: str(contact.email).trim(),
      note: str(contact.note).trim(),
      links: list(contact.links)
        .filter(isObj)
        .map((l) => ({ id: str(l.id).trim(), label: str(l.label).trim(), url: str(l.url).trim() })),
    },
    projects: list(r.projects).map(normProject),
  }
}

// ─────────────────────────────────────────────────────────── validate ──
export function validatePortfolio(p: Portfolio): Issue[] {
  const out: Issue[] = []
  const err = (path: string, message: string) => out.push({ level: 'error', path, message })
  const warn = (path: string, message: string) => out.push({ level: 'warning', path, message })

  if (!p.profile.name) err('profile.name', 'Name is required.')
  if (!p.profile.role) warn('profile.role', 'Role line is empty.')
  if (p.profile.about.length === 0) warn('profile.about', 'About text is empty.')

  if (p.contact.email && !isEmail(p.contact.email)) err('contact.email', 'Email address is not valid.')
  if (!p.contact.email) warn('contact.email', 'No contact email — the Contact tab will have no mail link.')
  p.contact.links.forEach((l, i) => {
    if (!l.label) err(`contact.links[${i}].label`, 'Link needs a label.')
    if (!isSafeLink(l.url)) err(`contact.links[${i}].url`, 'Link must be a full http(s) or mailto address.')
  })

  if (p.resume.pdf && !isSafeAsset(p.resume.pdf)) err('resume.pdf', 'Resume PDF must be a relative path inside the site or an https URL.')
  if (p.resume.pdf && !/\.pdf($|\?)/i.test(p.resume.pdf)) warn('resume.pdf', 'Resume file does not end in .pdf.')
  if (!p.resume.pdf) warn('resume.pdf', 'No formal resume PDF set — the Resume screen offers print / save-as-PDF instead of a download.')

  const { grid, orbitSpeed } = p.site.settings
  if (grid.opacity < LIMITS.gridOpacity.min || grid.opacity > LIMITS.gridOpacity.max) err('site.settings.grid.opacity', 'Grid opacity out of range.')
  if (grid.density < LIMITS.gridDensity.min || grid.density > LIMITS.gridDensity.max) err('site.settings.grid.density', 'Grid density out of range.')
  if (orbitSpeed < LIMITS.orbitSpeed.min || orbitSpeed > LIMITS.orbitSpeed.max) err('site.settings.orbitSpeed', 'Orbit speed out of range.')

  const checkIds = (items: { id: string }[], path: string) => {
    const seen = new Set<string>()
    items.forEach((it, i) => {
      if (!it.id) err(`${path}[${i}].id`, 'Missing id.')
      else if (it.id !== slugify(it.id)) err(`${path}[${i}].id`, `Id "${it.id}" must be lowercase letters, digits and dashes.`)
      else if (seen.has(it.id)) err(`${path}[${i}].id`, `Duplicate id "${it.id}".`)
      seen.add(it.id)
    })
  }
  checkIds(p.education, 'education')
  checkIds(p.experience, 'experience')
  checkIds(p.skills, 'skills')
  checkIds(p.contact.links, 'contact.links')
  checkIds(p.projects, 'projects')

  p.skills.forEach((s, i) => {
    if (!s.group) err(`skills[${i}].group`, 'Skill group needs a name.')
    if (s.items.length === 0) warn(`skills[${i}].items`, 'Skill group is empty.')
  })
  p.education.forEach((e, i) => {
    if (!e.school) err(`education[${i}].school`, 'School is required.')
  })

  if (p.projects.length === 0) warn('projects', 'No projects — the solar system will be empty.')
  const lanes = new Map<number, number>()
  p.projects.forEach((pr, i) => {
    const at = `projects[${i}]`
    if (!pr.title) err(`${at}.title`, 'Project needs a title.')
    if (!pr.summary) warn(`${at}.summary`, 'Project has no summary.')
    pr.links.forEach((l, j) => {
      if (!l.label) err(`${at}.links[${j}].label`, 'Link needs a label.')
      if (!isSafeLink(l.url) || l.url.startsWith('mailto:')) err(`${at}.links[${j}].url`, 'Project link must be a full http(s) address.')
    })
    pr.media.forEach((m, j) => {
      if (!isSafeAsset(m.src)) err(`${at}.media[${j}].src`, 'Media must be a relative path inside the site or an https URL.')
      if (!m.alt) warn(`${at}.media[${j}].alt`, 'Media has no alt text.')
    })
    const pl = pr.planet
    if (!PLANET_TYPES.includes(pl.type)) err(`${at}.planet.type`, 'Unknown planet type.')
    if (pl.size < LIMITS.planetSize.min || pl.size > LIMITS.planetSize.max) err(`${at}.planet.size`, `Planet size must be ${LIMITS.planetSize.min}–${LIMITS.planetSize.max}.`)
    if (pl.orbit !== null && (pl.orbit < LIMITS.orbit.min || pl.orbit > LIMITS.orbit.max)) err(`${at}.planet.orbit`, `Orbit lane must be ${LIMITS.orbit.min}–${LIMITS.orbit.max}, or automatic.`)
    if (pl.moons < LIMITS.moons.min || pl.moons > LIMITS.moons.max) err(`${at}.planet.moons`, 'Moons must be 0–3.')
    pl.palette.forEach((c, j) => {
      if (!isHexColor(c)) err(`${at}.planet.palette[${j}]`, 'Palette colours must be #rrggbb.')
    })
    if (pl.orbit !== null) lanes.set(pl.orbit, (lanes.get(pl.orbit) ?? 0) + 1)
    if (pr.placeholder) warn(`${at}`, `"${pr.title || pr.id}" is still marked as a placeholder.`)
  })
  lanes.forEach((count, lane) => {
    if (count > 3) warn('projects', `Orbit lane ${lane} holds ${count} planets; labels may crowd.`)
  })
  return out
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error')

/** Stable, human-diffable serialisation used by the admin export. */
export function serializePortfolio(p: Portfolio): string {
  return JSON.stringify(normalizePortfolio(p), null, 2) + '\n'
}

import { defaultProject, normalizePortfolio, PLANET_TYPES, validatePortfolio, type Portfolio } from './schema'
import { qa } from '../qa/params'

export const DRAFT_KEY = 'portfolio-admin-draft-v1'

/** URL of a file that lives next to index.html (works at any GitHub Pages base path). */
export const siteUrl = (path: string) => new URL(path.replace(/^\.?\//, ''), document.baseURI).toString()

/** Resolve a content-supplied asset reference (relative path or https URL). */
export const assetUrl = (src: string) => (/^https?:\/\//i.test(src) ? src : siteUrl(src))

function readDraft(): Portfolio | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: unknown }
    return parsed?.data ? normalizePortfolio(parsed.data) : null
  } catch {
    return null
  }
}

/** Synthetic project list for layout stress tests (?n=12). */
function withSyntheticProjects(p: Portfolio, n: number): Portfolio {
  const projects = Array.from({ length: Math.max(0, Math.min(24, Math.round(n))) }, (_, i) => {
    const src = p.projects[i % Math.max(1, p.projects.length)]
    const pr = defaultProject(`test-project-${i + 1}`, i * 13 + 3)
    pr.title = i % 3 === 0 ? `Test Project ${i + 1} With A Longer Name` : `Test Project ${i + 1}`
    pr.category = src?.category ?? 'Test'
    pr.summary = 'Synthetic entry used to test how the system scales.'
    pr.planet.type = PLANET_TYPES[i % PLANET_TYPES.length]
    pr.planet.size = 0.7 + ((i * 37) % 9) / 10
    pr.planet.ring = i % 5 === 1
    pr.planet.moons = i % 4 === 2 ? 1 : 0
    return pr
  })
  return { ...p, projects }
}

export async function loadPortfolio(): Promise<{ data: Portfolio; draft: boolean; issues: number }> {
  let data: Portfolio | null = null
  let draft = false
  if (qa.draft) {
    data = readDraft()
    draft = data !== null
  }
  if (!data) {
    const res = await fetch(siteUrl('data/portfolio.json'), { cache: 'no-cache' })
    if (!res.ok) throw new Error(`Could not load portfolio data (${res.status})`)
    data = normalizePortfolio(await res.json())
  }
  if (qa.n !== null) data = withSyntheticProjects(data, qa.n)
  const issues = validatePortfolio(data).filter((i) => i.level === 'error')
  if (issues.length && import.meta.env.DEV) console.warn('[portfolio] content errors', issues)
  return { data, draft, issues: issues.length }
}

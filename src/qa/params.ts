import type { Tab } from '../state/store'

/**
 * Read-only test selectors. They only choose which already-public scene state to show,
 * e.g. ?view=cockpit&tab=resume or ?view=project&project=<id>&t=4.
 * Views that would reveal the hidden features are limited to dev and QA builds.
 */
export type QaView = 'home' | 'cockpit' | 'orbit' | 'project' | 'flight' | 'deathstar' | 'intro' | 'launch' | 'altlaunch'

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
const SECRET_OK = import.meta.env.DEV || import.meta.env.VITE_QA === '1'
const PUBLIC_VIEWS: QaView[] = ['home', 'cockpit', 'orbit', 'project', 'intro', 'launch']
const SECRET_VIEWS: QaView[] = ['flight', 'deathstar', 'altlaunch']

function parseView(): QaView | null {
  const v = q.get('view') as QaView | null
  if (!v) return null
  if (PUBLIC_VIEWS.includes(v)) return v
  if (SECRET_OK && SECRET_VIEWS.includes(v)) return v
  return null
}

const numOrNull = (key: string) => {
  const raw = q.get(key)
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const tabRaw = q.get('tab')

export const qa = {
  view: parseView(),
  tab: (['about', 'skills', 'resume', 'contact'].includes(tabRaw ?? '') ? tabRaw : null) as Tab | null,
  project: q.get('project'),
  /** Freeze the scene clock (and scrub a cinematic) at this many seconds. */
  t: numOrNull('t'),
  seed: numOrNull('seed') ?? 1,
  /** Replace the project list with N synthetic entries to test scaling (4 / 8 / 12 ...). */
  n: SECRET_OK || true ? numOrNull('n') : null,
  draft: q.get('draft') === '1',
  /** Hide DOM chrome for clean 3D captures. */
  bare: q.get('bare') === '1',
  fps: q.get('fps') === '1',
  secretOk: SECRET_OK,
  /** Comma-separated render toggles for diagnosing a frame, e.g. ?debug=nocorona,nobloom */
  debug: new Set((q.get('debug') ?? '').split(',').filter(Boolean)),
}

export const isQa = qa.view !== null

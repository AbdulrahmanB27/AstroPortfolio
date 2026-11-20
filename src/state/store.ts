import { create } from 'zustand'
import type { Portfolio } from '../content/schema'

export type Mode = 'boot' | 'intro' | 'home' | 'cockpit' | 'launch' | 'orbit' | 'project' | 'flight'
export type Tab = 'about' | 'skills' | 'resume' | 'contact'
export const TABS: Tab[] = ['about', 'skills', 'resume', 'contact']

interface AppState {
  mode: Mode
  /** A cinematic owns the camera; ordinary input is ignored. */
  busy: boolean
  /** The running cinematic can be skipped. */
  skippable: boolean
  tab: Tab
  projectId: string | null
  hoverId: string | null
  content: Portfolio | null
  contentError: string | null
  draftPreview: boolean
  sceneReady: boolean
  gridOn: boolean
  reducedMotion: boolean
  flightUnlocked: boolean
  stationFound: boolean
  altShipUnlocked: boolean
  altShipActive: boolean
  toast: string | null
  set: (patch: Partial<AppState>) => void
  showToast: (text: string, ms?: number) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useApp = create<AppState>((set) => ({
  mode: 'boot',
  busy: true,
  skippable: false,
  tab: 'about',
  projectId: null,
  hoverId: null,
  content: null,
  contentError: null,
  draftPreview: false,
  sceneReady: false,
  gridOn: false,
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  flightUnlocked: false,
  stationFound: false,
  altShipUnlocked: false,
  altShipActive: false,
  toast: null,
  set: (patch) => set(patch),
  showToast: (text, ms = 3800) => {
    clearTimeout(toastTimer)
    set({ toast: text })
    toastTimer = setTimeout(() => set({ toast: null }), ms)
  },
}))

export const app = () => useApp.getState()

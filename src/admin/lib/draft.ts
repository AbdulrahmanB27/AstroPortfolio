import raw from '../../data/portfolio.json';
import { validatePortfolio, type Portfolio } from '../../data/schema';

/**
 * The studio opens already populated: the same JSON the site bundles is imported at
 * build time and validated with the shared schema. There is no fetch and no import step.
 * Drafts autosave to localStorage so a half-finished edit survives a reload.
 */

export const DRAFT_STORAGE_KEY = 'astro.admin.draft';
export const SOURCE_PATH = 'src/data/portfolio.json';

const initial = validatePortfolio(raw);
/** Parsed content with schema defaults applied (or the raw file if it is somehow invalid). */
export const loadedData: Portfolio = initial.ok ? initial.data : (raw as unknown as Portfolio);
export const loadedIssues: string[] = initial.ok ? [] : initial.issues;

/** The export format: 2-space indent, trailing newline, undefined keys dropped. */
export function serialize(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

export function sameContent(a: unknown, b: unknown): boolean {
  return serialize(a) === serialize(b);
}

interface StoredDraft {
  savedAt: string;
  data: unknown;
}

function looksLikePortfolio(value: unknown): value is Portfolio {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.meta === 'object' &&
    typeof v.profile === 'object' &&
    typeof v.skills === 'object' &&
    typeof v.resume === 'object' &&
    Array.isArray(v.categories) &&
    Array.isArray(v.projects) &&
    typeof v.settings === 'object'
  );
}

export function readStoredDraft(): { data: Portfolio; savedAt: string } | null {
  try {
    const text = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<StoredDraft>;
    if (!parsed || !looksLikePortfolio(parsed.data)) return null;
    return {
      data: parsed.data,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function writeStoredDraft(data: Portfolio): void {
  try {
    const stored: StoredDraft = { savedAt: new Date().toISOString(), data };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Quota or privacy mode: autosave is a convenience, never a requirement.
  }
}

export function clearStoredDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

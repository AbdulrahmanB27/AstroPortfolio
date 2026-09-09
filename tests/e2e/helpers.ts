import { expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Shared helpers for the end-to-end suite.
 *
 * Every test collects console errors and fails on them. The only tolerated message is
 * three.js's own `THREE.Clock` deprecation notice, which comes from a dependency.
 */

const IGNORED_CONSOLE = [/THREE\.Clock/];

export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text.slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  return errors;
}

export function expectNoConsoleErrors(errors: string[]): void {
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
}

/** App state read through the dev hook (needs `dev=true`). */
export async function appState<T>(page: Page, fn: (s: AppSnapshot) => T): Promise<T> {
  return page.evaluate(fn as never, undefined as never) as Promise<T>;
}

export interface AppSnapshot {
  scene: string;
  busy: boolean;
  selectedProjectId: string | null;
  hoveredProjectId: string | null;
  falconUnlocked: boolean;
  flightShip: string;
  devMode: boolean;
  settings: { grid: { enabled: boolean } };
}

export async function scene(page: Page): Promise<string> {
  return page.evaluate(() => window.__astro!.useApp.getState().scene);
}

export async function waitForScene(page: Page, want: string, timeout = 25_000): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.__astro!.useApp.getState().scene), { timeout })
    .toBe(want);
}

/** Wait until no sequence owns the camera, so input actually reaches the scene. */
export async function waitForIdle(page: Page, timeout = 20_000): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.__astro!.useApp.getState().busy), { timeout })
    .toBe(false);
}

/** Land on a page with the intro skipped; `dev` adds the `window.__astro` hook. */
export async function open(page: Page, hash = '#/', opts: { dev?: boolean; fresh?: boolean } = {}): Promise<string[]> {
  const errors = watchConsole(page);
  const query = ['nointro', opts.dev ? 'dev=true' : ''].filter(Boolean).join('&');
  await page.goto(`/?${query}${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('.loader[data-hidden="true"]', { timeout: 30_000 });
  return errors;
}

/** Mark the visitor as returning so the long first-run intro is skipped. */
export async function markVisited(context: BrowserContext, baseURL: string): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('astro.visited', JSON.stringify({ intro: true, cockpitEntries: 2, launches: 2 }));
    } catch {
      /* storage blocked */
    }
  });
  void baseURL;
}

export const sel = {
  loader: '.loader',
  homeMenu: '.home-menu[data-visible="true"]',
  missionComputer: '.mc[data-visible="true"]',
  systemHud: '.system-hud[data-visible="true"]',
  projectPanel: '.project-panel[data-visible="true"]',
  devOverlay: '[data-dev-overlay]',
  planetLabel: '.planet-label',
  introSkip: '.intro-skip',
} as const;

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
  // The seven project labels. `.planet-label` alone also matches the home planet's name,
  // which is not a project and not a button — the collision checks want that one included and
  // select the base class directly.
  planetLabel: '.planet-label--project',
  introSkip: '.intro-skip',
} as const;

/**
 * Wait until the camera stops moving.
 *
 * Headless WebGL renders through a software rasteriser at a few frames a second, and gsap
 * clamps its per-frame delta, so a 0.75s camera move takes roughly ten seconds of wall
 * clock in this harness. Fixed waits sample the middle of a tween and produce confident
 * nonsense — this repo has been caught by that before.
 */
export async function settleCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __rigLast?: string }).__rigLast = undefined;
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __rigLast?: string; __astro?: { rig: { position: { x: number; y: number; z: number }; fov: number } } };
      const r = w.__astro!.rig;
      const now = [r.position.x, r.position.y, r.position.z, r.fov].join(',');
      const settled = w.__rigLast === now;
      w.__rigLast = now;
      return settled;
    },
    null,
    { timeout: 120_000, polling: 400 },
  );
}

/**
 * Assert that nothing is painting over the cockpit's active display.
 *
 * Body copy is lighter than a heading so it never quite reaches the same peak, but it has to
 * be in the same world. When an overlay from another scene was dimming the console, body
 * copy sat at 31% of its own title.
 */
export async function expectDisplayUndimmed(page: Page, where: string): Promise<void> {
  const bands = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { title: box(document.querySelector('.mc-doc__title')), body: box(document.querySelector('.mc-doc__lede')) };
  });
  expect(bands.title, `${where}: title band`).not.toBeNull();
  expect(bands.body, `${where}: body band`).not.toBeNull();

  const shot = (await page.screenshot()).toString('base64');
  const peaks = await page.evaluate(
    async ({ shot, bands }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + shot;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const peak = (b: { x: number; y: number; w: number; h: number }) => {
        const x = Math.max(0, b.x);
        const y = Math.max(0, b.y);
        const w = Math.min(b.w, img.width - x);
        const h = Math.min(b.h, img.height - y);
        if (w <= 0 || h <= 0) return 0;
        const d = g.getImageData(x, y, w, h).data;
        let m = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          if (l > m) m = l;
        }
        return Math.round(m);
      };
      return { title: peak(bands.title!), body: peak(bands.body!), img: [img.width, img.height] };
    },
    { shot, bands },
  );

  expect(peaks.title, `${where}: title should be bright (image ${peaks.img.join('x')}, band ${JSON.stringify(bands.title)})`).toBeGreaterThan(180);
  expect(
    peaks.body / peaks.title,
    `${where}: body ${peaks.body} vs title ${peaks.title} — something is painting over the display`,
  ).toBeGreaterThan(0.7);
}

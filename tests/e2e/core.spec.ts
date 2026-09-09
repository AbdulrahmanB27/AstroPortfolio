import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, markVisited, open, scene, sel, waitForScene, watchConsole } from './helpers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const profile = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/data/portfolio.json', import.meta.url)), 'utf8'),
).profile as { name: string; tagline: string; intro: string };

/** Loading, the opening cinematic, and the guided pre-launch experience. */

test.describe('first load and intro', () => {
  test('loads cleanly and hides the designed loader', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator(sel.loader)).toHaveAttribute('data-hidden', 'true', { timeout: 30_000 });
    expectNoConsoleErrors(errors);
  });

  test('first visit plays the intro, which can be skipped to the menu', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.loader[data-hidden="true"]', { timeout: 30_000 });
    // The intro owns the camera before the menu appears.
    await expect(page.locator(sel.introSkip)).toBeVisible({ timeout: 15_000 });
    await page.locator(sel.introSkip).click();
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 20_000 });
    expectNoConsoleErrors(errors);
  });

  test('returning visitors reach the menu quickly', async ({ page, context, baseURL }) => {
    await markVisited(context, baseURL!);
    const errors = watchConsole(page);
    const started = Date.now();
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector(sel.homeMenu, { timeout: 25_000 });
    expect(Date.now() - started).toBeLessThan(20_000);
    expectNoConsoleErrors(errors);
  });
});

test.describe('home menu', () => {
  test('shows the name, role and all five destinations', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator(sel.homeMenu)).toBeVisible();
    await expect(page.getByText('Abdulrahman Bahjat').first()).toBeVisible();
    for (const label of ['About', 'Projects', 'Skills', 'Resume', 'Contact']) {
      await expect(page.locator(`${sel.homeMenu} button:has-text("${label}")`)).toBeVisible();
    }
    expectNoConsoleErrors(errors);
  });

  test('every personal destination opens the cockpit on its own tab', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    for (const label of ['About', 'Skills', 'Resume', 'Contact']) {
      await page.locator(`${sel.homeMenu} button:has-text("${label}")`).click();
      await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
      await expect(page.locator(`.mc__tab[data-active="true"]:has-text("${label}")`)).toBeVisible();
      await page.locator('button:has-text("Exit cockpit")').click();
      await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
      expect(await scene(page)).toBe('home');
    }
    expectNoConsoleErrors(errors);
  });
});

test.describe('cockpit', () => {
  test('switches between the four sections without leaving the cockpit', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    for (const [tab, heading] of [
      ['Skills', 'Skills'],
      ['Resume', 'Abdulrahman Bahjat'],
      ['Contact', 'Get in touch'],
      ['About', 'Abdulrahman Bahjat'],
    ] as const) {
      await page.locator(`.mc__tab:has-text("${tab}")`).click();
      await expect(page.locator('.mc-doc__title')).toContainText(heading);
    }
    expect(await scene(page)).toBe('cockpit');
    expectNoConsoleErrors(errors);
  });

  /**
   * Every field the content studio offers must reach the screen. `profile.tagline` was
   * editable in the studio and rendered nowhere: an owner could change it, export, install,
   * and see no difference anywhere on the site. Asserting against the JSON rather than a
   * literal keeps the two bound together.
   */
  test('renders every headline profile field from the data source', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    const doc = page.locator('.mc-doc');
    for (const value of [profile.name, profile.tagline, profile.intro]) {
      await expect(doc).toContainText(value);
    }
    expectNoConsoleErrors(errors);
  });

  test('shows the star through the forward window, not the hull', async ({ page }) => {
    // The cockpit camera sits just outside the rocket's exterior skin. The animated entry
    // hid the hull, but the deep-link jump wrote that through `handles.rocket`, which does
    // not exist yet during boot — so every shared `#/about` link opened staring at the
    // inside of the hull. The DOM was correct throughout, which is why the existing tests
    // passed; only the pixels showed it.
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });

    const strip = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const panelTop = document.querySelector('.mc')!.getBoundingClientRect().top;
      const bitmap = await createImageBitmap(canvas);
      const scale = bitmap.height / canvas.clientHeight;
      const height = Math.max(1, Math.round(panelTop * scale));
      const off = document.createElement('canvas');
      off.width = bitmap.width;
      off.height = height;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, off.width, height);
      let bright = 0;
      let warm = 0;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        total++;
        if (r + g + b > 330) bright++;
        if (r > b + 25) warm++;
      }
      return { bright: bright / total, warm: warm / total, height };
    });

    expect(strip.height, 'there must be a strip of window above the panel').toBeGreaterThan(40);
    expect(strip.bright, 'the star disc should light the window strip').toBeGreaterThan(0.15);
    expect(strip.warm, 'the window should read warm, not as neutral grey hull').toBeGreaterThan(0.2);
    expectNoConsoleErrors(errors);
  });

  test('Escape exits the cockpit', async ({ page }) => {
    await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await page.keyboard.press('Escape');
    await waitForScene(page, 'home');
  });

  test('resume offers a real, downloadable PDF', async ({ page }) => {
    const errors = await open(page, '#/resume');
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    const link = page.locator('a:has-text("Download resume")');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    const res = await page.request.get(new URL(href!, page.url()).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('pdf');
    expect((await res.body()).length).toBeGreaterThan(15_000);
    expectNoConsoleErrors(errors);
  });

  test('contact exposes working email and GitHub actions', async ({ page }) => {
    const errors = await open(page, '#/contact');
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
    const gh = page.locator('a[href*="github.com"]').first();
    await expect(gh).toBeVisible();
    expect(await gh.getAttribute('target')).toBe('_blank');
    expectNoConsoleErrors(errors);
  });
});

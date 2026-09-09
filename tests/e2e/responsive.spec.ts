import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, open, scene, sel, waitForScene } from './helpers';

/** Small screens, reduced motion, and the accessible paths through the content. */

test.describe('mobile portrait', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the menu is reachable and the characters stay in frame', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    for (const label of ['About', 'Projects', 'Skills', 'Resume', 'Contact']) {
      const btn = page.locator(`${sel.homeMenu} button:has-text("${label}")`);
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box!.height, `${label} tap target`).toBeGreaterThanOrEqual(30);
    }
    expectNoConsoleErrors(errors);
  });

  test('the cockpit screen is readable and scrolls', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    const panel = page.locator('.mc__body');
    await expect(panel).toBeVisible();
    const fontSize = await page.locator('.mc-doc__lede').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
    // The panel must not overflow the viewport horizontally.
    const width = await panel.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(390);
    expectNoConsoleErrors(errors);
  });

  test('a project opens as a readable sheet', async ({ page }) => {
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.project-panel__title')).toBeVisible();
    const box = await page.locator('.project-panel').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    expectNoConsoleErrors(errors);
  });

  test('the page never scrolls sideways', async ({ page }) => {
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('mobile landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the menu still fits', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(`${sel.homeMenu} button:has-text("Projects")`)).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});

/**
 * The larger breakpoints had screenshots but no assertions, so "it survives a wide monitor"
 * rested on someone looking at a PNG. The spec asks for standard desktop, wide desktop and
 * laptop, and its warning is against simply scaling the desktop interface up or down — so
 * these check the things that break when you do: reading measure, label density, and
 * whether the frame still holds every control without a sideways scroll.
 */
for (const [name, width, height] of [
  ['wide desktop', 1920, 1080],
  ['standard desktop', 1440, 900],
  ['laptop', 1280, 720],
] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } });

    test('the menu carries every destination inside the frame', async ({ page }) => {
      const errors = await open(page, '#/', { dev: true });
      await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
      for (const label of ['About', 'Projects', 'Skills', 'Resume', 'Contact']) {
        const box = await page.locator(`${sel.homeMenu} button:has-text("${label}")`).boundingBox();
        expect(box, `${label} missing`).not.toBeNull();
        expect(box!.x + box!.width, `${label} runs past the right edge`).toBeLessThanOrEqual(width);
        expect(box!.x, `${label} runs past the left edge`).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, `${label} runs past the bottom`).toBeLessThanOrEqual(height);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expectNoConsoleErrors(errors);
    });

    test('the cockpit keeps a readable measure rather than stretching', async ({ page }) => {
      const errors = await open(page, '#/about', { dev: true });
      await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
      const lede = page.locator('.mc-doc__lede');
      const m = await lede.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { width: el.getBoundingClientRect().width, fontSize: parseFloat(cs.fontSize) };
      });
      expect(m.fontSize, 'body text too small').toBeGreaterThanOrEqual(14);
      // Roughly 0.5em per character: keep the line between 40 and 80 characters. A panel
      // that grows with the monitor produces a line nobody can track back to the left
      // margin. The ceiling started at 95, which was loose enough to pass a panel measured
      // at 86 characters — comfortably past the 45-75 the eye actually wants.
      const chars = m.width / (m.fontSize * 0.5);
      expect(chars, `line length ${Math.round(chars)} characters`).toBeLessThanOrEqual(80);
      expect(chars, `line length ${Math.round(chars)} characters`).toBeGreaterThanOrEqual(40);
      expectNoConsoleErrors(errors);
    });

    test('every project label is drawn and none collide', async ({ page }) => {
      const errors = await open(page, '#/projects', { dev: true });
      await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(1500);
      const count = await page.evaluate(() => window.__astro!.portfolio.data.projects.length);
      await expect(page.locator(sel.planetLabel)).toHaveCount(count);
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.planet-label')]
          .filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.05)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          }),
      );
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          expect(hit, `labels ${i} and ${j} overlap at ${width}x${height}`).toBe(false);
        }
      }
      for (const [i, b] of boxes.entries()) {
        expect(b.left, `label ${i} off the left edge`).toBeGreaterThanOrEqual(-1);
        expect(b.right, `label ${i} off the right edge`).toBeLessThanOrEqual(width + 1);
      }
      expectNoConsoleErrors(errors);
    });

    test('a project reads as the hero without a sideways scroll', async ({ page }) => {
      const errors = await open(page, '#/projects/sweet-moment', { dev: true });
      await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('.project-panel__title')).toBeVisible();
      const box = await page.locator('.project-panel').boundingBox();
      expect(box!.x, 'panel starts off-screen').toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, 'panel runs past the right edge').toBeLessThanOrEqual(width + 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expectNoConsoleErrors(errors);
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('every destination still arrives, quickly', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });

    await page.locator(`${sel.homeMenu} button:has-text("About")`).click();
    await waitForScene(page, 'cockpit', 10_000);
    await page.locator('button:has-text("Exit cockpit")').click();
    await waitForScene(page, 'home', 10_000);

    await page.locator(`${sel.homeMenu} button:has-text("Projects")`).click();
    await waitForScene(page, 'system', 10_000);
    await expect(page.locator(sel.systemHud)).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});

test.describe('keyboard and semantics', () => {
  test('the menu is reachable by keyboard alone', async ({ page }) => {
    await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    // Tab until a menu item has focus, then activate it.
    let focused = '';
    for (let i = 0; i < 12 && !focused.includes('About'); i++) {
      await page.keyboard.press('Tab');
      focused = (await page.evaluate(() => document.activeElement?.textContent ?? '')) as string;
    }
    expect(focused).toContain('About');
    await page.keyboard.press('Enter');
    await waitForScene(page, 'cockpit', 25_000);
  });

  test('the primary navigation is a real landmark', async ({ page }) => {
    await open(page, '#/');
    await expect(page.locator('nav[aria-label="Primary"]')).toBeAttached();
    expect(await scene(page).catch(() => 'home')).toBeTruthy();
  });
});

import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, open, scene, sel, waitForIdle, waitForScene } from './helpers';

/**
 * The hidden features, and — just as important — proof that they stay hidden and never
 * interfere with ordinary portfolio use.
 */

test.describe('developer mode', () => {
  test('is absent by default and appears with ?dev=true', async ({ page }) => {
    await open(page, '#/projects');
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(sel.devOverlay)).toHaveCount(0);

    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.devOverlay)).toBeVisible({ timeout: 25_000 });
  });

  test('the hotkey toggles the overlay', async ({ page }) => {
    await open(page, '#/projects');
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.keyboard.press('Control+Alt+Shift+KeyD');
    await expect(page.locator(sel.devOverlay)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Control+Alt+Shift+KeyD');
    await expect(page.locator(sel.devOverlay)).toHaveCount(0);
  });

  test('the schematic grid can be toggled from the overlay', async ({ page }) => {
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.devOverlay)).toBeVisible({ timeout: 25_000 });
    // The panel is collapsed by default so it never covers the site; open it first.
    await page.locator('[data-dev="toggle"]').click();
    await expect(page.locator(`${sel.devOverlay}[data-expanded="true"]`)).toBeVisible();
    expect(await page.evaluate(() => window.__astro!.useApp.getState().settings.grid.enabled)).toBe(false);
    await page.locator(`${sel.devOverlay} label:has-text("enabled")`).first().click();
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().settings.grid.enabled))
      .toBe(true);
  });
});

test.describe('flight mode', () => {
  test('does not trigger during ordinary browsing', async ({ page }) => {
    await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    for (const ch of 'pilot') await page.keyboard.press(ch);
    await page.waitForTimeout(1200);
    expect(await scene(page)).toBe('home');
  });

  /**
   * The Konami code is what people actually try when they go hunting for a hidden mode, so
   * it triggers flight alongside the word. Matched on `event.code`, which is why this test
   * presses physical keys rather than characters.
   */
  test('the Konami code also enters flight mode', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
      await page.keyboard.press(key);
    }
    await waitForScene(page, 'flight', 20_000);
    // The enter-flight glide owns the camera for ~1.2s and swallows input until it lands.
    await waitForIdle(page);
    await page.keyboard.press('Escape');
    await waitForScene(page, 'system', 20_000);
    expectNoConsoleErrors(errors);
  });

  test('a partial Konami code does nothing', async ({ page }) => {
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(1000);
    expect(await scene(page)).toBe('system');
  });

  test('the pilot trigger flies, moves and exits back to the system', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    for (const ch of 'pilot') await page.keyboard.press(ch);
    await waitForScene(page, 'flight', 20_000);
    // The enter-flight glide owns the camera for ~1.2s; thrust before that is ignored.
    await waitForIdle(page);

    const before = await page.evaluate(() => window.__astro!.handles.flight!.getPosition());
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => window.__astro!.handles.flight!.getPosition());
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
    expect(moved, 'ship should move under thrust').toBeGreaterThan(20);

    await page.keyboard.press('Escape');
    await waitForScene(page, 'system', 20_000);
    await expect(page.locator(sel.systemHud)).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test('approaching the Death Star unlocks the Falcon', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    for (const ch of 'pilot') await page.keyboard.press(ch);
    await waitForScene(page, 'flight', 20_000);
    await waitForIdle(page);

    expect(await page.evaluate(() => window.__astro!.useApp.getState().falconUnlocked)).toBe(false);
    await page.evaluate(() => {
      // The station sits far out on the orbital plane; fly to its doorstep facing it.
      const a = (200 * Math.PI) / 180;
      const ds: [number, number] = [Math.cos(a) * 3200, Math.sin(a) * 3200];
      const len = Math.hypot(ds[0], ds[1]);
      window.__astro!.handles.flight!.teleport(ds[0] * ((len - 150) / len), ds[1] * ((len - 150) / len), ds);
    });
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().falconUnlocked), { timeout: 15_000 })
      .toBe(true);
    await expect(page.getByText(/Falcon unlocked/i)).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.__astro!.useApp.getState().flightShip)).toBe('falcon');

    // T swaps back to the original ship.
    await page.keyboard.press('t');
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().flightShip), { timeout: 10_000 })
      .toBe('rocket');
    expectNoConsoleErrors(errors);
  });

  test('the unlock persists for a returning visitor', async ({ page, context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('astro.falcon', '1');
      } catch {
        /* storage blocked */
      }
    });
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    expect(await page.evaluate(() => window.__astro!.useApp.getState().falconUnlocked)).toBe(true);
  });
});

test.describe('audio', () => {
  test('stays silent until the visitor asks for sound', async ({ page }) => {
    await open(page, '#/');
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    // Nothing may create an AudioContext before the toggle is used.
    expect(await page.evaluate(() => !!(window as { __astroAudio?: unknown }).__astroAudio)).toBe(false);
    const toggle = page.locator('button:has-text("Sound")');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('astro.audio')))
      .toBe('1');
  });
});

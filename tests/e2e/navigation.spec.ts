import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, open, sel, waitForIdle, waitForScene } from './helpers';

/**
 * Back and Forward move through the site.
 *
 * Every change of place used to replace the one history entry, so Back from the resume or a
 * project left the portfolio — on a phone, a swipe away from losing the page entirely.
 */
test.describe('browser history', () => {
  test('Back leaves the cockpit for the menu, and Forward returns', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    await page.locator('.home-menu__item', { hasText: 'Resume' }).click();
    await waitForScene(page, 'cockpit', 40_000);
    await waitForIdle(page, 40_000);
    expect(page.url()).toContain('#/resume');

    await page.goBack();
    await waitForScene(page, 'home', 40_000);
    await waitForIdle(page, 40_000);
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    expect(['', '#/']).toContain(new URL(page.url()).hash);

    await page.goForward();
    await waitForScene(page, 'cockpit', 40_000);
    expect(page.url()).toContain('#/resume');
    expectNoConsoleErrors(errors);
  });

  test('stepping out with the site’s own control does not leave a duplicate entry behind', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    await page.locator('.home-menu__item', { hasText: 'About' }).click();
    await waitForScene(page, 'cockpit', 40_000);
    await waitForIdle(page, 40_000);

    // Leave through the reader, then the cabin's own exit.
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__astro!.useApp.getState().cockpitView), { timeout: 20_000 }).toBe('room');
    await waitForIdle(page, 20_000);
    await page.locator('.cockpit-hud button').first().click();
    await waitForScene(page, 'home', 40_000);
    await waitForIdle(page, 40_000);

    // The way back in is now Forward, not Back: the cockpit entry is ahead of us.
    await page.goForward();
    await waitForScene(page, 'cockpit', 40_000);
    expectNoConsoleErrors(errors);
  });

  test('Back from a project goes to the orbit', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await waitForIdle(page, 40_000);
    const first = await page.evaluate(() => window.__astro!.portfolio.data.projects.slice().sort((a, b) => a.order - b.order)[0]!.id);
    const toggle = page.locator('[aria-controls="project-index"]');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.locator('.project-index__item').first().click();
    await waitForScene(page, 'project', 40_000);
    await waitForIdle(page, 40_000);
    expect(page.url()).toContain(`#/projects/${first}`);

    await page.goBack();
    await waitForScene(page, 'system', 40_000);
    expect(page.url()).toMatch(/#\/projects$/);
    expectNoConsoleErrors(errors);
  });
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expectNoConsoleErrors, watchConsole } from './helpers';

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/data/portfolio.json', import.meta.url)), 'utf8'),
) as {
  profile: { name: string; title: string; tagline: string; contact: { email: string; github: string } };
  projects: { id: string; title: string }[];
  resume: { file: string };
};

/**
 * The simplified portfolio. It is a separate HTML entry so it never loads the 3D renderer,
 * and it is where a visitor without WebGL ends up — so "does it exist and is it complete"
 * is a real requirement, not a nice-to-have.
 */
test.describe('simplified portfolio', () => {
  test('loads without the 3D renderer', async ({ page }) => {
    const errors = watchConsole(page);
    const assets: string[] = [];
    page.on('request', (r) => assets.push(r.url()));

    await page.goto('/lite/', { waitUntil: 'load' });
    await expect(page.locator('.lite__name')).toHaveText(data.profile.name);

    // The whole point of the separate entry: no three, no r3f, no postprocessing.
    const heavy = assets.filter((u) => /\/(three|r3f|postfx)-[^/]*\.js$/.test(u));
    expect(heavy, `should not load the renderer: ${heavy.join(', ')}`).toEqual([]);
    expectNoConsoleErrors(errors);
  });

  test('carries every project from the same data file', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/lite/', { waitUntil: 'load' });
    await expect(page.locator('.lite-card')).toHaveCount(data.projects.length);
    for (const p of data.projects) {
      await expect(page.locator('.lite-card__title', { hasText: p.title }).first()).toBeVisible();
    }
    expectNoConsoleErrors(errors);
  });

  test('offers the real resume download and working contact actions', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/lite/', { waitUntil: 'load' });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.locator('a:has-text("Download the PDF")').click(),
    ]);
    expect(await download.path()).toBeTruthy();

    await expect(page.locator(`a[href="mailto:${data.profile.contact.email}"]`)).toBeVisible();
    await expect(page.locator(`a[href="${data.profile.contact.github}"]`)).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test('every section anchor in the nav resolves to a section', async ({ page }) => {
    await page.goto('/lite/', { waitUntil: 'load' });
    const hrefs = await page.locator('.lite__nav a').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!),
    );
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) {
      await expect(page.locator(href!), `${href} should exist`).toHaveCount(1);
    }
  });

  test('reads on a phone without a sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = watchConsole(page);
    await page.goto('/lite/', { waitUntil: 'load' });
    await expect(page.locator('.lite__name')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Every nav chip has to be a real tap target.
    for (const box of await page.locator('.lite__nav a').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    )) {
      expect(box).toBeGreaterThanOrEqual(36);
    }
    expectNoConsoleErrors(errors);
  });

  /**
   * The link belongs to the home menu and must fade out with it. It shipped without the
   * menu's own visibility rule and stayed painted at full opacity everywhere — it turned up
   * sitting on an orbit ring in the solar system.
   */
  test('the link is only visible on the home menu', async ({ page }) => {
    // Each route is a distinct URL, not just a new hash: navigating by hash alone stays in
    // the same document, so the scene would not be rebuilt and the check would pass or fail
    // on whatever the previous route left behind.
    for (const [route, scene, wanted] of [
      ['#/', 'home', 1],
      ['#/projects', 'system', 0],
      ['#/about', 'cockpit', 0],
    ] as const) {
      await page.goto(`/?nointro&dev=true&r=${scene}${route}`, { waitUntil: 'load' });
      await expect
        .poll(() => page.evaluate(() => window.__astro!.useApp.getState().scene), { timeout: 25_000 })
        .toBe(scene);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const el = document.querySelector('.home-menu__lite');
              return el ? Number(getComputedStyle(el).opacity) : -1;
            }),
          { timeout: 25_000, message: `lite link opacity on ${route}` },
        )
        .toBe(wanted);
    }
  });

  test('the 3D site links to it, and it links back', async ({ page }) => {
    await page.goto('/?nointro#/', { waitUntil: 'load' });
    // Wait for the menu to actually arrive: until then the link carries tabindex -1 and the
    // loader is still over the canvas.
    await expect(page.locator('.home-menu[data-visible="true"]')).toBeVisible({ timeout: 25_000 });
    const link = page.locator('.home-menu__lite');
    await expect(link).toBeVisible({ timeout: 25_000 });
    await link.click();
    await expect(page.locator('.lite__name')).toBeVisible({ timeout: 20_000 });
    await page.locator('.lite__switch a').click();
    await expect(page).toHaveURL(/\/(index\.html)?(\?|#|$)/);
  });
});

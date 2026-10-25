import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, open, sel, waitForIdle, waitForScene } from './helpers';

/**
 * Getting around: the routes between sections that are not parent and child, and the
 * browser's own Back and Forward.
 *
 * Every journey here chains several sequences (leave the cockpit, launch, focus a planet), so
 * the timeouts are the sum of those, not of one — and under a software rasteriser the cockpit
 * alone renders at seconds per frame (see .github/workflows/e2e.yml).
 */
test.describe.configure({ timeout: 180_000 });

const appState = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const s = window.__astro!.useApp.getState();
    return { scene: s.scene, busy: s.busy, tab: s.cockpitTab, project: s.selectedProjectId };
  });

test.describe('cross-section navigation', () => {
  test('the reader links straight to the projects', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await page.locator('.mc__go').click();
    await waitForScene(page, 'system', 40_000);
    await waitForIdle(page);
    await expect(page).toHaveURL(/#\/projects$/);
    expectNoConsoleErrors(errors);
  });

  test('a skill opens the project that uses it', async ({ page }) => {
    const errors = await open(page, '#/skills', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    const python = page.locator('.tag--linked:has-text("Python")');
    await python.click();
    await expect(python).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.skill-usage[data-open="true"] a:has-text("Minecraft Adhan Clock")').click();
    await expect.poll(async () => (await appState(page)).project, { timeout: 45_000 }).toBe('minecraft-adhan');
    await waitForScene(page, 'project', 45_000);
    await expect(page.locator(sel.projectPanel)).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test('the orbit links to a cockpit section', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.locator(`${sel.systemHud} .system-hud__links a:has-text("Contact")`).click();
    await waitForScene(page, 'cockpit', 40_000);
    await expect.poll(async () => (await appState(page)).tab).toBe('contact');
    await expect(page.locator(sel.missionComputer)).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});

test.describe('browser history', () => {
  test('Back and Forward move between the places visited', async ({ page }) => {
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });

    await page.locator('button:has-text("Back to orbit")').click();
    await waitForScene(page, 'system');
    await waitForIdle(page);
    await expect(page).toHaveURL(/#\/projects$/);

    await page.goBack();
    await waitForScene(page, 'project', 25_000);
    await expect.poll(async () => (await appState(page)).project).toBe('sweet-moment');
    await waitForIdle(page);

    await page.goForward();
    await waitForScene(page, 'system', 25_000);
    expectNoConsoleErrors(errors);
  });

  test('a section change in the reader is its own history entry', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await page.locator('.mc__tab:has-text("Skills")').click();
    await expect(page).toHaveURL(/#\/skills$/);
    await page.goBack();
    await expect.poll(async () => (await appState(page)).tab).toBe('about');
    await expect(page).toHaveURL(/#\/about$/);
    expectNoConsoleErrors(errors);
  });
});

test.describe('project panel', () => {
  test('Previous wraps from the first project to the last, and says where it goes', async ({ page }) => {
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    const prev = page.locator('.pager:not(.pager--next)');
    await expect(prev).toBeEnabled();
    await expect(prev).toContainText('AstroPortfolio');
    await prev.click();
    await expect.poll(async () => (await appState(page)).project, { timeout: 20_000 }).toBe('astro-portfolio');
    expectNoConsoleErrors(errors);
  });

  test('an image opens full size and Escape closes it without leaving the project', async ({ page }) => {
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await waitForIdle(page);
    await page.locator('.project-media__zoom').click();
    await expect(page.locator('.lightbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lightbox')).toHaveCount(0);
    expect((await appState(page)).scene).toBe('project');
    expectNoConsoleErrors(errors);
  });
});

test.describe('quick actions', () => {
  test('the landing frame offers the resume, email and GitHub without entering the ship', async ({ page }) => {
    const errors = await open(page, '#/');
    await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
    const links = page.locator('.lockup[data-visible="true"] .quick-links a');
    await expect(links.filter({ hasText: 'Resume PDF' })).toHaveAttribute('href', /\.pdf$/);
    await expect(links.filter({ hasText: 'Email' })).toHaveAttribute('href', /^mailto:/);
    await expect(links.filter({ hasText: 'GitHub' })).toHaveAttribute('href', /github\.com/);
    expectNoConsoleErrors(errors);
  });

  test('the email address can be copied', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page, '#/contact', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await page.locator('.contact-list .copy-btn').click();
    await expect(page.locator('.contact-list .copy-btn')).toHaveText('Copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/@/);
    expectNoConsoleErrors(errors);
  });
});

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PortfolioSchema } from '../../src/data/schema';
import { expectNoConsoleErrors, watchConsole } from './helpers';

/** The owner-facing content studio: opens populated, validates, exports usable JSON. */

const exportLink = 'a:has-text("Export JSON")';

test.describe('content studio', () => {
  test('opens with the current content already loaded', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/admin/', { waitUntil: 'load' });
    // Populated on arrival: no "import your JSON first" step.
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Abdulrahman Bahjat', { timeout: 20_000 });
    await expect(page.getByLabel('Title', { exact: true })).not.toHaveValue('');
    await expect(page.locator(exportLink)).toBeVisible();
    for (const section of ['Site', 'Profile', 'Skills', 'Resume', 'Categories', 'Projects', 'Planet', 'Settings']) {
      await expect(page.locator(`button:has-text("${section}")`).first()).toBeVisible();
    }
    expectNoConsoleErrors(errors);
  });

  test('exports JSON that satisfies the schema and carries the edit', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/admin/', { waitUntil: 'load' });
    const tagline = page.getByLabel('Tagline', { exact: true });
    await expect(tagline).toBeVisible({ timeout: 20_000 });
    const edited = 'Builds complete things - verified by the end-to-end suite.';
    await tagline.fill(edited);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.locator(exportLink).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const raw = JSON.parse(await readFile(path!, 'utf8'));
    const parsed = PortfolioSchema.parse(raw);
    expect(parsed.profile.tagline).toBe(edited);
    expect(parsed.projects.length).toBeGreaterThan(0);
    expectNoConsoleErrors(errors);
  });

  test('the planet section previews the whole orbit layout', async ({ page }) => {
    await page.goto('/admin/', { waitUntil: 'load' });
    await page.locator('button:has-text("Planet")').first().click();
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 15_000 });
    const circles = await page.locator('svg circle').count();
    expect(circles, 'orbit preview should draw rings and planets').toBeGreaterThan(5);
  });

  test('invalid input is reported and blocks export', async ({ page }) => {
    await page.goto('/admin/', { waitUntil: 'load' });
    await page.locator('button:has-text("Categories")').first().click();
    const hex = page.locator('input[type="text"][value^="#"]').first();
    await expect(hex).toBeVisible({ timeout: 15_000 });
    await hex.fill('#12345');
    await expect(page.getByText(/Expected a #rrggbb color/i).first()).toBeVisible({ timeout: 10_000 });
    // The export link is neutralised while the draft is invalid.
    await expect(page.locator(exportLink)).toHaveAttribute('aria-disabled', 'true');
  });

  test('a draft survives a reload and can be discarded', async ({ page }) => {
    await page.goto('/admin/', { waitUntil: 'load' });
    const tagline = page.getByLabel('Tagline', { exact: true });
    await expect(tagline).toBeVisible({ timeout: 20_000 });
    await tagline.fill('Draft persistence check');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('astro.admin.draft')), { timeout: 10_000 })
      .toContain('Draft persistence check');

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByLabel('Tagline', { exact: true })).toHaveValue('Draft persistence check', { timeout: 20_000 });
    await page.locator('button:has-text("Discard draft")').first().click();
    await expect(page.getByLabel('Tagline', { exact: true })).not.toHaveValue('Draft persistence check');
  });
});

import { test, expect } from '@playwright/test';

/**
 * The `setup` project: can this browser render the 3D site at all?
 *
 * Every scene test begins by waiting 30 s for the loader to hide. If WebGL never comes up,
 * that wait fails 64 times over, twice each with retries — the first three CI runs each took
 * ~30 minutes to say nothing more than "exit code 1". This single test asks the question
 * once, in about a minute, and attaches the answer (renderer string, core count, where the
 * page ended up) so the failure reads as a diagnosis instead of a timeout. When it fails,
 * Playwright skips every dependent test.
 */
test('the browser renders the 3D site (WebGL2 is available and the loader hides)', async ({ page }, testInfo) => {
  const probe = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { webgl2: false, renderer: 'none', vendor: 'none' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl2: true,
      renderer: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unmasked renderer unavailable',
      vendor: info ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : 'unmasked vendor unavailable',
    };
  });
  const environment = {
    ...probe,
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    userAgent: await page.evaluate(() => navigator.userAgent),
    ci: Boolean(process.env.CI),
    platform: process.platform,
  };
  await testInfo.attach('environment.json', {
    body: JSON.stringify(environment, null, 2),
    contentType: 'application/json',
  });
  // Print it too: the list reporter's stdout is the only thing visible without an artifact.
  console.log(`[webgl.setup] ${JSON.stringify(environment)}`);

  expect(probe.webgl2, `no WebGL2 context: renderer=${probe.renderer}`).toBe(true);

  await page.goto('/?nointro&dev=true#/', { waitUntil: 'load' });
  // A browser without usable WebGL is sent to /lite/ by the app itself (src/lib/webgl.ts).
  // That page has no loader, so name the redirect instead of timing out on a selector.
  const landed = await page.evaluate(() => window.location.pathname);
  expect(landed, `the app redirected to ${landed}, which it does only when it decides WebGL is unavailable`).not.toContain('/lite/');
  await expect(page.locator('.loader[data-hidden="true"]'), `loader never hid; renderer=${probe.renderer}`).toBeAttached({
    timeout: 30_000,
  });
});

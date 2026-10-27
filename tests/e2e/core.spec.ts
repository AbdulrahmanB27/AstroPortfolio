import { expect, test } from '@playwright/test';
import { expectDisplayUndimmed, expectNoConsoleErrors, markVisited, open, scene, sel, settleCamera, waitForScene, watchConsole } from './helpers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const profile = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/data/portfolio.json', import.meta.url)), 'utf8'),
).profile as { name: string; intro: string };

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
    // The wall-clock bound measures the machine (fonts, a 700 ms loader hold, a 1.8 s tween
    // at whatever frame rate the rasteriser manages), not the product, so it only holds on
    // a machine with a GPU. The 25 s selector wait above still bounds it everywhere.
    if (!process.env.CI) expect(Date.now() - started).toBeLessThan(20_000);
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

  // One test per destination rather than four round trips in one: each trip is an enter and
  // an exit sequence, and four of them under a software rasteriser overran the 60 s budget
  // while every individual trip was fine.
  for (const label of ['About', 'Skills', 'Resume', 'Contact']) {
    test(`the ${label} destination opens the cockpit on its own tab and exits to the menu`, async ({ page }) => {
      const errors = await open(page, '#/', { dev: true });
      await page.locator(`${sel.homeMenu} button:has-text("${label}")`).click();
      await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
      await expect(page.locator(`.mc__tab[data-active="true"]:has-text("${label}")`)).toBeVisible();
      await page.locator('.mc__exit').click();
      await expect(page.locator(sel.homeMenu)).toBeVisible({ timeout: 25_000 });
      expect(await scene(page)).toBe('home');
      expectNoConsoleErrors(errors);
    });
  }
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
   * Every field the content studio offers must reach the screen. A profile field was once
   * editable in the studio and rendered nowhere: an owner could change it, export, install,
   * and see no difference anywhere on the site. Asserting against the JSON rather than a
   * literal keeps the two bound together.
   */
  test('renders every headline profile field from the data source', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    const doc = page.locator('.mc-doc');
    for (const value of [profile.name, profile.intro]) {
      await expect(doc).toContainText(value);
    }
    expectNoConsoleErrors(errors);
  });

  /**
   * Nothing from another scene may paint over the cockpit's displays.
   *
   * This has been three separate bugs with one shape: an overlay belonging to a different
   * scene, hidden by fading its children while the container kept painting. The solar
   * system's project index kept a 14px `backdrop-filter` running behind an `opacity: 0` HUD
   * — a hidden blur still filters. The home menu's `::before` scrim had no visibility rule
   * at all and sat over every other scene; on a phone it landed on the console and body copy
   * measured a peak luminance of 74 against the same panel's title at 242.
   *
   * None of that shows in the DOM — the text is `#eef2f8` and every computed style is
   * correct — so this reads the rendered pixels instead. The phone case lives in
   * `responsive.spec.ts`, because resizing mid-test leaves the CSS3D layer projecting the
   * previous viewport.
   */
  test('nothing from another scene dims the cockpit display', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await settleCamera(page);
    await expectDisplayUndimmed(page, 'desktop');
    expectNoConsoleErrors(errors);
  });

  /**
   * The reader, and the cabin behind it.
   *
   * The cockpit has two states now. Reading a raked surface through a perspective camera lost
   * to a page twice, so the displays carry the section titles and the reading is flat. What
   * has to hold: the reader fills the frame, there is never a second copy of the content in
   * the document, switching section stays in the reader, Escape steps back to the cabin rather
   * than out of the ship, the cabin has a way out of its own, and selecting a display comes
   * back to the reader on THAT section.
   */
  test('the reader fills the frame, and the cabin behind it has a way out', async ({ page }) => {
    const errors = await open(page, '#/skills', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await settleCamera(page);

    const frameSize = () =>
      page.evaluate(() => {
        const r = document.querySelector('.mc__frame')!.getBoundingClientRect();
        return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
      });

    expect(await page.evaluate(() => window.__astro!.useApp.getState().cockpitView)).toBe('full');
    // Exactly one mission computer in the document, always. A build that still mounted the
    // reader on the active display as well put two of everything in here, including two
    // "back to the cabin" buttons.
    await expect(page.locator('.mc')).toHaveCount(1);
    await expect(page.locator('.mc-doc__title')).toContainText('Skills');

    const onFull = await frameSize();
    expect(onFull.w / onFull.vw, 'the reader should use most of the viewport').toBeGreaterThan(0.85);
    expect(onFull.h / onFull.vh, 'the reader should use most of the viewport').toBeGreaterThan(0.85);

    // Switching section stays in the reader. It used to drop back to the display, which is the
    // wrong reading of the gesture.
    await page.locator('.mc__tab', { hasText: 'Resume' }).click();
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().cockpitTab), { timeout: 20_000 })
      .toBe('resume');
    expect(
      await page.evaluate(() => window.__astro!.useApp.getState().cockpitView),
      'switching section must not leave the reader',
    ).toBe('full');
    await expect(page.locator('.mc-doc__title')).toContainText('Abdulrahman');
    await expect(page.locator('.mc')).toHaveCount(1);

    // Escape steps back to the cabin, not out of the ship.
    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().cockpitView), { timeout: 20_000 })
      .toBe('room');
    expect(await scene(page)).toBe('cockpit');

    /*
     * The cabin has a way out of its own.
     *
     * For one build it did not: the reading moved to a flat surface, the reader's header went
     * with it, and the cabin was left as four displays and no control at all — you could only
     * leave the cockpit by first opening a section. The owner found that, not a check here,
     * because nothing tests for the absence of a control unless it is asked to.
     */
    await expect(page.locator('.cockpit-hud[data-visible="true"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.cockpit-hud button')).toBeVisible();

    // And selecting a display comes back to the reader on that section.
    await page.locator('.screen-card:has-text("Contact")').click();
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().cockpitView), { timeout: 20_000 })
      .toBe('full');
    expect(await page.evaluate(() => window.__astro!.useApp.getState().cockpitTab)).toBe('contact');
    expectNoConsoleErrors(errors);
  });

  /**
   * No gradient may cover the last line of a reading surface. One did: it existed to say
   * "there is more below" and did it by washing out the bottom row, which on a display
   * inside a scene cannot be scrolled clear without losing your place.
   */
  test('the bottom line of a display is readable', async ({ page }) => {
    const errors = await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });
    await settleCamera(page);

    const band = await page.evaluate(() => {
      const body = document.querySelector('.mc__body')!.getBoundingClientRect();
      // The last 40px inside the scroll area, where a bottom fade would sit.
      return { x: Math.round(body.left + 8), y: Math.round(body.bottom - 44), w: Math.round(body.width - 16), h: 36 };
    });
    const shot = (await page.screenshot()).toString('base64');
    const peak = await page.evaluate(
      async ({ shot, band }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + shot;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const x = Math.max(0, band.x);
        const y = Math.max(0, band.y);
        const w = Math.min(band.w, img.width - x);
        const h = Math.min(band.h, img.height - y);
        if (w <= 0 || h <= 0) return 0;
        const d = g.getImageData(x, y, w, h).data;
        let m = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          if (l > m) m = l;
        }
        return Math.round(m);
      },
      { shot, band },
    );
    // Text, not a wash. Under the old gradient this band peaked in the low tens.
    expect(peak, `bottom band peak luminance (band ${JSON.stringify(band)})`).toBeGreaterThan(110);
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

    // Measured from the cabin, not from a display. Entering the cockpit now flies straight
    // to the section you asked for, and from a foot away from one screen the forward window
    // is behind the camera's shoulder — the window is what the cabin view is for.
    await page.locator('.mc__back').click();
    await expect.poll(() => page.evaluate(() => window.__astro!.useApp.getState().cockpitView), { timeout: 25_000 }).toBe('room');
    await settleCamera(page);

    const strip = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const cards = [...document.querySelectorAll<HTMLElement>('.screen-card')];
      const panelTop = cards.length
        ? Math.min(...cards.map((c) => c.getBoundingClientRect().top))
        : document.querySelector('.mc')!.getBoundingClientRect().top;
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
      let peak = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        total++;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (l > peak) peak = l;
        if (r + g + b > 330) bright++;
        if (r > b + 25) warm++;
      }
      return { bright: bright / total, warm: warm / total, peak, height };
    });

    expect(strip.height, 'there must be a strip of window above the panel').toBeGreaterThan(40);
    // Peak, not fraction. The share of the band the star fills depends on how much window
    // is around it, and the console rework made that band much taller — the same star went
    // from 0.15 of a small strip to 0.146 of a large one while becoming more visible. What
    // actually distinguishes "the star through the window" from "the inside of the hull" is
    // that something in the band is genuinely bright and warm.
    expect(strip.peak, 'the star disc should be in the window').toBeGreaterThan(200);
    expect(strip.bright, 'the star should light a real part of the window').toBeGreaterThan(0.05);
    expect(strip.warm, 'the window should read warm, not as neutral grey hull').toBeGreaterThan(0.2);
    expectNoConsoleErrors(errors);
  });

  /**
   * Escape walks out one layer at a time, and neither layer may be a dead end.
   *
   * The handler used to live on the reader when the reader was the console; moving it left the
   * cabin with no keyboard exit, which is the same absence as the missing pill one layer down.
   */
  test('Escape leaves the reader, then the rocket', async ({ page }) => {
    await open(page, '#/about', { dev: true });
    await expect(page.locator(sel.missionComputer)).toBeVisible({ timeout: 25_000 });

    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().cockpitView), { timeout: 25_000 })
      .toBe('room');
    expect(await scene(page)).toBe('cockpit');

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

  /**
   * Scene exposure has to actually change the rendered frame.
   *
   * `handles.exposure.setLevel` existed, was documented as "focusing a project dims the whole
   * 3D world", and was called by four sequences — and did nothing at all for its entire life,
   * because it wrote `gl.toneMappingExposure` while an `EffectComposer` was drawing the scene
   * through its own passes. `setLevel(0)` and `setLevel(1)` produced byte-identical frames on
   * three surfaces. Nothing in the type system, the build or any other test could see it: the
   * call succeeded, the value was stored, and the pixels never moved.
   *
   * So this asserts the only thing that matters about it. Measured over the scene band to the
   * left of the project panel, where the world is.
   */
  test('scene exposure changes the rendered frame', async ({ page }) => {
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2000);

    const mean = async () => {
      const shot = (await page.screenshot()).toString('base64');
      return await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        // The scene band: left of the panel, below the top chrome.
        const d = g.getImageData(0, 120, Math.round(img.width * 0.5), Math.round(img.height * 0.6)).data;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 16) {
          sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          n += 1;
        }
        return sum / n;
      }, shot);
    };

    await page.evaluate(() => window.__astro!.handles.exposure!.setLevel(1));
    await page.waitForTimeout(1200);
    const bright = await mean();
    await page.evaluate(() => window.__astro!.handles.exposure!.setLevel(0.2));
    await page.waitForTimeout(1200);
    const dim = await mean();

    expect(bright, `the scene band should be lit at level 1 (measured ${bright.toFixed(1)})`).toBeGreaterThan(4);
    expect(
      dim,
      `level 0.2 must be visibly darker than level 1 — bright ${bright.toFixed(1)}, dim ${dim.toFixed(1)}`,
    ).toBeLessThan(bright * 0.75);
    expectNoConsoleErrors(errors);
  });
});

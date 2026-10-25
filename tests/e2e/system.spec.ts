import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, open, sel, waitForScene } from './helpers';

/** Launch, the solar system, project selection and the ways back. */

test.describe('launch', () => {
  test('Projects launches and settles into the solar system', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await page.locator(`${sel.homeMenu} button:has-text("Projects")`).click();
    await waitForScene(page, 'system', 30_000);
    await expect(page.locator(sel.systemHud)).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test('Shift+click runs the alternate launch and still reaches the system', async ({ page }) => {
    const errors = await open(page, '#/', { dev: true });
    await page.locator(`${sel.homeMenu} button:has-text("Projects")`).click({ modifiers: ['Shift'] });
    await waitForScene(page, 'system', 30_000);
    await expect(page.locator(sel.systemHud)).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});

test.describe('solar system', () => {
  test('actually draws the planets on a deep link, not just the HUD', async ({ page }) => {
    // A deep link runs the jump sequence before the scene has mounted. When the reveal
    // value lived in component state, that write was lost on remount and the page showed
    // an empty starfield while the HUD still reported itself visible.
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await expect
      .poll(() => page.evaluate(() => window.__astro!.systemView.reveal), { timeout: 15_000 })
      .toBe(1);
    expect(await page.evaluate(() => window.__astro!.systemView.dim)).toBe(0);

    // And prove it on screen: the framed disc must contain lit pixels, not pure space.
    const litFraction = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const bitmap = await createImageBitmap(canvas);
      const off = document.createElement('canvas');
      off.width = bitmap.width;
      off.height = bitmap.height;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, off.width, off.height);
      let lit = 0;
      let total = 0;
      for (let i = 0; i < data.length; i += 4 * 37) {
        total++;
        if (data[i]! + data[i + 1]! + data[i + 2]! > 90) lit++;
      }
      return lit / total;
    });
    expect(litFraction, 'the system view should not be an empty starfield').toBeGreaterThan(0.02);
    expectNoConsoleErrors(errors);
  });

  test('renders a label for every project', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    const count = await page.evaluate(() => window.__astro!.portfolio.data.projects.length);
    await expect(page.locator(sel.planetLabel)).toHaveCount(count);
    expectNoConsoleErrors(errors);
  });

  /**
   * The home planet is a real body on the one dashed orbit in the frame, and it was the only
   * one carrying no name — two reviewers read it as either a project they could not identify
   * or a bug, and the HUD's "Home planet" control never got tied to anything visible. It is
   * deliberately not a button: a second way back competing with the HUD control is worse than
   * none, so this asserts both halves — that it is named, and that it is not a destination.
   */
  test('the home planet is named, and is not a project', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    const home = page.locator('.planet-label--home');
    await expect(home).toHaveCount(1);
    await expect(home).toHaveText(/home/i);
    // Painted, and quieter than any project label.
    const alpha = await home.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(alpha, 'home label is painted').toBeGreaterThan(0.05);
    const projectAlpha = await page
      .locator(sel.planetLabel)
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(alpha, 'home label is quieter than a project').toBeLessThan(projectAlpha);
    expect(await home.evaluate((el) => el.tagName), 'not a control').not.toBe('BUTTON');
    // And it must not be counted as one: adding it under the bare `.planet-label` class broke
    // five "a label for every project" assertions at once, because the count went to eight.
    expect(
      await page.locator('.planet-label--project.planet-label--home').count(),
      'the home label is not also a project label',
    ).toBe(0);
    expectNoConsoleErrors(errors);
  });

  test('labels do not overlap each other', async ({ page }) => {
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
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
        const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  test('hovering a label marks the project as hovered', async ({ page }) => {
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1200);
    await page.locator(sel.planetLabel).first().hover({ force: true });
    await expect
      .poll(() => page.evaluate(() => window.__astro!.useApp.getState().hoveredProjectId))
      .not.toBeNull();
  });

  test('the project index lists and opens every project', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.locator('button:has-text("Project index")').click();
    const items = page.locator('.project-index__item');
    const count = await page.evaluate(() => window.__astro!.portfolio.data.projects.length);
    await expect(items).toHaveCount(count);
    await items.first().click();
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    expectNoConsoleErrors(errors);
  });
});

test.describe('project view', () => {
  test('shows the project as the hero with links and media', async ({ page }) => {
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.project-panel__title')).toContainText('Sweet Moment');
    await expect(page.locator('.project-panel a:has-text("Open live site")')).toBeVisible();
    await expect(page.locator('.project-panel a:has-text("Source on GitHub")')).toBeVisible();
    const img = page.locator('.project-media img').first();
    await expect(img).toBeVisible();
    // The image must actually have decoded, not just be present in the DOM.
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    expectNoConsoleErrors(errors);
  });

  /**
   * The "there is more to read" affordance must actually fire.
   *
   * `useHasMoreBelow` took a RefObject, and the panel body renders only once a project is
   * selected — so on the first effect the ref was null, the hook returned early, and nothing
   * in its dependency list changed when the element later appeared. No scroll listener was
   * ever attached. The result: 687px of a case study below the fold on a phone with the fade
   * off and the cue hidden, and on the desktop the write-up ending flush against the pager.
   * The DOM contained every word; the reader had no way to know.
   *
   * Asserting the flag against measured overflow is what makes this checkable, and the fade
   * and cue have to clear the pager or they are invisible whatever the flag says.
   */
  test('signals that a long write-up continues below the fold', async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const errors = await open(page, '#/projects/sweet-moment', { dev: true });
      await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(1200);

      const m = await page.evaluate(() => {
        const body = document.querySelector('.project-panel__body');
        const frame = document.querySelector('.project-panel__frame');
        const footer = document.querySelector('.project-panel__footer');
        const cue = document.querySelector('.project-panel__frame .scroll-cue');
        return {
          overflow: body ? body.scrollHeight - body.scrollTop - body.clientHeight : 0,
          more: frame?.getAttribute('data-more'),
          cueVisible: cue?.getAttribute('data-visible'),
          cueBottom: cue ? Math.round(cue.getBoundingClientRect().bottom) : null,
          footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null,
          fadeOpacity: frame ? getComputedStyle(frame, '::after').opacity : null,
        };
      });

      const where = `${viewport.width}x${viewport.height}`;
      expect(m.overflow, `${where}: this project should overflow`).toBeGreaterThan(50);
      expect(m.more, `${where}: fade is off with ${m.overflow}px hidden`).toBe('true');
      expect(m.cueVisible, `${where}: scroll cue hidden with ${m.overflow}px hidden`).toBe('true');
      expect(Number(m.fadeOpacity), `${where}: fade not painted`).toBeGreaterThan(0.5);
      // The cue has to sit above the pager, not behind it.
      expect(m.cueBottom!, `${where}: scroll cue is behind the pager`).toBeLessThanOrEqual(m.footerTop! + 2);
      expectNoConsoleErrors(errors);
    }
  });

  /**
   * The mobile sheet has to leave room for the writing. It shipped giving the description
   * 25px — one line, cut mid-sentence, above a 73px pager.
   */
  test('leaves the phone enough room to read the write-up', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1200);
    const visible = await page.evaluate(() => {
      const body = document.querySelector('.project-panel__body');
      const desc = document.querySelector('.project-panel__summary');
      if (!body || !desc) return 0;
      const b = body.getBoundingClientRect();
      const d = desc.getBoundingClientRect();
      return Math.max(0, Math.min(d.bottom, b.bottom) - d.top);
    });
    // Four lines at ~25px. Below this the description is a fragment, not a paragraph.
    expect(visible, 'description band above the pager').toBeGreaterThanOrEqual(95);
    expectNoConsoleErrors(errors);
  });

  test('flies the orbital probe in on a shared link, not just the panel', async ({ page }) => {
    // The probe is how a project presents itself, and a shared `#/projects/<id>` link runs
    // during boot — before the component has registered its handle. Writing the fade level
    // through that handle meant whether the probe appeared came down to a race, so the same
    // URL sometimes opened with the planet alone. The DOM was identical either way.
    const errors = await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const probe = window.__astro!.live.scene?.getObjectByName('probe');
            if (!probe) return { visible: false, opacity: 0 };
            let opacity = 0;
            probe.traverse((o) => {
              const mat = (o as { material?: { opacity?: number } }).material;
              if (mat?.opacity !== undefined) opacity = Math.max(opacity, mat.opacity);
            });
            return { visible: probe.visible, opacity };
          }),
        { timeout: 15_000 },
      )
      .toEqual({ visible: true, opacity: 1 });
    expectNoConsoleErrors(errors);
  });

  test('Next and Previous move between projects', async ({ page }) => {
    await open(page, '#/projects/sweet-moment', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    const first = await page.locator('.project-panel__title').textContent();
    await page.locator('button:has-text("Next")').click();
    await expect
      .poll(() => page.locator('.project-panel__title').textContent(), { timeout: 20_000 })
      .not.toBe(first);
  });

  test('returns to orbit', async ({ page }) => {
    const errors = await open(page, '#/projects/mykitchen', { dev: true });
    await expect(page.locator(sel.projectPanel)).toBeVisible({ timeout: 25_000 });
    await page.locator('button:has-text("Back to orbit")').click();
    await waitForScene(page, 'system');
    await expect(page.locator(sel.systemHud)).toBeVisible();
    expectNoConsoleErrors(errors);
  });
});

test.describe('returning home', () => {
  test('the Home planet control flies back to the menu', async ({ page }) => {
    const errors = await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.locator(`${sel.systemHud} button:has-text("Home planet")`).click();
    await waitForScene(page, 'home', 30_000);
    await expect(page.locator(sel.homeMenu)).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test('clicking the star returns home', async ({ page }) => {
    await open(page, '#/projects', { dev: true });
    await expect(page.locator(sel.systemHud)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1200);
    // Project the star (world origin) into screen space from the live camera rig and
    // click it on the canvas, the way a visitor would.
    const point = await page.evaluate(() => {
      const { rig } = window.__astro!;
      const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
      const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
      const cross = (a: number[], b: number[]) => [
        a[1]! * b[2]! - a[2]! * b[1]!,
        a[2]! * b[0]! - a[0]! * b[2]!,
        a[0]! * b[1]! - a[1]! * b[0]!,
      ];
      const norm = (a: number[]) => {
        const l = Math.hypot(a[0]!, a[1]!, a[2]!);
        return [a[0]! / l, a[1]! / l, a[2]! / l];
      };
      const pos = [rig.position.x, rig.position.y, rig.position.z];
      const fwd = norm(sub([rig.target.x, rig.target.y, rig.target.z], pos));
      const right = norm(cross(fwd, [0, 1, 0]));
      const up = cross(right, fwd);
      const v = sub([0, 0, 0], pos);
      const z = dot(v, fwd);
      const halfFov = Math.tan((rig.fov * Math.PI) / 360);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ndcX = dot(v, right) / z / (halfFov * (w / h));
      const ndcY = dot(v, up) / z / halfFov;
      return { x: ((ndcX + 1) / 2) * w, y: ((1 - ndcY) / 2) * h };
    });
    await page.mouse.click(point.x, point.y);
    await waitForScene(page, 'home', 30_000);
  });
});

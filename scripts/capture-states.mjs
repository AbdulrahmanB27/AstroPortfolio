// Captures the key visual states of the running app into captures/<label>/.
// Usage: node scripts/capture-states.mjs [--url http://localhost:5173] [--label round1] [--states home,cockpit,...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const baseUrl = opt('url', 'http://localhost:5173').replace(/\/$/, '');
const label = opt('label', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
const only = opt('states', '').split(',').filter(Boolean);
const outDir = resolve('captures', label);
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  wide: { width: 1920, height: 1080 },
  laptop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
  mobileLandscape: { width: 844, height: 390 },
};

/** Each state: how to reach it from a fresh page and how long to settle. */
const STATES = [
  // `startWhen` anchors the frame times to the moment the sequence actually begins. Timed
  // from page load instead, the first three intro frames landed on the loading screen, so
  // the cinematic was being judged on frames that did not contain it.
  { id: 'intro', url: '/#/', wait: 0, startWhen: '.intro-skip[data-visible="true"]', frames: [300, 900, 1600, 2400, 3200, 4200, 5400, 6300], viewports: ['desktop'] },
  { id: 'launch', url: '/?nointro#/', wait: 2200, click: 'button:has-text("Projects")', frames: [700, 1500, 2400, 3300, 4400, 5600, 7200], viewports: ['desktop'] },
  { id: 'launch-comedic', url: '/?nointro#/', wait: 2200, click: 'button:has-text("Projects")', clickModifiers: ['Shift'], frames: [1600, 2400, 3000, 3600, 4400], viewports: ['desktop'] },
  { id: 'enter-cockpit', url: '/?nointro#/', wait: 2200, click: 'button:has-text("About")', frames: [500, 1100, 1600, 2000, 2600, 3400], viewports: ['desktop'] },
  { id: 'return-home', url: '/?nointro#/projects', wait: 2600, click: 'button:has-text("Home planet")', frames: [600, 1300, 2000, 2600, 3200], viewports: ['desktop'] },
  { id: 'home-dev', url: '/?nointro&dev=true#/', wait: 2600, viewports: ['desktop'] },
  { id: 'home', url: '/?nointro#/', wait: 2600, viewports: ['desktop', 'wide', 'laptop', 'mobile', 'mobileLandscape'] },
  { id: 'cockpit-about', url: '/?nointro#/about', wait: 2600, viewports: ['desktop', 'mobile'] },
  { id: 'cockpit-skills', url: '/?nointro#/skills', wait: 2600, viewports: ['desktop'] },
  { id: 'cockpit-resume', url: '/?nointro#/resume', wait: 2600, viewports: ['desktop', 'mobile'] },
  { id: 'cockpit-contact', url: '/?nointro#/contact', wait: 2600, viewports: ['desktop'] },
  { id: 'system', url: '/?nointro#/projects', wait: 3200, viewports: ['desktop', 'wide', 'laptop', 'mobile'] },
  { id: 'project', url: '/?nointro#/projects/sweet-moment', wait: 3400, viewports: ['desktop', 'mobile'] },
  { id: 'project-2', url: '/?nointro#/projects/vex-robots', wait: 3400, viewports: ['desktop'] },
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] });
const errors = [];
for (const state of STATES) {
  if (only.length && !only.includes(state.id)) continue;
  for (const vp of state.viewports) {
    const context = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.text().includes('THREE.Clock')) return;
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${state.id}/${vp}] ${m.type()}: ${m.text().slice(0, 300)}`);
    });
    page.on('pageerror', (e) => errors.push(`[${state.id}/${vp}] pageerror: ${String(e).slice(0, 300)}`));
    try {
      await page.goto(baseUrl + state.url, { waitUntil: 'load', timeout: 60000 });
      if (state.startWhen) await page.waitForSelector(state.startWhen, { state: 'visible', timeout: 60000 });
      await page.waitForTimeout(state.wait);
      if (state.click || state.frames) {
        if (state.click) await page.click(state.click, { timeout: 10000, modifiers: state.clickModifiers ?? [] });
        // Timed against a real clock, not by summing sleeps: each screenshot costs a few
        // hundred milliseconds, so accumulating waits drifted later frames far enough to
        // land on a different beat of the sequence than the filename claimed. The 1500ms
        // cockpit frame was actually arriving after the cut, which read as "the transition
        // holds on black" when the transition was doing nothing of the sort.
        const t0 = Date.now();
        for (const t of state.frames ?? [state.wait]) {
          await page.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
          const file = resolve(outDir, `${state.id}--${vp}--${String(t).padStart(5, '0')}ms.png`);
          await page.screenshot({ path: file, fullPage: false });
          console.log('captured', `${state.id}--${vp}--${t}ms.png`);
        }
      } else {
        const file = resolve(outDir, `${state.id}--${vp}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log('captured', `${state.id}--${vp}.png`);
      }
    } catch (e) {
      errors.push(`[${state.id}/${vp}] capture failed: ${String(e).slice(0, 300)}`);
    }
    await context.close();
  }
}
await browser.close();
if (errors.length) {
  console.log('\nConsole/page issues:');
  for (const e of errors) console.log(' ', e);
}
console.log(`\nDone → ${outDir}`);

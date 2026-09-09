/**
 * Frame-rate and load measurement against the production build.
 *
 * The numbers quoted in the report have to be reproducible, so this drives the same
 * preview build the end-to-end suite uses, samples real animation frames in the page, and
 * prints a table. It measures two device profiles: a desktop viewport, and a throttled
 * mobile profile that also exercises the lower quality tier.
 *
 *   node scripts/perf-check.mjs
 *
 * Starts `vite preview` on PORT (default 4173) unless something already answers there.
 */
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.PORT ?? 4173);
const BASE = `http://localhost:${PORT}`;
const SAMPLE_MS = 4000;

const STATES = [
  { name: 'home', hash: '#/', settle: 'home-menu' },
  { name: 'cockpit', hash: '#/about', settle: 'mc' },
  { name: 'system', hash: '#/projects', settle: 'system-hud' },
  { name: 'project', hash: '#/projects/sweet-moment', settle: 'project-panel' },
];

async function alreadyServing() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startPreview() {
  if (await alreadyServing()) return null;
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await alreadyServing()) return child;
  }
  child.kill();
  throw new Error(`preview server never answered on ${BASE}`);
}

/** Sample real animation frames and return fps percentiles plus the worst frame. */
async function sampleFrames(page, ms) {
  return page.evaluate(async (duration) => {
    const gaps = [];
    let last = performance.now();
    const deadline = last + duration;
    await new Promise((resolve) => {
      const tick = (now) => {
        gaps.push(now - last);
        last = now;
        if (now < deadline) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    // Drop the first few frames: they include the scheduling of this very call.
    const clean = gaps.slice(3).sort((a, b) => a - b);
    const at = (q) => clean[Math.min(clean.length - 1, Math.floor(clean.length * q))];
    return {
      frames: clean.length,
      medianMs: +at(0.5).toFixed(2),
      p95Ms: +at(0.95).toFixed(2),
      worstMs: +clean[clean.length - 1].toFixed(2),
    };
  }, ms);
}

async function measure(browser, profile) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const rows = [];

  for (const state of STATES) {
    const started = Date.now();
    // A distinct query per state forces a real document load: changing only the hash
    // would leave the previous scene mounted and measure the wrong thing.
    await page.goto(`${BASE}/?nointro&dev=true&s=${state.name}${state.hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`.${state.settle}[data-visible="true"]`, { timeout: 40_000 });
    const interactiveMs = Date.now() - started;
    // Let the scene settle so we measure the steady state, not the arrival tween.
    await page.waitForTimeout(1200);
    const f = await sampleFrames(page, SAMPLE_MS);
    const quality = await page.evaluate(() => window.__astro?.useApp.getState().quality.tier ?? 'unknown');
    rows.push({
      state: state.name,
      quality,
      fpsMedian: +(1000 / f.medianMs).toFixed(1),
      medianMs: f.medianMs,
      p95Ms: f.p95Ms,
      worstMs: f.worstMs,
      interactiveMs,
    });
  }

  await context.close();
  return rows;
}

const child = await startPreview();
// Headless Chromium renders WebGL through SwiftShader on the CPU, so the frame rates
// below are NOT what a visitor sees — they are a relative regression guard, useful for
// catching "this state got several times more expensive". Real frame rates have to be
// read from a GPU-backed browser; set PERF_GPU=1 where a display session is available.
const gpu = process.env.PERF_GPU === '1';
const browser = await chromium.launch({
  headless: !gpu,
  args: ['--disable-frame-rate-limit', '--autoplay-policy=no-user-gesture-required'],
});
console.log(gpu ? '(GPU rendering)' : '(software rendering — frame rates are a relative guard, not real-world)');
const profiles = [
  { label: 'desktop 1440x900', context: { viewport: { width: 1440, height: 900 } } },
  { label: 'mobile (Pixel 5)', context: { ...devices['Pixel 5'] } },
];

let worstFps = Infinity;
try {
  for (const profile of profiles) {
    const rows = await measure(browser, profile);
    console.log(`\n== ${profile.label}`);
    console.log('  state     quality  fps(med)  median  p95    worst   interactive');
    for (const r of rows) {
      worstFps = Math.min(worstFps, r.fpsMedian);
      console.log(
        `  ${r.state.padEnd(9)} ${String(r.quality).padEnd(8)} ${String(r.fpsMedian).padStart(7)}` +
          `  ${String(r.medianMs).padStart(6)}  ${String(r.p95Ms).padStart(5)}  ${String(r.worstMs).padStart(6)}` +
          `  ${String(r.interactiveMs).padStart(7)} ms`,
      );
    }
  }
} finally {
  await browser.close();
  if (child) child.kill();
}

console.log(`\nworst median frame rate across every state and profile: ${worstFps} fps`);
// The software floor is deliberately loose: it tracks how many pixels the scene costs,
// not what a visitor experiences. Raising the render scale to supersample away aliasing
// tripled the CPU cost here while the GPU frame time did not move at all.
const floor = gpu ? 30 : Number(process.env.PERF_FLOOR ?? 0.5);
if (worstFps < floor) {
  console.error(`PERF CHECK: FAIL — a state fell below the ${floor} fps floor for this renderer`);
  process.exit(1);
}
console.log('PERF CHECK: PASS');

import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * End-to-end checks run against the real production build served by `vite preview`,
 * so what is tested is what the host will serve.
 *
 * WebGL in headless Chromium depends on where it runs, and the two cases want opposite
 * flags:
 *
 * - On the owner's Windows machine, `--use-angle=default` lets ANGLE pick the real GPU
 *   (D3D11). Without the explicit flags the headless shell defaults to software rendering.
 * - On a GitHub runner there is no GPU. The headless shell then picks SwiftShader for WebGL
 *   by itself — but only when nobody passes `--use-gl`/`--use-angle`. Passing the Windows
 *   flags there overrides that default with a backend that has nothing to bind to, which
 *   is how the first three CI runs each spent thirty minutes waiting for a loader that never
 *   hid. So on CI the flags are simply omitted. (Playwright itself already adds
 *   `--enable-unsafe-swiftshader`, the Chromium 137+ opt-in for software WebGL.)
 */
const launchArgs = CI ? [] : ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  // Software rendering is CPU-bound; two browsers on a 4-vCPU runner halve each other's
  // frame rate. Locally the GPU makes two workers fine.
  workers: CI ? 1 : 2,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // A run where every scene test is doomed must fail in minutes, not hours: the first three
  // CI runs each took ~30 minutes to fail because nothing bounded the arithmetic of
  // 64 scene tests × 2 attempts × 30 s loader wait. The `setup` project below is the fast
  // path; these two are the backstop.
  globalTimeout: CI ? 20 * 60_000 : 0,
  maxFailures: CI ? 10 : 0,
  // `github` writes every failure as an annotation on the run summary — readable by anyone
  // who can see the run, no admin rights needed. `html` is uploaded as an artifact.
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { args: launchArgs },
  },
  projects: [
    // Proves the browser can render the 3D site at all before the suite spends 30 s per test
    // finding out. When it fails, every dependent test is skipped and the failure carries
    // the renderer string (or the redirect to /lite/, which is the no-WebGL signature).
    { name: 'setup', testMatch: /webgl\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !CI,
    timeout: 240_000,
  },
});

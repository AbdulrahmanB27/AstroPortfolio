// Prints a per-frame timeline for one view: where the long frames fall and what the canvas size was.
//   node tools/qa/frametrace.mjs "view=home" [--seconds 8] [--firefox] [--headed] [--base http://localhost:5180/]
import { chromium, firefox } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const query = args[0] && !args[0].startsWith('--') ? args[0] : 'view=home'
const base = opt('--base', 'http://localhost:5180/')
const seconds = Number(opt('--seconds', '8'))

const useFirefox = args.includes('--firefox')
const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: !args.includes('--headed'), timeout: 120000 })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...(useFirefox ? {} : { deviceScaleFactor: 1 }) })).newPage()
await page.goto(`${base}?${query}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().sceneReady, null, { timeout: 150000 })
await page.waitForTimeout(3000)
const r = await page.evaluate(
  (ms) =>
    new Promise((resolve) => {
      const cv = document.querySelector('canvas')
      const frames = []
      let last = performance.now()
      const t0 = last
      const tick = (now) => {
        frames.push([Math.round(now - t0), +(now - last).toFixed(1), cv.width])
        last = now
        if (now - t0 < ms) requestAnimationFrame(tick)
        else resolve(frames)
      }
      requestAnimationFrame(tick)
    }),
  seconds * 1000,
)
await browser.close()
// one line per second: frame count, long frames (ms), canvas width at the end of that second
for (let s = 0; s < seconds; s++) {
  const f = r.filter((x) => x[0] >= s * 1000 && x[0] < (s + 1) * 1000)
  const long = f.filter((x) => x[1] > 25).map((x) => Math.round(x[1]))
  console.log(`t=${String(s + 3).padStart(2)}s  frames ${String(f.length).padStart(2)}  width ${f.length ? f[f.length - 1][2] : '-'}  long: ${long.join(' ') || '-'}`)
}

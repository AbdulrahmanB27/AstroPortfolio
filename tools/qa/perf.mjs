// Frame-rate measurement on the real GPU. Vsync and the frame limiter are disabled so the number shows headroom.
//   node tools/qa/perf.mjs [--base http://localhost:5180/] [--dsf 1] [--size desktop|laptop|phone] [--vsync] [--views "a|b"]
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const base = opt('--base', 'http://localhost:5180/')
const dsf = Number(opt('--dsf', '1'))
const sizeName = opt('--size', 'desktop')
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844] }
const [width, height] = SIZES[sizeName]
const DEFAULT_VIEWS = ['view=home', 'view=cockpit', 'view=orbit', 'view=project&project=sweet-moment-chocolate', 'view=flight', 'view=orbit&n=12']
// --views "view=home|view=home&debug=nobloom" measures just those query strings
const VIEWS = opt('--views', '') ? opt('--views', '').split('|') : DEFAULT_VIEWS

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(args.includes('--vsync') ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'])],
})
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf })
const page = await ctx.newPage()
const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2')
  const e = c.getExtension('WEBGL_debug_renderer_info')
  return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'
})
console.log(`GPU: ${gpu}\nviewport ${width}x${height} @ dsf ${dsf}`)
for (const q of VIEWS) {
  await page.goto(`${base}?${q}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().mode !== 'boot', null, { timeout: 90000 })
  // let resolution scaling converge before measuring (it waits 2.5 s, then needs a few seconds per step)
  await page.waitForTimeout(Number(opt('--settle', '14000')))
  const r = await page.evaluate(
    (finish) =>
      new Promise((resolve) => {
        // --finish: block on the GPU every frame, so (without vsync) the interval is the true cost of a frame
        const glc = finish ? document.querySelector('canvas').getContext('webgl2') : null
        const times = []
        let last = performance.now()
        const t0 = last
        const tick = (now) => {
          if (glc) glc.finish()
          times.push(now - last)
          last = now
          if (now - t0 < 5000) requestAnimationFrame(tick)
          else {
            times.shift()
            times.sort((a, b) => a - b)
            const avg = times.reduce((a, b) => a + b, 0) / times.length
            const cv = document.querySelector('canvas')
            const long = times.filter((t) => t > 34)
            resolve({ fps: +(1000 / avg).toFixed(1), medianMs: +times[Math.floor(times.length * 0.5)].toFixed(1), p95ms: +times[Math.floor(times.length * 0.95)].toFixed(1), p99ms: +times[Math.floor(times.length * 0.99)].toFixed(1), worstMs: +times[times.length - 1].toFixed(1), framesOver34ms: long.length, msInLong: Math.round(long.reduce((a, b) => a + b, 0)), frames: times.length, buffer: `${cv.width}x${cv.height}` })
          }
        }
        requestAnimationFrame(tick)
      }),
    args.includes('--finish'),
  )
  console.log(`${q.padEnd(48)} ${JSON.stringify(r)}`)
}
await browser.close()

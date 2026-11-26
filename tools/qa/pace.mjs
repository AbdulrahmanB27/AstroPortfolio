// Frame pacing through one transition: frames per half second and the longest frames, with what was going on.
//   node tools/qa/pace.mjs <view-query> <action> [--seconds 5] [--firefox] [--size laptop|desktop]
//   e.g.  node tools/qa/pace.mjs "view=home" launch      node tools/qa/pace.mjs "view=orbit" returnHome --firefox
import { chromium, firefox } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--seconds', '--size', '--base'].includes(args[i - 1])))
const [query = 'view=home', action = 'launch'] = pos
const seconds = Number(opt('--seconds', '5'))
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768] }
const [width, height] = SIZES[opt('--size', 'laptop')]
const base = opt('--base', 'http://localhost:5180/')
const useFirefox = args.includes('--firefox')

const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: true, timeout: 120000 })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width, height }, ...(useFirefox ? {} : { deviceScaleFactor: 1 }) })).newPage()
// record every shader program that takes long to link, with a hint of which one it is
await page.addInitScript(() => {
  const orig = WebGL2RenderingContext.prototype.getProgramInfoLog
  window.__links = []
  WebGL2RenderingContext.prototype.getProgramInfoLog = function (prog) {
    const t = performance.now()
    const r = orig.call(this, prog)
    const dt = performance.now() - t
    if (dt > 40) {
      let tag = ''
      try {
        const src = this.getAttachedShaders(prog).map((sh) => this.getShaderSource(sh)).join(' ')
        const marks = ['PTYPE', 'regoH', 'cellA', 'uExtent', 'tLamp', 'uPlume', 'uOuter', 'uRadius', 'uGain', 'VSM_SAMPLES', 'DEPTH_PACKING', 'USE_ENVMAP', 'USE_POINTS', 'inputBuffer', 'uPower', 'vFade', 'vSeed']
        tag = marks.filter((m) => src.includes(m)).join(',')
        const n = src.match(/#define SHADER_NAME (\w+)/)
        const ty = src.match(/#define PTYPE (\d)/)
        tag += (n ? ' ' + n[1] : '') + (ty ? ' type=' + ty[1] : '') + ' len=' + src.length
      } catch {
        /* ignore */
      }
      window.__links.push([t, Math.round(dt), tag])
    }
    return r
  }
})
await page.goto(`${base}?${query}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().sceneReady && !window.__portfolio.app.getState().busy, null, { timeout: 150000 })
await page.waitForTimeout(3000)
const r = await page.evaluate(
  ([a, ms]) =>
    new Promise((resolve) => {
      const p = window.__portfolio
      const [name, arg] = a.split(':')
      const frames = []
      const cv = document.querySelector('canvas')
      let last = performance.now()
      const t0 = last
      window.__paceT0 = t0
      const tick = (now) => {
        frames.push([Math.round(now - t0), Math.round(now - last), +p.fx.system.toFixed(2), Math.round(p.fx.lift), p.fx.rocketVisible, p.app.getState().mode, cv.width])
        last = now
        if (now - t0 < ms) requestAnimationFrame(tick)
        else resolve(frames)
      }
      requestAnimationFrame(tick)
      if (arg !== undefined) p.director[name](arg)
      else p.director[name]()
    }),
  [action, seconds * 1000],
)
const links = await page.evaluate(() => window.__links.filter((l) => l[0] >= window.__paceT0).map((l) => [Math.round(l[0] - window.__paceT0), l[1], l[2]]))
await browser.close()
const per = []
for (let s = 0; s < seconds * 2; s++) per.push(r.filter((f) => f[0] >= s * 500 && f[0] < (s + 1) * 500).length)
console.log(`${useFirefox ? 'firefox' : 'chrome'}  ${query} -> ${action}`)
console.log(`frames per half second: ${per.join(' ')}`)
const long = r.filter((f) => f[1] > 60).sort((a, b) => b[1] - a[1]).slice(0, 6)
console.log(long.length ? 'longest frames:' : 'no frame over 60 ms')
long.forEach((f) => console.log(`  ${String(f[1]).padStart(5)} ms at t=${f[0]} ms  (system ${f[2]}, lift ${f[3]} m, rocket ${f[4]}, mode ${f[5]})`))
const sizes = []
r.forEach((f) => {
  if (!sizes.length || sizes[sizes.length - 1][1] !== f[6]) sizes.push([f[0], f[6]])
})
console.log(`canvas width over time: ${sizes.map((x) => `${x[1]}px@${x[0]}ms`).join(' -> ')}`)
console.log(links.length ? 'shader programs linked during the transition:' : 'no shader program linked during the transition')
links.forEach((l) => console.log(`  ${String(l[1]).padStart(5)} ms at t=${l[0]} ms  ${l[2]}`))

// Diagnostic: which shader programs are slow to link, and when, on a first visit (phone size; --desktop for 1080p).
//   node tools/qa/shader-links.mjs [--desktop] [--firefox]      (dev server must be running)
import { chromium, firefox } from 'playwright-core'

const args = process.argv.slice(2)
const size = args.includes('--desktop') ? { width: 1920, height: 1080, dsf: 1, touch: false } : { width: 390, height: 844, dsf: 2, touch: true }
const useFirefox = args.includes('--firefox')
const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: true, timeout: 120000 })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: useFirefox ? 1366 : size.width, height: useFirefox ? 768 : size.height }, ...(useFirefox ? {} : { deviceScaleFactor: size.dsf, hasTouch: size.touch, isMobile: size.touch }) })
const page = await ctx.newPage()
await page.addInitScript(() => {
  const orig = WebGL2RenderingContext.prototype.getProgramInfoLog
  window.__compiles = []
  const T0 = performance.now()
  window.__blocked = { linkProgram: 0, getProgramParameter: 0, compileShader: 0, getShaderParameter: 0, getProgramInfoLog: 0 }
  for (const name of ['linkProgram', 'getProgramParameter', 'compileShader', 'getShaderParameter']) {
    const f = WebGL2RenderingContext.prototype[name]
    WebGL2RenderingContext.prototype[name] = function (...a) {
      const t = performance.now()
      const r = f.apply(this, a)
      window.__blocked[name] += performance.now() - t
      return r
    }
  }
  WebGL2RenderingContext.prototype.getProgramInfoLog = function (prog) {
    const t = performance.now()
    const r = orig.call(this, prog)
    const dt = performance.now() - t
    window.__blocked.getProgramInfoLog += dt
    if (dt > 60) {
      let tag = '?'
      try {
        const src = this.getAttachedShaders(prog)
          .map((sh) => this.getShaderSource(sh))
          .join(' ')
        const marks = ['PTYPE', 'regoH', 'cellA', 'uExtent', 'tLamp', 'uPower', 'VSM', 'DEPTH_PACKING', 'luminance', 'vfbm', 'USE_ENVMAP', 'USE_POINTS', 'inputBuffer', 'uOuter', 'uRadius', 'uStar']
        tag = marks.filter((m) => src.includes(m)).join(',')
        const m = src.match(/#define PTYPE (\d)/)
        if (m) tag += ' type=' + m[1]
        const sm = src.match(/#define SHADER_NAME (\w+)/)
        if (sm) tag += ' ' + sm[1]
        tag += ' len=' + src.length
      } catch {
        /* ignore */
      }
      window.__compiles.push(((t - T0) / 1000).toFixed(1) + 's +' + Math.round(dt) + 'ms ' + tag)
    }
    return r
  }
})
const t0 = Date.now()
const stamp = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`)
await page.goto('http://localhost:5180/', { waitUntil: 'load' })
await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().sceneReady, null, { timeout: 180000 })
stamp('scene ready (loader lifts)')
await page.waitForTimeout(1500)
await page.keyboard.press('Enter')
await page.waitForTimeout(2500)
const t1 = Date.now()
const st = await page.evaluate(() => (({ mode, busy }) => ({ mode, busy }))(window.__portfolio.app.getState()))
stamp(`state ${JSON.stringify(st)} (page answered in ${Date.now() - t1} ms)`)
const t2 = Date.now()
const frames = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = (now) => { n++; if (now - t < 3000) requestAnimationFrame(f); else res(n) }; requestAnimationFrame(f) }))
stamp(`frames in 3 s at home: ${frames} (wall time ${Date.now() - t2} ms)`)
console.log('main thread time inside WebGL compile/link calls (ms):', JSON.stringify(Object.fromEntries(Object.entries(await page.evaluate(() => window.__blocked)).map(([k, v]) => [k, Math.round(v)]))))
console.log('slow program links:')
console.log((await page.evaluate(() => window.__compiles.join('\n'))) || '  none over 60 ms')
await browser.close()

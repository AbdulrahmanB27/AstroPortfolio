// Traces the camera through "return to the home planet": where it is relative to the planet at every step,
// plus a strip of frames. Catches paths that pass through or under the planet.
//   node tools/qa/return-trace.mjs <label> [--az 24] [--el 0] [--zoom 1] [--real] [--nosheet] [--firefox] [--base http://localhost:5180/]
import { chromium, firefox } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const label = args[0] && !args[0].startsWith('--') ? args[0] : 'return'
const base = opt('--base', 'http://localhost:5180/')
const az = Number(opt('--az', '24'))
const el = Number(opt('--el', '0'))
const zoom = Number(opt('--zoom', '1'))
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

const useFirefox = args.includes('--firefox')
const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: true, timeout: 120000 })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, ...(useFirefox ? {} : { deviceScaleFactor: 1 }) })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const idle = (mode) => page.waitForFunction((m) => window.__portfolio && window.__portfolio.app.getState().mode === m && !window.__portfolio.app.getState().busy, mode, { timeout: 150000 })
if (args.includes('--real')) {
  // the way a visitor gets there: opening, menu, launch (so everything on the surface has been drawn once)
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().mode === 'intro', null, { timeout: 150000 })
  await page.waitForTimeout(800)
  await page.keyboard.press('Enter')
  await idle('home')
  await page.waitForTimeout(600)
  await page.click('.menu__item[data-key="launch"]')
  await page.waitForTimeout(1500)
  await page.keyboard.press('Enter')
  await idle('orbit')
} else {
  await page.goto(`${base}?view=orbit`, { waitUntil: 'load' })
  await idle('orbit')
}
await page.waitForTimeout(1500)
// turn the view the way a visitor would: a real drag (0.22 degrees of azimuth per px, 0.1 of tilt) and the wheel
const dx = -(az - 24) / 0.22
const dy = el / 0.1
if (dx || dy) {
  // start where the whole drag stays inside the window (Firefox rejects pointer moves outside it)
  const x0 = dx < 0 ? 1300 : 60
  const y0 = dy < 0 ? 700 : 120
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (dx * i) / 12, y0 + (dy * i) / 12)
  await page.mouse.up()
}
if (zoom !== 1) {
  await page.mouse.move(683, 384)
  await page.mouse.wheel(0, Math.round(Math.log(zoom) / 0.0011))
}
await page.waitForTimeout(1500)
console.log('view before return:', JSON.stringify(await page.evaluate(() => (({ orbitAz, orbitEl, orbitZoom }) => ({ az: Math.round(orbitAz), el: Math.round(orbitEl), zoom: +orbitZoom.toFixed(2) }))(window.__portfolio.rig))))
await page.evaluate(() => {
  window.__trace = []
  const p = window.__portfolio
  const C = [0, -298.79, 0]
  const t0 = performance.now()
  const tick = () => {
    const s = p.app.getState()
    const scale = 1 + (3.2 - 1) * p.fx.system
    const d = Math.hypot(p.rig.pos.x - C[0], p.rig.pos.y - C[1], p.rig.pos.z - C[2])
    // height of the camera above the landing site's horizon plane, and above the globe's surface
    // clearance to every project planet (negative = the camera is inside it)
    let near = null
    p.systemRefs.world.forEach((b, id) => {
      const c = Math.hypot(p.rig.pos.x - b.pos.x, p.rig.pos.y - b.pos.y, p.rig.pos.z - b.pos.z) / b.radius
      if (!near || c < near.c) near = { id, c }
    })
    window.__near = !window.__near || (near && near.c < window.__near.c) ? { ...near, t: Math.round(performance.now() - t0) } : window.__near
    window.__trace.push({ t: Math.round(performance.now() - t0), mode: s.mode, busy: s.busy, sys: +p.fx.system.toFixed(2), x: Math.round(p.rig.pos.x), y: Math.round(p.rig.pos.y), z: Math.round(p.rig.pos.z), aboveSurface: Math.round(d - 300 * scale), tx: Math.round(p.rig.target.x), ty: Math.round(p.rig.target.y), tz: Math.round(p.rig.target.z) })
    if (performance.now() - t0 < 5600) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  p.director.returnHome()
})
const frames = []
for (let i = 0; i < (args.includes('--nosheet') ? 0 : 12); i++) {
  frames.push(await page.screenshot({ type: 'png' }))
  await page.waitForTimeout(230)
}
await page.waitForTimeout(args.includes('--nosheet') ? 6000 : 2900)
const trace = await page.evaluate(() => window.__trace)
const near = await page.evaluate(() => window.__near)
await browser.close()

// contact sheet: 4 x 3
if (frames.length) {
const W = 455
const H = 256
const tiles = await Promise.all(frames.map((f) => sharp(f).resize(W, H).toBuffer()))
await sharp({ create: { width: W * 4, height: H * 3, channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 4) * W, top: Math.floor(i / 4) * H })))
  .png()
  .toFile(join(out, `return_az${az}_el${el}${useFirefox ? '_ff' : ''}.png`))
}

const step = Math.max(1, Math.floor(trace.length / 22))
console.log('t(ms)  mode    sys   camera(x,y,z)                aboveSurface   target(x,y,z)')
trace.filter((_, i) => i % step === 0 || i === trace.length - 1).forEach((r) => console.log(`${String(r.t).padStart(5)}  ${r.mode.padEnd(7)} ${String(r.sys).padEnd(5)} ${`${r.x}, ${r.y}, ${r.z}`.padEnd(28)} ${String(r.aboveSurface).padStart(8)} m     ${r.tx}, ${r.ty}, ${r.tz}`))
let gap = { ms: 0, at: 0 }
for (let i = 1; i < trace.length; i++) if (trace[i].mode === 'launch' && trace[i].t - trace[i - 1].t > gap.ms) gap = { ms: trace[i].t - trace[i - 1].t, at: trace[i - 1].t }
console.log(`longest frame during the return: ${gap.ms} ms (at t=${gap.at} ms); frames drawn while returning: ${trace.filter((r) => r.mode === 'launch').length}`)
const worst = trace.reduce((a, b) => (b.aboveSurface < a.aboveSurface ? b : a))
const minY = trace.reduce((a, b) => (b.y < a.y ? b : a))
console.log(`\nclosest to the surface: ${worst.aboveSurface} m at t=${worst.t} ms; lowest camera height (world y): ${minY.y} m at t=${minY.t} ms`)
const leg1 = trace.filter((r) => r.t < 1300)
const tight = leg1.reduce((a, b) => (b.aboveSurface < a.aboveSurface ? b : a), leg1[0])
console.log(`first leg: closest to the (enlarged) globe ${tight.aboveSurface} m at t=${tight.t} ms, camera y there ${tight.y} m`)
console.log(`nearest project planet: ${near ? `${near.id} at ${near.c.toFixed(2)} radii (t=${near.t} ms)` : 'n/a'}`)
console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}; sheet: tasks/captures/${label}/return_az${az}_el${el}${useFirefox ? '_ff' : ''}.png`)

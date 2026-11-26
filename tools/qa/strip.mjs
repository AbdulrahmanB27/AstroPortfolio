// Frame strip of one transition: start in a view, trigger an action, capture frames at a fixed interval.
//   node tools/qa/strip.mjs <label> <view-query> <action> [--every 150] [--frames 12] [--scrub [--from s --to s]] [--drag dx,dy] [--size laptop|desktop|phone] [--firefox]
//   actions: returnHome | exitCockpit | openCockpit:<tab> | launch | focusProject:<id> | closeProject
//   e.g.  node tools/qa/strip.mjs exit "view=cockpit&tab=about" exitCockpit
import { chromium, firefox } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--every', '--frames', '--size', '--base', '--drag', '--from', '--to'].includes(args[i - 1])))
const [label = 'strip', query = 'view=orbit', action = 'returnHome'] = pos
const every = Number(opt('--every', '150'))
const count = Number(opt('--frames', '12'))
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844] }
const sizeName = opt('--size', 'laptop')
const [width, height] = SIZES[sizeName]
const base = opt('--base', 'http://localhost:5180/')
const useFirefox = args.includes('--firefox')
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: true, timeout: 120000 })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width, height }, ...(useFirefox ? {} : { deviceScaleFactor: 1 }) })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`${base}?${query}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().sceneReady && !window.__portfolio.app.getState().busy, null, { timeout: 150000 })
await page.waitForTimeout(2500)
// --drag "dx,dy" turns the system view first with a real mouse drag (0.22 degrees of turn per px, 0.1 of tilt)
if (opt('--drag', '')) {
  const [dx, dy] = opt('--drag', '0,0').split(',').map(Number)
  const x0 = dx < 0 ? width - 60 : 60
  const y0 = dy < 0 ? height - 60 : 120
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (dx * i) / 12, y0 + (dy * i) / 12)
  await page.mouse.up()
  await page.waitForTimeout(1400)
}
await page.evaluate((a) => {
  const [name, arg] = a.split(':')
  const d = window.__portfolio.director
  window.__t0 = performance.now()
  if (arg !== undefined) d[name](arg)
  else d[name]()
}, action)
const frames = []
if (args.includes('--scrub')) {
  // exact, evenly spaced frames: pause the transition and seek it (independent of how slow screenshots are)
  const dur = await page.evaluate(() => {
    const tl = window.__portfolio.timeline()
    tl.pause()
    return tl.duration()
  })
  const from = Number(opt('--from', '0'))
  const to = Number(opt('--to', String(dur)))
  for (let i = 0; i < count; i++) {
    const t = from + ((to - from) * i) / (count - 1) - (i === count - 1 ? 0.001 : 0)
    await page.evaluate((x) => new Promise((res) => { window.__portfolio.timeline().time(x, false); requestAnimationFrame(() => requestAnimationFrame(res)) }), t)
    await page.waitForTimeout(120)
    frames.push({ t: Math.round(t * 1000), buf: await page.screenshot({ type: 'png' }) })
  }
} else {
  for (let i = 0; i < count; i++) {
    const t = await page.evaluate(() => Math.round(performance.now() - window.__t0))
    frames.push({ t, buf: await page.screenshot({ type: 'png' }) })
    await page.waitForTimeout(every)
  }
}
const end = await page.evaluate(() => (({ mode, busy }) => ({ mode, busy }))(window.__portfolio.app.getState()))
await browser.close()

const cols = 4
const W = Math.round(1820 / cols)
const H = Math.round((W * height) / width)
const tiles = await Promise.all(frames.map((f) => sharp(f.buf).resize(W, H).toBuffer()))
const file = join(out, `${action.replace(/[^a-z0-9]+/gi, '_')}_${sizeName}${opt('--drag', '') ? '_drag' + opt('--drag', '').replace(/[^0-9-]+/g, '_') : ''}${useFirefox ? '_ff' : ''}.png`)
await sharp({ create: { width: W * cols, height: H * Math.ceil(frames.length / cols), channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
  .png()
  .toFile(file)
console.log(`frames at ms: ${frames.map((f) => f.t).join(', ')}`)
console.log(`end state: ${JSON.stringify(end)}; errors: ${errors.length ? errors.join(' | ') : 'none'}`)
console.log(`sheet: ${file.replace(root, '').replace(/\\/g, '/')}`)

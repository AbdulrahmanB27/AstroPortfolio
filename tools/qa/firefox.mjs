// Screenshots and console errors from the installed Firefox (driven over WebDriver BiDi).
//   node tools/qa/firefox.mjs <label> ["view=home&t=6|view=orbit&t=6|..."] [--size desktop|laptop|phone|hidpi] [--dpr 1.75] [--headed]
import { firefox } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const rest = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--size', '--base', '--dpr'].includes(args[i - 1])))
const label = rest[0] ?? 'ff'
const views = (rest[1] ?? 'view=home&t=6|view=cockpit&tab=about&t=6|view=orbit&t=6|view=project&t=6').split('|')
const base = opt('--base', 'http://localhost:5180/')
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844], hidpi: [1646, 900] }
const sizeName = opt('--size', 'laptop')
const [width, height] = SIZES[sizeName]
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

// --dpr sets Firefox's own pixel scale (the context option is not available over BiDi)
const dprPref = opt('--dpr', '')
const browser = await firefox.launch({ channel: 'moz-firefox', headless: !args.includes('--headed'), timeout: 120000, ...(dprPref ? { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': dprPref } } : {}) })
console.log(`Firefox ${browser.version()}  ${width}x${height}`)
const ctx = await browser.newContext({ viewport: { width, height } })
let failures = 0
for (const q of views) {
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`)
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 400)}`))
  const t0 = Date.now()
  await page.goto(`${base}?${q}`, { waitUntil: 'load', timeout: 120000 })
  let ready = true
  try {
    await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().sceneReady, null, { timeout: 150000 })
  } catch {
    ready = false
  }
  const readyMs = Date.now() - t0
  await page.waitForTimeout(3500)
  const dprSeen = await page.evaluate(() => ({ dpr: window.devicePixelRatio, canvas: (() => { const c = document.querySelector('canvas'); return c ? `${c.width}x${c.height}` : 'none' })() }))
  console.log('   ', JSON.stringify(dprSeen))
  const name = q.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
  await page.screenshot({ path: join(out, `ff_${name}_${sizeName}.png`) })
  const real = logs.filter((l) => !/X4122|X4008|React DevTools|downloadable font|Layout was forced/.test(l))
  if (!ready || real.some((l) => /error/i.test(l))) failures++
  console.log(`${q.padEnd(40)} ready=${ready} after ${(readyMs / 1000).toFixed(1)}s  messages=${real.length}`)
  real.slice(0, 8).forEach((l) => console.log('    ' + l))
  await page.close()
}
await browser.close()
console.log(failures ? `${failures} view(s) with problems` : 'no errors')
process.exitCode = failures ? 1 : 0

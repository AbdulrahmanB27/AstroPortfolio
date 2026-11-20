// End-to-end journey with real input. Records state, console errors and frames at each beat.
//   node tools/qa/journey.mjs <label> [--base http://localhost:5180/] [--size desktop|laptop|phone] [--reduced]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const label = args[0] && !args[0].startsWith('--') ? args[0] : 'journey'
const base = opt('--base', 'http://localhost:5180/')
const sizeName = opt('--size', 'laptop')
const reduced = args.includes('--reduced')
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844] }
const [width, height] = SIZES[sizeName]
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
})
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  isMobile: sizeName === 'phone',
  hasTouch: sizeName === 'phone',
  reducedMotion: reduced ? 'reduce' : 'no-preference',
})
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const results = []
let n = 0
const state = () =>
  page.evaluate(() => {
    const s = window.__portfolio?.app.getState()
    return s ? { mode: s.mode, busy: s.busy, tab: s.tab, project: s.projectId } : null
  })
const snap = async (name) => {
  const file = `${String(++n).padStart(2, '0')}_${name}_${sizeName}.png`
  await page.screenshot({ path: join(out, file) })
  return file
}
const record = (step, ok, extra = {}) => {
  results.push({ step, ok, ...extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${JSON.stringify(extra)}`)
}
const check = async (name, expect) => {
  const s = await state()
  const ok = Object.entries(expect).every(([k, v]) => s && s[k] === v)
  record(name, ok, { state: s })
  await snap(name)
  return ok
}
const settle = async (ms = 14000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = await state()
    if (s && !s.busy) return true
    await page.waitForTimeout(100)
  }
  return false
}
const tap = (sel) => (sizeName === 'phone' ? page.tap(sel) : page.click(sel))
const menu = (label) => `.menu__item:has-text("${label}")`

// The dev server exposes the test handle without any ?view parameter, so this is the real first-run flow.
await page.goto(base, { waitUntil: 'load' })
await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().mode !== 'boot', null, { timeout: 90000 })
await page.waitForTimeout(600)
if (reduced) {
  await check('reduced_motion_starts_home', { mode: 'home' })
} else {
  await check('intro_running', { mode: 'intro', busy: true })
  await page.waitForTimeout(1900)
  await snap('intro_mid')
  // rapid input during the cinematic must not break anything
  await page.mouse.click(width * 0.5, height * 0.5)
  await page.mouse.click(width * 0.8, height * 0.5)
  await page.keyboard.press('Escape') // skip
}
await settle()
await check('home_ready', { mode: 'home', busy: false })

// About -> cockpit
await tap(menu('About'))
await page.waitForTimeout(900)
await snap('to_cockpit_mid')
await tap(menu('Projects')).catch(() => {}) // must be ignored while busy
await settle()
await page.waitForTimeout(700)
await check('cockpit_about', { mode: 'cockpit', busy: false, tab: 'about' })
for (const t of ['skills', 'resume', 'contact']) {
  await tap(`#tab-${t}`)
  await page.waitForTimeout(450)
  await check(`cockpit_${t}`, { mode: 'cockpit', tab: t })
}
const mail = await page.getAttribute('.contact__email a', 'href')
record('mailto_link', /^mailto:.+@.+/.test(mail ?? ''), { href: mail })
await tap('.backbtn.is-on')
await page.waitForTimeout(500)
await snap('exit_cockpit_mid')
await settle()
await check('home_after_cockpit', { mode: 'home', busy: false })

// Resume goes straight to the resume tab; Escape steps back
await tap(menu('Resume'))
await settle()
await check('cockpit_resume_direct', { mode: 'cockpit', tab: 'resume' })
await page.keyboard.press('Escape')
await settle()
await check('home_via_escape', { mode: 'home', busy: false })

// Projects -> launch -> orbit
await tap(menu('Projects'))
if (!reduced) {
  await page.waitForTimeout(1500)
  await snap('launch_1500')
  await page.waitForTimeout(1300)
  await snap('launch_2800')
  await page.waitForTimeout(1500)
  await snap('launch_4300')
}
await settle(16000)
await page.waitForTimeout(800)
await check('orbit', { mode: 'orbit', busy: false })

// focus a planet through its label, read the display, go back
const pick = async (id, text) => {
  const shown = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.plabel')].find((e) => e.textContent.includes(t))
    return !!el && parseFloat(el.style.opacity || '0') > 0.3
  }, text)
  if (shown) return tap(`.plabel:has-text("${text}")`)
  // label hidden by collision handling: use the planet itself
  const d = await page.evaluate((i) => window.__portfolio.screenDiscs.get(i), id)
  return sizeName === 'phone' ? page.touchscreen.tap(d.x, d.y) : page.mouse.click(d.x, d.y)
}
await pick('sweet-moment-chocolate', 'Sweet Moment')
await page.waitForTimeout(500)
await snap('focus_mid')
await settle()
await page.waitForTimeout(500)
await check('project_open', { mode: 'project', busy: false, project: 'sweet-moment-chocolate' })
const link = await page.getAttribute('.project__links a', 'href')
record('project_link', link?.replace(/\/$/, '') === 'https://sweetmomentchocolate.com', { href: link })
const img = await page.evaluate(() => {
  const i = document.querySelector('.project__media img')
  return i ? { complete: i.complete, w: i.naturalWidth } : null
})
record('project_media_loaded', !!img && img.complete && img.w > 0, { img })
await tap('.backbtn.is-on')
await settle()
await check('orbit_after_project', { mode: 'orbit', busy: false, project: null })

// click a planet in the 3D view itself (real pointer events through the canvas)
await page.waitForTimeout(700) // let the overview settle so the projected position is current
const target = await page.evaluate(() => window.__portfolio.screenDiscs.get('space-portfolio'))
await page.mouse.move(target.x, target.y)
await page.waitForTimeout(300)
if (sizeName === 'phone') await page.touchscreen.tap(target.x, target.y)
else await page.mouse.click(target.x, target.y)
await settle()
await page.waitForTimeout(400)
await check('project_by_planet_click', { mode: 'project', project: 'space-portfolio' })
await page.keyboard.press('Escape')
await settle()
await check('orbit_via_escape', { mode: 'orbit', busy: false })

// the way home
await tap('.backbtn.is-on')
if (!reduced) {
  await page.waitForTimeout(1200)
  await snap('return_mid')
}
await settle(16000)
await check('home_after_return', { mode: 'home', busy: false })

// a second launch works and can be skipped
await tap(menu('Projects'))
await page.waitForTimeout(600)
await page.keyboard.press('Enter')
await settle()
await check('orbit_after_skip', { mode: 'orbit', busy: false })

record('console_errors', errors.length === 0, { errors: errors.slice(0, 5) })
writeFileSync(join(out, `journey_${sizeName}${reduced ? '_reduced' : ''}.json`), JSON.stringify(results, null, 2))
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

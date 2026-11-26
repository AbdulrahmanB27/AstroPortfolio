// End-to-end journey with real input. Records state, console errors and frames at each beat.
//   node tools/qa/journey.mjs <label> [--base http://localhost:5180/] [--size desktop|laptop|phone] [--reduced] [--firefox]
import { chromium, firefox } from 'playwright-core'
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

// --firefox drives the installed Firefox over WebDriver BiDi (no touch emulation there: laptop/desktop only)
const useFirefox = args.includes('--firefox')
const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: true, timeout: 120000 })
  : await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
    })
const ctx = await browser.newContext({
  viewport: { width, height },
  ...(useFirefox ? {} : { deviceScaleFactor: 1, isMobile: sizeName === 'phone', hasTouch: sizeName === 'phone' }),
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
    return s ? { mode: s.mode, busy: s.busy, tab: s.tab, project: s.projectId, simple: s.simple } : null
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
const tap = (sel, o) => (sizeName === 'phone' ? page.tap(sel, o) : page.click(sel, o))
const menu = (key) => `.menu__item[data-key="${key}"]`

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

// three destinations, each to its own place
const labels = await page.evaluate(() => [...document.querySelectorAll('.menu__item .menu__label')].map((e) => e.textContent))
record('menu_has_three_destinations', labels.length === 3, { labels })

// Simple view: a plain page over the scene, with its own address; Escape closes it
await tap(menu('simple'))
await page.waitForTimeout(700)
await check('simple_view_open', { mode: 'home', simple: true })
const simple = await page.evaluate(() => ({ projects: document.querySelectorAll('.simple .sproject').length, want: window.__portfolio.app.getState().content.projects.length, hash: location.hash }))
record('simple_view_lists_every_project', simple.projects === simple.want && simple.hash === '#simple', simple)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await check('simple_view_closed', { mode: 'home', simple: false, busy: false })

// Cockpit
await tap(menu('cockpit'))
await page.waitForTimeout(900)
await snap('to_cockpit_mid')
await tap(menu('launch'), { timeout: 1500 }).catch(() => {}) // must be ignored while busy
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

// the computer comes back on the page that was last open; Escape steps back
await tap(menu('cockpit'))
await settle()
await check('cockpit_reopens_on_last_tab', { mode: 'cockpit', tab: 'contact' })
await page.keyboard.press('Escape')
await settle()
await check('home_via_escape', { mode: 'home', busy: false })

// Launch -> orbit
await tap(menu('launch'))
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
// a click on the planet itself keeps the project open; a click on empty space steps back to the system
const spot = await page.evaluate(() => {
  const disc = window.__portfolio.screenDiscs.get(window.__portfolio.app.getState().projectId)
  const panel = document.querySelector('.project').getBoundingClientRect()
  const back = document.querySelector('.backbtn.is-on').getBoundingClientRect()
  const free = (x, y) => !(x >= panel.left - 6 && x <= panel.right + 6 && y >= panel.top - 6 && y <= panel.bottom + 6) && !(x <= back.right + 8 && y <= back.bottom + 8) && Math.hypot(x - disc.x, y - disc.y) > disc.r + 12
  const inPanel = (x, y) => x >= panel.left && x <= panel.right && y >= panel.top && y <= panel.bottom
  const pts = [[0.95, 0.06], [0.5, 0.04], [0.06, 0.3], [0.94, 0.3], [0.5, 0.97], [0.05, 0.6], [0.95, 0.6], [0.06, 0.94]].map(([fx, fy]) => [Math.round(innerWidth * fx), Math.round(innerHeight * fy)])
  return { empty: pts.find(([x, y]) => free(x, y)) ?? null, planet: inPanel(disc.x, disc.y) || disc.x < 0 || disc.x > innerWidth || disc.y < 0 || disc.y > innerHeight ? null : [disc.x, disc.y] }
})
const poke = ([x, y]) => (sizeName === 'phone' ? page.touchscreen.tap(x, y) : page.mouse.click(x, y))
if (spot.planet) {
  await poke(spot.planet)
  await page.waitForTimeout(700)
  await check('click_on_the_planet_keeps_the_project', { mode: 'project', project: 'space-portfolio' })
}
record('empty_space_beside_the_project', !!spot.empty, spot)
if (spot.empty) await poke(spot.empty)
else await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await settle()
await check('orbit_by_clicking_empty_space', { mode: 'orbit', busy: false })

// the way home: the old pill is gone, a tip names the way, and the home planet takes you back
record('no_home_pill_in_orbit', (await page.locator('.backbtn.is-on').count()) === 0)
const tips = await page.evaluate(() => [...document.querySelectorAll('.hint.is-on, .pindex.is-on .pindex__head em')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim().replace(/\s+/g, ' ')))
record('orbit_tip_says_how_to_get_back', tips.some((t) => /home/i.test(t)), { tips })
await page.waitForTimeout(700)
const homeLabel = await page.evaluate(() => {
  const el = document.querySelector('.plabel[data-id="__home"]')
  return !!el && parseFloat(el.style.opacity || '0') > 0.3
})
if (homeLabel) await tap('.plabel[data-id="__home"]')
else {
  const d = await page.evaluate(() => window.__portfolio.screenDiscs.get('__home'))
  await poke([d.x, d.y])
}
if (!reduced) {
  await page.waitForTimeout(1200)
  await snap('return_mid')
}
await settle(16000)
await check('home_after_return', { mode: 'home', busy: false })

// a second launch works and can be skipped
await tap(menu('launch'))
await page.waitForTimeout(600)
await page.keyboard.press('Enter')
await settle()
await check('orbit_after_skip', { mode: 'orbit', busy: false })

// the simple view has its own address: it opens straight from a link, and the browser's Back button closes it
await page.goto('about:blank') // a change of #fragment alone would not reload the page
await page.goto(base + '#simple', { waitUntil: 'load' })
await page.waitForSelector('.simple .sproject', { timeout: 30000 })
record('simple_view_opens_from_its_link', (await state()).simple === true, { url: page.url() })
await page.click('.simple__close')
await page.waitForFunction(() => { const s = window.__portfolio.app.getState(); return s.mode === 'home' && !s.busy && s.sceneReady }, null, { timeout: 150000 })
await page.waitForTimeout(600)
await check('closing_it_lands_on_the_home_planet', { mode: 'home', busy: false, simple: false })
record('address_is_clean_again', !page.url().includes('#'), { url: page.url() })
await tap(menu('simple'))
await page.waitForTimeout(500)
await page.evaluate(() => history.back()) // the browser's Back button (same page, so no load event to wait for)
await page.waitForTimeout(500)
await check('browser_back_closes_the_simple_view', { mode: 'home', simple: false })

record('console_errors', errors.length === 0, { errors: errors.slice(0, 5) })
writeFileSync(join(out, `journey_${sizeName}${reduced ? '_reduced' : ''}.json`), JSON.stringify(results, null, 2))
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

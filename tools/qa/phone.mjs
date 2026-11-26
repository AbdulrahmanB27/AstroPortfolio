// The whole site on a phone, driven with real touch input (taps, swipes and holds through the DevTools protocol).
//   node tools/qa/phone.mjs <label> [--size 390x844] [--dpr 2] [--base http://localhost:5180/]
// Checks layout (nothing off-screen, touch targets big enough) and behaviour in every state, and saves a
// screenshot of each to tasks/captures/<label>/.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const label = args[0] && !args[0].startsWith('--') ? args[0] : 'phone'
const base = opt('--base', 'http://localhost:5180/')
const [width, height] = opt('--size', '390x844').split('x').map(Number)
const dpr = Number(opt('--dpr', '2'))
const tag = `${width}x${height}`
const portrait = width / height < 0.8
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] })
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const results = []
let n = 0
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`)
}
const shot = (name) => page.screenshot({ path: join(out, `${String(++n).padStart(2, '0')}_${name}_${tag}.png`) })
const st = () => page.evaluate(() => (({ mode, busy, reading, tab, simple, projectId }) => ({ mode, busy, reading, tab, simple, projectId }))(window.__portfolio.app.getState()))
const settle = async (ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (!(await st()).busy) return true
    await page.waitForTimeout(100)
  }
  return false
}
const rect = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }, sel)
const inView = (r, pad = 0) => !!r && r.w > 0 && r.h > 0 && r.x >= -pad && r.y >= -pad && r.x + r.w <= width + pad && r.y + r.h <= height + pad
const tap = (sel) => page.tap(sel)
const tapAt = (x, y) => page.touchscreen.tap(x, y)
/** A finger drag: dy < 0 moves the finger up (the content scrolls down). */
const swipe = async (x, y, dy) => {
  // real touch points, one move per frame (Chrome's synthetic scroll gesture sends no touchmove under emulation)
  const steps = Math.max(6, Math.round(Math.abs(dy) / 22))
  x = Math.round(x)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: Math.round(y) }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y + (dy * i) / steps) }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const cue = (sel) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(`${s} .screen__more .cue`)].find((c) => getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0)
    const sc = document.querySelector(`${s} .scrollcue`)
    return { text: el ? el.innerText.trim() : '', room: sc.scrollHeight - sc.clientHeight - Math.round(sc.scrollTop) }
  }, sel)
/** The cue never claims there is more when there is not (and the other way round). */
const honest = (c) => (/more/i.test(c.text) ? c.room > 6 : c.room <= 6 || /zoom in/i.test(c.text))
const scrollTop = (sel) => page.evaluate((s) => document.querySelector(s).scrollTop, sel)
const skip = async () => {
  await page.waitForTimeout(500)
  if (await page.locator('.skip.is-on').count()) await tap('.skip.is-on').catch(() => {})
  await settle()
}
/** Elements matching sel that are shown but stick out of the viewport or are too small to tap. */
const badTargets = (sel, min = 40) =>
  page.evaluate(
    ([s, m, w, h]) =>
      [...document.querySelectorAll(s)]
        .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
        .filter(({ r, cs }) => r.width > 0 && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.2)
        .filter(({ r }) => r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1 || r.height < m)
        .map(({ el, r }) => `${el.textContent.trim().slice(0, 24)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`),
    [sel, min, width, height],
  )

// ───────────────────────────────────────────────────────────── home ──
await page.goto(base, { waitUntil: 'load' })
await page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().mode !== 'boot', null, { timeout: 150000 })
await skip()
await page.waitForTimeout(1600)
check('home is ready', (await st()).mode === 'home')
const items = await page.evaluate(() => [...document.querySelectorAll('.menu__item')].map((b) => b.querySelector('.menu__label').textContent))
check('the menu has three destinations', items.length === 3, items.join(' | '))
check('menu buttons fit the screen and are big enough to tap', (await badTargets('.menu__item', 44)).length === 0, await badTargets('.menu__item', 44))
const idr = await rect('.identity')
const mr = await rect('.menu ul')
check('name and menu do not overlap', !!idr && !!mr && (idr.y + idr.h <= mr.y || mr.y + mr.h <= idr.y || idr.x + idr.w <= mr.x), JSON.stringify({ identity: idr, menu: mr }))
check('the page does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
await shot('home')

// ────────────────────────────────────────────────────── simple view ──
await tap('.menu__item[data-key="simple"]')
await page.waitForTimeout(700)
check('Simple view opens', (await st()).simple && (await page.locator('.simple').count()) === 1)
check('Simple view has its own address', page.url().endsWith('#simple'), page.url())
check('Simple view does not scroll sideways', await page.evaluate(() => { const s = document.querySelector('.simple'); return s.scrollWidth <= s.clientWidth + 1 }))
check('its close button is on screen and tappable', (await badTargets('.simple__close', 36)).length === 0, await badTargets('.simple__close', 36))
const counts = await page.evaluate(() => ({ projects: document.querySelectorAll('.sproject').length, want: window.__portfolio.app.getState().content.projects.length, h1: document.querySelector('.simple h1')?.textContent }))
check('it lists every project', counts.projects === counts.want && counts.projects > 0, JSON.stringify(counts))
await shot('simple_top')
await swipe(width / 2, height * 0.7, -520)
await page.waitForTimeout(400)
check('a swipe scrolls the simple view', (await scrollTop('.simple')) > 200, `scrollTop ${await scrollTop('.simple')}`)
await page.tap('.simple__bar nav button:has-text("Projects")')
await page.waitForTimeout(900)
await shot('simple_projects')
const wide = await page.evaluate(() => [...document.querySelectorAll('.simple__page *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).map((el) => el.className || el.tagName).slice(0, 5))
check('nothing in the simple view runs off the right edge', wide.length === 0, wide.join(', '))
await page.tap('.simple__bar nav button:has-text("Contact")')
await page.waitForTimeout(900)
await shot('simple_contact')
await tap('.simple__close')
await page.waitForTimeout(700)
let s = await st()
check('closing it returns to the home planet', !s.simple && s.mode === 'home' && !page.url().includes('#simple'), JSON.stringify(s))

// ─────────────────────────────────────────────────────────── cockpit ──
await tap('.menu__item[data-key="cockpit"]')
await page.waitForTimeout(600)
await settle()
await page.waitForTimeout(900)
s = await st()
check('the cockpit opens', s.mode === 'cockpit' && !s.busy, JSON.stringify(s))
const c0 = await rect('.console')
check('the mission computer is on screen', inView(c0, 2), JSON.stringify(c0))
check('no zoom button is left', (await page.locator('.zoombtn').count()) === 0)
const cue0 = await cue('.console')
check('the cue says scrolling zooms in', /zoom in/i.test(cue0.text), JSON.stringify(cue0))
await shot('cockpit_default')
await swipe(c0.x + c0.w / 2, c0.y + c0.h * 0.65, -160)
await page.waitForTimeout(1100)
s = await st()
check('the first swipe zooms in', s.reading === true)
check('...and does not move the page', (await scrollTop('.console__body')) === 0, `scrollTop ${await scrollTop('.console__body')}`)
const c1 = await rect('.console')
check('the zoomed display fills more of the screen and stays on it', inView(c1, 2) && c1.w * c1.h > c0.w * c0.h * 1.3, `${c0.w}x${c0.h} -> ${c1.w}x${c1.h}`)
await shot('cockpit_reading')
let cq = await cue('.console')
check('zoomed in, the cue tells the truth about what is below', honest(cq), JSON.stringify(cq))
if (cq.room < 90) {
  // this page fits on this screen: use the longest one to test scrolling
  await tap('#tab-resume')
  await page.waitForTimeout(600)
  cq = await cue('.console')
  check('the cue tells the truth on the Resume page too', honest(cq), JSON.stringify(cq))
}
if (cq.room >= 90) {
  await swipe(c1.x + c1.w / 2, c1.y + c1.h * 0.6, -260)
  await page.waitForTimeout(500)
  check('the next swipe scrolls the page', (await scrollTop('.console__body')) > 60, `scrollTop ${await scrollTop('.console__body')}`)
} else check('every page of the computer fits this screen without scrolling', true, JSON.stringify(cq))
check('tabs fit and are big enough to tap', (await badTargets('.console__tabs button', 36)).length === 0, await badTargets('.console__tabs button', 36))
for (const t of ['skills', 'resume', 'contact']) {
  await tap(`#tab-${t}`)
  await page.waitForTimeout(500)
  check(`tab ${t} opens and keeps the zoom`, (await st()).tab === t && (await st()).reading)
  await shot(`cockpit_${t}`)
}
// pulling down at the top of the page pulls back out
await page.evaluate(() => document.querySelector('.console__body').scrollTo({ top: 0 }))
await page.waitForTimeout(400)
const c2 = await rect('.console')
await swipe(c2.x + c2.w / 2, c2.y + c2.h * 0.35, 220)
await page.waitForTimeout(1300)
check('pulling down at the top zooms back out', (await st()).reading === false)
await page.waitForTimeout(600)
check('...and it stays zoomed out', (await st()).reading === false)
check('the Exit pill is on screen', (await badTargets('.backbtn.is-on', 36)).length === 0, await badTargets('.backbtn.is-on', 36))
await tap('.backbtn.is-on')
await settle()
check('Exit returns to the home planet', (await st()).mode === 'home')

// ───────────────────────────────────────────────────── launch, orbit ──
await tap('.menu__item[data-key="launch"]')
await page.waitForTimeout(900)
await shot('launch')
await skip()
await page.waitForTimeout(1200)
s = await st()
check('launch ends in the system view', s.mode === 'orbit' && !s.busy, JSON.stringify(s))
check('there is no Home planet pill', (await page.locator('.backbtn.is-on').count()) === 0)
const tip = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.hint, .pindex__head em')].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && cs.display !== 'none' && parseFloat(getComputedStyle(el.closest('.hint, .pindex')).opacity) > 0.5 })
  return els.map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } })
})
check('a tip says how to get back', tip.some((t) => /home/i.test(t.text) && t.left >= 0 && t.right <= width && t.bottom <= height), JSON.stringify(tip))
// rows further down the list are reached by scrolling it: only the ones showing are checked
const rows = await page.evaluate(() => {
  const list = document.querySelector('.pindex.is-on ul')
  if (!list || getComputedStyle(list.closest('.pindex')).display === 'none') return null
  const box = list.getBoundingClientRect()
  const shown = [...list.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).filter((r) => r.top < box.bottom - 4)
  return { shown: shown.length, bad: shown.filter((r) => r.height < 40 || r.left < 0 || r.right > innerWidth || r.bottom > Math.min(innerHeight, box.bottom) + 1).length, listBottom: Math.round(box.bottom) }
})
check('project list rows fit and are big enough to tap', !portrait || (!!rows && rows.shown > 0 && rows.bad === 0 && rows.listBottom <= height), JSON.stringify(rows))
await shot('orbit')

// open a project (list on narrow screens, label or planet otherwise)
const firstId = await page.evaluate(() => window.__portfolio.app.getState().content.projects[0].id)
const open = async (id) => {
  if (portrait) await page.tap('.pindex.is-on li:first-child button')
  else {
    const d = await page.evaluate((i) => window.__portfolio.screenDiscs.get(i), id)
    await tapAt(d.x, d.y)
  }
  await page.waitForTimeout(700)
  await settle()
  await page.waitForTimeout(1000)
}
await open(firstId)
s = await st()
check('a project opens', s.mode === 'project' && !s.busy, JSON.stringify(s))
const p0 = await rect('.project')
check('the project display is on screen', inView(p0, 2), JSON.stringify(p0))
await shot('project_default')
await swipe(p0.x + p0.w / 2, p0.y + p0.h * 0.6, -160)
await page.waitForTimeout(1100)
check('the first swipe zooms the project display', (await st()).reading === true)
check('...and does not move the page', (await scrollTop('.project__inner')) === 0, `scrollTop ${await scrollTop('.project__inner')}`)
const p1 = await rect('.project')
check('the zoomed project display stays on screen', inView(p1, 2), JSON.stringify(p1))
await shot('project_reading')
const pq = await cue('.project')
check('zoomed in, the project cue tells the truth', honest(pq), JSON.stringify(pq))
if (pq.room >= 90) {
  await swipe(p1.x + p1.w / 2, p1.y + p1.h * 0.55, -300)
  await page.waitForTimeout(500)
  check('the next swipe scrolls the project', (await scrollTop('.project__inner')) > 60, `scrollTop ${await scrollTop('.project__inner')}`)
} else check('this project fits this screen without scrolling', true, JSON.stringify(pq))
await shot('project_scrolled')
const links = await page.evaluate(() => [...document.querySelectorAll('.project__links a')].map((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }))
check('project links are on screen when zoomed', links.length === 0 || links.every(Boolean), JSON.stringify(links))
await page.evaluate(() => document.querySelector('.project__inner').scrollTo({ top: 0 }))
await page.waitForTimeout(400)
await swipe(p1.x + p1.w / 2, p1.y + p1.h * 0.3, 220)
await page.waitForTimeout(1300)
check('pulling down at the top zooms the project back out', (await st()).reading === false && (await st()).mode === 'project')
// a tap on empty space leaves the project; a tap on the planet does not
const where = await page.evaluate(() => {
  const st = window.__portfolio.app.getState()
  const disc = window.__portfolio.screenDiscs.get(st.projectId)
  const panel = document.querySelector('.project').getBoundingClientRect()
  const back = document.querySelector('.backbtn.is-on').getBoundingClientRect()
  const free = (x, y) => !(x >= panel.left - 6 && x <= panel.right + 6 && y >= panel.top - 6 && y <= panel.bottom + 6) && !(x <= back.right + 8 && y <= back.bottom + 8) && Math.hypot(x - disc.x, y - disc.y) > disc.r + 12
  for (const [fx, fy] of [[0.9, 0.12], [0.85, 0.08], [0.5, 0.05], [0.08, 0.3], [0.92, 0.3], [0.5, 0.97], [0.05, 0.6], [0.95, 0.6]]) {
    const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy)
    if (free(x, y)) return { x, y, disc, panel: { top: Math.round(panel.top), bottom: Math.round(panel.bottom) } }
  }
  return { disc, panel: { top: Math.round(panel.top), bottom: Math.round(panel.bottom) } }
})
const discOnScreen = where.disc && where.disc.x > 0 && where.disc.x < width && where.disc.y > 0 && where.disc.y < height
if (discOnScreen) {
  await tapAt(where.disc.x, where.disc.y)
  await page.waitForTimeout(800)
  s = await st()
  // on a narrow screen the display may cover the planet's centre: then the tap is a tap on the display
  check('a tap on the planet itself does not leave the project', s.mode === 'project', JSON.stringify(s))
  if (s.reading) {
    await page.evaluate(() => window.__portfolio.director.setReading(false))
    await page.waitForTimeout(1000)
  }
}
check('there is empty space to tap beside the project', where.x !== undefined, JSON.stringify(where))
if (where.x !== undefined) {
  await tapAt(where.x, where.y)
  await page.waitForTimeout(600)
  await settle()
  s = await st()
  check('a tap on empty space goes back to the system view', s.mode === 'orbit' && !s.busy, JSON.stringify(s))
} else {
  await tap('.backbtn.is-on')
  await settle()
}
// the Back pill still works
await page.waitForTimeout(700)
await open(firstId)
check('the Back pill is on screen', (await badTargets('.backbtn.is-on', 36)).length === 0, await badTargets('.backbtn.is-on', 36))
await tap('.backbtn.is-on')
await settle()
check('the Back pill goes back to the system view', (await st()).mode === 'orbit')

// ───────────────────────────────────────────────────── the way home ──
await page.waitForTimeout(900)
const home = await page.evaluate(() => {
  const el = document.querySelector('.plabel[data-id="__home"]')
  const r = el.getBoundingClientRect()
  return { shown: parseFloat(el.style.opacity || '0') > 0.3, x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height), disc: window.__portfolio.screenDiscs.get('__home') }
})
check('the home planet is marked on the map', home.shown, JSON.stringify(home))
if (home.shown) await tapAt(home.x, home.y)
else await tapAt(home.disc.x, home.disc.y)
await page.waitForTimeout(1500)
await shot('return')
await skip()
check('tapping Home lands on the home planet', (await st()).mode === 'home', JSON.stringify(await st()))

// ─────────────────────────────────────────── flight (hidden) by touch ──
await tap('.menu__item[data-key="launch"]')
await skip()
await page.waitForTimeout(800)
await page.evaluate(() => { const p = window.__portfolio; p.app.getState().set({ flightUnlocked: true }); p.director.enterFlight() })
await page.waitForTimeout(3200)
check('flight mode starts', (await st()).mode === 'flight')
const hud = await rect('.flighthud')
check('the flight banner fits the screen', inView(hud, 1), JSON.stringify(hud))
check('its Exit button is big enough to tap', (await badTargets('.flighthud .btn', 32)).length === 0, await badTargets('.flighthud .btn', 32))
const before = await page.evaluate(() => ({ ...window.__portfolio.flight.ship }))
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(width * 0.72), y: Math.round(height * 0.3) }] })
await page.waitForTimeout(1800)
await shot('flight')
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
const after = await page.evaluate(() => ({ ...window.__portfolio.flight.ship }))
check('touch and hold flies the ship', Math.hypot(after.x - before.x, after.z - before.z) > 800, `moved ${Math.round(Math.hypot(after.x - before.x, after.z - before.z))}`)
await tap('.flighthud .btn:has-text("Exit")')
await settle()
check('Exit leaves flight mode', (await st()).mode === 'orbit')

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
writeFileSync(join(out, `phone_${tag}.json`), JSON.stringify(results, null, 2))
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed (${tag})`)
process.exitCode = failed.length ? 1 : 0

// Zoom ("reading") behaviour of the in-world displays, with real input.
//   node tools/qa/reading.mjs <label> [--size laptop|desktop|phone] [--firefox] [--base http://localhost:5180/]
import { chromium, firefox } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const label = args[0] && !args[0].startsWith('--') ? args[0] : 'reading'
const base = opt('--base', 'http://localhost:5180/')
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844] }
const sizeName = opt('--size', 'laptop')
const [width, height] = SIZES[sizeName]
const phone = sizeName === 'phone'
const useFirefox = args.includes('--firefox')
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

const browser = useFirefox
  ? await firefox.launch({ channel: 'moz-firefox', headless: true, timeout: 120000 })
  : await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] })
const ctx = await browser.newContext({ viewport: { width, height }, ...(useFirefox ? {} : { deviceScaleFactor: 1, isMobile: phone, hasTouch: phone }) })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

let pass = 0
let fail = 0
const check = (name, ok, extra = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`)
}
const st = () => page.evaluate(() => (({ mode, busy, reading, tab }) => ({ mode, busy, reading, tab }))(window.__portfolio.app.getState()))
const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }, sel)
const fontPx = (sel) => page.evaluate((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), sel)
const settle = () => page.waitForTimeout(1100)
const shot = (name) => page.screenshot({ path: join(out, `${name}_${sizeName}${useFirefox ? '_ff' : ''}.png`) })
const ready = () => page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().sceneReady && !window.__portfolio.app.getState().busy, null, { timeout: 150000 })
const cdp = phone ? await ctx.newCDPSession(page) : null
const scrollDown = async (sel, dy) => {
  const r = await rect(sel)
  const x = Math.round(r.x + r.w / 2)
  const y = Math.round(r.y + r.h * 0.6)
  if (phone) {
    // a real finger drag (touch points through the DevTools protocol)
    const steps = Math.max(6, Math.round(dy / 22))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y - (dy * i) / steps) }] })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await page.mouse.move(x, y)
    // a wheel spin: several notches in a row, as a hand does it
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, Math.round(dy / 4))
      await page.waitForTimeout(40)
    }
  }
}
const top = (sel) => page.evaluate((s) => document.querySelector(s).scrollTop, sel)
const cue = (sel) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(`${s} .screen__more .cue`)].find((c) => getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0)
    const sc = document.querySelector(`${s} .scrollcue`)
    return { text: el ? el.innerText.trim() : '', shown: !!el, room: sc.scrollHeight - sc.clientHeight - Math.round(sc.scrollTop) }
  }, sel)

// ── cockpit computer ──
await page.goto(`${base}?view=cockpit&tab=about`, { waitUntil: 'load' })
await ready()
await page.waitForTimeout(1500)
const c0 = await rect('.console')
const f0 = await fontPx('.console__body')
await shot('01_cockpit_default')
check('cockpit starts in the establishing shot', (await st()).reading === false, JSON.stringify(c0))
check('there is no zoom button', (await page.locator('.zoombtn').count()) === 0)
const cue0 = await cue('.console')
check('the cue says that scrolling zooms in', cue0.shown && /zoom in/i.test(cue0.text), JSON.stringify(cue0))
await scrollDown('.console', 240)
await settle()
const c1 = await rect('.console')
const f1 = await fontPx('.console__body')
await shot('02_cockpit_reading')
check('scrolling the display zooms in', (await st()).reading === true)
check('the display is much larger when zoomed', c1.w * c1.h > c0.w * c0.h * (phone ? 1.4 : 2.2), `${c0.w}x${c0.h} -> ${c1.w}x${c1.h} (${((c1.w * c1.h) / (c0.w * c0.h)).toFixed(2)}x area)`)
check('text is larger when zoomed', f1 >= f0, `${f0.toFixed(1)}px -> ${f1.toFixed(1)}px`)
check('the zoomed display fits the viewport', c1.x >= 0 && c1.y >= 0 && c1.x + c1.w <= width + 1 && c1.y + c1.h <= height + 1, JSON.stringify(c1))
check('the scroll that zooms does not move the page', (await top('.console__body')) === 0, `scrollTop ${await top('.console__body')}`)
const cueIn = await cue('.console')
check('zoomed in, the cue tells the truth about what is below', /more/i.test(cueIn.text) ? cueIn.room > 6 : cueIn.room <= 6, JSON.stringify(cueIn))
await scrollDown('.console', 240)
await page.waitForTimeout(500)
check('the next scroll moves the page', (await top('.console__body')) > 40, `scrollTop ${await top('.console__body')}`)
await page.evaluate(() => document.querySelector('.console__body').scrollTo({ top: 0 }))
await page.waitForTimeout(300)
// switching tab keeps the zoom
await page.click('.console__tabs button:has-text("Resume")')
await page.waitForTimeout(500)
check('changing tab keeps the zoom', (await st()).reading === true && (await st()).tab === 'resume')
await shot('03_cockpit_reading_resume')
await page.keyboard.press('Escape')
await settle()
const s2 = await st()
check('Escape zooms out first (stays in the cockpit)', s2.reading === false && s2.mode === 'cockpit')
// zoom in again, then scroll up at the top to pull out
await scrollDown('.console', 120)
await settle()
check('scrolling zooms in again', (await st()).reading === true && (await top('.console__body')) === 0)
if (!phone) {
  const r = await rect('.console')
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2)
  await page.waitForTimeout(450)
  await page.mouse.wheel(0, -200)
  await settle()
  check('scrolling up at the top zooms out', (await st()).reading === false)
  // click on the text zooms in, click outside zooms out
  await page.mouse.click(r.x + r.w / 2, r.y + r.h * 0.6)
  await settle()
  check('clicking the display zooms in', (await st()).reading === true)
  await page.mouse.click(12, height - 12)
  await settle()
  check('clicking outside zooms out', (await st()).reading === false)
}
if (!phone) {
  // one long spin of the wheel (or a trackpad fling): it zooms first, and the page only starts to move
  // once the display has arrived
  await page.click('#tab-about')
  await page.waitForTimeout(400)
  const r = await rect('.console')
  await page.mouse.move(r.x + r.w / 2, r.y + r.h * 0.6)
  let movedEarly = 0
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 30)
    await page.waitForTimeout(40)
    // while the camera is still on its way in, the page must not have moved
    const now = await page.evaluate(() => ({ read: window.__portfolio.fx.read, top: document.querySelector('.console__body').scrollTop }))
    if (now.read < 0.985) movedEarly = Math.max(movedEarly, now.top)
  }
  await page.waitForTimeout(300)
  const end = await top('.console__body')
  check('a long spin zooms first and scrolls afterwards', (await st()).reading === true && movedEarly === 0 && end > 0, `moved before arriving: ${movedEarly}px, scrolled by the end of the spin: ${end}px`)
  await page.evaluate(() => document.querySelector('.console__body').scrollTo({ top: 0 }))
  await page.keyboard.press('Escape')
  await settle()
}
await page.evaluate(() => window.__portfolio.director.setReading(true))
await settle()
await page.evaluate(() => window.__portfolio.director.exitCockpit())
await page.waitForFunction(() => window.__portfolio.app.getState().mode === 'home' && !window.__portfolio.app.getState().busy, null, { timeout: 30000 })
check('leaving the cockpit clears the zoom', (await st()).reading === false && (await page.evaluate(() => window.__portfolio.fx.read)) === 0)

// ── project display ──
await page.goto(`${base}?view=project&project=sweet-moment-chocolate`, { waitUntil: 'load' })
await ready()
await page.waitForFunction(() => window.__portfolio.app.getState().mode === 'project' && !window.__portfolio.app.getState().busy, null, { timeout: 60000 })
await page.waitForTimeout(1800)
const p0 = await rect('.project')
await shot('04_project_default')
const cue1 = await cue('.project')
check('the project cue says that scrolling zooms in', cue1.shown && /zoom in/i.test(cue1.text), JSON.stringify(cue1))
await scrollDown('.project', 200)
await settle()
check('the scroll that zooms the project does not move the page', (await top('.project__inner')) === 0, `scrollTop ${await top('.project__inner')}`)
await scrollDown('.project', 200)
await page.waitForTimeout(500)
check('the next scroll moves the project page', (await top('.project__inner')) > 40, `scrollTop ${await top('.project__inner')}`)
const p1 = await rect('.project')
await shot('05_project_reading')
check('scrolling the project display zooms in', (await st()).reading === true)
check('the project display is much larger when zoomed', p1.w * p1.h > p0.w * p0.h * (phone ? 1.2 : 2.2), `${p0.w}x${p0.h} -> ${p1.w}x${p1.h} (${((p1.w * p1.h) / (p0.w * p0.h)).toFixed(2)}x area)`)
check('the zoomed project display fits the viewport', p1.x >= 0 && p1.y >= 0 && p1.x + p1.w <= width + 1 && p1.y + p1.h <= height + 1, JSON.stringify(p1))
const link = await page.evaluate(() => { const a = document.querySelector('.project__links a'); if (!a) return null; const r = a.getBoundingClientRect(); return { href: a.href, visible: r.width > 0 && r.bottom <= innerHeight && r.top >= 0 } })
check('the project link is still reachable when zoomed', !!link && link.visible, JSON.stringify(link))
await page.keyboard.press('Escape')
await settle()
const s5 = await st()
check('Escape zooms out first (stays on the project)', s5.reading === false && s5.mode === 'project')
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__portfolio.app.getState().mode === 'orbit' && !window.__portfolio.app.getState().busy, null, { timeout: 30000 })
check('a second Escape goes back to the system view', true)
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(`\n${pass}/${pass + fail} checks passed`)
process.exitCode = fail ? 1 : 0

// Hidden features: they must work, and they must stay out of the normal flow until deliberately triggered.
//   node tools/qa/secrets.mjs [--base http://localhost:5180/]   (dev server or a VITE_QA=1 build)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5180/'
const out = join(root, 'tasks', 'captures', 'secrets')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const results = []
const record = (step, ok, extra = {}) => {
  results.push({ step, ok, ...extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${JSON.stringify(extra)}`)
}
const st = () =>
  page.evaluate(() => {
    const s = window.__portfolio.app.getState()
    const p = window.__portfolio
    return { mode: s.mode, busy: s.busy, flightUnlocked: s.flightUnlocked, stationFound: s.stationFound, alt: s.altShipUnlocked, altActive: s.altShipActive, grid: s.gridOn, gag: p.fx.gag, cam: p.rig.pos.toArray().map((v) => Math.round(v)) }
  })
const ready = () => page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().mode !== 'boot', null, { timeout: 90000 })
const settle = async (ms = 16000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (!(await st()).busy) return
    await page.waitForTimeout(100)
  }
}
const press = async (keys) => {
  for (const k of keys) await page.keyboard.press(k)
}

// ── normal flow first: nothing secret is visible or loaded ──
await page.goto(base, { waitUntil: 'load' })
await ready()
await page.keyboard.press('Escape')
await settle()
const requests = []
page.on('request', (r) => requests.push(r.url()))
let s = await st()
record('home_has_no_secret_ui', s.mode === 'home' && !s.flightUnlocked && (await page.locator('.flighthud.is-on, .flightbtn').count()) === 0, s)
// the flight code does nothing on the surface
await press(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
record('flight_code_ignored_on_surface', (await st()).mode === 'home')

// ── secret launch: Alt + Projects ──
await page.click('.menu__item[data-key="launch"]', { modifiers: ['Alt'] })
await page.waitForTimeout(2600)
s = await st()
record('alt_launch_runs_tether_gag', s.mode === 'launch' && s.gag >= 0, { gag: s.gag })
await page.screenshot({ path: join(out, '01_tether_gag.png') })
await page.waitForTimeout(1400)
await page.screenshot({ path: join(out, '02_tether_dragged.png') })
await settle(20000)
s = await st()
record('alt_launch_ends_in_normal_orbit', s.mode === 'orbit' && !s.busy && s.gag < 0, s)
record('secret_models_not_loaded_before_flight', !requests.some((u) => /scout|freighter|station/.test(u)), { glbRequests: requests.filter((u) => u.endsWith('.glb')).length })

// ── schematic grid: Shift+G ──
await page.keyboard.press('Shift+G')
const gridOn = (await st()).grid
await page.waitForTimeout(500)
await page.screenshot({ path: join(out, '03_grid_on.png') })
await page.keyboard.press('Shift+G')
record('shift_g_toggles_grid', gridOn === true && (await st()).grid === false)

// ── flight mode: up up down down left right ──
await press(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
await page.waitForTimeout(2500)
s = await st()
record('code_enters_flight_mode', s.mode === 'flight' && s.flightUnlocked && (await page.locator('.flighthud.is-on').count()) === 1, s)
const cam0 = s.cam
await page.keyboard.down('w')
await page.keyboard.down('d')
await page.waitForTimeout(2600)
await page.keyboard.up('d')
await page.keyboard.up('w')
await page.waitForTimeout(400)
s = await st()
const moved = Math.hypot(s.cam[0] - cam0[0], s.cam[1] - cam0[1], s.cam[2] - cam0[2])
record('keys_fly_the_ship', moved > 1500, { movedMetres: Math.round(moved) })
await page.screenshot({ path: join(out, '04_flight.png') })
// pointer steering: hold on the right side of the screen
const before = (await st()).cam
await page.mouse.move(1100, 300)
await page.mouse.down()
await page.waitForTimeout(1800)
await page.mouse.up()
const after = (await st()).cam
record('pointer_flies_the_ship', Math.hypot(after[0] - before[0], after[2] - before[2]) > 800)
// boost: faster, and it leaves a trail
await page.evaluate(() => {
  // open space between the outer orbits, heading along the orbit
  const f = window.__portfolio.flight
  Object.assign(f.ship, { x: 0, z: 24000, heading: Math.PI / 2, speed: 0, kx: 0, kz: 0 })
})
await page.keyboard.down('Shift')
await page.keyboard.down('w')
await page.waitForTimeout(2200)
const boosted = await page.evaluate(() => ({ speed: Math.round(window.__portfolio.flight.ship.speed), boost: +window.__portfolio.flight.ship.boost.toFixed(2) }))
await page.screenshot({ path: join(out, '04b_boost_trail.png') })
await page.keyboard.up('Shift')
await page.waitForTimeout(900)
const cruising = await page.evaluate(() => ({ speed: Math.round(window.__portfolio.flight.ship.speed), boost: +window.__portfolio.flight.ship.boost.toFixed(2) }))
await page.keyboard.up('w')
record('shift_boosts', boosted.boost > 0.9 && boosted.speed > 5000 && cruising.boost < 0.1 && cruising.speed < boosted.speed, { boosted, cruising })

// bodies are solid: fly straight at each kind at full boost and never get inside
const gapTo = () =>
  page.evaluate(() => {
    const f = window.__portfolio.flight
    let worst = Infinity
    for (const s of f.solids()) {
      const reach = s.r + f.shipRadius
      if (Math.abs(s.y) >= reach) continue
      worst = Math.min(worst, Math.hypot(f.ship.x - s.x, f.ship.z - s.z) - Math.sqrt(reach * reach - s.y * s.y))
    }
    return worst
  })
const ram = async (name, pick, shotName) => {
  const hitBefore = await page.evaluate(() => window.__portfolio.flight.impact.at)
  await page.evaluate((code) => {
    const f = window.__portfolio.flight
    const s = new Function('solids', `return ${code}`)(f.solids())
    // start 4000 m short of its surface, on the side away from the star, nose at its centre
    const out = Math.hypot(s.x, s.z) || 1
    const ux = out > 1 ? s.x / out : 0
    const uz = out > 1 ? s.z / out : 1
    const x = s.x + ux * (s.r + 4000)
    const z = s.z + uz * (s.r + 4000)
    Object.assign(f.ship, { x, z, heading: Math.atan2(s.x - x, -(s.z - z)), speed: 0, turn: 0, kx: 0, kz: 0 })
  }, pick)
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  let worst = Infinity
  let hit = false
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(50)
    worst = Math.min(worst, await gapTo())
    const at = await page.evaluate(() => window.__portfolio.flight.impact.at)
    if (!hit && at !== hitBefore) {
      hit = true
      await page.waitForTimeout(120)
      if (shotName) await page.screenshot({ path: join(out, shotName) })
    }
  }
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
  record(`${name}_is_solid`, hit && worst > -3, { deepestMetres: Math.round(worst * 10) / 10, hit })
}
await ram('planet', 'solids[3]', '04c_planet_impact.png') // 0 star, 1 home, 2 station, then planets and moons
await ram('star', 'solids[0]', '04d_star_impact.png')
await ram('home_planet', 'solids[1]')
await ram('moon', 'solids.slice(3).sort((a, b) => a.r - b.r)[0]')
await page.evaluate(() => Object.assign(window.__portfolio.flight.ship, { x: 2600, z: 10200, heading: Math.PI * 0.62, speed: 0, kx: 0, kz: 0 }))
await page.waitForTimeout(1500)

// planets are not selectable while flying
const disc = await page.evaluate(() => [...window.__portfolio.screenDiscs.entries()].find(([k]) => !k.startsWith('__')))
await page.mouse.click(disc[1].x, disc[1].y)
await page.waitForTimeout(600)
record('planets_inert_in_flight', (await st()).mode === 'flight')
await page.keyboard.press('Escape')
await settle()
s = await st()
record('escape_leaves_flight', s.mode === 'orbit' && !s.busy, s)
record('flight_button_available_after_unlock', (await page.locator('.flightbtn.is-on').count()) === 1)

// ── the station and the alternate ship ──
await page.goto(base + '?view=deathstar', { waitUntil: 'load' })
await ready()
await page.waitForTimeout(3500)
s = await st()
record('station_view_starts_in_flight', s.mode === 'flight', s)
await page.keyboard.down('w')
let unlocked = false
for (let i = 0; i < 60 && !unlocked; i++) {
  await page.waitForTimeout(250)
  unlocked = (await st()).alt
  if (i === 6) await page.screenshot({ path: join(out, '05_station_approach.png') })
}
await page.keyboard.up('w')
s = await st()
record('reaching_station_unlocks_alt_ship', s.alt && s.altActive && s.stationFound, s)
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, '06_freighter_unlocked.png') })
await page.click('.flighthud .btn:has-text("Fly the scout")')
record('ship_toggle_works', (await st()).altActive === false)

// ── typed shortcut to the studio ──
await page.goto(base, { waitUntil: 'load' })
await ready()
await page.keyboard.press('Escape')
await settle()
await page.keyboard.type('admin')
await page.waitForURL(/\/admin\/$/, { timeout: 10000 }).catch(() => {})
record('typing_admin_opens_studio', /\/admin\/$/.test(page.url()), { url: page.url() })

record('console_errors', errors.length === 0, { errors: errors.slice(0, 5) })
writeFileSync(join(out, 'secrets.json'), JSON.stringify(results, null, 2))
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

// Deterministic screenshot harness.
//   node tools/qa/capture.mjs <label> [shotFilter] [--base http://localhost:5180/]
// Shots are defined in tools/qa/shots.json; output goes to tasks/captures/<label>/.
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base')
const base = baseIdx >= 0 ? args[baseIdx + 1] : 'http://localhost:5180/'
const rest = args.filter((a, i) => !(a.startsWith('--') || (baseIdx >= 0 && i === baseIdx + 1)))
const label = rest[0] ?? 'adhoc'
const filter = rest[1] ? new RegExp(rest[1]) : null
let total = 0
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844] }
const shots = JSON.parse(readFileSync(join(root, 'tools/qa/shots.json'), 'utf8')).filter((s) => !filter || filter.test(s.name))
const out = join(root, 'tasks', 'captures', label)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--force-device-scale-factor=1'],
})
const log = []
for (const shot of shots) {
  for (const sizeName of shot.sizes ?? ['desktop']) {
    const [width, height] = SIZES[sizeName]
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: sizeName === 'phone',
      hasTouch: sizeName === 'phone',
      reducedMotion: shot.reducedMotion ? 'reduce' : 'no-preference',
    })
    const page = await ctx.newPage()
    const errors = []
    // ANGLE prints HLSL precision warnings (X4122 / X4008) for the noise shaders; they are benign and filtered out.
    const benign = (t) => /^THREE\.WebGLProgram: Program Info Log:[\s\S]*warning X4(122|008)/.test(t) && !/error/i.test(t)
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !benign(m.text()) && errors.push(`${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    const url = base + (shot.query ? `?${shot.query}` : '')
    await page.goto(url, { waitUntil: 'load' })
    try {
      await page.waitForFunction(() => !document.querySelector('.loader') || document.querySelector('.loader.is-done'), null, { timeout: 60000 })
    } catch {
      errors.push('timeout waiting for loader')
    }
    await page.waitForTimeout(shot.wait ?? 2500)
    for (const step of shot.steps ?? []) {
      if (step.click) await page.click(step.click, { modifiers: step.modifiers ?? [] })
      if (step.key) await page.keyboard.press(step.key)
      if (step.eval) console.log(`  eval ${step.eval} => ${JSON.stringify(await page.evaluate(step.eval))}`)
      if (step.move) await page.mouse.move(step.move[0] * width, step.move[1] * height)
      if (step.mouse) await page.mouse.click(step.mouse[0] * width, step.mouse[1] * height)
      await page.waitForTimeout(step.wait ?? 500)
    }
    const file = join(out, `${shot.name}_${sizeName}.png`)
    await page.screenshot({ path: file })
    log.push({ shot: shot.name, size: `${width}x${height}`, url, errors })
    total += errors.length
    console.log(`${shot.name} ${sizeName}  ${errors.length ? 'ISSUES: ' + errors.slice(0, 2).join(' | ').slice(0, 400) : 'ok'}`)
    await ctx.close()
  }
}
await browser.close()
writeFileSync(join(out, 'log.json'), JSON.stringify(log, null, 2))
console.log(`
${log.length} captures, ${total} console errors/warnings`)
process.exit(total ? 1 : 0)

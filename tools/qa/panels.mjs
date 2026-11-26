// Opens every project display at desktop, laptop and phone sizes and checks that the start of its content is
// reachable (nothing clipped above the scroll origin) and that its images load.
//   node tools/qa/panels.mjs [idFilter] [--base http://localhost:5180/]
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base')
const base = baseIdx >= 0 ? args[baseIdx + 1] : 'http://localhost:5180/'
const filterArg = args.find((a, i) => !a.startsWith('--') && i !== baseIdx + 1)
const only = filterArg ? new RegExp(filterArg) : null
const ids = JSON.parse(readFileSync(join(root, 'public/data/portfolio.json'), 'utf8'))
  .projects.map((p) => p.id)
  .filter((id) => !only || only.test(id))
const SIZES = { desktop: [1920, 1080], laptop: [1366, 768], phone: [390, 844] }

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars'],
})
let problems = 0
for (const [sizeName, [width, height]] of Object.entries(SIZES)) {
  const phone = sizeName === 'phone'
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const id of ids) {
    await page.goto(`${base}?view=project&project=${id}&t=6`, { waitUntil: 'load' })
    await page.waitForFunction(() => !document.querySelector('.loader') || document.querySelector('.loader.is-done'), null, { timeout: 90000 })
    await page.waitForTimeout(1500)
    const r = await page.evaluate(() => {
      const inner = document.querySelector('.project__inner')
      inner.scrollTop = 0
      const top = inner.getBoundingClientRect().top
      const shown = [...inner.children].map((el) => el.getBoundingClientRect()).filter((b) => b.height > 0)
      return {
        clippedAbove: Math.round(top - Math.min(...shown.map((b) => b.top))),
        scroll: `${inner.scrollHeight}/${inner.clientHeight}`,
        images: [...inner.querySelectorAll('img')].map((i) => i.complete && i.naturalWidth > 0),
      }
    })
    const ok = r.clippedAbove <= 1 && r.images.every(Boolean)
    if (!ok) problems++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${sizeName.padEnd(8)} ${id.padEnd(26)} clippedAbove=${r.clippedAbove}px scroll=${r.scroll} images=${JSON.stringify(r.images)}`)
  }
  if (errors.length) {
    problems += errors.length
    console.log('page errors:', errors)
  }
  await ctx.close()
}
await browser.close()
console.log(problems ? `\n${problems} problem(s)` : `\nall ${ids.length} project displays reachable at every size`)
process.exit(problems ? 1 : 0)

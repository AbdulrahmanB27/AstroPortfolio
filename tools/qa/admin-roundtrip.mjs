// Proves the content loop on a production build served like GitHub Pages (sub-path, no rewrites):
//   deployed JSON -> /admin auto-load -> edit -> validate -> export -> replace data file -> site shows the change.
// Usage: node tools/qa/admin-roundtrip.mjs [distDir=dist-qa]
import { chromium } from 'playwright-core'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from './static-server.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dist = join(root, process.argv[2] ?? 'dist-qa')
const out = join(root, 'tasks', 'captures', 'admin')
const site = join(root, 'tools', 'blender', '_work', 'site-under-test')
rmSync(site, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(dist, site, { recursive: true })
const { server, url } = await startServer(site, '/space-portfolio', 4189)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('dialog', (d) => d.accept())
const results = []
const record = (step, ok, extra = {}) => {
  results.push({ step, ok, ...extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${JSON.stringify(extra)}`)
}
const field = (path) => `[id="${path}"]`
const nav = (label) => page.click(`.desktop-nav button:has-text("${label}")`)
const siteState = (query) =>
  page
    .goto(url + query, { waitUntil: 'load' })
    .then(() => page.waitForFunction(() => window.__portfolio && window.__portfolio.app.getState().mode !== 'boot', null, { timeout: 90000 }))
    .then(() => page.waitForTimeout(1500))
    .then(() =>
      page.evaluate(() => {
        const s = window.__portfolio.app.getState()
        return {
          projects: s.content.projects.length,
          tagline: s.content.profile.tagline,
          gridOn: s.gridOn,
          draft: s.draftPreview,
          labels: document.querySelectorAll('.plabel').length,
          lastId: s.content.projects[s.content.projects.length - 1].id,
        }
      }),
    )

// 1. /admin without a trailing slash must resolve exactly like on GitHub Pages
const res = await page.goto(url.replace(/\/$/, '') + '/admin', { waitUntil: 'load' })
record('admin_direct_url', res.status() === 200 && page.url().endsWith('/space-portfolio/admin/'), { finalUrl: page.url(), status: res.status() })
await page.waitForSelector(field('site.title'), { timeout: 30000 })
const loaded = await page.inputValue(field('site.title'))
record('admin_autoloads_deployed_json', loaded.includes('Abdulrahman Bahjat'), { title: loaded })
record('admin_shows_published_state', (await page.textContent('.source-bar')).includes('Showing published content'))
await page.screenshot({ path: join(out, '01_admin_loaded.png') })

// 2. edit: grid on, tagline, one extra project
await page.check(field('site.settings.grid.enabled'))
await nav('Profile')
await page.fill(field('profile.tagline'), 'Round-trip check: edited in the studio.')
await nav('Projects')
const before = await page.locator('.project-list button, .project-row').count().catch(() => 0)
await page.click('button:has-text("Add project")')
await page.waitForTimeout(300)
const titleField = page.locator('[id^="projects["][id$=".title"]').last()
await titleField.fill('Round Trip Planet')
await page.locator('[id^="projects["][id$=".summary"]').last().fill('Added in the studio to prove that a new entry becomes a planet.')
await page.waitForTimeout(900)
await page.screenshot({ path: join(out, '02_admin_edited.png'), fullPage: true })
const issues = await page.textContent('#validation-heading').catch(() => '')
const exportDisabled = await page.isDisabled('button:has-text("Export portfolio.json")')
record('admin_validates_and_allows_export', !exportDisabled, { validation: issues, rowsBefore: before })
record('admin_marks_local_draft', (await page.textContent('.source-bar')).includes('local draft'))

// 3. an invalid edit blocks export, fixing it re-enables it
await nav('Contact')
await page.fill(field('contact.email'), 'not-an-email')
await page.waitForTimeout(500)
const blocked = await page.isDisabled('button:has-text("Export portfolio.json")')
await page.fill(field('contact.email'), JSON.parse(readFileSync(join(dist, 'data', 'portfolio.json'), 'utf8')).contact.email)
await page.waitForTimeout(500)
record('admin_blocks_export_on_error', blocked && !(await page.isDisabled('button:has-text("Export portfolio.json")')))

// 4. export
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export portfolio.json")')])
const exportedPath = join(out, 'exported-portfolio.json')
await download.saveAs(exportedPath)
const exported = JSON.parse(readFileSync(exportedPath, 'utf8'))
record('export_filename_and_schema', download.suggestedFilename() === 'portfolio.json' && exported.schemaVersion === 1 && exported.projects.length === 7 && exported.site.settings.grid.enabled === true, {
  filename: download.suggestedFilename(),
  projects: exported.projects.length,
  newId: exported.projects[6].id,
})

// 5. draft preview in the site (still not deployed)
const viaDraft = await siteState('?draft=1&view=orbit')
record('site_previews_local_draft', viaDraft.draft && viaDraft.projects === 7 && viaDraft.gridOn, viaDraft)
const published = await siteState('?view=orbit')
record('deployed_site_unchanged_before_redeploy', !published.draft && published.projects === 6 && !published.gridOn, published)

// 6. "redeploy": replace the data asset, nothing else
writeFileSync(join(site, 'data', 'portfolio.json'), readFileSync(exportedPath))
const after = await siteState('?view=orbit')
record('redeployed_site_shows_changes', after.projects === 7 && after.gridOn && after.tagline.startsWith('Round-trip') && after.labels === 8, after)
await page.screenshot({ path: join(out, '03_site_after_redeploy_grid_on.png') })
// the new planet is interactive without any scene code change
await page.click('.plabel:has-text("Round Trip Planet")')
await page.waitForFunction(() => window.__portfolio.app.getState().mode === 'project' && !window.__portfolio.app.getState().busy, null, { timeout: 15000 })
const opened = await page.evaluate(() => window.__portfolio.app.getState().projectId)
record('new_json_project_is_an_interactive_planet', opened === exported.projects[6].id, { opened })
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, '04_new_planet_project.png') })

// 7. back in the studio the draft now equals what is deployed; reset works either way
await page.goto(url + 'admin/', { waitUntil: 'load' })
await page.waitForSelector(field('site.title'))
const bar = await page.textContent('.source-bar')
record('admin_reloads_new_deployed_json', bar.includes('Showing published content') || bar.includes('local draft'), { bar: bar.trim().slice(0, 80) })
if (bar.includes('local draft')) {
  await page.click('button:has-text("Reset draft to published")')
  await page.waitForTimeout(800)
  record('admin_reset_to_published', (await page.textContent('.source-bar')).includes('Showing published content'))
}
await nav('Projects')
record('admin_lists_redeployed_project', (await page.locator('text=Round Trip Planet').count()) > 0)

const errorsBefore404 = errors.length
// 8. unknown paths get the 404 page, not a broken app (the browser logs that 404 itself, which is expected)
const nf = await page.goto(url + 'does-not-exist', { waitUntil: 'load' })
record('unknown_path_serves_404_page', nf.status() === 404 && (await page.content()).includes('Abdulrahman Bahjat'), { status: nf.status() })

record('console_errors', errorsBefore404 === 0, { errors: errors.slice(0, errorsBefore404) })
writeFileSync(join(out, 'roundtrip.json'), JSON.stringify(results, null, 2))
await browser.close()
server.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)

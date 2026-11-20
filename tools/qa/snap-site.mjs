// Capture a real screenshot of a live project site to use as project media.
//   node tools/qa/snap-site.mjs https://example.com public/media/example.webp
import { chromium } from 'playwright-core'
import sharp from 'sharp'

const [url, out] = process.argv.slice(2)
if (!url || !out) throw new Error('usage: snap-site.mjs <url> <out.webp>')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => ({ error: String(e) }))
await page.waitForTimeout(2500)
const title = await page.title()
const png = await page.screenshot({ type: 'png' })
await browser.close()
await sharp(png).resize(1280).webp({ quality: 82 }).toFile(out)
console.log(JSON.stringify({ url, status: res?.status?.() ?? res?.error ?? null, title, out }))

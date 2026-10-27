import { chromium } from '@playwright/test';
const out = 'C:/Dev/PortfolioV3/public/media/projects/';
const sites = [
  ['https://sweetmomentchocolate.com/', 'sweet-moment-home.jpg'],
  ['https://abdulrahmanb27.github.io/MyKitchenCloudflare/', 'mykitchen-dashboard.jpg'],
];
const browser = await chromium.launch();
for (const [url, file] of sites) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: out + file, type: 'jpeg', quality: 82 });
    console.log('ok', file, await page.title());
  } catch (e) { console.log('fail', file, String(e).slice(0, 200)); }
  await page.close();
}
await browser.close();

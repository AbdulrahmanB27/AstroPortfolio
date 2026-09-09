// Generates the formal, ATS-friendly resume PDF from src/data/portfolio.json.
//
//   npm run build:resume
//   node scripts/build-resume.mjs [--data src/data/portfolio.json] [--out public/resume/<file>]
//                                 [--html <copy of the intermediate html>] [--png <preview png>]
//
// The intermediate HTML goes to a temp directory (never into public/). The PDF is written
// with Playwright's bundled Chromium and committed, so the GitHub Pages workflow needs
// neither Playwright nor a browser. See docs/RESUME.md.
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderResumeHtml } from './resume-template.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dataPath = resolve(root, opt('data', 'src/data/portfolio.json'));
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
for (const key of ['profile', 'resume', 'skills', 'projects']) {
  if (!data[key]) throw new Error(`${dataPath}: missing "${key}" (run npm test for the full schema check)`);
}
const outPath = resolve(root, opt('out', join('public', data.resume.file)));
const htmlCopy = opt('html', '');
const pngPath = opt('png', '');

const { html, model } = renderResumeHtml(data);

const workDir = mkdtempSync(join(tmpdir(), 'astro-resume-'));
const htmlPath = join(workDir, 'resume.html');
writeFileSync(htmlPath, html, 'utf8');
if (htmlCopy) {
  mkdirSync(dirname(resolve(root, htmlCopy)), { recursive: true });
  copyFileSync(htmlPath, resolve(root, htmlCopy));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });

  // Rough fill estimate: lay the print stylesheet out at the printable area of a Letter
  // page (8.5×11in minus 0.6in margins, at 96 css px per inch) and compare heights.
  const printable = { width: Math.round(7.3 * 96), height: Math.round(9.8 * 96) };
  await page.setViewportSize(printable);
  const contentHeight = await page.evaluate(() => document.body.getBoundingClientRect().height);
  const fill = contentHeight / printable.height;

  const pdf = normalizePdf(
    await page.pdf({
      format: 'Letter',
      margin: { top: '0.6in', right: '0.6in', bottom: '0.6in', left: '0.6in' },
      printBackground: false,
      preferCSSPageSize: false,
      tagged: true,
    }),
    data.resume.updated,
  );

  const pages = countPages(pdf);
  if (pages < 1 || pages > 2) {
    throw new Error(`Resume renders to ${pages} pages; it must be 1–2. Trim the JSON content or the template typography.`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, pdf);

  if (pngPath) {
    // Screen preview of the same HTML at 96 dpi Letter width (8.5in = 816px) for reviews.
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 816, height: 1056 });
    mkdirSync(dirname(resolve(root, pngPath)), { recursive: true });
    await page.screenshot({ path: resolve(root, pngPath), fullPage: true });
  }

  console.log(
    `resume: ${relative(outPath)} (${(pdf.length / 1024).toFixed(1)} KB, ${pages} page${pages === 1 ? '' : 's'}, ~${Math.round(fill * 100)}% of one page)`,
  );
  console.log(`sections: ${model.sections.map((s) => s.title).join(' → ')}`);
  if (model.skipped.length) {
    console.log('skipped placeholder text:');
    for (const s of model.skipped) console.log(`  - ${s}`);
  }
  if (model.placeholderEntries.length) {
    console.log('included entries still marked placeholder (confirm before sending):');
    for (const s of model.placeholderEntries) console.log(`  - ${s}`);
  }
  if (pages === 2) console.log('note: the resume is two pages; one page is preferred.');
} finally {
  await browser.close();
  rmSync(workDir, { recursive: true, force: true });
}

function relative(p) {
  return p.startsWith(root) ? p.slice(root.length + 1).replaceAll('\\', '/') : p;
}

/** Page objects are written as "/Type /Page" (the page tree is "/Type /Pages"). */
function countPages(pdf) {
  const text = pdf.toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/**
 * Chromium stamps the PDF with the current time (CreationDate/ModDate), so identical
 * content would still produce a different file on every run and a noisy git diff.
 * Replace the stamps with resume.updated (missing month/day become 01). The replacement
 * keeps the exact byte length so the xref table stays valid; anything unexpected is
 * left untouched. Nothing else in the file depends on the clock.
 */
function normalizePdf(pdf, updated) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(updated ?? ''));
  if (!m) return pdf;
  const stamp = `D:${m[1]}${m[2] ?? '01'}${m[3] ?? '01'}000000+00'00'`;
  const text = pdf
    .toString('latin1')
    .replace(/\/(CreationDate|ModDate)\s*\((D:[^)]*)\)/g, (all, key, value) =>
      value.length === stamp.length ? `/${key} (${stamp})` : all,
    );
  return Buffer.from(text, 'latin1');
}

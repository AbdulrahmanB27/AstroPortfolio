// Objective UI checks across every route and breakpoint: text contrast, tap-target size,
// focus visibility, horizontal overflow, heading order, image alt text and control naming.
//
// This is the half of a UI review that does not need an opinion. It runs against the
// production build the same way `pages:check` does, and prints one line per finding so the
// output can be pasted into a review verbatim.
//
//   node scripts/ui-audit.mjs [--url http://localhost:4173]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
const urlArg = argv.indexOf('--url');
const baseUrl = urlArg >= 0 ? argv[urlArg + 1] : 'http://localhost:4173';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
};

/** Every reachable surface, and how to know it has arrived. */
const SURFACES = [
  { id: 'home', url: '/?nointro#/', ready: '.home-menu[data-visible="true"]' },
  { id: 'cockpit-about', url: '/?nointro#/about', ready: '.mc[data-visible="true"]' },
  { id: 'cockpit-resume', url: '/?nointro#/resume', ready: '.mc[data-visible="true"]' },
  { id: 'cockpit-contact', url: '/?nointro#/contact', ready: '.mc[data-visible="true"]' },
  { id: 'system', url: '/?nointro#/projects', ready: '.system-hud[data-visible="true"]' },
  { id: 'project', url: '/?nointro#/projects/sweet-moment', ready: '.project-panel[data-visible="true"]' },
  // `flat: true` — no WebGL loader to wait out. Waiting for one anyway cost 60s a pair and
  // four minutes of a nine-minute run proving a selector that can never appear.
  { id: 'lite', url: '/lite/', ready: '.lite__projects', flat: true },
  { id: 'admin', url: '/admin/', ready: '#admin-root', flat: true },
];

const findings = [];
const record = (level, surface, vp, rule, detail) => findings.push({ level, surface, vp, rule, detail });

/** WCAG relative luminance and contrast ratio. */
const AUDIT = `(() => {
  const parse = (c) => {
    const m = String(c).match(/[\\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const backdrop = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.55) return c;
      node = node.parentElement;
    }
    return { r: 5, g: 7, b: 13, a: 1 };
  };
  /*
   * Effective alpha: the element's own opacity times every ancestor's.
   *
   * Without this the audit read the colour property and ignored opacity, and reported zero
   * failures on a build whose solar-system category captions measured 2.37:1 -- two human
   * review lenses found them independently. A CSS colour is a promise; what reaches the eye
   * is that colour composited through however many opacity layers sit above it, and on this
   * site the label layer sets opacity per element from a density setting. An audit that only
   * reads the colour property is measuring the promise.
   *
   * (No backticks in here: this whole block lives inside a template literal that is
   * evaluated in the page.)
   */
  const effectiveAlpha = (el) => {
    let a = 1;
    let node = el;
    while (node && node !== document.documentElement) {
      const o = Number(getComputedStyle(node).opacity);
      if (!Number.isNaN(o)) a *= o;
      node = node.parentElement;
    }
    return a;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (Number(cs.opacity) < 0.08) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    // Inside an aria-hidden subtree the content is not presented to anyone.
    return !el.closest('[aria-hidden="true"]');
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 44);

  const out = { contrast: [], targets: [], headings: [], images: [], controls: [], overflow: 0 };

  // --- text contrast -------------------------------------------------------------------
  const TEXT = 'p,li,span,a,button,h1,h2,h3,h4,strong,em,td,th,label,figcaption';
  for (const el of document.querySelectorAll(TEXT)) {
    if (!visible(el)) continue;
    /*
     * A disabled control is exempt from the contrast requirement (WCAG 1.4.3 excludes
     * "inactive user interface components"), and dimming one is how a UI says it is
     * inactive. The studio's reorder arrows are disabled at the ends of a list; folding
     * opacity into the measurement correctly found them at 2.34:1, and correctly finding them
     * is not the same as them being defects.
     */
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[disabled],[aria-disabled="true"]')) continue;
    // Only leaf-ish text: an element whose text comes from its own children is measured there.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = backdrop(el);
    // The text's own alpha and every opacity it is rendered through.
    fg.a *= effectiveAlpha(el);
    const ratio = (Math.max(lum(over(fg, bg)), lum(bg)) + 0.05) / (Math.min(lum(over(fg, bg)), lum(bg)) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const floor = large ? 3 : 4.5;
    if (ratio < floor) {
      out.contrast.push({ text: label(el), ratio: +ratio.toFixed(2), floor, size: +size.toFixed(1), sel: el.className || el.tagName });
    }
  }

  // --- tap targets ---------------------------------------------------------------------
  for (const el of document.querySelectorAll('a[href],button,[role="button"],input,select')) {
    if (!visible(el)) continue;
    if (el.closest('[data-dev-overlay]')) continue;
    // A visually-hidden input driven by a visible label is the correct accessible pattern
    // for a file picker; its own 1x1 box is not the target anyone hits.
    if (el.classList.contains('visually-hidden')) continue;
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 24) {
      out.targets.push({ text: label(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // --- heading order -------------------------------------------------------------------
  let last = 0;
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (!visible(h)) continue;
    const level = Number(h.tagName[1]);
    if (last && level > last + 1) out.headings.push({ text: label(h), from: last, to: level });
    last = level;
  }

  // --- images and controls without a name ----------------------------------------------
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    if (!img.getAttribute('alt') && img.getAttribute('aria-hidden') !== 'true') out.images.push({ src: (img.currentSrc || img.src).split('/').pop() });
  }
  for (const el of document.querySelectorAll('a[href],button,[role="button"]')) {
    if (!visible(el)) continue;
    if (!label(el)) out.controls.push({ sel: el.className || el.tagName });
  }

  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return out;
})()`;

async function auditSurface(page, surface, vpName) {
  // Progress on stderr, so the report on stdout stays paste-able. A script that prints
  // nothing for ten minutes is indistinguishable from a hung one, and this one waits up to
  // 60s per selector on 23 surface/viewport pairs.
  process.stderr.write(`  ... ${surface.id} @ ${vpName}
`);
  await page.goto(baseUrl + surface.url, { waitUntil: 'load', timeout: 60_000 });
  if (!surface.flat) await page.waitForSelector('.loader[data-hidden="true"]', { timeout: 60_000 }).catch(() => {});
  await page.waitForSelector(surface.ready, { timeout: 30_000 }).catch(() => {});
  await sleep(surface.flat ? 400 : 1400);

  const r = await page.evaluate(AUDIT);
  for (const c of r.contrast) record('FAIL', surface.id, vpName, 'contrast', `${c.ratio}:1 (needs ${c.floor}) at ${c.size}px — "${c.text}"`);
  for (const t of r.targets) record('WARN', surface.id, vpName, 'tap-target', `${t.w}x${t.h} — "${t.text}"`);
  for (const h of r.headings) record('WARN', surface.id, vpName, 'heading-order', `h${h.from} → h${h.to} — "${h.text}"`);
  for (const i of r.images) record('FAIL', surface.id, vpName, 'img-alt', `no alt — ${i.src}`);
  for (const c of r.controls) record('FAIL', surface.id, vpName, 'control-name', `unnamed control — ${c.sel}`);
  if (r.overflow > 1) record('FAIL', surface.id, vpName, 'overflow-x', `${r.overflow}px of horizontal scroll`);

  // Focus must be visible on the first few focusable controls.
  const focus = await page.evaluate(() => {
    const els = [...document.querySelectorAll('a[href],button')].filter((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.08 && r.width > 1 && !e.closest('[aria-hidden="true"]') && !e.closest('[data-dev-overlay]');
    });
    const bad = [];
    for (const el of els.slice(0, 8)) {
      el.focus();
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow && cs.boxShadow !== 'none';
      if (!ring && !shadow) bad.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40));
      el.blur();
    }
    return bad;
  });
  for (const f of focus) record('FAIL', surface.id, vpName, 'focus-visible', `no focus indicator — "${f}"`);
}

let server;
try {
  await fetch(baseUrl).catch(() => {
    throw new Error('no server');
  });
} catch {
  server = spawn('npx', ['vite', 'preview', '--port', '4173'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      await sleep(500);
    }
  }
}

const browser = await chromium.launch();
for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  for (const surface of SURFACES) {
    // The admin studio is owner-only and not part of the visitor experience on a phone.
    if (surface.id === 'admin' && vpName !== 'desktop') continue;
    try {
      await auditSurface(page, surface, vpName);
    } catch (e) {
      record('ERROR', surface.id, vpName, 'audit', String(e).slice(0, 120));
    }
  }
  await context.close();
}
await browser.close();
server?.kill();

const fails = findings.filter((f) => f.level === 'FAIL');
const warns = findings.filter((f) => f.level === 'WARN');
const byRule = new Map();
for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);

console.log('\n== UI audit ==\n');
for (const f of findings) {
  console.log(`[${f.level.padEnd(5)}] ${f.surface.padEnd(16)} ${f.vp.padEnd(8)} ${f.rule.padEnd(14)} ${f.detail}`);
}
console.log('\n-- by rule --');
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${rule}`);
console.log(`\n${fails.length} failing, ${warns.length} warnings, across ${SURFACES.length} surfaces x ${Object.keys(VIEWPORTS).length} viewports`);
process.exit(fails.length ? 1 : 0);

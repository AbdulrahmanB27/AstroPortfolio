// The composition checks a contrast audit cannot make: prose measure in characters, whether a
// clipped line is faded or guillotined, whether two edges that should agree do, whether a
// destination's name is whole. Each one prints PASS/FAIL next to the measured value, so a
// regression names itself instead of needing a screenshot to find.
//
// Every number in here came out of a review finding. It is the half of the review that can be
// re-run: `npm run ui:audit` covers contrast, targets and semantics, this covers layout.
//
//   node scripts/ui-verify.mjs [--url http://localhost:4173]
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const urlArg = argv.indexOf('--url');
const BASE = (urlArg >= 0 ? argv[urlArg + 1] : 'http://localhost:4173').replace(/\/$/, '');
let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${detail}`);
};

function lineScan(sel) {
  const el = document.querySelector(sel);
  if (!el) return { note: 'absent' };
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length > 4);
  if (!node) return { note: 'no text node' };
  const range = document.createRange();
  const lines = [];
  let cur = null;
  for (let i = 0; i < node.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (!cur || Math.abs(r.top - cur.top) > 2) {
      cur = { top: r.top, n: 0 };
      lines.push(cur);
    }
    cur.n += 1;
  }
  return { chars: lines.map((l) => l.n) };
}

/**
 * Load a surface on the SAME page, for real.
 *
 * `page.goto` to a URL differing only in the hash does not reload — the app stays in whatever
 * scene it was in and every selector after it matches the wrong surface. That cost two
 * debugging rounds in this file. Opening a page per surface fixes it and introduces a worse
 * problem: each page holds a WebGL context, and under the headless software rasteriser a
 * later page boots without one and then hangs on a selector that can never appear. So: one
 * page, and a varying query string to force the reload.
 */
let visit = 0;
async function open(page, hash, ready, label) {
  visit += 1;
  await page.goto(`${BASE}/?nointro&v=${visit}#${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('.loader[data-hidden="true"]', { timeout: 60_000 }).catch(() => {});
  if (!ready) return true;
  try {
    await page.waitForSelector(ready, { timeout: 60_000 });
    return true;
  } catch {
    check(`reached ${label}`, false, `"${ready}" never appeared`);
    return false;
  }
}

const browser = await chromium.launch();

// ---------- desktop ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await open(page, '/about', '.mc[data-visible="true"]', 'the About display');
  await page.waitForTimeout(2600);

  for (const [tag] of [['screen']]) {
    for (const sel of ['.mc-doc__lede', '.mc-doc__p']) {
      const r = await page.evaluate(lineScan, sel);
      const full = r.chars && r.chars.length > 1 ? r.chars.slice(0, -1) : r.chars;
      const longest = full ? Math.max(...full) : -1;
      check(`${tag} ${sel} measure <= 78 chars`, longest > 0 && longest <= 78, `${longest} chars`);
    }
  }

  // The fade is shallower than the padding it sits in, everywhere it is applied.
  const fade = await page.evaluate(() => {
    const b = document.querySelector('.mc__body');
    const cs = getComputedStyle(b);
    return {
      fade: parseFloat(cs.getPropertyValue('--fade')),
      pad: parseFloat(cs.paddingBottom),
      mask: (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none',
      overflow: b.scrollHeight - b.clientHeight,
    };
  });
  check('screen fade is applied', fade.mask, `mask ${fade.mask}`);
  check('screen fade shallower than padding', fade.fade < fade.pad, `fade ${fade.fade}px < pad ${fade.pad}px`);

  // Scrolled to the end, the final line must be at full opacity: no glyph inside the ramp.
  const endState = await page.evaluate(() => {
    const b = document.querySelector('.mc__body');
    b.scrollTop = b.scrollHeight;
    const fadeTop = b.getBoundingClientRect().bottom - parseFloat(getComputedStyle(b).getPropertyValue('--fade'));
    // Lowest glyph box in the document.
    let lowest = -Infinity;
    let who = '';
    const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let n;
    while ((n = walk.nextNode())) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.bottom > lowest && r.top < b.getBoundingClientRect().bottom) {
          lowest = r.bottom;
          who = n.textContent.trim().slice(0, 30);
        }
      }
    }
    return { lowest: Math.round(lowest), fadeTop: Math.round(fadeTop), who };
  });
  check(
    'screen last line clear of the ramp at scroll end',
    endState.lowest <= endState.fadeTop,
    `lowest glyph ${endState.lowest} vs ramp top ${endState.fadeTop} — "${endState.who}"`,
  );

  /*
   * The reader's way out, and the cabin's.
   *
   * This replaces three assertions about a header that no longer exists — "the exits are one
   * group", "the icon controls match each other", "no exit floats away" — which were all
   * describing a cluster of three controls a review found unreadable. The cluster is gone with
   * the view it belonged to. What is still a requirement, and always was, is that there is
   * exactly one way to close the reader and exactly one way to leave the ship, and that
   * neither layer is a dead end. Written as the requirement so a better arrangement passes it
   * rather than having to argue with it (lesson 32).
   */
  const ways = await page.evaluate(() => {
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 26) };
    };
    return {
      close: [...document.querySelectorAll('.mc__back')].map(box),
      leave: [...document.querySelectorAll('.mc__exit')].map(box),
      readers: document.querySelectorAll('.mc').length,
    };
  });
  check('exactly one reader in the document', ways.readers === 1, `${ways.readers} found`);
  check(
    'exactly one way to close the reader',
    ways.close.length === 1 && ways.close[0].h >= 36,
    ways.close.length ? `${ways.close.length} x ${ways.close[0].w}x${ways.close[0].h} "${ways.close[0].text}"` : 'none',
  );
  check(
    'exactly one way to leave the ship from the reader',
    ways.leave.length === 1,
    ways.leave.length ? `"${ways.leave[0].text}"` : 'none',
  );

  const reader = await page.evaluate(() => {
    const x = (s) => {
      const e = document.querySelector(s);
      return e ? Math.round(e.getBoundingClientRect().x) : null;
    };
    const frame = document.querySelector('.mc__frame').getBoundingClientRect();
    const surf = document.querySelector('.cockpit-full');
    return {
      rail: x('.mc__rail'),
      content: x('.mc-doc'),
      frameW: Math.round(frame.width),
      frameH: Math.round(frame.height),
      vw: innerWidth,
      vh: innerHeight,
      wash: getComputedStyle(document.querySelector('.mc__frame')).backgroundImage.includes('gradient'),
      blurred: (getComputedStyle(surf).backdropFilter || '').includes('blur'),
      sections: [...document.querySelectorAll('.mc__tab-label')].map((e) => e.textContent.trim()),
      captions: [...document.querySelectorAll('.mc__tab-sub')].filter((e) => getComputedStyle(e).display !== 'none').length,
    };
  });
  check('the reader fills the frame', reader.frameW / reader.vw > 0.85 && reader.frameH / reader.vh > 0.85, `${reader.frameW}x${reader.frameH} of ${reader.vw}x${reader.vh}`);
  check('the rail leads the page', reader.rail !== null && reader.content !== null && reader.content > reader.rail + 200, `rail ${reader.rail}, content ${reader.content}`);
  check('the reader carries the star wash', reader.wash, `gradient ${reader.wash}`);
  check('the world is still behind the reader', reader.blurred, `backdrop blur ${reader.blurred}`);
  check('every section is named in the rail', reader.sections.join(',') === 'About,Skills,Resume,Contact', reader.sections.join(','));
  check('the rail says what each section holds', reader.captions === 4, `${reader.captions} captions shown`);

  /*
   * The content column may not move when you change section.
   *
   * A fixed rail and a content block that re-centres per section would shift the reading
   * column under the reader's eye on every click. Measured on all four.
   */
  const edges = [];
  for (const section of ['skills', 'resume', 'contact', 'about']) {
    await page.locator(`.mc__tab:has-text("${section[0].toUpperCase()}${section.slice(1)}")`).click();
    await page.waitForTimeout(420);
    edges.push(await page.evaluate(() => Math.round(document.querySelector('.mc-doc').getBoundingClientRect().x)));
  }
  check('the reading column does not move between sections', new Set(edges).size === 1, `left edges ${edges.join(', ')}`);

  for (const sel of ['.mc-doc__lede', '.mc-doc__p']) {
    const r = await page.evaluate(lineScan, sel);
    const full2 = r.chars && r.chars.length > 1 ? r.chars.slice(0, -1) : r.chars;
    const longest = full2 ? Math.max(...full2) : -1;
    check(`reader ${sel} measure <= 78 chars`, longest > 0 && longest <= 78, `${longest} chars`);
  }

  // The scroll cue may only cover text the mask has already taken to near zero.
  const cue = await page.evaluate(() => {
    const b = document.querySelector('.mc__body');
    const c = document.querySelector('.scroll-cue');
    const bb = b.getBoundingClientRect();
    const cc = c.getBoundingClientRect();
    const fade = parseFloat(getComputedStyle(b).getPropertyValue('--fade'));
    return { cueTop: Math.round(cc.top), rampTop: Math.round(bb.bottom - fade) };
  });
  check('scroll cue sits inside the fade ramp', cue.cueTop >= cue.rampTop - 1, `cue top ${cue.cueTop} vs ramp top ${cue.rampTop}`);


  // Home: the doorway to /lite/ is no longer in the caption voice, and has its own ground.
  await open(page, '/', '.home-menu[data-visible="true"]', 'home');
  await page.waitForTimeout(2000);
  const home = await page.evaluate(() => {
    const lite = document.querySelector('.home-menu__lite');
    const sub = document.querySelector('.home-menu__sub');
    const cs = getComputedStyle(lite);
    return {
      liteMono: cs.fontFamily.includes('Mono'),
      liteUpper: cs.textTransform === 'uppercase',
      litePlate: cs.backgroundColor,
      subMono: getComputedStyle(sub).fontFamily.includes('Mono'),
      liteBordered: parseFloat(cs.borderTopWidth) > 0,
      litePlated: cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
      subBordered: parseFloat(getComputedStyle(sub).borderTopWidth) > 0,
      liteW: Math.round(lite.getBoundingClientRect().width),
      menuW: Math.round(document.querySelector('.home-menu').getBoundingClientRect().width),
    };
  });
  /*
   * The doorway must not be mistakable for a menu caption — but the thing that guarantees
   * that is its FORM, not its voice.
   *
   * Round 10 found it in the sublabels' exact mono caption voice, in their column, at their
   * size, reading as the caption of a sixth menu item, and the fix was to change the voice.
   * Round 12 then found it was the only pill in the product not in mono uppercase, out of
   * fourteen. Both were right, and only one of them can be satisfied by the voice. So the
   * voice matches the control system and this asserts the actual differentiator: the doorway
   * has a border and a ground, and a caption has neither.
   */
  check(
    'the doorway reads as a control, not a caption',
    home.liteBordered && home.litePlated && !home.subBordered,
    `doorway border ${home.liteBordered} + ground ${home.litePlated}; caption border ${home.subBordered}`,
  );
  check('lite doorway hugs its label', home.liteW < 190, `${home.liteW}px wide in a ${home.menuW}px column`);
  check('lite doorway has its own ground', /rgba?\(/.test(home.litePlate) && home.litePlate !== 'rgba(0, 0, 0, 0)', home.litePlate);

  await ctx.close();
}

// ---------- mobile ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await open(page, '/about', '.mc[data-visible="true"]', 'the phone cockpit');
  await page.waitForTimeout(2800);

  /*
   * Phone rail geometry is asserted below, next to the row it describes.
   *
   * There were two checks for "the section names are whole on a phone" — one here against the
   * old `.mc__tabs` strip and one in the reader block — which is how a file ends up arguing
   * with itself after a layout changes. One check, beside the thing it measures.
   */
  const fadeM = await page.evaluate(() => {
    const b = document.querySelector('.mc__body');
    const cs = getComputedStyle(b);
    return { fade: parseFloat(cs.getPropertyValue('--fade')), pad: parseFloat(cs.paddingBottom) };
  });
  check('phone fade shallower than padding', fadeM.fade < fadeM.pad, `fade ${fadeM.fade}px < pad ${fadeM.pad}px`);

  /*
   * On a phone the rail is a row, and it has to be a cheap one.
   *
   * The header it replaces cost 208px of an 844px frame at its worst — a tab row plus three
   * stacked pills — and put the first word of content 36% down the viewport. Four names at
   * 15px fit one row with room over, so the captions go and the numbers go with them.
   */
  const fullM = await page.evaluate(() => {
    const rail = document.querySelector('.mc__rail').getBoundingClientRect();
    const title = document.querySelector('.mc-doc__title') ?? document.querySelector('.mc-doc');
    const names = [...document.querySelectorAll('.mc__tab-label')].map((e) => {
      const r = e.getBoundingClientRect();
      const strip = document.querySelector('.mc__rail-list').getBoundingClientRect();
      return { text: e.textContent.trim(), clipped: r.right > strip.right + 1 || r.width < 8 };
    });
    return {
      railH: Math.round(rail.height),
      titleY: Math.round(title.getBoundingClientRect().y),
      clipped: names.filter((n) => n.clipped).map((n) => n.text),
      names: names.map((n) => n.text).join(','),
    };
  });
  check('the phone rail is one cheap row', fullM.railH < 80, `${fullM.railH}px tall`);
  check('phone reading starts above 22% of the frame', fullM.titleY / 844 < 0.22, `${fullM.titleY}px (${Math.round((fullM.titleY / 844) * 100)}%)`);
  check('every section name is whole on a phone', fullM.clipped.length === 0, fullM.clipped.length ? fullM.clipped.join(',') : fullM.names);

  await ctx.close();
}


// ---------- the invariants round 11 was about ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  /*
   * The type scale has to STEP.
   *
   * The most repeated finding of the round was that one enormous display step is followed by
   * a 2-3px band into which four or five semantic levels are all poured, with colour left to
   * carry the rank that size should. The amber standfirst measured smaller than the paragraph
   * it introduces. This asserts the order, in rendered pixels, on the surface the panel
   * actually uses.
   */
  await open(page, '/about', '.mc[data-visible="true"]', 'the About display');
  await page.waitForTimeout(2600);
  const steps = await page.evaluate(() => {
    const size = (s) => {
      const e = document.querySelector(s);
      return e ? parseFloat(getComputedStyle(e).fontSize) : null;
    };
    return { title: size('.mc-doc__title'), lede: size('.mc-doc__lede'), body: size('.mc-doc__p') };
  });
  check(
    'about type scale steps down, not sideways',
    steps.title > steps.lede && steps.lede > steps.body,
    `title ${steps.title} > lede ${steps.lede} > body ${steps.body}`,
  );

  /*
   * The case studies were the one prose surface with no measure.
   *
   * Its own page: `page.goto` to a URL that differs only in the hash does NOT reload, so
   * reusing the page above left the app in whatever scene it was already in and the selector
   * matched nothing. That has now cost two debugging rounds in this file.
   */
  await open(page, '/projects/sweet-moment', '.project-panel[data-visible="true"]', 'a project');
  await page.waitForTimeout(2400);
  for (const sel of ['.project-panel__summary', '.project-panel__p']) {
    const r = await page.evaluate(lineScan, sel);
    const full = r.chars && r.chars.length > 1 ? r.chars.slice(0, -1) : r.chars;
    const longest = full ? Math.max(...full) : -1;
    check(`project ${sel} measure <= 78 chars`, longest > 0 && longest <= 78, `${longest} chars`);
  }

  /*
   * Contrast, with the element's opacity folded in.
   *
   * Two review lenses measured the solar system's category captions at 2.37-3.59:1 on a build
   * where the audit reported zero failures, because the audit read `color` and the labels set
   * their alpha per element. This is that measurement, as a test.
   */
  await open(page, '/projects', '.system-hud[data-visible="true"]', 'the solar system');
  await page.waitForTimeout(3400);
  const labelContrast = await page.evaluate(() => {
    const parse = (c) => {
      const m = String(c).match(/[\d.]+/g);
      if (!m) return null;
      const [r, g, b, a] = m.map(Number);
      return { r, g, b, a: a === undefined ? 1 : a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const alpha = (el) => {
      let a = 1;
      let n = el;
      while (n && n !== document.documentElement) {
        a *= Number(getComputedStyle(n).opacity);
        n = n.parentElement;
      }
      return a;
    };
    const sky = { r: 5, g: 7, b: 13 };
    const out = [];
    for (const el of document.querySelectorAll('.planet-label__cat, .planet-label__name')) {
      const fg = parse(getComputedStyle(el).color);
      const a = alpha(el);
      if (a < 0.05) continue;
      const over = { r: fg.r * a + sky.r * (1 - a), g: fg.g * a + sky.g * (1 - a), b: fg.b * a + sky.b * (1 - a) };
      const ratio = (lum(over) + 0.05) / (lum(sky) + 0.05);
      out.push({ text: el.textContent.trim().slice(0, 22), ratio: +ratio.toFixed(2) });
    }
    return out;
  });
  const worst = labelContrast.length ? labelContrast.reduce((a, b) => (a.ratio < b.ratio ? a : b)) : null;
  check(
    'every solar-system label clears AA with its own opacity',
    worst !== null && worst.ratio >= 4.5,
    worst ? `worst ${worst.ratio}:1 — "${worst.text}" of ${labelContrast.length} labels` : 'no labels found',
  );

  // A technology's name may not split, and a line may not end on a separator.
  await open(page, '/resume', '.mc[data-visible="true"]', 'the resume display');
  await page.waitForTimeout(2200);
  const techWrap = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.mc-list__meta.t-mono .nowrap')) {
      /*
       * One term, one line.
       *
       * Count only rects with real width: when a line breaks before one of these spans, its
       * leading space collapses and Chrome still reports a zero-width rect for it on the
       * previous line. That is the separator doing its job — travelling to the next line with
       * the term it belongs to — not a break inside the term.
       */
      // Group by line, not by rect: an inline element returns one rect per TEXT NODE, so a
      // span holding a separator and a term reports two rects side by side on one line. What
      // makes it split is two DISTINCT line tops.
      const drawn = [...el.getClientRects()].filter((r) => r.width > 0.5);
      const lines = new Set(drawn.map((r) => Math.round(r.top)));
      if (lines.size > 1) bad.push(el.textContent.trim().slice(0, 26));
    }
    return bad;
  });
  // And no rendered line may END on a separator.
  const orphanSep = await page.evaluate(() => {
    const bad = [];
    for (const meta of document.querySelectorAll('.mc-list__meta.t-mono')) {
      const rows = new Map();
      for (const el of meta.querySelectorAll('.nowrap')) {
        for (const r of el.getClientRects()) {
          if (r.width <= 0.5) continue;
          const key = Math.round(r.top);
          const row = rows.get(key) ?? { right: -Infinity, text: '' };
          if (r.right > row.right) {
            row.right = r.right;
            row.text = el.textContent.trim();
          }
          rows.set(key, row);
        }
      }
      for (const row of rows.values()) if (/[·]$/.test(row.text)) bad.push(row.text.slice(0, 26));
    }
    return bad;
  });
  check('no line ends on a separator', orphanSep.length === 0, orphanSep.length ? orphanSep.join(' | ') : 'none');
  check('no technology name is split across lines', techWrap.length === 0, techWrap.length ? techWrap.join(' | ') : 'all whole');

  await ctx.close();
}

// ---------- phone: controls and targets ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await open(page, '/about', '.mc[data-visible="true"]', 'the phone cockpit');
  await page.waitForTimeout(2800);

  // No control may sit on a glyph.
  const overlap = await page.evaluate(() => {
    const cue = document.querySelector('.scroll-cue');
    if (!cue || Number(getComputedStyle(cue).opacity) < 0.05) return { skipped: true };
    const c = cue.getBoundingClientRect();
    const body = document.querySelector('.mc__body');
    const range = document.createRange();
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let n;
    const hits = [];
    while ((n = walk.nextNode())) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top) {
          hits.push(n.textContent.trim().slice(0, 30));
          break;
        }
      }
    }
    return { cue: `${Math.round(c.left)}-${Math.round(c.right)}`, hits: [...new Set(hits)] };
  });
  check(
    'the scroll cue does not sit on any glyph',
    overlap.skipped || overlap.hits.length === 0,
    overlap.skipped ? 'cue not shown' : `cue x ${overlap.cue}${overlap.hits.length ? ` over "${overlap.hits[0]}"` : ''}`,
  );

  // The product's own touch standard is 44px, not the audit's 24px floor.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('a[href],button,[role="button"]')]
      .filter((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return (
          cs.visibility !== 'hidden' &&
          Number(cs.opacity) > 0.08 &&
          r.width > 1 &&
          r.bottom > 0 &&
          r.top < innerHeight &&
          !e.closest('[aria-hidden="true"]') &&
          !e.closest('[data-dev-overlay]') &&
          !e.classList.contains('visually-hidden')
        );
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 22), min: Math.round(Math.min(r.width, r.height)) };
      })
      .filter((t) => t.min < 40),
  );
  check(
    'every phone control is at least 40px on its short side',
    small.length === 0,
    small.length ? small.map((t) => `${t.min}px "${t.text}"`).join(', ') : 'all >= 40px',
  );

  /*
   * The cabin is not a dead end.
   *
   * This is the assertion that was missing when the owner found the bug: with the reading
   * moved to a flat surface the cabin was four displays and no control at all, and you could
   * only leave the cockpit by first opening a section. Nothing tests for the absence of a
   * control unless it is asked to.
   */
  await page.locator('.mc__back').click();
  await page.waitForTimeout(1600);
  const cabin = await page.evaluate(() => {
    const hud = document.querySelector('.cockpit-hud');
    const btn = hud?.querySelector('button');
    const r = btn?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.screen-card')].length;
    return {
      shown: hud?.dataset?.visible === 'true',
      target: r ? Math.round(Math.min(r.width, r.height)) : 0,
      text: (btn?.textContent || '').trim().slice(0, 30),
      cards,
      view: window.__astro?.useApp.getState().cockpitView,
    };
  });
  check('the cabin has a visible way out', cabin.shown && cabin.target >= 36, `"${cabin.text}" ${cabin.target}px, view ${cabin.view}`);
  check('the cabin still offers every section', cabin.cards === 4, `${cabin.cards} displays`);

  await ctx.close();
}

// ---------- home: the name is the primary type, and says what he builds ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  for (const vp of [{ width: 1440, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'phone  ' }]) {
    const c = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await c.newPage();
    await open(page, '/', '.home-menu[data-visible="true"]', 'home');
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => {
      const size = (s) => {
        const e = document.querySelector(s);
        return e ? parseFloat(getComputedStyle(e).fontSize) : null;
      };
      return {
        name: size('.lockup__name'),
        nav: size('.home-menu__label'),
      };
    });
    check(`${vp.tag} the name outranks a menu item`, r.name > r.nav * 1.15, `name ${r.name}px vs nav ${r.nav}px`);
    await c.close();
  }
  await ctx.close();
}


// ---------- the contract's own rules, measured in the frame ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  /*
   * "Canvas background is --space-900, never pure black."  — docs/ART_DIRECTION.md
   *
   * This is the check that would have caught giving the exposure feature a SUBTRACTIVE
   * implementation. Brightness that subtracts a constant clips everything dimmer than the
   * constant to #000000: an independent review measured 41.5% of the focused-project frame at
   * exactly black with the starfield gone, 30.3% of the phone resume frame and 14.7% of the
   * phone project frame. Multiplying scales the range instead and leaves none. A faint star
   * has to stay a faint star.
   */
  const noPureBlack = async (label, hash, ready, vp) => {
    const c = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const pg = await c.newPage();
    if (await open(pg, hash, ready, label)) {
      await pg.waitForTimeout(2800);
      const shot = (await pg.screenshot()).toString('base64');
      const share = await pg.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, cv.width, cv.height).data;
        let black = 0;
        let n = 0;
        for (let i = 0; i < px.length; i += 4) {
          n += 1;
          if (px[i] + px[i + 1] + px[i + 2] === 0) black += 1;
        }
        return (100 * black) / n;
      }, shot);
      check(`${label}: no pure black`, share < 0.5, `${share.toFixed(1)}% at exactly #000000`);
    }
    await c.close();
  };

  await noPureBlack('project desktop', '/projects/sweet-moment', '.project-panel[data-visible="true"]', { width: 1440, height: 900 });
  await noPureBlack('project phone  ', '/projects/sweet-moment', '.project-panel[data-visible="true"]', { width: 390, height: 844 });
  await noPureBlack('cockpit phone  ', '/resume', '.mc[data-visible="true"]', { width: 390, height: 844 });

  // Every line of the identity lockup carries the halo. The tagline was added to the lockup
  // and not to the selector, and on a phone it lands on the star's corona at 1.34:1.
  await open(page, '/', '.home-menu[data-visible="true"]', 'home');
  await page.waitForTimeout(1800);
  const halos = await page.evaluate(() =>
    [...document.querySelectorAll('.lockup:not(.lockup--static) > *')].map((e) => ({
      cls: String(e.className),
      shadow: getComputedStyle(e).textShadow !== 'none',
    })),
  );
  const bare = halos.filter((h) => !h.shadow);
  check(
    'every line of the lockup is haloed against the scene',
    halos.length > 0 && bare.length === 0,
    bare.length ? bare.map((b) => b.cls).join(', ') : `${halos.length} lines, all haloed`,
  );

  // Scanlines are on the art direction's Never list, by name.
  await open(page, '/about', '.mc[data-visible="true"]', 'the About display');
  await page.waitForTimeout(2200);
  const scan = await page.evaluate(() => {
    const found = [];
    for (const el of document.querySelectorAll('.mc__frame, .screen-card, .mc-mount *, .screen-mount--active *')) {
      for (const pseudo of ['::before', '::after']) {
        const bg = getComputedStyle(el, pseudo).backgroundImage;
        if (/repeating-linear-gradient/.test(bg)) found.push(`${el.className || el.tagName}${pseudo}`);
      }
    }
    return [...new Set(found)];
  });
  check('no scanlines on the console', scan.length === 0, scan.length ? scan.join(', ') : 'none');

  // The media pager has to paint its marks. Two rules computing the same box differently gave
  // it a zero-width content box on a phone and it painted nothing at all.
  const pager = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pp = await pager.newPage();
  if (await open(pp, '/projects/sweet-moment', '.project-panel[data-visible="true"]', 'a project on a phone')) {
    await pp.waitForTimeout(2400);
    const dots = await pp.evaluate(() =>
      [...document.querySelectorAll('.project-media__nav button')].map((e) => {
        const r = e.getBoundingClientRect();
        const a = getComputedStyle(e, '::after');
        return { target: Math.round(Math.min(r.width, r.height)), mark: parseFloat(a.width) || 0 };
      }),
    );
    check(
      'the media pager paints a mark inside a real target',
      dots.length > 0 && dots.every((d) => d.mark >= 6 && d.target >= 24),
      dots.length ? dots.map((d) => `${d.mark}px mark in ${d.target}px target`).join(', ') : 'no pager found',
    );
  }
  await pager.close();

  await ctx.close();
}

await browser.close();
console.log(`\n${fails} failing`);
process.exit(fails ? 1 : 0);

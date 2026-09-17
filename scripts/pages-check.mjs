// Simulates GitHub Pages sub-path hosting for the production build and verifies that
// routes, entries, assets and the 404 fallback behave the way they will on
// https://<user>.github.io/<repo>/ (and, for public/404.html, on a custom domain root).
//
// Usage:
//   node scripts/pages-check.mjs [--skip-build] [--prefix AstroPortfolio] [--out captures/pages-check]
//   node scripts/pages-check.mjs --root        (custom domain: the site served from "/")
//   (--prefix takes the repository name; pass it without slashes in Git Bash, which rewrites
//   "/Name/" into a Windows path before node sees it — that is also why the root mode is a
//   flag and not `--prefix /`)
//
// The site is deployed to a custom domain (public/CNAME), so `--root` is the check that
// matches production; the project-site mode stays because the repo must still deploy
// unchanged to https://<user>.github.io/<repo>/ if the domain ever goes away. In root mode
// the checks that only make sense under a prefix ("/" answers 404", "/assets/ is wrong",
// the github.io first-segment redirect) are skipped and say so, not failed.
//
// What it does (spec §50 / §66 "GitHub Pages build/paths/routes"):
//   1. `VITE_BASE_PATH=/AstroPortfolio/ npm run build` (unless --skip-build).
//   2. Serves dist/ from an ephemeral local port under the /AstroPortfolio/ prefix with the
//      same rules as Pages: directory index.html, 301 for `/dir` → `/dir/`, real content
//      types, 404.html served with status 404 for unknown paths, and `/` outside the
//      prefix answering 404 the way <user>.github.io does for a project site.
//   3. Drives headless Chromium through the routes on http://<check>.github.io:<port>/ (the
//      hostname is mapped to 127.0.0.1 with --host-resolver-rules, so public/404.html sees a
//      github.io host exactly as on Pages and the browser follows the server's real 301s),
//      plus a second server at the domain root for the custom-domain style of 404.html.
//      Console errors, page errors and failed requests fail the run.
//   4. HEAD-checks every media file referenced by src/data/portfolio.json, the resume PDF
//      and the favicon under the prefix.
//   5. Greps dist/index.html, dist/admin/index.html and the built CSS for absolute
//      `/assets/`, `/src/` or other root references that would break under a sub-path.
//
// No dependencies beyond node built-ins and the repo's @playwright/test.

import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// ---------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

/*
 * One run at a time.
 *
 * This script rebuilds `dist/` twice — once with the sub-path base it needs to test, once back
 * to the root base so it leaves the tree usable. Two runs overlapping therefore fight over the
 * same directory, and the loser reports a FAIL that has nothing to do with the product. That
 * happened: a run in the foreground raced a run in a background task and printed
 * "PAGES CHECK: FAIL" on a build that passes 91/91 on its own. A deployment check that cries
 * wolf is worse than no deployment check, so it refuses rather than racing.
 */
const LOCK = resolve(repoRoot, 'node_modules', '.pages-check.lock');
if (existsSync(LOCK)) {
  const age = Date.now() - statSync(LOCK).mtimeMs;
  if (age < 15 * 60_000) {
    console.error(
      [
        '',
        'Another pages:check is running (lock ' + Math.round(age / 1000) + 's old at ' + LOCK + ').',
        'It rebuilds dist/, so two runs cannot overlap. Wait for it, or delete the lock if it died.',
        '',
      ].join(String.fromCharCode(10)),
    );
    process.exit(2);
  }
}
writeFileSync(LOCK, String(process.pid));
const releaseLock = () => {
  try {
    rmSync(LOCK, { force: true });
  } catch {
    /* the report is what matters; a stale lock ages out */
  }
};
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));
const distDir = resolve(repoRoot, 'dist');
const outDir = resolve(repoRoot, opt('out', 'captures/pages-check'));
const skipBuild = flag('skip-build');
/** Base path as Vite receives it, e.g. "/AstroPortfolio/" — or "/" with --root. */
const basePath = flag('root')
  ? '/'
  : ('/' + opt('prefix', '/AstroPortfolio/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
/** Same thing without the trailing slash, e.g. "/AstroPortfolio". */
const prefix = basePath.replace(/\/$/, '');
/** Fake project-site host; Chromium resolves it to 127.0.0.1 (see browserChecks). */
const PAGES_HOST = 'astro-pages-check.github.io';
let PAGES_ORIGIN = `http://${PAGES_HOST}`; // port appended once the server is listening
const OVERLAY_TIMEOUT = 60_000;

// ---------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------

const results = [];
const record = (status, name, detail = '') => {
  results.push({ status, name, detail });
  const tag = status === 'PASS' ? ' ok ' : status === 'WARN' ? 'warn' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
};
const pass = (name, detail) => record('PASS', name, detail);
const fail = (name, detail) => record('FAIL', name, detail);
const warn = (name, detail) => record('WARN', name, detail);
const check = (ok, name, detail) => (ok ? pass(name, detail) : fail(name, detail));
const heading = (title) => console.log(`\n== ${title}`);

// ---------------------------------------------------------------------------------------
// 1. Build
// ---------------------------------------------------------------------------------------

heading(`Build (VITE_BASE_PATH=${basePath})`);
if (skipBuild) {
  console.log('--skip-build: using the existing dist/');
} else {
  // `npm run build` = typecheck + vite build (main app + /admin/), exactly what deploy.yml runs.
  const build = spawnSync('npm run build', {
    cwd: repoRoot,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE_PATH: basePath, FORCE_COLOR: '0' },
  });
  if (build.status !== 0) {
    fail('npm run build', `exit code ${build.status}`);
    finish();
  }
  pass('npm run build', 'typecheck + vite build');
}
if (!existsSync(resolve(distDir, 'index.html'))) {
  fail('dist/index.html exists', 'nothing to serve; run without --skip-build');
  finish();
}
check(existsSync(resolve(distDir, 'admin', 'index.html')), 'dist/admin/index.html exists', 'admin entry emitted by the MPA build');
check(existsSync(resolve(distDir, 'lite', 'index.html')), 'dist/lite/index.html exists', 'simplified entry emitted by the MPA build');
check(existsSync(resolve(distDir, '404.html')), 'dist/404.html exists', 'copied from public/404.html');

// ---------------------------------------------------------------------------------------
// 2. Static server that behaves like GitHub Pages
// ---------------------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};
const mimeFor = (file) => MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * @param {object} o
 * @param {string} o.dir            directory to serve (dist/)
 * @param {string} o.prefix         "/AstroPortfolio" for a project site, "" for a domain root
 * @param {boolean} o.redirectDirs  301 `/dir` → `/dir/` like Pages does (false to force the
 *                                  404.html fallback to handle it)
 * @param {string[]} o.aliases      extra prefixes that map onto `dir` (used by the root-mode
 *                                  server so the /AstroPortfolio/ build can be exercised at "/")
 */
function createPagesServer({ dir, prefix, redirectDirs, aliases = [] }) {
  const notFoundPage = resolve(dir, '404.html');
  const log = [];

  const server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    const send = (status, headers, file) => {
      log.push({ method, url: req.url, status });
      res.writeHead(status, headers);
      if (method === 'HEAD' || !file) return res.end();
      createReadStream(file).pipe(res);
    };
    const sendText = (status, text, type = 'text/plain; charset=utf-8') => {
      log.push({ method, url: req.url, status });
      res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(text) });
      res.end(method === 'HEAD' ? undefined : text);
    };
    const sendFile = (status, file) => {
      const size = statSync(file).size;
      send(status, { 'content-type': mimeFor(file), 'content-length': size, 'cache-control': 'no-store' }, file);
    };
    const notFound = () => {
      if (existsSync(notFoundPage)) sendFile(404, notFoundPage);
      else sendText(404, 'Not found');
    };

    if (method !== 'GET' && method !== 'HEAD') return sendText(405, 'Method not allowed');
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return sendText(400, 'Bad request');
    }

    // Outside the project prefix <user>.github.io answers with GitHub's own 404 page
    // (there is no user site), never with this project's 404.html.
    if (prefix) {
      if (pathname === prefix) {
        return send(301, { location: `${prefix}/${url.search}`, 'content-length': 0 });
      }
      if (!pathname.startsWith(`${prefix}/`)) {
        return sendText(404, "<h1>404</h1><p>There isn't a GitHub Pages site here.</p>", 'text/html; charset=utf-8');
      }
    }
    let rel = pathname.slice(prefix.length);
    for (const alias of aliases) {
      if (rel === alias) rel = '/';
      else if (rel.startsWith(`${alias}/`)) rel = rel.slice(alias.length);
    }

    const target = resolve(dir, `.${rel}`);
    if (target !== dir && !target.startsWith(dir + sep)) return notFound();

    let stat = existsSync(target) ? statSync(target) : null;
    if (stat?.isDirectory()) {
      if (!rel.endsWith('/')) {
        if (redirectDirs) return send(301, { location: `${pathname}/${url.search}`, 'content-length': 0 });
        return notFound();
      }
      const index = resolve(target, 'index.html');
      if (existsSync(index)) return sendFile(200, index);
      return notFound();
    }
    if (stat?.isFile()) return sendFile(200, target);
    // Pages also serves `/page` for `page.html`.
    if (existsSync(`${target}.html`) && statSync(`${target}.html`).isFile()) return sendFile(200, `${target}.html`);
    return notFound();
  });

  return new Promise((resolveServer, rejectServer) => {
    server.on('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({
        port,
        origin: `http://127.0.0.1:${port}`,
        log,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Minimal HTTP client (no redirects followed) for the protocol-level checks. */
function fetchRaw(url, method = 'GET') {
  return new Promise((resolveReq, rejectReq) => {
    const req = httpRequest(url, { method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolveReq({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', rejectReq);
    req.end();
  });
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------

let pagesServer = null;
let rootServer = null;
let browser = null;

try {
  pagesServer = await createPagesServer({ dir: distDir, prefix, redirectDirs: true });
  rootServer = await createPagesServer({ dir: distDir, prefix: '', redirectDirs: false, aliases: [prefix] });
  PAGES_ORIGIN = `http://${PAGES_HOST}:${pagesServer.port}`;
  console.log(`\nProject-site server: ${pagesServer.origin}${basePath}  (browser opens it as ${PAGES_ORIGIN}${basePath})`);
  console.log(`Domain-root server:  ${rootServer.origin}/  (custom-domain style, no directory redirects)`);

  await httpChecks();
  await assetChecks();
  distReferenceChecks();
  await browserChecks();
} catch (e) {
  fail('pages-check crashed', String(e?.stack ?? e).slice(0, 600));
} finally {
  await browser?.close().catch(() => {});
  await pagesServer?.close();
  await rootServer?.close();
}
finish();

// ---------------------------------------------------------------------------------------
// 3. Protocol-level checks (status codes, redirects, content types)
// ---------------------------------------------------------------------------------------

async function httpChecks() {
  heading('HTTP behaviour under the prefix');
  const o = pagesServer.origin;

  let r;
  if (prefix) {
    r = await fetchRaw(`${o}/`);
    check(r.status === 404, `GET / → 404 outside the project prefix`, `got ${r.status}`);

    r = await fetchRaw(`${o}${prefix}`);
    check(r.status === 301 && r.headers.location === `${prefix}/`, `GET ${prefix} → 301 ${prefix}/`, `got ${r.status} ${r.headers.location ?? ''}`);
  } else {
    console.log('  (root mode: no prefix, so no "outside the prefix" or "/prefix → /prefix/" checks)');
  }

  r = await fetchRaw(`${o}${prefix}/`);
  check(r.status === 200 && /text\/html/.test(r.headers['content-type'] ?? ''), `GET ${prefix}/ → 200 text/html`, `got ${r.status} ${r.headers['content-type']}`);

  r = await fetchRaw(`${o}${prefix}/admin`);
  check(r.status === 301 && r.headers.location === `${prefix}/admin/`, `GET ${prefix}/admin → 301 ${prefix}/admin/`, `got ${r.status} ${r.headers.location ?? ''}`);

  r = await fetchRaw(`${o}${prefix}/admin/`);
  check(r.status === 200 && /text\/html/.test(r.headers['content-type'] ?? ''), `GET ${prefix}/admin/ → 200 text/html`, `got ${r.status}`);

  // The simplified portfolio is a real directory index too, and it is the fallback a
  // visitor without WebGL is sent to — so it has to resolve on a sub-path host.
  r = await fetchRaw(`${o}${prefix}/lite`);
  check(r.status === 301 && r.headers.location === `${prefix}/lite/`, `GET ${prefix}/lite → 301 ${prefix}/lite/`, `got ${r.status} ${r.headers.location ?? ''}`);

  r = await fetchRaw(`${o}${prefix}/lite/`);
  check(r.status === 200 && /text\/html/.test(r.headers['content-type'] ?? ''), `GET ${prefix}/lite/ → 200 text/html`, `got ${r.status}`);

  r = await fetchRaw(`${o}${prefix}/this-page-does-not-exist`);
  check(
    r.status === 404 && /text\/html/.test(r.headers['content-type'] ?? '') && r.body.includes('Redirecting'),
    `GET ${prefix}/this-page-does-not-exist → 404 with public/404.html as the body`,
    `got ${r.status} ${r.headers['content-type']}`,
  );

  r = await fetchRaw(`${o}${prefix}/404.html`);
  check(r.status === 200, `GET ${prefix}/404.html → 200 (the file itself is reachable)`, `got ${r.status}`);

  // Every <script src> / <link href> in both entries resolves under the prefix with the right type.
  for (const entry of ['index.html', 'admin/index.html', 'lite/index.html']) {
    const html = readFileSync(resolve(distDir, entry), 'utf8');
    const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]).filter((u) => u.startsWith('/'));
    for (const ref of refs) {
      const expected = mimeFor(ref);
      const res = await fetchRaw(`${o}${ref}`, 'HEAD');
      const type = res.headers['content-type'] ?? '';
      check(
        res.status === 200 && type.startsWith(expected.split(';')[0]),
        `${entry}: ${ref} → 200 ${expected.split(';')[0]}`,
        `got ${res.status} ${type}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------
// 4. Media, resume PDF, favicon (from src/data/portfolio.json)
// ---------------------------------------------------------------------------------------

async function assetChecks() {
  heading('Content assets referenced by src/data/portfolio.json');
  const data = JSON.parse(readFileSync(resolve(repoRoot, 'src/data/portfolio.json'), 'utf8'));
  const paths = new Map(); // site-relative path → label
  for (const p of data.projects ?? []) {
    for (const m of p.media ?? []) {
      if (m.src) paths.set(m.src, `${p.id} media`);
      if (m.poster) paths.set(m.poster, `${p.id} poster`);
    }
  }
  if (data.resume?.file) paths.set(data.resume.file, 'resume PDF');
  paths.set('favicon.svg', 'favicon');

  for (const [rel, label] of paths) {
    const url = `${pagesServer.origin}${basePath}${rel.replace(/^\//, '')}`;
    const expected = mimeFor(rel).split(';')[0];
    const res = await fetchRaw(url, 'HEAD');
    const type = (res.headers['content-type'] ?? '').split(';')[0];
    const length = Number(res.headers['content-length'] ?? 0);
    const onDisk = existsSync(resolve(repoRoot, 'public', rel.replace(/^\//, '')));
    check(
      res.status === 200 && type === expected && length > 0,
      `HEAD ${basePath}${rel} (${label})`,
      res.status === 200 ? `${type}, ${length} bytes` : `got ${res.status}${onDisk ? '' : ` — public/${rel} is missing`}`,
    );
  }
}

// ---------------------------------------------------------------------------------------
// 5. No absolute root references in the built HTML/CSS
// ---------------------------------------------------------------------------------------

function distReferenceChecks() {
  heading('Absolute root references in dist/');
  for (const entry of ['index.html', 'admin/index.html', 'lite/index.html']) {
    const html = readFileSync(resolve(distDir, entry), 'utf8');
    // Under a prefix a root "/assets/" URL misses the site; at the root it is the correct URL.
    // A "/src/" reference is wrong everywhere: it means the source entry shipped instead of a
    // build, which is exactly what a white screen on the live domain looked like.
    const badRe = prefix ? /["'(=]\s*(\/(?:assets|src)\/[^"')\s>]*)/g : /["'(=]\s*(\/src\/[^"')\s>]*)/g;
    const bad = [...html.matchAll(badRe)].map((m) => m[1]);
    const rootRefs = [...html.matchAll(/\b(?:src|href)=["'](\/[^"']*)["']/g)]
      .map((m) => m[1])
      .filter((u) => !u.startsWith(`${prefix}/`));
    check(bad.length === 0, prefix ? `dist/${entry}: no "/assets/" or "/src/" references` : `dist/${entry}: no "/src/" references (a build, not the source entry)`, bad.length ? bad.join(', ') : 'none');
    check(rootRefs.length === 0, `dist/${entry}: every absolute URL starts with ${prefix}/`, rootRefs.length ? rootRefs.join(', ') : 'none');
  }
  const assetsDir = resolve(distDir, 'assets');
  const cssFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.css')) : [];
  const cssBad = [];
  for (const f of cssFiles) {
    const css = readFileSync(resolve(assetsDir, f), 'utf8');
    for (const m of css.matchAll(/url\(\s*["']?(\/(?!\/)[^"')]*)["']?\s*\)/g)) {
      if (!m[1].startsWith(`${prefix}/`)) cssBad.push(`${f}: ${m[1]}`);
    }
  }
  check(cssBad.length === 0, `dist/assets/*.css: no absolute url(/…) references`, cssBad.length ? cssBad.join(', ') : `${cssFiles.length} file(s) clean`);
}

// ---------------------------------------------------------------------------------------
// 6. Browser checks
// ---------------------------------------------------------------------------------------

async function browserChecks() {
  heading('Browser (headless Chromium)');
  mkdirSync(outDir, { recursive: true });
  // The github.io hostname resolves to the local project-site server. Real HTTP, real 301s:
  // request routing (page.route) cannot be used here because Playwright does not route the
  // follow-up request of a redirect, which would leak to the real github.io.
  browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=default',
      '--ignore-gpu-blocklist',
      `--host-resolver-rules=MAP ${PAGES_HOST} 127.0.0.1`,
    ],
  });

  // Context A: http://<check>.github.io:<port>/<prefix>/ — the project-site style.
  const pagesContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  // Context B: the domain root (custom-domain / CNAME style). Hostname is not github.io.
  const rootContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  const P = `${PAGES_ORIGIN}${basePath}`;
  const R = `${rootServer.origin}/`;

  const scenarios = [
    {
      id: 'home',
      context: pagesContext,
      url: `${P}?nointro#/`,
      overlay: '.home-menu[data-visible="true"]',
      label: 'home menu',
    },
    {
      id: 'system',
      context: pagesContext,
      url: `${P}?nointro#/projects`,
      overlay: '.system-hud[data-visible="true"]',
      label: 'system hud',
    },
    {
      id: 'project',
      context: pagesContext,
      url: `${P}?nointro#/projects/sweet-moment`,
      overlay: '.project-panel[data-visible="true"]',
      label: 'project panel',
    },
    {
      id: 'project-devmode-state',
      context: pagesContext,
      url: `${P}?nointro&dev=true#/projects/sweet-moment`,
      overlay: '.project-panel[data-visible="true"]',
      label: 'project panel',
      state: { scene: 'project', selectedProjectId: 'sweet-moment' },
    },
    {
      id: 'lite',
      context: pagesContext,
      url: `${P}lite/`,
      overlay: '.lite__projects',
      label: 'simplified portfolio',
    },
    {
      id: 'admin',
      context: pagesContext,
      url: `${P}admin/`,
      admin: true,
    },
    {
      id: 'admin-no-slash',
      context: pagesContext,
      url: `${P}admin`,
      admin: true,
      finalUrl: `${P}admin/`,
      expectRedirect: 301,
    },
    {
      id: 'typo-project-site',
      context: pagesContext,
      url: `${P}no-such-page/deeper?nointro#/projects`,
      overlay: '.system-hud[data-visible="true"]',
      label: 'system hud',
      finalUrl: `${P}?nointro#/projects`,
      expect404: `${P}no-such-page/deeper?nointro`,
      note: '404.html derives the base from the first path segment on a github.io host',
    },
    {
      id: 'typo-custom-domain',
      context: rootContext,
      url: `${R}no-such-page?nointro#/about`,
      overlay: '.mc[data-visible="true"]',
      label: 'mission computer',
      finalUrl: `${R}?nointro#/about`,
      expect404: `${R}no-such-page?nointro`,
      note: '404.html uses "/" as the base when the host is not github.io',
    },
    {
      id: 'admin-no-slash-custom-domain',
      context: rootContext,
      url: `${R}admin`,
      admin: true,
      finalUrl: `${R}admin/`,
      expect404: `${R}admin`,
      note: 'no server-side directory redirect here, so 404.html has to add the slash',
    },
  ];

  for (const s of scenarios) {
    if (!prefix && s.id === 'typo-project-site') {
      // 404.html derives the base from the first path segment on a github.io host — a
      // project-site rule. At the root the custom-domain scenario below is the real one.
      console.log(`  (root mode: skipping ${s.id}, a project-site-only rule)`);
      continue;
    }
    s.server = s.context === pagesContext ? pagesServer : rootServer;
    await runScenario(s);
  }
  await pagesContext.close();
  await rootContext.close();
}

async function runScenario(s) {
  const page = await s.context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];
  const redirects = [];
  const notFound = [];
  const isThirdParty = (url) => {
    try {
      const h = new URL(url).hostname;
      return h !== PAGES_HOST && h !== '127.0.0.1' && h !== 'localhost';
    } catch {
      return false;
    }
  };

  page.on('console', (m) => {
    const text = m.text();
    if (text.includes('THREE.Clock')) return; // upstream deprecation notice, accepted
    const from = m.location()?.url ?? '';
    if (m.type() === 'error') {
      // The missing document of a 404.html scenario is expected to answer 404.
      if (/^Failed to load resource/.test(text) && s.expect404 && from.split('#')[0].startsWith(s.expect404)) return;
      // A third-party resource that cannot be reached (offline CI) is not a deployment bug.
      if (/^Failed to load resource/.test(text) && isThirdParty(from)) consoleWarnings.push(`${text} (${from})`);
      else consoleErrors.push(`${text}${from ? ` (${from})` : ''}`.slice(0, 300));
    } else if (m.type() === 'warning') {
      consoleWarnings.push(text.slice(0, 200));
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on('response', (r) => {
    const status = r.status();
    if (status >= 300 && status < 400) redirects.push(`${status} ${r.url()} → ${r.headers().location ?? '?'}`);
    if (status === 404 && s.expect404 && r.url().startsWith(s.expect404)) return notFound.push(r.url());
    if (status >= 400) failedRequests.push(`${status} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    const line = `${r.failure()?.errorText ?? 'failed'} ${r.url()}`;
    if (isThirdParty(r.url())) consoleWarnings.push(`request failed: ${line}`);
    else failedRequests.push(line);
  });

  const name = `${s.id}: ${s.url.replace(PAGES_ORIGIN, '').replace(rootServer.origin, '')}`;
  const logStart = s.server.log.length;
  try {
    // A 404.html redirect replaces the document while it is still parsing, so wait for the
    // commit only and let the final URL + load state settle afterwards.
    await page.goto(s.url, { waitUntil: s.finalUrl ? 'commit' : 'load', timeout: 60_000 });

    if (s.finalUrl) {
      await page.waitForURL((u) => u.href === s.finalUrl, { timeout: 15_000 }).catch(() => {});
      await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});
      const current = page.url();
      check(current === s.finalUrl, `${name} → lands on ${s.finalUrl.replace(PAGES_ORIGIN, '').replace(rootServer.origin, '')}`, current === s.finalUrl ? s.note ?? '' : `landed on ${current}`);
    }
    if (s.expectRedirect) {
      const path = new URL(s.url).pathname;
      const served = s.server.log.slice(logStart).filter((l) => l.status === s.expectRedirect && l.url.split('?')[0] === path);
      const seen = served.length > 0 || redirects.some((r) => r.startsWith(`${s.expectRedirect} ${s.url}`));
      check(seen, `${name} → server answered ${s.expectRedirect} and the browser followed it`, seen ? `${s.expectRedirect} ${path} → ${path}/` : 'no redirect observed');
    }
    if (s.expect404) {
      check(notFound.length > 0, `${name} → the missing path answered 404 (public/404.html) before redirecting`, notFound[0] ?? 'no 404 observed');
    }

    if (s.overlay) {
      await page.waitForSelector(s.overlay, { state: 'visible', timeout: OVERLAY_TIMEOUT });
      await page.waitForTimeout(1500); // let late-loading textures/media (and the overlay fade) settle so their errors are caught
      pass(`${name} → ${s.label} visible`, s.overlay);
    }
    if (s.admin) {
      await page.waitForFunction(
        () => {
          const el = document.getElementById('admin-root');
          return !!el && el.childElementCount > 0 && (el.textContent ?? '').trim().length > 0;
        },
        undefined,
        { timeout: OVERLAY_TIMEOUT },
      );
      const summary = await page.evaluate(() => {
        const el = document.getElementById('admin-root');
        return `${el.childElementCount} child element(s), "${(el.textContent ?? '').trim().slice(0, 60)}"`;
      });
      pass(`${name} → #admin-root has content`, summary);
    }
    if (s.state) {
      const state = await page.evaluate(() => {
        const hook = window.__astro;
        if (!hook) return null;
        const st = hook.useApp.getState();
        return { scene: st.scene, selectedProjectId: st.selectedProjectId, projects: hook.portfolio.data.projects.length };
      });
      const ok = !!state && state.scene === s.state.scene && state.selectedProjectId === s.state.selectedProjectId;
      check(ok, `${name} → window.__astro state`, state ? JSON.stringify(state) : 'window.__astro not exposed with ?dev=true');
    }
  } catch (e) {
    fail(`${name}`, String(e?.message ?? e).split('\n')[0].slice(0, 300));
  }

  const shot = resolve(outDir, `${s.id}.png`);
  await page.screenshot({ path: shot }).catch(() => {});

  check(consoleErrors.length === 0, `${name} → no console/page errors`, consoleErrors.length ? consoleErrors.join(' | ') : 'clean');
  check(failedRequests.length === 0, `${name} → no failed requests (status ≥ 400)`, failedRequests.length ? failedRequests.join(' | ') : 'clean');
  if (consoleWarnings.length) warn(`${name} → console warnings`, consoleWarnings.join(' | ').slice(0, 400));
  await page.close();
}

// ---------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------

/**
 * Leave `dist/` built for the root again.
 *
 * This script builds with a sub-path base to simulate a project site. Left that way, the
 * next thing to serve `dist/` from the root — the capture script, `npm run preview` — gets
 * 404s on every asset, which reads as a broken site rather than as leftover state.
 */
function restoreRootBuild() {
  if (skipBuild || !prefix) return;
  heading('Restoring dist/ for root hosting');
  const build = spawnSync('npm run build', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, VITE_BASE_PATH: '/', FORCE_COLOR: '0' },
  });
  console.log(build.status === 0 ? '  dist/ rebuilt with base "/"' : '  WARNING: rebuild failed; run `npm run build` before serving dist/');
}

function finish() {
  restoreRootBuild();
  const failed = results.filter((r) => r.status === 'FAIL');
  const warned = results.filter((r) => r.status === 'WARN');
  const passed = results.filter((r) => r.status === 'PASS');
  console.log('\n== Summary');
  console.log(`  ${passed.length} passed, ${failed.length} failed, ${warned.length} warning(s)`);
  if (failed.length) {
    console.log('\n  Failures:');
    for (const f of failed) console.log(`   - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  console.log(`\n  Screenshots: ${outDir}`);
  console.log(failed.length ? '\nPAGES CHECK: FAIL' : '\nPAGES CHECK: PASS');
  process.exit(failed.length ? 1 : 0);
}

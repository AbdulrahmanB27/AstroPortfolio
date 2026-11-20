# Abdulrahman Bahjat — Space Portfolio

An interactive portfolio presented as a small star system. Visitors meet the engineer on a rocky home
planet, read his background on the rocket's mission computer, launch, and explore one planet per project.

**Meet the engineer → Prepare for the mission → Launch → Explore the work.**

Fully static: no backend, no database, no CDN at runtime. Built with Vite, React, TypeScript,
three.js / React Three Fiber, GSAP and Zustand. Every model is authored by script in Blender.

## Run it

```bash
npm install
npm run dev          # http://localhost:5180  (studio at /admin/)
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ locally
```

## Deploy to GitHub Pages

The build uses relative URLs (`base: './'`), so the same `dist/` works at `https://<user>.github.io/`
and at `https://<user>.github.io/<repo>/` with no configuration and no rewrites.

- **Recommended:** push the repository to GitHub, then *Settings → Pages → Source: GitHub Actions*.
  `.github/workflows/pages.yml` builds and publishes `dist/` on every push to `main`.
- **Manual:** run `npm run build` and publish the contents of `dist/` to the Pages branch.

`/admin` is a real folder with its own `index.html`, so `…/admin` opens directly on Pages.
Unknown paths get `404.html`, which links back to the portfolio.

## Edit the content (no code)

All content lives in one file: [`public/data/portfolio.json`](public/data/portfolio.json).

1. Open `/admin/` on the deployed site (or locally). It loads the **currently deployed** JSON automatically.
2. Edit profile, education, experience, skills, resume, contact, projects, planet looks and visual settings.
   Edits autosave as a **local draft in your browser** and never touch the deployed site.
   *Preview draft in the site* opens the site with your draft applied.
3. Fix anything the validation panel flags, then **Export portfolio.json**.
4. Replace `public/data/portfolio.json` in the repository with the exported file, commit and push.
   GitHub Pages rebuilds; nothing else needs to change. A new project entry becomes a new planet.

The studio is public and has no sign-in. It cannot change the live site; it only produces a file.

**Resume PDF:** put the file in `public/` (for example `public/resume.pdf`) and set *Resume → PDF path* to
`resume.pdf`. Until a PDF is set, the Resume screen offers *Print / save as PDF*, generated from the same data.

**Project images:** put them in `public/media/` and reference them as `media/<file>`.
`node tools/qa/snap-site.mjs <url> public/media/<name>.webp` captures a real screenshot of a live site.

Schema, defaults and validation: [`src/content/schema.ts`](src/content/schema.ts) (shared by site and studio).

## How to experience it

- **First minute:** a short approach to the home planet (any key or *Skip* ends it), then the menu.
- **About / Skills / Resume / Contact:** walk up to the lander, the hatch opens, the mission computer wakes.
  *Exit cockpit* or `Esc` returns to the surface.
- **Projects:** launch into the system. Drag to turn it, wheel or pinch to zoom, pick a planet or its label
  (phones also get a project index). A survey probe brings up the project display. `Esc` steps back.
- **Home:** the *Home planet* button, the home planet itself, or the star.

### Hidden extras (not linked from the UI)

| Trigger | What happens |
|---|---|
| `Alt`- or `Shift`-click **Projects** | Alternate launch: the astronaut is tied to a landing leg |
| `↑ ↑ ↓ ↓ ← →` in the system view | Flight mode: hold the mouse / touch or use WASD, `Shift` boosts, `Esc` leaves |
| Fly far beyond the outer orbit | A station appears; reaching it unlocks a second ship |
| `Shift` + `G` | Schematic radial grid on / off (default is set in the studio) |
| Type `admin` | Opens the content studio |
| Look up-right of the star from the surface | A faint "A B" constellation |

## Project layout

```
index.html, admin/index.html     two static entry points
public/data/portfolio.json       the content (the only file you edit to change the site)
public/models, textures, draco   Blender-built GLBs (Draco), baked cockpit light maps, local decoder
src/content/                     schema, validation, loader
src/state/                       store, director (every transition), keyboard shortcuts
src/world/                       scene sets, shots (authored cameras), shaders
src/ui/                          DOM: menu, mission computer, project display, labels
src/admin/                       content studio
tools/blender/                   one build script per asset (headless Blender 5.x)
tools/assets/compress.mjs        Draco compression of public/models
tools/qa/                        screenshot harness and automated tests
tasks/                           plan, lessons, verification evidence
_legacy/                         the previous implementation, kept for reference only
```

### Rebuilding 3D assets

```bash
blender -b --factory-startup -P tools/blender/build_rocket.py
blender -b --factory-startup -P tools/blender/build_astronaut.py
blender -b --factory-startup -P tools/blender/build_terrain.py
blender -b --factory-startup -P tools/blender/build_cockpit.py -- --res 4096 --spp 96 --gpu   # bakes lighting
blender -b --factory-startup -P tools/blender/build_probe.py
blender -b --factory-startup -P tools/blender/build_secrets.py
npm run assets:compress
```

After a cockpit bake, regenerate the phone-size light maps (2048²) from the 4096² ones.
The cockpit's display housing is exported as its own node (`Monitor`) so the site can narrow it on phones.

## Tests and QA

```bash
npm run typecheck
npm run qa:schema      # validates public/data/portfolio.json against the schema
npm run qa:capture     # locked screenshots at 1920x1080, 1366x768, 390x844 -> tasks/captures/
npm run qa:journey     # full click-through with real input (add -- --size phone | --reduced)
npm run qa:secrets     # hidden features work and stay out of the normal flow
npm run qa:admin       # studio round trip on a production build served like GitHub Pages
npm run qa:perf        # frame-rate measurement (run on mains power, with nothing else using the GPU)
node tools/qa/frametrace.mjs "view=home"    # per-second frame pacing and canvas size for one view
node tools/qa/shader-links.mjs [--desktop]  # which shaders link slowly on a first visit, and when
node tools/qa/panels.mjs [idFilter]         # every project display: content reachable from the top, images load
```

The dev server must be running for capture / journey / secrets / perf / panels. `qa:admin` builds its own copy.

Read-only test states (no privileges, they only pick a scene): `?view=home`, `?view=cockpit&tab=resume`,
`?view=orbit`, `?view=project&project=<id>`, `?view=intro&t=3`, `?view=launch&t=2.5`, plus `&n=12` to stress
the system with synthetic projects. Views of the hidden features exist only in dev and `VITE_QA=1` builds.

Evidence for what was verified, and what was not, is in [`tasks/verification.md`](tasks/verification.md).

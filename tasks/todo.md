# Space Portfolio — Rebuild Plan (2026-11-17)

Full visual rebuild from scratch. The July implementation is archived in `_legacy/`
(procedural JSX primitives, placeholder content). Brief: `Space_Portfolio_One_Shot_Super_Prompt.md`.

**Narrative:** Meet the engineer → Prepare for the mission → Launch → Explore the work.

---

## 1. Audit summary (Phase 0)

- Old stack: Vite 7 + React 19 (JS) + R3F 9 + drei 10 + GSAP + Zustand. ~6k lines, every asset a
  three.js primitive with default materials. No reference images in the repo. Not a git repo.
- Old content (`src/data/data.json`) is invented placeholder (wrong university, fake jobs, fake GPA,
  unverified links). `public/resume.pdf` was a 37-byte dummy. None of it is reused.
- Features to preserve: 5-item home menu, cockpit personal console, launch cutscene, 3D orbit of
  project planets, project view, star click, `/admin` editor + JSON export + local drafts,
  schematic grid (Shift+G), typed `admin` shortcut, ↑↑↓↓←→ flight mode, Death-Star-like discovery →
  Falcon-like ship, Alt+launch tether gag, AB constellation.
- Deliberately dropped because the brief rejects them: the 2D "Simplified View" page and the
  full-screen "Star Core" dashboard (star click now returns to the home planet).
- Tools actually available: Blender 5.3 headless (Steam install, Cycles CPU + Intel oneAPI),
  Codex CLI (image generation, for concept references), Playwright + system Chrome, Claude subagents.
  Blender MCP live-session server is NOT connected → all modelling is scripted headless.
- Machine for every FPS claim: Intel Core Ultra 7 258V, Intel Arc 140V integrated GPU, 32 GB.

## 2. Architecture

- **Stack:** Vite 7, React 19, TypeScript, three 0.182, @react-three/fiber 9, drei 10, GSAP 3,
  Zustand 5, postprocessing. Fonts self-hosted through `@fontsource` (no runtime CDN).
- **Two static entries:** `index.html` (experience) and `admin/index.html` (content studio).
  `base: './'` → works at any GitHub Pages path with no rewrites. `404.html` bounces to the site.
- **Content:** single `public/data/portfolio.json`, fetched at runtime, normalised + validated by
  `src/content/schema.ts` (shared by site and admin). No content in components.
- **One world, true scale (metres):** landing site at the origin on a 150 m-radius home planet;
  star 2.4 km away; project planets on orbits 4–17 km. Launch and star-return are therefore real
  continuous camera moves, not scene swaps. Camera near/far follow altitude.
- **Sets:** `Sky` (stars, AB constellation, nebula) · `Star` · `HomeSet` (terrain, astronaut, rocket)
  · `CockpitSet` (baked interior, sits inside the rocket capsule) · `SystemSet` (orbits, planets,
  grid, labels) · `Probe` (project terminal) · `Flight` (ship, station). Sets mount/hide by mode so
  nothing unseen animates.
- **State machine (`src/state/director.ts`):** modes `boot → intro → home ⇄ cockpit`,
  `home → launch → orbit ⇄ project`, `orbit → home`, `orbit ⇄ flight`. Every transition is one GSAP
  timeline with a single owner, an input lock, skip (`progress(1)`), and a reduced-motion variant.
  Per-frame data never goes through React/Zustand (lesson from July).
- **Camera:** one rig; every hero shot is an authored pose with three aspect variants
  (wide ≥1.5, standard, portrait <0.8) in `src/world/shots.ts`.
- **In-world screens:** cockpit console and probe display are real DOM, positioned every frame on
  the projected rectangle of the physical screen mesh while the camera faces it head-on → crisp,
  accessible, scrollable text that is still bolted to the hardware.
- **Assets:** `tools/blender/*.py` build every model headless and export GLB to `public/models/`.
  Cockpit lighting is baked in Cycles to one atlas; hero props carry baked AO in vertex colours.
- **QA hooks:** `?view=home|cockpit|orbit|project` `&tab=` `&project=` `&t=` `&seed=` `&n=<4|8|12>`
  (synthetic project count). `view=flight|deathstar` only in dev or `VITE_QA=1` builds.
  `tools/qa/capture.mjs` shoots every locked state at 1920×1080, 1366×768, 390×844.

## 3. Art bible (locked)

| Surface | Material decision |
|---|---|
| Space | near-black `#05060a`, sparse stars with slight temperature variation, one faint warm-grey nebula band |
| Star | HDR emissive granulated surface, white-yellow core `#fff3cf` → amber limb `#ffb23e`, layered soft corona, bloom tuned so adjacent text/geometry survive |
| Home rock | matte slate/charcoal `#3b3f47`→`#22252b`, fine regolith + boulders, baked AO, raking warm key, cool fill so backlit faces never go to black |
| Rocket | off-white ceramic panels `#d9d6cf` (semi-matte), graphite engine section `#2a2d33`, brushed metal legs, dark glazing, 3–4 tiny amber marker lights |
| Astronaut | off-white fabric with ribbed graphite joints, gold-tinted visor (glossy), graphite backpack, amber chest light |
| Cockpit | graphite/naval painted metal, ribbed hull, padded seat, amber + cool-white practicals, warm star spill through the window, fully baked |
| Screens | dark warm-black glass `#0b0d10`, off-white type `#ece7dc`, amber accent `#f2b45a`; no neon blue |
| Planets | muted individually designed worlds (rock, banded gas, ice, desert, ocean, ember, moon), lit by the star, dark far side, thin rim |
| Orbits | hair-thin warm-grey lines, low opacity, never brighter than a label |
| UI type | Michroma (wide caps, identity + small labels) / Manrope (everything readable). Off-white on dark, amber accent only |

Shape language: clean, chamfered, intentional proportions; no default primitives, no toon outlines.
UI: almost none persistent. Plain language. No fake coordinates or dashboards.

## 4. Hero shots (locked camera states)

1. **HOME** — astronaut back-left foreground, star centre over curved horizon, rocket right-of-centre
   mid-ground, identity top-left, menu right column. Portrait: star upper-middle, astronaut
   lower-left, rocket lower-right, menu stacked low.
2. **COCKPIT** — from behind the seat; ribs, ceiling, floor visible; window with star above the
   console; main screen dominant and readable. Portrait: pushed in so the screen spans the width.
3. **ORBIT** — three-quarter view from above the plane, star centre, readable ellipses, labelled
   planets, system fits with margin at all three sizes.
4. **PROJECT** — planet large on the left (top on portrait), survey probe with display on the right
   (below on portrait).
5. **FLIGHT** — chase view above the plane, ship readable, station only discernible far out.

## 5. Phases and gates

- [x] **P0** Audit, plan, scaffold, capture harness, Blender pipeline proven end-to-end
- [x] **P1** Home hero: terrain, astronaut, rocket, star, sky, menu (critique passes p0-p3, then judge rounds)
- [x] **P2** Cockpit: baked room, console UI (About/Skills/Resume/Contact)
- [x] **P3** Opening cinematic, cockpit in/out, launch (+ skip, reduced motion, rapid input)
- [x] **P4** Orbit system, labels, planets, probe project view, star return, 4/8/12 scaling
- [x] **P5** Content JSON + `/admin` studio (auto-load, validate, draft, export, grid) + Pages build
- [x] **P6** Secrets: flight, station, alt ship, tether launch, AB constellation
- [ ] **P7** Gauntlet: functional matrix, perf and production build are done and green; the independent
      visual judge has NOT passed the gate below (scores per round are in `tasks/verification.md`)

Gate for each visual phase: rubric average ≥ 4.3, nothing below 4, judged from screenshots.

## 6. Test plan

- Automated: `npm run typecheck`, `npm run build`, `npm run qa:capture` (screenshots + console
  error collection), schema unit checks via `npm run qa:schema`.
- Manual/browser: full journey, rapid clicks during transitions, skip, reduced motion, resize,
  keyboard focus order, touch (mobile emulation), cold-cache load, admin round trip.
- Evidence goes to `tasks/verification.md`; nothing is claimed there that was not run.

## 7. Known risks

- Integrated GPU: bloom + large star shader + shadows must stay inside 60 fps → baked lighting,
  frozen shadow map, DPR cap, half-res bloom.
- Scripted Blender modelling quality → preview renders reviewed before any GLB ships.
- True-scale world → depth precision; mitigated by altitude-driven near/far.
- DOM-on-screen alignment on phones → dedicated portrait shots.
- Real content is thin (one verified project, no resume PDF) → clearly marked placeholders.

## 8. Review (2026-11-19)

- Built: everything in phases P0-P6; see `README.md` for what exists and how to run it.
- Verified: see the Phase 7 table in `tasks/verification.md` (all automated checks green on the last code state).
- Not achieved: the P7 visual gate. Five independent judge rounds ended at Home 3.81, Cockpit 3.31, Orbit 3.44,
  Project 3.81 against a bar of 4.3 with nothing below 4.
- Next work, in the order the last judge report ranks it:
  1. Phone cockpit and phone project shots that keep the screen mounts in frame (likely an upright console
     screen in the cockpit model, which means a rebake).
  2. Hero-scale materials: home terrain strata instead of repeated slab stacks, finer star granulation, gas
     giant storms and band structure, less uniform crater stamping, restrained lava glow.
  3. Orbit label hierarchy: clearer leader endpoints, brighter secondary text, orbit strokes broken behind labels.
  4. A visible landmark through the cockpit exit and the middle of the launch.
  5. Cockpit detail pass (key legends, panel seams, fasteners) with more warm window spill, then rebake.
- Owner content still missing: real project entries, education and experience details, a resume PDF.

## 9. Art pass review (2026-11-19)

- Done from the list above: items 1-5 (phone bezels via a narrower monitor, terrain, planets and star, label
  leaders, hatch and launch landmarks, cockpit detail and rebake). Details and evidence: "Art pass" in
  `tasks/verification.md`.
- Still open:
  1. ~~Re-measure frame rates on mains power with the app's preview pane closed.~~ Done: 59.6-60 fps in
     every view; see the art-pass section of `tasks/verification.md`.
  2. The visual gate is still not met; the judge's remaining themes are the phone project probe being cropped,
     the dense phone system map at 12 projects, the flat lit hatch panel, and planet/terrain craft generally.
  3. A stray stencil ("THR") floats beside the throttle on the cockpit deck; fixing it needs a rebake.
  4. Owner content: real projects, education and experience details, resume PDF.


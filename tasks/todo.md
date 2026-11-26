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


## 10. Content port from the live site (2026-11-19)

- [x] Ported the owner's real content from `main` of github.com/AbdulrahmanB27/AstroPortfolio (the live site at
  abdulrahmanbahjat.com) into `public/data/portfolio.json`: profile, education, experience and activities,
  skills, contact links, and seven projects (Sweet Moment Chocolates, MyRoom, MyKitchen, PrayerLock,
  AstroPortfolio, VEX Robotics, Minecraft Adhan Clock).
- [x] Copied `public/resume/Abdulrahman-Bahjat-Resume.pdf`, `public/CNAME` and the project images
  (`public/media/projects/`) byte for byte from `main`.
- [x] Mapping: old `tagline` -> `summary`; old `summary` + `description` + `process` -> `description`;
  `technologies` -> `tags`; activities folded into `experience`. The six art-passed planet slots (lane, phase,
  type) were kept and re-assigned by fit; AstroPortfolio is a new `moon` body sharing lane 6.
- [x] PrayerLock was `placeholder: true` on `main` (no screenshots or links yet). Set to false here because the
  rebuild prints "Placeholder" on its orbit label and hides it from the resume; the text is the owner's own.
- [x] AstroPortfolio screenshots on `main` showed the previous site; replaced with fresh captures of this build.
- [x] `tools/qa/shots.json`: `project_sparse` now opens PrayerLock (the old placeholder entry is gone).
- [x] Real entries are long enough to overflow the probe display, which exposed a clipping bug: fixed in
  `src/ui/ui.css` (`align-content: safe center`; image column anchored to the top). New check
  `tools/qa/panels.mjs`: 7 projects x 3 sizes, all reachable.
- [x] `journey.mjs` and `admin-roundtrip.mjs` no longer hardcode six projects or an exact URL string.
- [x] Verified: qa:schema 0 errors / 0 warnings; build; qa:journey 20/20; qa:admin 15/15; captures `port`,
  `port2`, `port3` with 0 console errors.

## 11. Owner feedback round (2026-11-25)

The owner reported four problems. All four are addressed; evidence is in the matching section of
`tasks/verification.md`.

- [x] **"The sun does not look good."** New star: luminous golden core darkening to deep orange at the limb,
  fine convection cells, a few small sunspot groups with penumbrae, corona with streamers, flame tongues and
  arches. Built on a pre-generated noise texture (`src/world/starNoise.ts`), which is also cheaper to draw.
- [x] **"Visuals are glitched on Firefox."** Reproduced with the installed Firefox: freezes of 1 to 1.7 s in the
  middle of transitions. Cause and fix: see lessons (light count recompiles; shadow map refresh). All
  transitions now run at 60 fps in Firefox with no shader linking mid-transition. I could not look at the
  owner's own Firefox window (the access request was not answered), so anything beyond what the tests show is
  unknown.
- [x] **"Screens are too small to be usable; scrolling should zoom in."** The establishing shots are a little
  closer, and both displays now have a reading mode: scrolling, clicking the display or its zoom button pushes
  the camera in until the display fills the view (about 3x the area on a laptop, 20 px text); Escape, clicking
  outside or scrolling up at the top pulls back. On phones the reading panel grows to the full height.
- [x] **"Going back to the home planet puts the camera under the planet."** The return path is rebuilt (see
  lessons). From any turned, tilted or zoomed view the camera now swings round on its orbit and comes down
  from above; longest frame 19 ms in Chrome, 40 ms in Firefox.

Not done / open:
- The owner's Firefox was not observed directly; ask them to confirm.
- Committed to branch `claude/portfolio-rebuild` on 2026-11-26, not pushed.
- Safari and real phones remain untested.



## 12. Owner feedback round 2 (2026-11-26)

The owner asked for five changes and a check of the phone layout. All done; evidence is in the matching
section of `tasks/verification.md`.

- [x] **Home menu:** three destinations instead of five: "Launch into orbit" (projects), "Enter the cockpit"
  (About, Skills, Resume, Contact on the mission computer; it reopens on the page last read) and "Simple view".
  Each shows its hint line all the time.
- [x] **Simple view (new):** the whole portfolio as one plain scrolling page (`src/ui/SimpleView.tsx`), laid
  over the scene, which stops drawing while it is open. It has its own address (`#simple`): it opens straight
  from a link without playing the opening shot, and Esc, its Back button or the browser's Back closes it.
- [x] **Displays:** the zoom icon is gone. From a distance a display is a preview that does not scroll; the
  first scroll (or tap, click or swipe) only zooms, and the page starts to move once the display has arrived.
  The cue under a display is now a fixed status line that always says what scrolling will do.
- [x] **Project view:** a click or tap on empty space steps back (zooms out first if zoomed, then returns to
  the system view). A click on the planet being looked at does nothing. The Back pill stays.
- [x] **System view:** the "Home planet" pill is removed. The hint line reads "Select a planet to view its
  project · Select the home planet to land"; on phones the project list header says "Tap Home on the map to
  land". The home planet's label is now always placed, even when the map is crowded.
- [x] **Flight mode:** the star, the planets, their moons, the home planet and the station are solid: the ship
  slides past on a glancing touch and is stopped and pushed back on a head-on one, with a small ring of light
  and a short shudder. The chase camera rides over bodies instead of passing through them. Boosting leaves a
  trail from each engine (two streaks on the scout, one band on the freighter) and opens the view slightly.
- [x] **Phones:** new test `tools/qa/phone.mjs` goes through every state with real touch input at six sizes.
  Found and fixed while doing it: the simple view's section links shifted the whole interface; "Scroll for
  more" could show with nothing more to scroll (and vanish at the first touch); the Home label could be
  hidden in landscape; on tablet-shaped windows the home menu sat on top of the lander (it now drops onto the
  ground at the lower right for windows narrower than 3:2). Pulling down at the top of a zoomed display zooms
  back out on touch screens.
- [x] QA scripts updated for the new controls; whole regression run in Chrome and Firefox.

Not done / open:
- Tested on emulated phones and tablets in Chrome only: no real phone, no Safari.
- Flight mode still cannot be unlocked on a phone (the code is typed on a keyboard), and there is no boost on
  touch (Shift only).
- Project `CLAUDE.md` still describes the five-item menu and "click star -> personal section".
- Committed to branch `claude/portfolio-rebuild` on 2026-11-26, not pushed.

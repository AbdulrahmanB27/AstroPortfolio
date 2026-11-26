# Lessons Learned

---

## Lesson: Per-frame Zustand Updates Cause Continuous Re-renders

**Problem:**
`Planet.useFrame` called `setPlanetPosition` (a Zustand setter) 60 times/second per planet.
With 5 planets that is 300 Zustand state updates per second, causing every subscribed component to re-render on every frame.

**Root Cause:**
Putting mutable, high-frequency data (world positions) into reactive state (Zustand) is the wrong tool.
Zustand state is for data that should trigger UI re-renders when it changes.
Planet positions in a `useFrame` loop do not need to trigger re-renders.

**Correct Pattern:**
Use a module-level mutable object (`planetRegistry.js`) as a plain JS reference store.
Planet components write to it directly in `useFrame`.
Camera handlers read from it synchronously when needed.
No React subscriptions, no re-renders.

**Rule:**
Never put per-frame 3D data into Zustand. Use a module-level ref or plain object for anything that changes every animation frame.

---

## Lesson: pendingNavTarget Must Be Cleared After Consumption

**Problem:**
After: surface menu → liftoff → orbit → star core → back to orbit,
`pendingNavTarget` was still `'star'`. The `useEffect` in `SceneManager` re-fired
when stage returned to ORBIT, immediately sending the camera back to star core in a loop.

**Root Cause:**
The value was set once (on surface menu click) but never cleared.
The `useEffect` had no guard against re-consumption on subsequent stage changes.

**Correct Pattern:**
Call `setPendingNavTarget(null)` immediately before starting the animation it triggers.
This ensures the value is consumed exactly once regardless of how many times
the stage transitions through ORBIT.

**Rule:**
Any "intent" value set before a multi-step async sequence must be cleared
at the moment it is consumed, not at the end of the sequence.

---

## Lesson: Remove Stale Imports After Refactoring

**Problem:**
`OrbitScene.jsx` imported `STAGE` from the store but did not use it after
`useFlightMode` was extracted to its own hook. Linter flagged it.
`StarCorePanel.jsx` imported `THREE` and `flyCamera` that were never used.

**Root Cause:**
Stale named imports left over after moving logic out of the component.

**Rule:**
After any refactor, scan imports for names no longer referenced in the file and remove them.

---

## Lesson: Stage Transitions Require Explicit Camera Return Animation

**Problem:**
When exiting STAR_CORE or PLANET back to ORBIT, the camera remained at the close-up
position (near the star or planet). The OrbitScene's `useEffect([camera])` only fires on
mount — since OrbitScene never unmounts between ORBIT/STAR_CORE/PLANET transitions,
the camera was never returned to the orbit overview position.

**Root Cause:**
Assuming the scene lifecycle (mount/unmount) would handle camera state. It doesn't —
OrbitScene stays mounted for all three stages so its camera setup effect never re-fires.

**Correct Pattern:**
In `SceneManager`, track `prevStageRef`. When stage transitions to ORBIT from
STAR_CORE or PLANET, explicitly call `flyCamera` back to the orbit position `(0, 55, 20)`.

**Rule:**
Never rely on component mount/unmount to drive camera transitions if the component
remains mounted across multiple stages. Always drive camera explicitly from the stage manager.

---

## Lesson: Easter Egg Key Sequences Should Stop Accumulating After Unlock

**Problem:**
The flight mode key sequence buffer kept accumulating arrow key presses even after
flight mode was already unlocked. Arrow keys used for flight movement would keep
triggering sequence checks unnecessarily.

**Root Cause:**
No guard on the sequence check — it ran on every keydown regardless of state.

**Correct Pattern:**
Wrap the flight sequence logic in `if (!flightModeUnlocked)` so it only runs before the mode is active.

**Rule:**
One-time unlock sequences must be disabled after they fire.

---

## Lesson: Full Store Subscription in useStore() Without Selector

**Problem:**
`StarField.jsx` used `const { visualMode } = useStore()` — destructuring from the full store.
Every Zustand state change (HUD prompts, stage changes, admin open/close) caused StarField to re-render,
even though it only depends on `visualMode`.

**Root Cause:**
Calling `useStore()` without a selector function subscribes to the entire store.
Zustand's selector pattern `useStore((s) => s.visualMode)` only triggers re-renders when that specific slice changes.

**Rule:**
Always use selector functions with Zustand: `useStore((s) => s.field)`, never `useStore()` or `const { field } = useStore()`.

---

## Lesson: Animation Spec Requires Explicit Motion on Static Elements

**Problem:**
The animation spec required distant planets to slowly orbit, distant orbit rings to rotate,
menu items to fade in sequentially, and a camera idle drift on the surface. All of these
were implemented as static renders with no animation.

**Root Cause:**
Static meshes were placed correctly but never given `useFrame` loops for motion.
HTML menu items rendered instantly without staggered CSS transitions.

**Correct Pattern:**
Every visible element in a cinematic scene should have intentional motion, even if minimal.
Wrap groups in `useRef` + `useFrame` with very slow rotation. Use CSS transition-delay for staggered UI reveals.

**Rule:**
When a spec says "slowly orbit" or "subtle drift", always add explicit per-frame animation — never leave 3D elements static.

---

## Lesson: Cockpit Transitions Must Stay In-World

**Problem:**
The About cockpit flow was split between scene-mounted geometry and overlay-style UI/fade behavior, which made the transition feel like a popup instead of entering the rocket interior.

**Root Cause:**
Transition ownership was spread across multiple layers (global scene mounts and UI overlays), so camera choreography and interior reveal were not fully world-space.

**Correct Pattern:**
Keep cockpit transition choreography in one world-space scene controller (`CockpitScene`): animate hatch, move camera through the hatch, power up interior lighting, then reveal a single in-cabin console surface.

**Rule:**
For narrative 3D transitions, avoid fullscreen overlay teleport/fade UX and keep motion/UI integrated with scene meshes and camera paths.

---

## Lesson: Point Light Intensities Must Account for Physical Falloff

**Problem:**
The cockpit interior rendered as a giant blown-out cyan slab. Every surface near a
point light was overexposed into unrecognizability, destroying the entire scene.

**Root Cause:**
three.js r155+ uses physically-correct lighting: point light contribution is
`intensity / distance²`. Interior lights sat 0.2–1 m from surfaces with intensities
of 0.6–2.0, giving effective multipliers of 5–45×. Values that look fine at
room-scale distances (3–10 m) nuke close-quarters interiors.

**Correct Pattern:**
For small interiors, keep point lights ≥0.4 m from the nearest surface and use
intensities in the 0.1–0.5 range (ramped by a power factor). Use material
`emissive` for glow accents instead of cranking light intensity.

**Rule:**
When lighting a scene, estimate `intensity / nearestDistance²` for every point
light — if it is much greater than ~2, the surface will blow out.

---

## Lesson: Nested Interiors Must Hide the Exterior Shell

**Problem:**
Even after fixing lighting, the cockpit view was filled by a huge pale surface:
the rocket's own exterior hull. The interior set (2.8 m wide) is far larger than
the rocket model (~1 m diameter) it is nominally "inside", so the camera inside
the interior was simultaneously inside/behind the hull meshes.

**Root Cause:**
Two mutually-exclusive representations (small exterior prop, large interior set)
were rendered at the same time at the same origin.

**Correct Pattern:**
Treat exterior and interior as swappable stage props: hide the exterior
(`showCraft={!cockpitVisible}`) at the moment the entry animation reveals the
interior, and restore it on exit.

**Rule:**
When an interior set is larger than its exterior prop, never render both at once —
swap them at the camera-crossing moment of the transition.

---

## Lesson: Scene Swaps Must Not Leave Stale Duplicate Props

**Problem:**
During liftoff, two rockets were visible: the animated `RisingRocket` ascending and
the static `Spacecraft` still parked on the ground. The `showCraft={!altMode}` flag
was inverted — it kept the static craft in normal mode, exactly when the animated
replacement was also rendered.

**Root Cause:**
A replacement prop (animated rocket) was added without removing the original in the
same code path, and the hide flag was reasoned about backwards.

**Rule:**
When one scene renders another scene with a "replacement" prop (animated stand-in),
the original must be hidden in *all* modes where the stand-in exists — write the
flag from the stand-in's perspective (`showCraft={false}` because RisingRocket
always renders), not from the mode's.

---

## Lesson: drei Html Defaults Render Above All Fixed UI

**Problem:**
Planet name labels floated on top of the Star Core and Project panels
(e.g. "AUTO TURRET SENTRY" overlapping the About panel).

**Root Cause:**
drei's `<Html>` assigns z-index from its default `zIndexRange` `[16777271, 0]` —
astronomically higher than the app's fixed-position UI (zIndex 20–100).

**Rule:**
Always pass an explicit `zIndexRange` to drei `<Html>` (e.g. `[20, 0]`) so
in-world labels sit *below* HUD/panel chrome.

---

## Lesson: Backlit Terrain Needs a Fill Light or It Reads as Holes

**Problem:**
A dune hemisphere placed between the camera and the horizon star rendered as a
pitch-black blob "hole" in front of the sun; crater rings read as floating black
arcs.

**Root Cause:**
The only strong light came from behind the terrain (the star), so camera-facing
faces received no light, and dark matte materials went fully black against a
bright background.

**Correct Pattern:**
Move set-dressing out of the star's sightline, add a faint warm "bounce" fill from
the camera side, and lighten materials that will only ever be seen in silhouette.
For glow shells, use `AdditiveBlending` + `depthWrite={false}` and stacked
decreasing-opacity shells so glows brighten rather than gray-out the sky.

**Rule:**
Any object between the camera and the key light needs either a fill light,
an emissive tint, or relocation — verify silhouettes with a screenshot.

---

# Rebuild lessons (2026-11)

## Lesson: three.js light intensities are physical — "2" is dim
**Problem:** Rim/kicker lights at intensity 1–3 produced no visible rim on props; scenes looked flat and cool.
**Root cause:** Since r155 Lambert output is `albedo × intensity × N·L / π`. Intuition from legacy lighting is ~3× too low.
**Correct pattern:** Budget lights in π-units (a white surface reaches 1.0 at intensity ≈ π) and judge by screenshot, not by number.
**Rule:** When a light "does nothing", compute `albedo × I × N·L / π` before touching anything else.

## Lesson: fill/kicker lights without shadows erase ground shadows
**Problem:** Long dramatic shadows vanished after adding rim kickers.
**Root cause:** Unshadowed lights at ~20° elevation lit the ground more than the shadow-casting key did.
**Correct pattern:** Keep unshadowed accent lights nearly horizontal (≈3°) so they catch vertical faces and edges but contribute almost nothing to flat ground.
**Rule:** Any light that cannot cast shadows must be aimed so it barely touches the main shadow-receiving surface.

## Lesson: refs for DOM anchored to 3D must be callback refs when the element mounts late
**Problem:** The cockpit console never appeared on the physical screen.
**Root cause:** `useEffect(() => bind(ref.current), [])` ran while the component still returned `null` (content not loaded), so nothing was ever registered.
**Rule:** If a component can return `null` on first render, register its elements with a callback ref, never a mount effect.

## Lesson: screen-space derivative bump must be scaled by pixel footprint
**Problem:** Planets rendered as blocky, sparkling mosaics.
**Root cause:** `dFdx/dFdy` bump on high-frequency procedural height is evaluated per 2×2 quad; when one pixel spans a lot of surface the gradient is noise.
**Correct pattern:** Fade relief by `length(dFdx(worldPos)) / radius`, and give smooth bodies (gas giants) zero relief.
**Rule:** Never ship derivative-based bump without a footprint fade.

## Lesson: a bake blocker can be an innocent "glass" mesh
**Problem:** The star-light bake of the cockpit was completely black.
**Root cause:** The window glass box had an opaque glossy material and sat in the opening.
**Rule:** Set `hide_render = True` on glazing/helper meshes before baking; verify with a lights-off preview render first.

## Lesson: gate the load screen on rendered frames, not on mount
**Problem:** Labels and camera were wrong for the first seconds in fresh sessions.
**Root cause:** `sceneReady` fired on mount; the first real frames then stalled on shader compilation with stale camera matrices.
**Rule:** Lift the loader only after N frames have actually been drawn.

## Lesson: long heredocs through the Bash tool break on apostrophes
**Problem:** Multi-line `python - <<'EOF'` / `cat > file <<'EOF'` commands failed with "unexpected EOF".
**Rule:** Write scripts and source files with the Write tool; keep shell heredocs short and apostrophe-free.

## Lesson: verify which CLI binary a tool resolves to
**Problem:** Codex rejected every model.
**Root cause:** The `codex` on PATH was an old CLI; the desktop app bundles a newer one.
**Rule:** When a delegated tool fails on capability, check for a newer bundled binary before giving up on the tool.

## Lesson: never read a baseline back from objects a frame loop also writes
**Problem:** The sun (and all surface lights) randomly went dark between runs; the ground rendered almost black.
**Root cause:** Baseline intensities were captured in a passive `useEffect`; the R3F frame loop sometimes ran first, wrote `0` (baseline not yet known), and the effect then recorded zero as the baseline.
**Correct pattern:** Keep baselines as constants (or `userData` set at creation) and derive per-frame values from them.
**Rule:** A value that a frame loop overwrites must never be the source of truth for its own baseline. Measure pixels when a regression looks "random": numbers exposed that the same URL gave different brightness.

## Lesson: clamp before pow() in shaders
**Problem:** Large black rectangles appeared in launch frames.
**Root cause:** Simplex noise can overshoot [-1, 1]; `pow(negative, x)` is NaN, and the bloom mip chain smears one NaN pixel into a rectangle.
**Rule:** Every `pow()` whose base comes from noise or interpolation gets `clamp(..., 0.0, 1.0)` / `max(..., 0.0)` first.

## Lesson: shader helpers must be inserted into the right stage, and captures must fail on console errors
**Problem:** Planets silently failed to compile (helper pasted into the vertex shader; later `modelMatrix` used in the fragment stage), and my grep filter hid the errors.
**Rule:** After any shader edit run the capture harness and read its error count; it now exits non-zero on real console errors and ignores only the known benign HLSL warnings.

## Lesson: offset a look-at point along the camera, not along a world axis
**Problem:** Raising the phone system map by moving the look-at point along the system Z axis also pushed the map sideways and off the right edge.
**Root cause:** The overview is turned 24 degrees in azimuth, so a world-axis offset is not vertical on screen.
**Correct pattern:** Offset along the camera's own ground-projected direction (`sin(az), 0, cos(az)`), scaled by camera distance so zoom keeps the framing.
**Rule:** Any framing offset is expressed in the camera's basis, never in world axes.

## Lesson: a phone view needs its own layout, not the desktop one made smaller
**Problem:** The phone system view was a small diagram floating between empty bands, with a two-column list whose colour swatches did not identify planets.
**Correct pattern:** Split the screen on purpose: map in the upper part, a one-column numbered list below, and the same numbers as badges on the map.
**Rule:** For every portrait shot decide what fills each third of the screen before tuning the camera.

## Lesson: point sprites without a texture are squares
**Problem:** The departing lander showed as a white square once the point size went above a few pixels.
**Rule:** Any `Points` larger than about 3 px gets a round, soft `map`.

## Lesson: label slots need sides as well as corners
**Problem:** With 12 planets one ringed planet near the star had no label.
**Root cause:** Every candidate position was a corner; a planet boxed in above and below had no free corner.
**Rule:** Keep left/right slots in the candidate list and re-check the 12-project stress capture after any label change.

## Lesson: a capture can look right by coincidence
**Problem:** The flight start looked good beside a big planet, then showed a dark limb after another planet's phase was edited.
**Root cause:** The ship spawned on the night side of the first planet; an unrelated neighbour happened to fill the frame.
**Correct pattern:** Spawn on the sunward side, heading past the lit face, computed from the planet's own position.
**Rule:** After changing content, re-capture every view that depends on body positions.

## Lesson: an emission strength of zero exports as a black emissive colour
**Problem:** The lander's open hatch stayed a black rectangle although the code drove `emissiveIntensity` up.
**Root cause:** The Blender material was authored with emission strength 0 (driven at runtime). glTF stores colour times strength, so the exported emissive colour was black and no intensity could light it.
**Correct pattern:** Set the emissive colour at runtime for any material whose strength is animated, or export it with a non-zero strength.
**Rule:** After wiring a runtime-driven glow, look at it lit at least once in a capture.

## Lesson: do not capture while a GPU bake is running
**Problem:** Screenshot runs timed out and reported a loader error during the cockpit light bake.
**Root cause:** Cycles on the GPU starves the browser's WebGL context on a single integrated GPU.
**Rule:** Queue captures and frame-rate measurements after bakes; use bake time for work that needs no rendering.

## Lesson: on a narrow screen, narrow the hardware instead of cropping it
**Problem:** On phones the cockpit display was pushed in until its bezels left the frame, so the content read as a web panel.
**Correct pattern:** Export the display housing as its own node and scale it in width for portrait; the DOM panel follows the scaled screen mesh, so real bezels stay in view at the same reading size.
**Rule:** When a physical screen cannot fit a viewport, change the prop for that viewport rather than the framing.

## Lesson: lettering in a baked scene should be geometry
**Problem:** Key legends and stencils would be a blur at light-map texel density.
**Correct pattern:** Convert text to thin meshes with their own flat material; each letter bakes to a flat colour and stays crisp at any distance.

## Lesson: to split one part out of a baked mesh, join it last and cut by face index
**Correct pattern:** Join the room first, append the part, remember the face count before the append; after unwrapping and baking, select faces with index >= that count and separate. UVs and baked texels are untouched.

## Lesson: shader compile time is part of the performance budget
**Problem:** After the planet shader was enriched, the page froze for about 35 seconds shortly after the menu appeared (98% of main-thread time inside `getProgramInfoLog`); the phone click-through timed out on the first tap.
**Root cause:** One fragment shader carried every planet type behind `if (uType == ...)` on a uniform, with 27-iteration loops called from nine places. The Windows shader compiler unrolls and inlines all of it, and three.js blocks on the link the first time a program is drawn, which for off-screen bodies is whenever they first come into view.
**Correct pattern:** (1) make the type a compile-time constant (`defines`), so each type is its own small program; (2) keep loop bodies small (8 cells instead of 27); (3) compile every program behind the loading screen with `compileAsync`, including stand-ins for hidden objects, against a render target of the same kind the scene is really drawn into; (4) lift the loader only when that has finished.
**Rule:** After any shader change, run `node tools/qa/shader-links.mjs` and confirm nothing links slowly after the loader lifts.

## Lesson: frame rates are only comparable when the machine is in the same state
**Problem:** Home appeared to drop from 60 to about 44 fps after the art pass; an hour went into profiling content that was not the cause.
**Root cause:** Two things outside the build: the desktop app's own preview pane was rendering the same 3D site and using about half the GPU, and later the laptop went onto battery, which paces every view at about 46 fps whatever is drawn.
**Correct pattern:** Before measuring, check that no other process is using the GPU and that the machine is on mains power; record both next to the number. Park any live preview of the site on a static page.
**Rule:** A frame-rate claim without the power state and GPU idle check written beside it is not evidence.

## Lesson: adaptive resolution must judge against the device's own pace
**Problem:** With fixed bounds (below 50 fps = struggling), a browser capped at about 46 fps would be stepped down to the lowest resolution for no gain.
**Correct pattern:** Bounds relative to the fastest pace the device has shown (`rate * 0.82 .. rate * 0.96`, capped at 50..58), and a defined fallback (lowest size) when the monitor keeps flipping.

## Lesson: a cue that appears on overflow must not change the size of the thing that overflows
**Problem:** On the small phone display a short status always showed "Scroll for more": the cue's own row shrank the reading area, which created the overflow that kept the cue visible.
**Correct pattern:** When the footer holds only the cue, float it over the corner instead of giving it a layout row.
**Rule:** Check both stable states of any "show X when Y overflows" rule.

## Lesson: an outside reviewer's scores have a noise floor
**Problem:** Seven rounds of independent screenshot review moved between 3.3 and 4.0 and stayed there while visible defects were being fixed; consecutive rounds asked for opposite things (finer star detail, then "too hairlike").
**Rule:** Use each round for its concrete, checkable findings; do not chase the number or a note that reverses the previous one, and report the plateau as it is.

## Lesson: read what a library counts before building on its fallback
**Problem:** After adding "on fallback, use the lowest resolution", cheap views ran at 1344x756 on a fast machine.
**Root cause:** drei's `PerformanceMonitor` increments its flip counter on every incline as well as every decline, even when the factor is already at the top, so a steady 60 fps reaches the flip limit and fires the fallback.
**Correct pattern:** A purpose-built scaler in a few lines: start at the top, step down on missed refreshes, remember the failed size as a ceiling, never go back above it.
**Rule:** Read the source of any counter or threshold you hang behaviour on; and check the settled canvas size, not only the fps, when testing a scaler.

## Lesson: "even frame times" does not mean "paced by the system"
**Problem:** The scaler treated low but even frame times as a battery-saver cap and did nothing; home was actually locked at half the refresh rate (even 33 ms frames) by GPU load.
**Correct pattern:** Take the device's pace from the fastest interval it has shown: 16.7 ms seen anywhere means 60 Hz is available and 33 ms is a miss; a paced browser never shows the short interval.


## Lesson: centred content in a scroll box loses its top when it overflows
**Problem:** With the real project text, the probe display opened mid-paragraph on desktop and laptop: the title and first lines sat above the scroll origin and could not be scrolled to.
**Root cause:** `.project__inner` scrolls and centred its grid tracks (`align-content: center`). Overflow then spills equally above and below, and a scroll container cannot reach the part above. The placeholder entries were short enough never to overflow, so every earlier capture looked fine.
**Correct pattern:** `align-content: safe center` (with plain `center` declared first as the fallback), and for long entries anchor the image column to the top beside the title instead of centring it against the text.
**Rule:** Test every content screen with the longest real entry, not the sample one: run `node tools/qa/panels.mjs` after any content or panel CSS change.

## Lesson: QA checks should read their expectations from the content they test
**Problem:** After the real content landed, the journey and admin checks failed although the site behaved correctly: they expected exactly six projects and one exact URL string.
**Correct pattern:** Derive counts from the published `portfolio.json`; compare URLs without a trailing slash.
**Rule:** A test that breaks when the owner edits content is testing the content, not the code.

## Lesson: a light inside a group that hides recompiles every shader in the scene
**Problem:** Transitions froze: about 0.6 s in Chrome and 1 to 1.7 s in Firefox in the middle of the launch, when entering the cockpit, when opening the first project and on the way back to the home planet.
**Root cause:** The engine's point light was a child of the lander, and the lander (and the whole surface set) is hidden in several states. three.js includes the number of lights in every material's program key, so each time that light came or went, every material in the scene, lit or not, was given a new program and compiled again. A second point light with intensity 0 sat inside the probe group and did the same on project focus.
**Correct pattern:** Lights live at the top level and are never hidden; switch them with intensity. Position a "local" light from the frame loop instead of parenting it.
**Rule:** After adding or moving any light, run `node tools/qa/pace.mjs "view=home" launch` and the other transitions: the output must say "no shader program linked during the transition".

## Lesson: a camera move between two orbiting views must travel in the orbit's own coordinates
**Problem:** "Home planet" swung the camera under and around the planet, and through the star's glow, whenever the system view had been turned first.
**Root cause:** The path was a spline in world space from wherever the camera was to a fixed point behind the landing site. From the default view that is a short, clean line. From a turned view the start can be below the home planet's horizon or on the far side of the star, and the same spline cuts under the planet or over the star and ends in a 180 degree whip. Every test started from the default view.
**Correct pattern:** Interpolate the view's own parameters (azimuth, tilt, zoom) back to the composed overview while blending towards the destination, so the camera stays on its orbit until it is on the right side.
**Rule:** Test every transition that starts from a user-controlled camera from several user-chosen states (`tools/qa/return-trace.mjs --az --el --zoom`, `tools/qa/strip.mjs --drag`), not only the default.

## Lesson: measure a transition's pacing, not just its end state
**Problem:** The journeys passed 20/20 while the launch ran at 30 fps with 100 ms frames and a 0.6 s freeze.
**Root cause:** The journey checks the state after each step. Nothing looked at frames during a cinematic. The soft shadow map (4096 squared, 12-tap blur) was being re-rendered every frame while the lander climbed.
**Correct pattern:** `tools/qa/pace.mjs` reports frames per half second, the longest frames and any shader link during a transition; `tools/qa/strip.mjs --scrub` renders exact frames of it. Shadow map is now 4096 x 1024 (the frustum is 4:1), 8 taps, and refreshed only while its change is in view.
**Rule:** Every cinematic gets a pace run in Chrome and Firefox before it is called done.

## Lesson: test in the second browser with a tool, not by assumption
**Problem:** "Visuals are glitched on Firefox" arrived from the owner; verification.md had listed Firefox as untested.
**Correct pattern:** playwright-core can drive the installed Firefox over WebDriver BiDi (`firefox.launch({ channel: 'moz-firefox' })`); the QA scripts take `--firefox`. Differences that matter: Firefox has no parallel shader compile, rejects pointer moves outside the window and non-integer wheel deltas, and has no touch emulation.
**Rule:** Run `journey.mjs --firefox`, `reading.mjs --firefox` and the pace runs with `--firefox` before a release.

## Lesson: a display that zooms must ignore the scroll events its own resize causes
**Problem:** On phones, pressing Escape to zoom out of a display sometimes zoomed straight back in.
**Root cause:** "Any scroll zooms in." While the panel shrank, the browser re-clamped its scroll position and fired scroll events, which counted as the visitor scrolling.
**Rule:** Gestures inferred from scroll events need a quiet period after any programmatic layout change of the scroller.

## Lesson: bake noise into a texture when a shader covers the screen
**Problem:** The star was the most expensive thing on the home view and one of the slowest shaders to compile, and its look came from stacking analytic noise.
**Correct pattern:** One 512 squared tiling texture generated on the CPU at start-up (cells, soft noise, coarse cells in three channels), sampled three-planar on the sphere. Lookups compile instantly, cost little per pixel, and cellular patterns that are impractical per pixel become free. Home went from needing a reduced canvas to holding 60 fps at full 1080p.


## Lesson: one button per destination
**Problem:** The owner disliked the home menu: four of its five buttons (About, Skills, Resume, Contact) all went to the same cockpit.
**Root cause:** The menu mirrored the content sections instead of the places a visitor can go. Sections inside one place are that place's own navigation (the computer's tabs).
**Rule:** A top-level menu lists destinations, never sections of the same destination. If two buttons end in the same view, merge them and say what is inside in the hint line.

## Lesson: a scroll that triggers something must not also scroll
**Problem:** Scrolling a display zoomed the camera in and moved the page at the same time, so the visitor arrived part-way down the text.
**Correct pattern:** The preview state does not scroll at all (`overflow: hidden`, `touch-action: none`). The wheel listener is non-passive and swallows events until the camera has arrived and that same gesture has ended (a gap in the wheel stream, or a short time limit so a hand that never pauses is not locked out). Touch moves are cancelled until arrival.
**Rule:** When one gesture has two meanings, give the first meaning the whole gesture.

## Lesson: scrollIntoView also scrolls layers that never scroll by hand
**Problem:** In the simple view, a section link shifted the whole fixed interface up: the sticky bar was cut off and the 3D canvas showed in a strip at the bottom.
**Root cause:** `scrollIntoView` scrolls every scrollable ancestor, and an `overflow: hidden` box is still scrollable by script.
**Rule:** Inside a fixed overlay, scroll the overlay itself (`el.scrollTo`) to a computed offset; never call `scrollIntoView` there.

## Lesson: a synthetic touch gesture is not a touch
**Problem:** The first phone run reported that swipes scrolled nothing, anywhere.
**Root cause:** Under mobile emulation Chrome's `Input.synthesizeScrollGesture` sent pointer moves but no `touchmove`, so nothing scrolled. The site was fine.
**Correct pattern:** Drive swipes with `Input.dispatchTouchEvent` (touchStart, a touchMove per frame, touchEnd): those produce real touch scrolling, `pointercancel` and scroll events. `tools/qa/phone.mjs` does this.
**Rule:** When every instance of one kind of input fails at once, test the input tool against a plain scrolling page before touching the product.

## Lesson: collisions for a ship that is steered, not simulated
**Correct pattern:** The ship keeps its simple model (a speed along the nose) plus a knock vector that dies away. On contact the position is put back on the surface and the part of the velocity pointing into the body is reflected with most of it lost, then split again into "along the nose" and "knock". A glancing touch slides past, a head-on one stops the ship and pushes it back, and the nose never snaps round. Bodies off the plane (the home planet, the station, moons) are tested as the circle where their sphere cuts the plane.
**Rule:** Add physics as a correction on top of the existing control model; do not replace the model to get one effect.

## Lesson: a ribbon that widens along its length shows its triangles
**Problem:** The freighter's wide boost trail had regular stripes across it.
**Root cause:** Each segment was a trapezoid (the trail fanned out in proportion to the nozzle width), and a value interpolated across the two triangles of a trapezoid kinks along the diagonal.
**Rule:** Spread a ribbon by a fixed amount, not by a multiple of its width, so wide ribbons stay close to rectangles.

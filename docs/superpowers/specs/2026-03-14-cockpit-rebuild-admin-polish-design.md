# Cockpit Rebuild + Admin Panel Polish — Design Spec

**Date:** 2026-03-14
**Priority:** C (Cockpit screens/environment) → A (Admin panel readability)

---

## Part 1: Cockpit Full Rebuild

### Problem

The current CockpitScene renders screens inside a narrow rocket capsule whose wall materials (`#0A0C10`, `#141924`) are nearly invisible against the `#04060e` background. Screens appear to float in void. The camera pan multiplier (`4.2x`) is too aggressive, causing screens to clip off-viewport.

### Design: Rectangular Bridge Interior

Replace the cylindrical capsule interior with a wider rectangular bridge room.

#### Room Geometry

- **Dimensions:** ~3.5m wide × 6m deep × 2.4m tall (in Three.js units)
- **Shape:** Rectangular box with subtle rounded edges at ceiling-wall joints
- **Walls:** Visible dark-gray panels (`#1A2535` to `#222D40`) with slight metalness (0.3)
- **Floor:** Dark (`#0E1320`) with cyan grid lines (opacity 0.12)
- **Ceiling:** Slightly lighter than walls (`#1E2840`) with central light strip

#### Wall Materials (Key Change)

All surfaces must be clearly distinguishable from the void background:

| Surface | Color | Roughness | Metalness |
|---------|-------|-----------|-----------|
| Left/Right walls | `#1A2535` | 0.7 | 0.3 |
| Back wall | `#182030` | 0.75 | 0.2 |
| Floor | `#0E1320` | 0.85 | 0.2 |
| Ceiling | `#1E2840` | 0.7 | 0.15 |
| Structural ribs | `#2A3545` | 0.3 | 0.6 |
| Console surface | `#141E2C` | 0.4 | 0.4 |

#### Screen Placement

All screens are mounted on wall surfaces with visible bezels (thin box geometry around each Html element):

1. **Profile Screen (main console):** Center front, angled ~35° on console desk. `distanceFactor={1.0}`, `scale={1.2}`
2. **Skills Screen (left wall):** Mounted flat on left wall. `distanceFactor={1.2}`, `scale={1.1}`
3. **Resume Screen (right wall):** Mounted flat on right wall. `distanceFactor={1.2}`, `scale={1.1}`
4. **Comms Screen (back wall):** Mounted on rear wall. `distanceFactor={1.2}`, `scale={1.0}`
5. **Exit Button:** On right side console edge. `distanceFactor={0.5}`, `scale={1.0}`

Each screen gets a **bezel frame** — a thin box mesh (`0.02` depth) surrounding it with `#263238` material and emissive edge (`#4FC3F7`, intensity 0.15).

#### Interior Detail Meshes

- **Edge glow strips:** Thin emissive planes along wall-floor and wall-ceiling joints (cyan, `emissiveIntensity: 0.3`)
- **Equipment panels:** 4-6 small box meshes on walls (height ~0.3-0.5, depth ~0.05) representing instrument panels. Non-interactive, just visual depth.
- **Ceiling conduit rails:** 2 thin box meshes running lengthwise along ceiling edges
- **Status indicator dots:** Small sphere meshes (r=0.02) with emissive material (3 green, 1 amber) on wall panels
- **Forward window:** Transparent/dark pane showing exterior scene (stars, the nearby star glow)

#### Lighting

| Light | Color | Intensity | Position | Purpose |
|-------|-------|-----------|----------|---------|
| Cabin key | `#FFD54F` | 2.0 | Ceiling center-front | Main illumination |
| Cabin fill | `#4FC3F7` | 1.2 | Ceiling center-back | Fill, cool tone |
| Console glow | `#4FC3F7` | 1.5 | Above console | Screen reflection |
| Strip glow | `#FFD54F` | 0.8 | Edge strips | Ambient accent |
| Star pulse | `#FFF59D` | variable | Forward window | Pulsing star light through window |
| Ambient | `#4FC3F7` | 0.25 | Center | Baseline visibility |

All lights animate from 0 → target during entry (via `powerStateRef`).

#### Camera Behavior

**Entry animation:** Keep existing multi-phase choreography (approach → hatch → inside → console settle) but update waypoint positions to match new room dimensions:
- `hatchWaypoint`: Near side wall entry point
- `insideWaypoint`: Center of room, seated height `(0, 1.3, 0.6)`
- `consoleLook`: Console center `(0, 0.6, -1.0)`

**Idle camera (post-entry):**
- **Sway:** Keep existing subtle sway (`sin(t * 0.15) * 0.015`)
- **Mouse-follow pan:** Reduce from `pan * 4.2` to `pan * 1.8` on lookAt target
- **Camera position pan:** Reduce from `pan * 0.15` to `pan * 0.08`
- **Result:** All 4 screens remain visible at all pan extremes. Side screens become more centered when mouse moves toward them.

**Exit animation:** Reverse of entry — power down, camera backs out, hatch closes.

#### What Gets Deleted

- The entire capsule hull (external capsuleGeometry, coneGeometry, torusGeometry)
- The narrow interior shell geometry
- The old waypoint positions
- `ROCKET_POSITION` and `ROCKET_ROTATION` constants (new room is at origin of its group)

#### What Stays

- `IntroScene` rendering (the planet surface is still visible through the window/during entry)
- Entry/exit timeline structure (GSAP timelines with phases)
- `playMechanicalTone()` sound effect
- `CockpitScreens.jsx` content components (ProfileScreen, SkillsScreen, etc.)
- `consoleActive` state gating
- `useFrame` idle camera loop (with reduced pan values)

---

## Part 2: Admin Panel Readability Polish

### Problem

Font sizes throughout AdminPanel.jsx are extremely small (`0.42rem` to `0.52rem`). Labels, section headers, and status text are barely readable.

### Changes

#### Font Size Scale

Increase all font sizes by ~40%:

| Element | Current | New |
|---------|---------|-----|
| Restricted access header | `0.42rem` | `0.6rem` |
| Tab labels | `0.56rem` | `0.72rem` |
| Section titles (CardSection) | `0.52rem` | `0.7rem` |
| Field labels | `0.44rem` | `0.6rem` |
| Field input text | `0.68rem` | `0.82rem` |
| Info banners | `0.5rem` | `0.68rem` |
| Entry card labels | `0.48rem` | `0.65rem` |
| Action buttons | `0.52rem` | `0.65rem` |
| Status bar text | `0.42rem` | `0.58rem` |
| Error messages | `0.52rem` | `0.68rem` |
| Draft indicator | `0.46rem` | `0.62rem` |
| Settings card title | `0.52rem` | `0.68rem` |
| Settings card description | `0.65rem` | `0.8rem` |
| Keyboard shortcut hint | `0.46rem` | `0.62rem` |

#### Panel Width

Increase from `min(920px, 95vw)` to `min(1020px, 95vw)` to accommodate larger text.

#### No Other Changes

Keep existing color scheme, layout structure, tab system, and all functionality. This is purely a readability pass.

---

## Files Modified

1. **`src/scenes/CockpitScene.jsx`** — Full rewrite of `CockpitRocket` component, updated camera waypoints and pan values
2. **`src/components/panels/AdminPanel.jsx`** — Font size increases across all sub-components
3. **`src/components/ui/CockpitScreens.jsx`** — Possibly adjust `ScreenFrame` dimensions if needed for new room scale

## Files Not Modified

- `src/App.jsx` — No changes to stage routing
- `src/store/useStore.js` — No new state needed
- `src/components/panels/StarCorePanel.jsx` — Deferred to design system unification (Phase B)
- `src/components/panels/PlanetPanel.jsx` — Deferred to design system unification (Phase B)

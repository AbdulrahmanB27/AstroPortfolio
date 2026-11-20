# Cockpit Rebuild + Admin Panel Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invisible cockpit capsule with a visible rectangular bridge interior, fix camera panning, and improve admin panel readability.

**Architecture:** CockpitScene.jsx gets a full rewrite of its CockpitRocket component — new room geometry, lighting, detail meshes, and screen bezels. Camera pan values are reduced. AdminPanel.jsx gets a font-size-only pass. No new files or state changes.

**Tech Stack:** React Three Fiber, Three.js (meshStandardMaterial, meshBasicMaterial), GSAP, @react-three/drei Html

**Spec:** `docs/superpowers/specs/2026-03-14-cockpit-rebuild-admin-polish-design.md`

---

## Chunk 1: Cockpit Bridge Room Structure

### Task 1: Replace capsule hull with bridge room shell

**Files:**
- Modify: `src/scenes/CockpitScene.jsx` — `CockpitRocket` component (lines 48-268)

The current `CockpitRocket` renders a capsule hull (capsuleGeometry + coneGeometry) with a narrow interior. Replace the entire component body with a rectangular bridge room.

- [ ] **Step 1: Delete capsule hull geometry**

In `CockpitRocket`, delete the external hull meshes (lines 63-76: capsuleGeometry, coneGeometry, torusGeometry) and the hatch frame/hatch group (lines 78-88). Also delete the `ROCKET_POSITION`, `ROCKET_ROTATION` constants (lines 12-13) and remove them from the `<group>` wrapper.

The new `CockpitRocket` group should be positioned at `[0, 0.5, -12]` with no rotation and scale `1.0`.

- [ ] **Step 2: Replace interior shell with bridge room geometry**

Delete the old interior shell (lines 91-168: floor, grid lines, walls, back wall, structural ribs, forward frame, pilot seat) and replace with:

```jsx
{/* ── Bridge Room Shell ─────────────────────────────────── */}
<group position={[0, 0, 0]}>
  {/* Floor */}
  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[3.5, 6]} />
    <meshStandardMaterial color="#0E1320" roughness={0.85} metalness={0.2} />
  </mesh>

  {/* Floor Grid Lines */}
  <group position={[0, 0.002, 0]}>
    {[-1.2, -0.4, 0.4, 1.2].map((x, i) => (
      <mesh key={`gx${i}`} position={[x, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.008, 6]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.12} />
      </mesh>
    ))}
    {[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((z, i) => (
      <mesh key={`gz${i}`} position={[0, 0, z]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[3.5, 0.008]} />
        <meshBasicMaterial color="#4FC3F7" transparent opacity={0.08} />
      </mesh>
    ))}
  </group>

  {/* Ceiling */}
  <mesh position={[0, 2.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
    <planeGeometry args={[3.5, 6]} />
    <meshStandardMaterial color="#1E2840" roughness={0.7} metalness={0.15} />
  </mesh>

  {/* Left Wall */}
  <mesh position={[-1.75, 1.2, 0]} rotation={[0, Math.PI / 2, 0]}>
    <planeGeometry args={[6, 2.4]} />
    <meshStandardMaterial color="#1A2535" roughness={0.7} metalness={0.3} />
  </mesh>

  {/* Right Wall */}
  <mesh position={[1.75, 1.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
    <planeGeometry args={[6, 2.4]} />
    <meshStandardMaterial color="#1A2535" roughness={0.7} metalness={0.3} />
  </mesh>

  {/* Back Wall (entry side) */}
  <mesh position={[0, 1.2, 3]} rotation={[0, Math.PI, 0]}>
    <planeGeometry args={[3.5, 2.4]} />
    <meshStandardMaterial color="#182030" roughness={0.75} metalness={0.2} />
  </mesh>

  {/* Forward Wall (window wall) — two panels flanking window */}
  <mesh position={[-1.1, 1.2, -3]} rotation={[0, 0, 0]}>
    <planeGeometry args={[1.3, 2.4]} />
    <meshStandardMaterial color="#182030" roughness={0.75} metalness={0.2} />
  </mesh>
  <mesh position={[1.1, 1.2, -3]} rotation={[0, 0, 0]}>
    <planeGeometry args={[1.3, 2.4]} />
    <meshStandardMaterial color="#182030" roughness={0.75} metalness={0.2} />
  </mesh>

  {/* Forward Window (center) — dark transparent pane */}
  <mesh position={[0, 1.5, -3]}>
    <planeGeometry args={[1.2, 1.8]} />
    <meshStandardMaterial
      color="#040810"
      roughness={0.1}
      metalness={0.8}
      transparent
      opacity={0.6}
    />
  </mesh>
</group>
```

- [ ] **Step 3: Add structural ribs**

Add visible structural rib frames that outline the room shape:

```jsx
{/* Structural Ribs — cross-section frames */}
{[-2.5, -0.8, 0.8, 2.5].map((z, i) => (
  <group key={`rib${i}`} position={[0, 1.2, z]}>
    {/* Horizontal top */}
    <mesh position={[0, 1.2, 0]}>
      <boxGeometry args={[3.52, 0.04, 0.04]} />
      <meshStandardMaterial color="#2A3545" roughness={0.3} metalness={0.6} />
    </mesh>
    {/* Horizontal bottom */}
    <mesh position={[0, -1.2, 0]}>
      <boxGeometry args={[3.52, 0.04, 0.04]} />
      <meshStandardMaterial color="#2A3545" roughness={0.3} metalness={0.6} />
    </mesh>
    {/* Vertical left */}
    <mesh position={[-1.75, 0, 0]}>
      <boxGeometry args={[0.04, 2.42, 0.04]} />
      <meshStandardMaterial color="#2A3545" roughness={0.3} metalness={0.6} />
    </mesh>
    {/* Vertical right */}
    <mesh position={[1.75, 0, 0]}>
      <boxGeometry args={[0.04, 2.42, 0.04]} />
      <meshStandardMaterial color="#2A3545" roughness={0.3} metalness={0.6} />
    </mesh>
  </group>
))}
```

- [ ] **Step 4: Add pilot seat and main console**

```jsx
{/* Pilot Seat */}
<group position={[0, 0.15, 0.8]}>
  <mesh castShadow>
    <boxGeometry args={[0.7, 0.18, 0.7]} />
    <meshStandardMaterial color="#1A1D23" roughness={0.8} />
  </mesh>
  <mesh position={[0, 0.45, 0.2]} rotation={[-0.15, 0, 0]} castShadow>
    <boxGeometry args={[0.6, 0.65, 0.12]} />
    <meshStandardMaterial color="#232A35" roughness={0.7} />
  </mesh>
  {/* Headrest */}
  <mesh position={[0, 0.9, 0.28]} rotation={[-0.2, 0, 0]}>
    <boxGeometry args={[0.35, 0.25, 0.08]} />
    <meshStandardMaterial color="#232A35" roughness={0.7} />
  </mesh>
</group>

{/* Main Console Desk */}
<group position={[0, 0.62, -1.0]} rotation={[-0.4, 0, 0]}>
  <mesh castShadow>
    <boxGeometry args={[2.8, 0.06, 1.4]} />
    <meshStandardMaterial color="#141E2C" roughness={0.4} metalness={0.4} />
  </mesh>
  {/* Console edge accent line */}
  <mesh position={[0, 0.04, 0.65]} rotation={[-0.1, 0, 0]}>
    <boxGeometry args={[2.81, 0.02, 0.02]} />
    <meshBasicMaterial color="#4FC3F7" transparent opacity={0.6} />
  </mesh>
</group>
```

- [ ] **Step 5: Verify room renders visibly**

Run: `npm run dev`

Open http://localhost:5173, navigate to About from the surface menu. After the entry animation, the bridge room walls, floor, ceiling, ribs, seat, and console should all be clearly visible as dark-gray panels against the dark background. If any surface is invisible, its color needs to be lighter.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/CockpitScene.jsx
git commit -m "feat(cockpit): replace capsule hull with rectangular bridge room shell"
```

---

### Task 2: Add interior detail meshes

**Files:**
- Modify: `src/scenes/CockpitScene.jsx` — inside the bridge room `<group>`

- [ ] **Step 1: Add edge glow strips**

Add emissive accent strips along wall-floor and wall-ceiling joints:

```jsx
{/* ── Edge Glow Strips ──────────────────────────────────── */}
{/* Floor-wall joints */}
{[[-1.74, 0.01, 0], [1.74, 0.01, 0]].map(([x, y, z], i) => (
  <mesh key={`fe${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[0.02, 6]} />
    <meshBasicMaterial color="#4FC3F7" transparent opacity={0.3} />
  </mesh>
))}
{/* Ceiling-wall joints */}
{[[-1.74, 2.39, 0], [1.74, 2.39, 0]].map(([x, y, z], i) => (
  <mesh key={`ce${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[0.02, 6]} />
    <meshBasicMaterial color="#4FC3F7" transparent opacity={0.2} />
  </mesh>
))}
{/* Ceiling center light strip */}
<mesh position={[0, 2.39, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
  <planeGeometry args={[0.8, 3]} />
  <meshBasicMaterial color="#4FC3F7" transparent opacity={0.06} />
</mesh>
```

- [ ] **Step 2: Add wall equipment panels**

```jsx
{/* ── Equipment Panels (non-interactive wall detail) ───── */}
{/* Left wall panels */}
<mesh position={[-1.73, 1.0, 1.5]}>
  <boxGeometry args={[0.04, 0.5, 0.6]} />
  <meshStandardMaterial color="#222D40" roughness={0.5} metalness={0.4} />
</mesh>
<mesh position={[-1.73, 1.6, 1.5]}>
  <boxGeometry args={[0.04, 0.25, 0.6]} />
  <meshStandardMaterial color="#1E2838" roughness={0.6} metalness={0.3} />
</mesh>
{/* Right wall panels */}
<mesh position={[1.73, 1.0, 1.5]}>
  <boxGeometry args={[0.04, 0.5, 0.6]} />
  <meshStandardMaterial color="#222D40" roughness={0.5} metalness={0.4} />
</mesh>
<mesh position={[1.73, 1.6, 1.5]}>
  <boxGeometry args={[0.04, 0.25, 0.6]} />
  <meshStandardMaterial color="#1E2838" roughness={0.6} metalness={0.3} />
</mesh>
```

- [ ] **Step 3: Add ceiling conduit rails and status LEDs**

```jsx
{/* ── Ceiling Conduit Rails ─────────────────────────────── */}
{[-1.2, 1.2].map((x, i) => (
  <mesh key={`cond${i}`} position={[x, 2.35, 0]}>
    <boxGeometry args={[0.06, 0.06, 5.8]} />
    <meshStandardMaterial color="#2A3545" roughness={0.3} metalness={0.5} />
  </mesh>
))}

{/* ── Status Indicator LEDs ─────────────────────────────── */}
{[
  { pos: [-1.72, 1.35, 1.2], color: '#66BB6A' },
  { pos: [-1.72, 1.35, 1.4], color: '#66BB6A' },
  { pos: [-1.72, 1.35, 1.6], color: '#66BB6A' },
  { pos: [1.72, 1.35, 1.4], color: '#FFA726' },
].map((led, i) => (
  <mesh key={`led${i}`} position={led.pos}>
    <sphereGeometry args={[0.02, 8, 8]} />
    <meshBasicMaterial color={led.color} />
  </mesh>
))}
```

- [ ] **Step 4: Verify details render**

Run dev server. Enter cockpit. Confirm: edge glow strips visible along wall joints, equipment panel boxes on walls, conduit rails on ceiling, small colored LED dots on wall panels.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/CockpitScene.jsx
git commit -m "feat(cockpit): add interior detail meshes — edge strips, panels, conduits, LEDs"
```

---

### Task 3: Mount screens with bezels and update positions

**Files:**
- Modify: `src/scenes/CockpitScene.jsx` — Html screen placements and surrounding bezels

- [ ] **Step 1: Add screen bezel helper**

Add a small helper component at the top of CockpitScene.jsx (after imports, before CockpitRocket):

```jsx
function ScreenBezel({ width, height, position, rotation }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[width + 0.08, height + 0.08, 0.03]} />
      <meshStandardMaterial
        color="#263238"
        roughness={0.4}
        metalness={0.5}
        emissive="#4FC3F7"
        emissiveIntensity={0.08}
      />
    </mesh>
  )
}
```

- [ ] **Step 2: Update profile screen (main console)**

Replace the current profile screen Html block. The console group position has changed to `[0, 0.62, -1.0]`:

```jsx
{/* PROFILE SCREEN — on console */}
{consoleActive && (
  <>
    <ScreenBezel width={1.8} height={1.0} position={[0, 0.08, 0]} rotation={[0, 0, 0]} />
    <Html
      transform
      position={[0, 0.09, 0]}
      rotation={[0, 0, 0]}
      scale={1.2}
      distanceFactor={1.0}
      zIndexRange={[100, 0]}
    >
      <ProfileScreen />
    </Html>
  </>
)}
```

(This goes inside the console desk `<group>`.)

- [ ] **Step 3: Update skills screen (left wall)**

Position against the left wall at x=-1.72 (just inset from wall surface):

```jsx
{/* SKILLS SCREEN — left wall */}
{consoleActive && (
  <>
    <ScreenBezel width={1.3} height={1.0} position={[-1.72, 1.2, -0.5]} rotation={[0, Math.PI / 2, 0]} />
    <Html
      transform
      position={[-1.70, 1.2, -0.5]}
      rotation={[0, Math.PI / 2, 0]}
      scale={1.1}
      distanceFactor={1.2}
      zIndexRange={[100, 0]}
    >
      <SkillsScreen />
    </Html>
  </>
)}
```

- [ ] **Step 4: Update resume screen (right wall)**

```jsx
{/* RESUME SCREEN — right wall */}
{consoleActive && (
  <>
    <ScreenBezel width={1.3} height={1.1} position={[1.72, 1.2, -0.5]} rotation={[0, -Math.PI / 2, 0]} />
    <Html
      transform
      position={[1.70, 1.2, -0.5]}
      rotation={[0, -Math.PI / 2, 0]}
      scale={1.1}
      distanceFactor={1.2}
      zIndexRange={[100, 0]}
    >
      <ResumeScreen />
    </Html>
  </>
)}
```

- [ ] **Step 5: Update comms screen (back wall)**

```jsx
{/* COMMS SCREEN — back wall */}
{consoleActive && (
  <>
    <ScreenBezel width={1.1} height={0.9} position={[0, 1.4, 2.97]} rotation={[0, Math.PI, 0]} />
    <Html
      transform
      position={[0, 1.4, 2.95]}
      rotation={[0, Math.PI, 0]}
      scale={1.0}
      distanceFactor={1.2}
      zIndexRange={[100, 0]}
    >
      <CommsScreen />
    </Html>
  </>
)}
```

- [ ] **Step 6: Update exit button position**

```jsx
{/* EXIT BUTTON — right side of console */}
{consoleActive && (
  <Html
    transform
    position={[1.1, 0.65, 0.3]}
    rotation={[0, -Math.PI / 6, 0]}
    scale={1.0}
    distanceFactor={0.5}
  >
    <ExitButton onExit={onExit} />
  </Html>
)}
```

- [ ] **Step 7: Verify all screens render with bezels**

Run dev server. Enter cockpit. Confirm: all 4 screens are visible with dark frame bezels around them, faint cyan edge glow on bezels. Screens appear mounted on walls/console, not floating.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/CockpitScene.jsx
git commit -m "feat(cockpit): mount screens with bezels, update positions for bridge room"
```

---

## Chunk 2: Camera + Lighting + Admin Polish

### Task 4: Update lighting for bridge room

**Files:**
- Modify: `src/scenes/CockpitScene.jsx` — light refs inside bridge room group

- [ ] **Step 1: Update light positions and intensities**

Replace the current cabin lights block (the `pointLight` elements near the bottom of the bridge room group) with positions calibrated for the wider room:

```jsx
{/* ── Cabin Lighting ────────────────────────────────────── */}
<pointLight ref={cabinKeyRef} position={[0, 2.3, -0.8]} color="#FFD54F" intensity={0} distance={8} decay={2} />
<pointLight ref={cabinFillRef} position={[0, 2.0, 1.5]} color="#4FC3F7" intensity={0} distance={8} decay={2} />
<pointLight ref={consoleGlowRef} position={[0, 1.2, -0.8]} color="#4FC3F7" intensity={0} distance={5} decay={2} />
<pointLight ref={stripGlowRef} position={[0, 0.5, 0]} color="#FFD54F" intensity={0} distance={5} decay={2} />
<pointLight ref={starPulseRef} position={[0, 1.5, -2.8]} color="#FFF59D" intensity={0} distance={6} decay={2} />

{/* Baseline ambient — always on so room is never fully black */}
<pointLight position={[0, 1.8, 0]} color="#4FC3F7" intensity={0.25} distance={12} />
```

- [ ] **Step 2: Update power animation target intensities in useFrame**

In the `useFrame` callback, update the power multipliers to match the spec:

```jsx
const power = powerStateRef.current.value
if (cabinKeyRef.current) cabinKeyRef.current.intensity = power * 2.0
if (cabinFillRef.current) cabinFillRef.current.intensity = power * 1.2
if (consoleGlowRef.current) consoleGlowRef.current.intensity = power * 1.5
if (stripGlowRef.current) stripGlowRef.current.intensity = power * 0.8
if (starPulseRef.current) {
  const pulse = 0.6 + Math.sin(state.clock.elapsedTime * 1.3) * 0.25
  starPulseRef.current.intensity = power * pulse
}
```

- [ ] **Step 3: Verify lighting illuminates room**

Run dev server. Enter cockpit. During power-up animation, walls should gradually become visible with warm-gold key light from above and cool-cyan fill. Console should have visible glow on its surface.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/CockpitScene.jsx
git commit -m "feat(cockpit): update lighting positions and intensities for bridge room"
```

---

### Task 5: Fix camera waypoints and reduce pan

**Files:**
- Modify: `src/scenes/CockpitScene.jsx` — waypoint positions, entry/exit timelines, useFrame idle loop

- [ ] **Step 1: Update waypoint object3D positions**

The waypoints inside the bridge room group need to match the new room dimensions:

```jsx
{/* Camera waypoints */}
<object3D ref={hatchWaypointRef} position={[2.0, 1.4, 2.0]} />
<object3D ref={hatchLookRef} position={[0, 1.0, -0.5]} />
<object3D ref={insideWaypointRef} position={[0.0, 1.3, 0.6]} />
<object3D ref={consoleLookRef} position={[0, 0.6, -1.0]} />
```

- [ ] **Step 2: Update the bridge group position constant**

At the top of the file, replace the old rocket position/rotation constants:

```jsx
const BRIDGE_POSITION = [0, 0.5, -12]
```

And use it on the CockpitRocket outer group:

```jsx
<group position={BRIDGE_POSITION}>
```

- [ ] **Step 3: Update approach point in entry timeline**

In the `useEffect` entry timeline, the `approachPoint` should aim toward the bridge entry:

```jsx
const approachPoint = new THREE.Vector3(2.5, 2.0, -8)
```

- [ ] **Step 4: Reduce camera pan multipliers in useFrame**

In the `useFrame` idle loop, change:

```jsx
// OLD
camera.position.set(
  insidePoint.x + swayX + pan * 0.15,
  insidePoint.y + swayY,
  insidePoint.z
)
camera.lookAt(
  consolePoint.x + pan * 4.2,
  consolePoint.y,
  consolePoint.z
)

// NEW
camera.position.set(
  insidePoint.x + swayX + pan * 0.08,
  insidePoint.y + swayY,
  insidePoint.z
)
camera.lookAt(
  consolePoint.x + pan * 1.8,
  consolePoint.y,
  consolePoint.z
)
```

- [ ] **Step 5: Verify camera behavior**

Run dev server. Enter cockpit. After entry animation:
1. Mouse at center → camera looks at console (profile screen centered)
2. Mouse far left → left wall skills screen becomes more visible, right edge of room still visible
3. Mouse far right → right wall resume screen becomes more visible, left edge still visible
4. No screen clips off viewport at any mouse position

- [ ] **Step 6: Commit**

```bash
git add src/scenes/CockpitScene.jsx
git commit -m "fix(cockpit): update camera waypoints for bridge room, reduce pan multipliers"
```

---

### Task 6: Admin panel font size polish

**Files:**
- Modify: `src/components/panels/AdminPanel.jsx` — font sizes across all sub-components

- [ ] **Step 1: Update panel width**

Change the main panel container width (line 278):
- Old: `width: 'min(920px, 95vw)'`
- New: `width: 'min(1020px, 95vw)'`

- [ ] **Step 2: Update header font sizes**

In the header section (~line 296-308):
- "restricted access" label: `0.42rem` → `0.6rem`
- "Data Configuration" title: keep `1rem` (already fine)

- [ ] **Step 3: Update error message font size**

Line ~330: `0.52rem` → `0.68rem`

- [ ] **Step 4: Update draft indicator font size**

Line ~348: `0.46rem` → `0.62rem`

- [ ] **Step 5: Update tab label font size**

Line ~372: `0.56rem` → `0.72rem`

- [ ] **Step 6: Update status bar font sizes**

Lines ~651-663:
- Planet/skill counts: `0.42rem` → `0.58rem`
- Draft/Clean indicator: `0.42rem` → `0.58rem`

- [ ] **Step 7: Update Field component font sizes**

In the `Field` function (~line 674):
- Label: `0.44rem` → `0.6rem`

In `fieldStyle` (~line 861):
- Input text: `0.68rem` → `0.82rem`

- [ ] **Step 8: Update CardSection title font size**

In `CardSection` (~line 724): `0.52rem` → `0.7rem`

- [ ] **Step 9: Update EntryCard label font size**

In `EntryCard` (~line 752): `0.48rem` → `0.65rem`

- [ ] **Step 10: Update InfoBanner font size**

In `InfoBanner` (~line 768): `0.5rem` → `0.68rem`

- [ ] **Step 11: Update SettingsCard font sizes**

In `SettingsCard` (~line 794-801):
- Title: `0.52rem` → `0.68rem`
- Description: `0.65rem` → `0.8rem`

- [ ] **Step 12: Update ActionBtn font size**

In `ActionBtn` (~line 819): `0.52rem` → `0.65rem`

- [ ] **Step 13: Update SmallBtn font size**

In `SmallBtn` (~line 849): `0.52rem` → `0.65rem`

- [ ] **Step 14: Update Settings tab keyboard hint**

Line ~636: `0.46rem` → `0.62rem`

- [ ] **Step 15: Verify admin panel readability**

Run dev server. Type "admin" to open admin panel. All text should be clearly readable — labels, tabs, inputs, buttons, status bar. No text should require squinting.

- [ ] **Step 16: Commit**

```bash
git add src/components/panels/AdminPanel.jsx
git commit -m "fix(admin): increase all font sizes ~40% for readability"
```

---

## Final Verification

- [ ] **Full flow test:** SURFACE → click About → cockpit entry animation → bridge room visible with screens → mouse pan works without clipping → click Exit → return to surface. Then type "admin" → verify readable text → close.

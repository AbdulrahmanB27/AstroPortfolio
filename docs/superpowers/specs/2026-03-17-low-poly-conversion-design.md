# Low-Poly Conversion + Model Loading Infrastructure — Design Spec

**Date:** 2026-03-17
**Goal:** Convert the entire 3D portfolio from smooth/PBR-heavy geometry to a cohesive low-poly aesthetic, and add infrastructure for importing .glb models from Blender.

---

## Motivation

1. **Visual cohesion with imported models** — Blender low-poly exports use faceted surfaces and simple materials. The procedural scene geometry must match.
2. **Easier model pipeline** — drop .glb files into `public/models/` and have them look native.
3. **Performance** — fewer vertices, simpler materials, lighter rendering.

---

## Part 1: Geometry Reduction

All procedural geometry gets reduced segments to produce visible facets.

### Segment Count Targets

| Geometry Type | Current | Target | Notes |
|---------------|---------|--------|-------|
| Planet body spheres | 32-64 | 1 (dodecahedron detail) | Use `dodecahedronGeometry` instead of `sphereGeometry` for planets |
| Star core sphere | 48 | 12 | Keep sphere but low segments |
| Star corona spheres | 24-32 | 10-12 | Fewer layers too (6 → 3) |
| Astronaut helmet | 12 | 8 | |
| Astronaut visor | 20 | 8 | |
| Astronaut torso/limbs capsules | 6-8 | 4-6 | |
| Spacecraft body capsule | 10 | 6 | |
| Spacecraft nose cone | 6 | 5 | Already low |
| Orbit ring tori | 64-128 | 16-24 | |
| Moon spheres | 8 | 6 | Or use dodecahedron |
| Scan ring tori | 64 | 16 | |
| Death Star sphere | 32 | 12 | |
| Flight ship parts | 8-16 | 6-8 | |
| Cockpit windshield planes | N/A | N/A | Planes stay as-is |
| Cockpit detail cylinders | 8 | 6 | |
| Starfield particles | 3000 | 2000 | Reduce count |
| Constellation stars | 6 segments | 4 segments | |

### Geometry Type Swaps

Replace `sphereGeometry` with `dodecahedronGeometry(radius, 1)` for:
- All project planets in OrbitScene
- Moons in OrbitScene
- IntroPlanet (already uses dodecahedron)
- Distant planets in IntroScene (already uses dodecahedron)

Keep `sphereGeometry` (low segments) for:
- Star cores (need to be rounder than planets)
- Corona/glow layers
- Engine glow spheres
- Status LED dots

---

## Part 2: Material Simplification

### flatShading Everywhere

Every `meshStandardMaterial` gets `flatShading: true`. Currently ~50% have it; needs to be 100%.

### PBR Parameter Clamping

| Parameter | Current Range | Low-Poly Target | Rationale |
|-----------|--------------|-----------------|-----------|
| metalness | 0.0 – 0.9 | 0.0 – 0.15 | Low-poly = matte surfaces |
| roughness | 0.05 – 0.95 | 0.6 – 0.95 | No shiny reflections |

**Exceptions:**
- Astronaut visor: keep metalness 0.5, roughness 0.2 (golden reflective visor is iconic)
- Windshield glass: keep metalness 0.6, roughness 0.1 (needs to read as glass)
- Screen bezels: keep metalness 0.4 (emissive accent element)
- Engine glow meshBasicMaterial: unchanged (not PBR)

### Star Corona Simplification

Current: 6 nested transparent spheres (core, inner corona, mid corona, warm haze, outer glow, far halo) + 3 lens flare rings.

Target: 3 layers total:
1. **Core** — solid `meshBasicMaterial`, color #FFD54F
2. **Inner glow** — transparent sphere, color #FF8F00, opacity 0.25
3. **Outer glow** — transparent sphere, color #FFE082, opacity 0.08

Drop: mid corona, warm haze, far halo, all 3 lens flare rings.

Same simplification for OrbitScene's CentralStar corona layers.

### domainMaterials.js Updates

All texture types get:
- `flatShading: true`
- metalness capped at 0.15
- roughness minimum 0.6

---

## Part 3: Lighting Simplification

### IntroScene

| Light | Current | Change |
|-------|---------|--------|
| Ambient | 0.05 | Increase to 0.12 |
| Key directional | #FFE082, 1.2 | Keep |
| Rim directional | #FF8F00, 0.8 | Keep |
| Cool fill directional | #29B6F6, 0.15 | Keep |
| Ground bounce directional | #FFF59D, 0.08 | Remove (negligible contribution) |

### OrbitScene

| Light | Current | Change |
|-------|---------|--------|
| Ambient (normal) | 0.08 | Increase to 0.15 |
| Star pointLight | #FFD54F, 3.5 | Reduce to 2.5 |

### CockpitScene

No lighting changes — the cockpit interior lighting works well as-is.

### LiftoffScene

Inherits IntroScene lighting. No separate changes needed.

---

## Part 4: Model Loading Infrastructure

### Directory Convention

```
public/
  models/
    README.md          ← documents naming convention and export settings
```

### Model Loader Utility

**New file: `src/utils/modelLoader.js`**

Provides:
- `useModel(path)` — hook wrapping `useGLTF` from drei, returns `{ scene, nodes, materials }` or `null` if path doesn't exist
- `preloadModel(path)` — calls `useGLTF.preload(path)` for eager loading
- Automatic `flatShading` injection on all imported model materials to match scene style

### Integration Pattern

Components that may be replaced by models use this pattern:

```jsx
// In Spacecraft component:
const model = useModel('/models/spacecraft.glb')
if (model) return <primitive object={model.scene} />
// else: render procedural fallback geometry below
```

This allows incremental replacement — drop a .glb into `public/models/` and the component auto-switches.

### Blender Export Guidelines (documented in README.md)

- Export as .glb (binary, smaller)
- Apply transforms before export
- Use flat shading in Blender (or the loader will inject it)
- Keep vertex count under 500 per object for low-poly style
- Use single material per mesh where possible
- Name meshes descriptively (e.g., `Body`, `Wing_L`, `Engine`)

---

## Part 5: What Does NOT Change

- All GSAP camera animations and timelines
- All interactions (screen zoom, hover tooltips, click handlers)
- Stage system (PROLOGUE → SURFACE → LIFTOFF → ORBIT → COCKPIT etc.)
- Zustand store and state management
- HTML/DOM panels (AdminPanel, StarCorePanel, PlanetPanel, CockpitScreens)
- HUD overlay
- Easter eggs (constellation, alt-launch, flight mode, Death Star)
- Color palette (cyan/gold/warm/cool scheme)
- Cockpit interior layout and screen positions

---

## Files Modified

1. **`src/scenes/IntroScene.jsx`** — SurfacePlanet segments, Astronaut segments, Spacecraft segments, HorizonStar corona simplification, DistantPlanets (already low-poly), lighting adjustment
2. **`src/scenes/OrbitScene.jsx`** — CentralStar corona simplification, Planet geometry swap to dodecahedron, Moon geometry, OrbitRing segments, DeathStar segments, FlightShip segments, lighting adjustment
3. **`src/scenes/LiftoffScene.jsx`** — RisingRocket segments, flame cone segments
4. **`src/scenes/StarField.jsx`** — Reduce particle count to 2000, constellation star segments to 4
5. **`src/scenes/CockpitScene.jsx`** — Reduce cylinder/sphere detail mesh segments
6. **`src/utils/domainMaterials.js`** — Enforce flatShading, clamp metalness/roughness
7. **New: `src/utils/modelLoader.js`** — useModel hook, preloadModel, flatShading injection
8. **New: `public/models/README.md`** — Blender export guidelines and naming convention

## Files NOT Modified

- `src/App.jsx`
- `src/store/useStore.js`
- `src/components/panels/*.jsx`
- `src/components/ui/*.jsx`
- `src/components/hud/*.jsx`
- `src/hooks/*.js`
- `src/utils/cameraAnimations.js`
- `src/utils/planetRegistry.js`

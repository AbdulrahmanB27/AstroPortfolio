# Low-Poly Conversion + Model Loading Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all procedural 3D geometry to a cohesive low-poly aesthetic and add infrastructure for importing .glb models from Blender.

**Architecture:** Apply changes bottom-up — start with the material factory (`domainMaterials.js`) so all planets inherit low-poly materials, then update each scene file's geometry segments, corona layers, and lighting. Finally, create the model loader utility and public directory convention.

**Tech Stack:** React Three Fiber, Three.js, @react-three/drei (useGLTF)

**Spec:** `docs/superpowers/specs/2026-03-17-low-poly-conversion-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/utils/domainMaterials.js` | Enforce flatShading + PBR clamping on all planet materials |
| Modify | `src/scenes/StarField.jsx` | Reduce particle count, constellation star segments |
| Modify | `src/scenes/IntroScene.jsx` | HorizonStar corona simplification, geometry segments, material PBR, lighting |
| Modify | `src/scenes/OrbitScene.jsx` | CentralStar corona, planet→dodecahedron, moon/ring segments, Death Star, FlightShip, lighting |
| Modify | `src/scenes/LiftoffScene.jsx` | RisingRocket segment reductions, flame cone segments |
| Modify | `src/scenes/CockpitScene.jsx` | Reduce cockpit detail mesh segments, clamp PBR values |
| Create | `src/utils/modelLoader.js` | useModel hook, preloadModel, automatic flatShading injection |
| Create | `public/models/README.md` | Blender export guidelines and naming convention |

---

## Chunk 1: Foundation + Simple Scenes

### Task 1: domainMaterials.js — Enforce flatShading and PBR Clamping

**Files:**
- Modify: `src/utils/domainMaterials.js` (all lines)

This is the foundation — all planet materials flow through this factory.

- [ ] **Step 1: Add `flatShading: true` to every MeshStandardMaterial**

Every `case` in the switch and the `default` return must include `flatShading: true`.

- [ ] **Step 2: Clamp metalness to max 0.15**

Current values: `metallic` case has 0.8, `geometric` case has 0.5, default has 0.1.
Change all metalness values exceeding 0.15 down to 0.15.

- [ ] **Step 3: Clamp roughness to minimum 0.6**

Current values: `icy` has 0.3, `metallic` has 0.2, `geometric` has 0.5.
Change all roughness values below 0.6 up to 0.6.

- [ ] **Step 4: Verify the complete file**

The final file should look like:

```js
import * as THREE from 'three'

const DOMAIN_COLORS = {
  aerospace: '#4FC3F7',
  robotics: '#B0BEC5',
  software: '#CE93D8',
  mechanical: '#FFAB40',
}

export function getPlanetMaterial(project, schematic = false) {
  const color = new THREE.Color(project.color || DOMAIN_COLORS[project.domain] || '#ffffff')

  if (schematic) {
    return new THREE.MeshBasicMaterial({ color, wireframe: true })
  }

  switch (project.texture) {
    case 'icy':
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.1,
        emissive: new THREE.Color(color).multiplyScalar(0.15),
        flatShading: true,
      })
    case 'metallic':
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.15,
        flatShading: true,
      })
    case 'gaseous':
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.9, metalness: 0.0,
        emissive: new THREE.Color(color).multiplyScalar(0.2),
        flatShading: true,
      })
    case 'rocky':
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.95, metalness: 0.0,
        flatShading: true,
      })
    case 'geometric':
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.15,
        emissive: new THREE.Color(color).multiplyScalar(0.3),
        wireframe: false,
        flatShading: true,
      })
    default:
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.7, metalness: 0.1,
        flatShading: true,
      })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/domainMaterials.js
git commit -m "feat: enforce flatShading and PBR clamping in domainMaterials"
```

---

### Task 2: StarField.jsx — Reduce Particle Count and Constellation Segments

**Files:**
- Modify: `src/scenes/StarField.jsx:7,79`

- [ ] **Step 1: Reduce star count from 3000 to 2000**

Line 7: Change `const COUNT = 3000` to `const COUNT = 2000`.

- [ ] **Step 2: Reduce constellation star sphere segments from 6 to 4**

Line 79: Change `<sphereGeometry args={[0.25, 6, 6]} />` to `<sphereGeometry args={[0.25, 4, 4]} />`.

- [ ] **Step 3: Run dev server and verify starfield still looks good**

Run: `npm run dev`
Expected: Fewer but still dense starfield. Constellation stars slightly more faceted.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/StarField.jsx
git commit -m "feat: reduce starfield to 2000 particles, constellation segments to 4"
```

---

### Task 3: IntroScene.jsx — Geometry, Corona, Materials, Lighting

**Files:**
- Modify: `src/scenes/IntroScene.jsx` (multiple sections)

This is the largest single-file change. Work through sub-components one at a time.

#### 3a: SurfacePlanet geometry reduction

- [ ] **Step 1: Reduce main planet sphere segments**

Line 14: Change `<sphereGeometry args={[400, 64, 64]} />` to `<sphereGeometry args={[400, 32, 32]} />`.
This is the ground — needs to stay a sphere (too big for dodecahedron) but can halve segments.

- [ ] **Step 2: Clamp SurfacePlanet material metalness/roughness**

Line 15: Current `metalness={0.02}` — OK (under 0.15).
Current `roughness={0.8}` — OK (above 0.6). No change needed.

#### 3b: Astronaut geometry + material fixes

- [ ] **Step 3: Reduce Astronaut helmet segments**

Line 88: Change `<sphereGeometry args={[0.75, 12, 12]} />` to `<sphereGeometry args={[0.75, 8, 8]} />`.

- [ ] **Step 4: Reduce Astronaut helmet material roughness**

Line 89: Change `roughness={0.3}` to `roughness={0.6}`.

- [ ] **Step 5: Reduce visor segments (keep PBR exception)**

Line 94: Change `<sphereGeometry args={[0.55, 20, 20, 0, Math.PI, 0.25, 1.5]} />` to `<sphereGeometry args={[0.55, 8, 8, 0, Math.PI, 0.25, 1.5]} />`.

The visor is a spec exception — keep metalness 0.8 and roughness 0.05 for the iconic gold reflective look. However, **remove the `flatShading` absence** — the visor does not currently have flatShading, but per spec exceptions, it keeps its reflective look, so leave as-is.

- [ ] **Step 6: Clamp Astronaut torso material roughness**

Line 101: Change `roughness={0.3}` to `roughness={0.6}`.

- [ ] **Step 7: Clamp Astronaut backpack roughness**

Line 107: `roughness={0.4}` → `roughness={0.6}`.

- [ ] **Step 8: Clamp Astronaut arm material roughness**

Line 115: Change `roughness={0.35}` to `roughness={0.6}`.

- [ ] **Step 9: Clamp Astronaut leg material roughness**

Line 129: Change `roughness={0.35}` to `roughness={0.6}`.

#### 3c: Spacecraft geometry + material fixes

- [ ] **Step 10: Reduce Spacecraft body capsule segments**

Line 165: Change `<capsuleGeometry args={[0.5, 2.2, 6, 10]} />` to `<capsuleGeometry args={[0.5, 2.2, 4, 6]} />`.

- [ ] **Step 11: Clamp Spacecraft body material roughness**

Line 166: Change `roughness={0.2}` to `roughness={0.6}`.

- [ ] **Step 12: Reduce nose cone segments**

Line 177: Change `<coneGeometry args={[0.5, 0.6, 6]} />` to `<coneGeometry args={[0.5, 0.6, 5]} />`.

- [ ] **Step 13: Clamp nose cone material roughness**

Line 178: Change `roughness={0.2}` to `roughness={0.6}`.

- [ ] **Step 14: Clamp porthole torus material roughness**

Line 184: Change `roughness={0.3}` to `roughness={0.6}`.

- [ ] **Step 15: Clamp porthole window material (spec exception: windshield glass)**

Line 188-191: The porthole has `roughness={0.1}` and `metalness={0.5}`. Per spec, windshield glass keeps `metalness={0.6}`, `roughness={0.1}`. This porthole is glass-like, so keep it as a similar exception — change metalness from 0.5 to 0.6 for consistency with spec, keep roughness 0.1.

- [ ] **Step 16: Clamp fin material roughness**

Line 200: Change `roughness={0.2}` to `roughness={0.6}`.

#### 3d: HorizonStar corona simplification (6 layers → 3)

- [ ] **Step 17: Reduce star core segments**

Line 250: Change `<sphereGeometry args={[22, 48, 48]} />` to `<sphereGeometry args={[22, 12, 12]} />`.

- [ ] **Step 18: Rewrite corona layers from 6 to 3**

Replace lines 253-277 (inner hot corona through far halo) with exactly 2 layers:

```jsx
      {/* Inner glow */}
      <mesh ref={coronaRef}>
        <sphereGeometry args={[28, 10, 10]} />
        <meshBasicMaterial color="#FF8F00" transparent opacity={0.25} />
      </mesh>
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[50, 10, 10]} />
        <meshBasicMaterial color="#FFE082" transparent opacity={0.08} />
      </mesh>
```

Note: The `coronaRef` stays on the inner glow layer for the hover scale animation.

- [ ] **Step 19: Remove all 3 lens flare rings**

Delete lines 279-293 (the entire `<group ref={rayRef}>` block with the 3 torus meshes).

Also remove `rayRef` from the component:
- Remove `const rayRef = useRef()` (line 223)
- Remove the `rayRef.current.rotation.z` line inside useFrame (line 242)

- [ ] **Step 20: Reduce DistantOrbitRings torus segments**

Line 316: Change `<torusGeometry args={[r * 0.8, 0.1, 4, 96]} />` to `<torusGeometry args={[r * 0.8, 0.1, 4, 20]} />`.

- [ ] **Step 21: Reduce DistantPlanets aura sphere segments**

Line 354: Change `<sphereGeometry args={[m.size * 1.3, 16, 16]} />` to `<sphereGeometry args={[m.size * 1.3, 8, 8]} />`.

#### 3e: IntroScene lighting adjustments

- [ ] **Step 22: Increase ambient light**

Line 443: Change `<ambientLight intensity={0.05} />` to `<ambientLight intensity={0.12} />`.

- [ ] **Step 23: Remove ground bounce directional light**

Delete lines 466-471 (the ground bounce directional light with comment):
```jsx
      {/* Ground bounce — subtle warm reflection */}
      <directionalLight
        position={[0, -5, 0]}
        intensity={0.08}
        color="#FFF59D"
      />
```

- [ ] **Step 24: Verify visually**

Run: `npm run dev`
Navigate to SURFACE stage. Check:
- Planet surface has visible facets on dunes/rocks (already did)
- Star has 3 corona layers, no lens flares
- No spinning ring artifacts
- Astronaut and spacecraft look chunkier but recognizable

- [ ] **Step 25: Commit**

```bash
git add src/scenes/IntroScene.jsx
git commit -m "feat: low-poly IntroScene — reduce segments, simplify corona, clamp PBR"
```

---

## Chunk 2: Orbit + Liftoff Scenes

### Task 4: OrbitScene.jsx — Planet Geometry Swap, Corona, Segments, Materials, Lighting

**Files:**
- Modify: `src/scenes/OrbitScene.jsx` (multiple sections)

#### 4a: CentralStar + StarCorona

- [ ] **Step 1: Reduce CentralStar core segments**

Line 47: Change `<sphereGeometry args={[4, 48, 48]} />` to `<sphereGeometry args={[4, 12, 12]} />`.

- [ ] **Step 2: Simplify CentralStar corona layers**

Replace lines 56-63 (the 2 corona sphere layers) with the spec's 2 layers:

```jsx
          <mesh>
            <sphereGeometry args={[5.2, 10, 10]} />
            <meshBasicMaterial color="#FF8F00" transparent opacity={hovered ? 0.25 : 0.12} />
          </mesh>
          <mesh>
            <sphereGeometry args={[6.5, 10, 10]} />
            <meshBasicMaterial color="#FFE082" transparent opacity={0.08} />
          </mesh>
```

Segments reduced from 32 to 10. Colors updated to match spec (inner: #FF8F00, outer: #FFE082).

- [ ] **Step 3: Reduce CentralStar pointLight intensity**

Line 66: Change `intensity={3.5}` to `intensity={2.5}`.

- [ ] **Step 4: Reduce hover scan ring torus segments**

Line 72: Change `<torusGeometry args={[5.8, 0.04, 4, 96]} />` to `<torusGeometry args={[5.8, 0.04, 4, 16]} />`.

- [ ] **Step 5: Reduce StarCorona sphere segments**

Lines 127-128: Change `<sphereGeometry args={[8, 32, 32]} />` to `<sphereGeometry args={[8, 12, 12]} />`.
Lines 131-132: Change `<sphereGeometry args={[13, 32, 32]} />` to `<sphereGeometry args={[13, 12, 12]} />`.

#### 4b: Moon geometry

- [ ] **Step 6: Change Moon to dodecahedron**

Line 156: Change `<sphereGeometry args={[0.2, 8, 8]} />` to `<dodecahedronGeometry args={[0.2, 0]} />`.

Line 160: Add `flatShading` to the Moon material:
Change `<meshStandardMaterial color="#90CAF9" roughness={0.6} />` to `<meshStandardMaterial color="#90CAF9" roughness={0.7} flatShading />`.

#### 4c: ScanRing segments

- [ ] **Step 7: Reduce ScanRing torus segments**

Line 181: Change `<torusGeometry args={[radius * 1.3, 0.03, 4, 64]} />` to `<torusGeometry args={[radius * 1.3, 0.03, 4, 16]} />`.

#### 4d: Planet geometry swap to dodecahedron

- [ ] **Step 8: Change Planet visible mesh from sphere to dodecahedron**

Line 235: Change `<sphereGeometry args={[project.size, 32, 32]} />` to `<dodecahedronGeometry args={[project.size, 1]} />`.

- [ ] **Step 9: Clamp Planet material PBR and add flatShading**

Lines 239-243: Change material to:
```jsx
            <meshStandardMaterial
              color={project.color}
              roughness={0.7}
              metalness={0.12}
              emissive={color.clone().multiplyScalar(0.12)}
              flatShading
            />
```

- [ ] **Step 10: Reduce Planet surface torus segments**

Line 250: Change `<torusGeometry args={[project.size * 1.01, 0.02, 4, 64]} />` to `<torusGeometry args={[project.size * 1.01, 0.02, 4, 16]} />`.

- [ ] **Step 11: Reduce featured ring torus segments**

Line 259: Change `<torusGeometry args={[project.size * 1.5, 0.06, 4, 64]} />` to `<torusGeometry args={[project.size * 1.5, 0.06, 4, 16]} />`.

#### 4e: OrbitRing segments

- [ ] **Step 12: Reduce OrbitRing torus segments**

Line 319: Change `<torusGeometry args={[radius, 0.03, 4, 128]} />` to `<torusGeometry args={[radius, 0.03, 4, 24]} />`.

#### 4f: DeathStar geometry + materials

- [ ] **Step 13: Reduce DeathStar main sphere segments**

Line 394: Change `<sphereGeometry args={[4, 32, 32]} />` to `<sphereGeometry args={[4, 12, 12]} />`.

- [ ] **Step 14: Clamp DeathStar material PBR**

Lines 395-398: Change `metalness={0.4}` to `metalness={0.15}`, add `flatShading`.

- [ ] **Step 15: Clamp DeathStar dish material PBR**

Lines 404-407: Change `metalness={0.5}` to `metalness={0.15}`, change `roughness={0.6}` to keep (OK), add `flatShading`.

- [ ] **Step 16: Reduce DeathStar trench torus segments**

Line 413: Change `<torusGeometry args={[4.02, 0.08, 4, 64]} />` to `<torusGeometry args={[4.02, 0.08, 4, 16]} />`.

- [ ] **Step 17: Reduce DeathStar glow sphere segments**

Line 418: Change `<sphereGeometry args={[5.5, 24, 24]} />` to `<sphereGeometry args={[5.5, 12, 12]} />`.

#### 4g: FlightShip geometry + materials

- [ ] **Step 18: Reduce FlightShip fuselage capsule segments**

Line 468: Change `<capsuleGeometry args={[0.4, 2.5, 8, 16]} />` to `<capsuleGeometry args={[0.4, 2.5, 4, 8]} />`.

- [ ] **Step 19: Clamp FlightShip fuselage material PBR**

Line 469: Change `roughness={0.2} metalness={0.8}` to `roughness={0.6} metalness={0.15} flatShading`.

- [ ] **Step 20: Reduce FlightShip canopy capsule segments**

Line 474: Change `<capsuleGeometry args={[0.3, 1.0, 8, 16]} />` to `<capsuleGeometry args={[0.3, 1.0, 4, 8]} />`.

- [ ] **Step 21: Clamp FlightShip canopy material PBR (windshield exception)**

Line 475: Keep metalness high for glass look per spec exception. Change `roughness={0.1} metalness={0.9}` to `roughness={0.1} metalness={0.6}`.

- [ ] **Step 22: Clamp FlightShip wing material PBR**

Lines 481, 485: Change `roughness={0.5} metalness={0.5}` to `roughness={0.6} metalness={0.15} flatShading`.

- [ ] **Step 23: Clamp FlightShip tail fin material PBR**

Lines 491, 495: Change `roughness={0.4} metalness={0.6}` to `roughness={0.6} metalness={0.15} flatShading`.

- [ ] **Step 24: Reduce FlightShip engine cylinder segments**

Lines 501, 512: Change `<cylinderGeometry args={[0.2, 0.25, 0.6, 16]} />` to `<cylinderGeometry args={[0.2, 0.25, 0.6, 6]} />`.

- [ ] **Step 25: Clamp FlightShip engine material**

Lines 502, 513: Change `roughness={0.8}` → OK. Add `flatShading`.

- [ ] **Step 26: Reduce FlightShip engine glow sphere segments**

Lines 505, 516: Change `<sphereGeometry args={[0.18, 16, 16]} />` to `<sphereGeometry args={[0.18, 8, 8]} />`.

#### 4h: IntroPlanet torus segments

- [ ] **Step 27: Reduce IntroPlanet surface torus segments**

Line 561: Change `<torusGeometry args={[0.42, 0.012, 4, 24]} />` to `<torusGeometry args={[0.42, 0.012, 4, 16]} />`.

#### 4i: OrbitScene lighting

- [ ] **Step 28: Increase OrbitScene ambient light**

Line 601: Change `<ambientLight intensity={schematic ? 0.5 : 0.08} />` to `<ambientLight intensity={schematic ? 0.5 : 0.15} />`.

- [ ] **Step 29: Verify visually**

Run: `npm run dev`
Navigate to ORBIT stage. Check:
- Planets are dodecahedra (faceted, not smooth spheres)
- Orbit rings are visibly segmented but still read as circles
- Star has reduced corona layers
- Flight mode ship looks chunkier
- Death Star has visible facets

- [ ] **Step 30: Commit**

```bash
git add src/scenes/OrbitScene.jsx
git commit -m "feat: low-poly OrbitScene — dodecahedron planets, reduce segments, clamp PBR"
```

---

### Task 5: LiftoffScene.jsx — RisingRocket Segment Reductions

**Files:**
- Modify: `src/scenes/LiftoffScene.jsx:36-100`

The RisingRocket is a copy of Spacecraft from IntroScene. Apply matching reductions.

- [ ] **Step 1: Reduce body capsule segments**

Line 39: Change `<capsuleGeometry args={[0.5, 2.2, 6, 10]} />` to `<capsuleGeometry args={[0.5, 2.2, 4, 6]} />`.

- [ ] **Step 2: Clamp body material roughness**

Line 40: Change `roughness={0.2}` to `roughness={0.6}`.

- [ ] **Step 3: Reduce nose cone segments**

Line 51: Change `<coneGeometry args={[0.5, 0.6, 6]} />` to `<coneGeometry args={[0.5, 0.6, 5]} />`.

- [ ] **Step 4: Clamp nose cone material roughness**

Line 52: Change `roughness={0.2}` to `roughness={0.6}`.

- [ ] **Step 5: Clamp porthole torus material roughness**

Line 58: Change `roughness={0.3}` to `roughness={0.6}`.

- [ ] **Step 6: Clamp porthole glass material (windshield exception)**

Lines 62-64: Change `metalness={0.5}` to `metalness={0.6}` (spec exception for glass). Keep `roughness={0.1}`.

- [ ] **Step 7: Clamp fin material roughness**

Line 73: Change `roughness={0.2}` to `roughness={0.6}`.

- [ ] **Step 8: Reduce flame cone segments**

Line 87: Change `<coneGeometry args={[0.3, 1.5, 8]} />` to `<coneGeometry args={[0.3, 1.5, 6]} />`.
Line 92: Change `<coneGeometry args={[0.5, 2.5, 8]} />` to `<coneGeometry args={[0.5, 2.5, 6]} />`.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/LiftoffScene.jsx
git commit -m "feat: low-poly LiftoffScene — reduce rocket and flame segments, clamp PBR"
```

---

## Chunk 3: Cockpit + Model Infrastructure

### Task 6: CockpitScene.jsx — Reduce Detail Mesh Segments, Clamp PBR

**Files:**
- Modify: `src/scenes/CockpitScene.jsx` (detail meshes only)

The cockpit uses mostly box geometry (no change needed). Only spheres and cylinders need reduction.

- [ ] **Step 1: Reduce status LED sphere segments**

Lines 369-370: Change `<sphereGeometry args={[0.012, 8, 8]} />` to `<sphereGeometry args={[0.012, 6, 6]} />`.

- [ ] **Step 2: Reduce side console cylinder segments**

Line 541: Change `<cylinderGeometry args={[0.012, 0.012, 0.015, 8]} />` to `<cylinderGeometry args={[0.012, 0.012, 0.015, 6]} />`.

- [ ] **Step 3: Add flatShading to cockpit wall/floor materials**

The cockpit materials have higher metalness values (0.3-0.6 on structural ribs, frame, etc.). Per the spec, cockpit scene has "no lighting changes" and these are interior materials. However, the spec says flatShading on all meshStandardMaterial. Add `flatShading` to each meshStandardMaterial in CockpitInterior that doesn't already have it.

Scan through and add `flatShading` to these materials:
- Floor plane (line 188)
- Ceiling plane (line 204)
- Left/right wall planes (lines 210, 215)
- Back wall plane (line 222)
- Dashboard panels (lines 231, 237, 243)
- Glare shield (line 249)
- Dashboard lip (line 255)
- Windshield panes: these are glass exceptions — keep metalness 0.9 and roughness 0.05
- Overhead panel (line 444)
- Center pedestal (line 469)
- Side console meshes
- Pilot seat meshes
- Structural ribs
- Wall detail panels

For brevity — add `flatShading` attribute to every `meshStandardMaterial` JSX element in CockpitInterior, EXCEPT the windshield panes (3 panes at lines 392, 400, 408 — spec exception for glass).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/CockpitScene.jsx
git commit -m "feat: low-poly CockpitScene — reduce detail segments, add flatShading"
```

---

### Task 7: Model Loader Utility

**Files:**
- Create: `src/utils/modelLoader.js`

- [ ] **Step 1: Create the modelLoader.js utility**

```js
import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'

/**
 * Hook to load a .glb model. Returns { scene, nodes, materials } or null.
 * Automatically injects flatShading on all imported materials.
 */
export function useModel(path) {
  let result = null
  try {
    result = useGLTF(path)
  } catch {
    return null
  }

  useEffect(() => {
    if (!result) return
    result.scene.traverse((child) => {
      if (child.isMesh && child.material) {
        const mat = child.material
        if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) {
          mat.flatShading = true
          mat.needsUpdate = true
        }
      }
    })
  }, [result])

  return result
    ? { scene: result.scene, nodes: result.nodes, materials: result.materials }
    : null
}

/**
 * Preload a model for eager loading.
 */
export function preloadModel(path) {
  useGLTF.preload(path)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/modelLoader.js
git commit -m "feat: add modelLoader utility with useModel hook and flatShading injection"
```

---

### Task 8: Public Models Directory + README

**Files:**
- Create: `public/models/README.md`

- [ ] **Step 1: Create the public/models directory and README**

```bash
mkdir -p public/models
```

- [ ] **Step 2: Write the Blender export guidelines**

Create `public/models/README.md`:

```md
# 3D Model Import Convention

## Naming

Place `.glb` files here. Components check for their matching model:
- `spacecraft.glb` — replaces the procedural Spacecraft component
- `astronaut.glb` — replaces the procedural Astronaut component
- etc.

## Blender Export Settings

1. **Format:** `.glb` (binary glTF — smaller than `.gltf`)
2. **Apply transforms** before export (Ctrl+A → All Transforms)
3. **Flat shading** in Blender (the loader also injects it automatically)
4. **Vertex count:** Keep under 500 per object for low-poly style
5. **Materials:** Single material per mesh where possible
6. **Mesh naming:** Use descriptive names (e.g., `Body`, `Wing_L`, `Engine`)

## Usage in Components

```jsx
import { useModel } from '../utils/modelLoader'

function Spacecraft() {
  const model = useModel('/models/spacecraft.glb')
  if (model) return <primitive object={model.scene} />
  // else: render procedural fallback geometry below
  return (
    <group>
      {/* procedural geometry */}
    </group>
  )
}
```
```

- [ ] **Step 3: Commit**

```bash
git add public/models/README.md
git commit -m "feat: add public/models directory with Blender export guidelines"
```

---

## Verification Checklist

After all tasks are complete, run through this final verification:

- [ ] `npm run dev` starts without errors
- [ ] PROLOGUE: Starfield renders, reduced count not jarring
- [ ] SURFACE: Planet surface has visible facets, astronaut/spacecraft look chunkier, star has 3 corona layers (no lens flare rings), lighting is slightly brighter
- [ ] LIFTOFF: Rocket flame cones have visible facets, rocket body matches surface spacecraft
- [ ] ORBIT: Planets are dodecahedra, orbit rings are visibly segmented, star has 2 corona layers, moons are small dodecahedra
- [ ] COCKPIT: Interior has flatShading on all non-glass surfaces, LED dots and console cylinders are more faceted
- [ ] Flight mode: FlightShip has chunkier geometry, Death Star is faceted
- [ ] Easter eggs: Constellation still visible, alt-launch works, flight mode activates
- [ ] `npm run build` completes without errors

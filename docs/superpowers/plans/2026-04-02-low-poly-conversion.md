# Low-Poly Conversion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 3D scene geometry to a cohesive low-poly aesthetic and add .glb model loading infrastructure.

**Architecture:** Reduce segment counts on all spheres/tori/capsules, add `flatShading: true` to every `meshStandardMaterial`, simplify multi-layer star coronas to 3 layers each, and provide a `useModel` hook so components can swap procedural geometry for Blender .glb imports.

**Tech Stack:** React Three Fiber, Three.js, `@react-three/drei` (`useGLTF`), Zustand store (no changes)

**Spec doc:** `docs/superpowers/specs/2026-03-17-low-poly-conversion-design.md`

---

## Chunk 1: Smallest scenes — StarField, LiftoffScene, CockpitScene

**Files:**
- Modify: `src/scenes/StarField.jsx`
- Modify: `src/scenes/LiftoffScene.jsx`
- Modify: `src/scenes/CockpitScene.jsx`

### Task 1: StarField — reduce particle count and constellation segments

- [ ] **Step 1: Edit `src/scenes/StarField.jsx`**

  Change `const COUNT = 3000` → `const COUNT = 2000` (line 6).

  Change constellation star geometry from `sphereGeometry args={[0.25, 6, 6]}` → `sphereGeometry args={[0.25, 4, 4]}` (line 78).

- [ ] **Step 2: Visual check**

  Run `npm run dev`, open http://localhost:5173. Confirm stars still visible in background, constellation still present but slightly coarser.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scenes/StarField.jsx
  git commit -m "perf: reduce starfield count 3000→2000, constellation segments 6→4"
  ```

---

### Task 2: LiftoffScene — reduce rocket and flame geometry

**Target areas in `src/scenes/LiftoffScene.jsx`:**
- `RisingRocket` body: `capsuleGeometry args={[0.5, 2.2, 6, 10]}` → `args={[0.5, 2.2, 4, 6]}`
- Inner flame cone: `coneGeometry args={[0.3, 1.5, 8]}` → `args={[0.3, 1.5, 6]}`
- Outer flame cone: `coneGeometry args={[0.5, 2.5, 8]}` → `args={[0.5, 2.5, 6]}`

- [ ] **Step 1: Edit `src/scenes/LiftoffScene.jsx`**

  Line ~39: `capsuleGeometry args={[0.5, 2.2, 6, 10]}` → `args={[0.5, 2.2, 4, 6]}`

  Line ~87: `coneGeometry args={[0.3, 1.5, 8]}` → `args={[0.3, 1.5, 6]}`

  Line ~92: `coneGeometry args={[0.5, 2.5, 8]}` → `args={[0.5, 2.5, 6]}`

- [ ] **Step 2: Visual check**

  Confirm liftoff sequence still plays with faceted rocket body and slightly chunkier flames.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scenes/LiftoffScene.jsx
  git commit -m "perf: reduce liftoff rocket and flame geometry segments"
  ```

---

### Task 3: CockpitScene — reduce detail geometry segments

**Target areas in `src/scenes/CockpitScene.jsx`:**
- Status LEDs (4 meshes): `sphereGeometry args={[0.012, 8, 8]}` → `args={[0.012, 6, 6]}`
- Side console button cylinders (15 meshes, left side): `cylinderGeometry args={[0.012, 0.012, 0.015, 8]}` → `args={[0.012, 0.012, 0.015, 6]}`

- [ ] **Step 1: Edit `src/scenes/CockpitScene.jsx`**

  Find `sphereGeometry args={[0.012, 8, 8]}` (LED dots, ~line 369) and change to `args={[0.012, 6, 6]}`.

  Find `cylinderGeometry args={[0.012, 0.012, 0.015, 8]}` (console buttons, ~line 541) and change to `args={[0.012, 0.012, 0.015, 6]}`.

- [ ] **Step 2: Visual check**

  Enter cockpit (About → surface menu). Confirm LEDs and console buttons still visible and shaped correctly.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scenes/CockpitScene.jsx
  git commit -m "perf: reduce cockpit LED and button cylinder segments 8→6"
  ```

---

## Chunk 2: IntroScene — HorizonStar simplification + lighting + Astronaut

**Files:**
- Modify: `src/scenes/IntroScene.jsx`

### Task 4: HorizonStar — reduce from 6 corona layers to 3, remove lens flare rings

The current `HorizonStar` component (`src/scenes/IntroScene.jsx` ~line 220) has:
- 6 corona sphere layers (core, inner, mid, warm haze, outer glow, far halo)
- 3 rotating lens flare torus rings

Replace with 3 layers only:
1. Core — `sphereGeometry(22, 12, 12)`, `meshBasicMaterial` color `#FFF59D`
2. Inner glow — `sphereGeometry(26, 10, 10)`, transparent, color `#FF8F00`, opacity `0.25`
3. Outer glow — `sphereGeometry(45, 10, 10)`, transparent, color `#FFE082`, opacity `0.08`

Drop: mid corona, warm haze, far halo spheres, and the entire rotating `<group ref={rayRef}>` with 3 torus rings. Remove the `rayRef` ref declaration and its `useFrame` update (`rayRef.current.rotation.z = ...`).

- [ ] **Step 1: Rewrite HorizonStar corona JSX**

  In `src/scenes/IntroScene.jsx`, replace the entire JSX block inside `<group position={[15, 12, -120]}>` with:

  ```jsx
  {/* Star core */}
  <mesh>
    <sphereGeometry args={[22, 12, 12]} />
    <meshBasicMaterial color="#FFF59D" />
  </mesh>
  {/* Inner glow */}
  <mesh ref={coronaRef}>
    <sphereGeometry args={[26, 10, 10]} />
    <meshBasicMaterial color="#FF8F00" transparent opacity={hovered ? 0.32 : 0.25} />
  </mesh>
  {/* Outer glow */}
  <mesh>
    <sphereGeometry args={[45, 10, 10]} />
    <meshBasicMaterial color="#FFE082" transparent opacity={0.08} />
  </mesh>

  {/* Key light */}
  <pointLight ref={lightRef} color="#FFD54F" intensity={4.5} distance={500} decay={1.0} />
  {/* Warm atmosphere */}
  <pointLight color="#FF8F00" intensity={1.5} distance={250} decay={1.5} />
  ```

- [ ] **Step 2: Remove unused refs and useFrame logic**

  Remove `const rayRef = useRef()` from `HorizonStar`.

  Remove the `rayRef.current.rotation.z = state.clock.elapsedTime * 0.012` line from `useFrame`.

  Update the `coronaRef` hover opacity in `useFrame` to lerp toward `hovered ? 0.32 : 0.25` (instead of driving scale only — keep the existing scale lerp logic, just update the opacity comment).

  The `targetScaleVec` ref and scale lerp can stay unchanged.

- [ ] **Step 3: Visual check**

  Reload app. Confirm the intro surface scene still shows the large star on the horizon. Should look simpler/chunkier with visible facets on the star sphere. No spinning lens flare rings.

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/IntroScene.jsx
  git commit -m "feat: simplify HorizonStar corona 6 layers → 3, remove lens flare rings"
  ```

---

### Task 5: IntroScene — lighting simplification + Astronaut visor segments

**Lighting change:** Remove the ground bounce `directionalLight` (intensity 0.08, position `[0,-5,0]`, color `#FFF59D`). Increase ambient from `0.05` to `0.12`.

**Astronaut visor:** `sphereGeometry args={[0.55, 20, 20, 0, Math.PI, 0.25, 1.5]}` → `args={[0.55, 8, 8, 0, Math.PI, 0.25, 1.5]}` (~line 94). Keep its metalness 0.8 and roughness 0.05 (visor exception).

**DistantOrbitRings:** torus segments `96` → `24` (~line 316).

- [ ] **Step 1: Edit `src/scenes/IntroScene.jsx`**

  Change `<ambientLight intensity={0.05} />` → `<ambientLight intensity={0.12} />` (~line 443).

  Remove the ground bounce directional light block (~lines 465-469):
  ```jsx
  {/* Ground bounce — subtle warm reflection */}
  <directionalLight
    position={[0, -5, 0]}
    intensity={0.08}
    color="#FFF59D"
  />
  ```

  Change astronaut visor: `sphereGeometry args={[0.55, 20, 20, ...]}` → `args={[0.55, 8, 8, 0, Math.PI, 0.25, 1.5]}`.

  Change DistantOrbitRings torus: `torusGeometry args={[r * 0.8, 0.1, 4, 96]}` → `args={[r * 0.8, 0.1, 4, 24]}`.

- [ ] **Step 2: Visual check**

  Confirm intro scene still looks correct. The ambient should be slightly brighter, astronaut visor still golden, orbit rings in background still visible.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scenes/IntroScene.jsx
  git commit -m "feat: IntroScene ambient 0.05→0.12, remove ground bounce, reduce segments"
  ```

---

## Chunk 3: OrbitScene — full low-poly conversion

**Files:**
- Modify: `src/scenes/OrbitScene.jsx`

### Task 6: OrbitScene — CentralStar + StarCorona segments

**CentralStar** (`src/scenes/OrbitScene.jsx` ~line 47):
- Main sphere: `sphereGeometry args={[4, 48, 48]}` → `args={[4, 12, 12]}`
- Inner corona: `sphereGeometry args={[5.2, 32, 32]}` → `args={[5.2, 10, 10]}`
- Outer corona: `sphereGeometry args={[6.5, 32, 32]}` → `args={[6.5, 10, 10]}`
- Hover scan ring: `torusGeometry args={[5.8, 0.04, 4, 96]}` → `args={[5.8, 0.04, 4, 24]}`

**StarCorona** (~line 126):
- Ring 1: `sphereGeometry args={[8, 32, 32]}` → `args={[8, 10, 10]}`
- Ring 2: `sphereGeometry args={[13, 32, 32]}` → `args={[13, 10, 10]}`

**OrbitRing** (~line 319):
- `torusGeometry args={[radius, 0.03, 4, 128]}` → `args={[radius, 0.03, 4, 24]}`

**Ambient light** (~line 601):
- `intensity={schematic ? 0.5 : 0.08}` → `intensity={schematic ? 0.5 : 0.15}`

**Star pointLight** (~line 66):
- `intensity={3.5}` → `intensity={2.5}`

- [ ] **Step 1: Edit `src/scenes/OrbitScene.jsx` — CentralStar and StarCorona**

  Apply all segment reductions listed above.

- [ ] **Step 2: Edit OrbitRing torus + ambient + pointLight**

  Apply remaining changes listed above.

- [ ] **Step 3: Visual check**

  Run app, enter orbit view. Central star should have visible facets. Orbit rings still visible. Lighting slightly brighter ambient.

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/OrbitScene.jsx
  git commit -m "feat: reduce CentralStar/StarCorona/OrbitRing segments, ambient 0.08→0.15, pointLight 3.5→2.5"
  ```

---

### Task 7: OrbitScene — Planet geometry → dodecahedron + flatShading + Moon

**Planet component** (~line 187):

The visible planet mesh currently uses:
```jsx
<sphereGeometry args={[project.size, 32, 32]} />
<meshStandardMaterial color={project.color} roughness={0.6} metalness={0.2} emissive={color.clone().multiplyScalar(0.12)} />
```

Replace with:
```jsx
<dodecahedronGeometry args={[project.size, 1]} />
<meshStandardMaterial
  color={project.color}
  roughness={0.7}
  metalness={0.08}
  flatShading
  emissive={color.clone().multiplyScalar(0.08)}
/>
```

Surface equator torus: `torusGeometry args={[project.size * 1.01, 0.02, 4, 64]}` → `args={[project.size * 1.01, 0.02, 4, 16]}`

Featured ring torus: `torusGeometry args={[project.size * 1.5, 0.06, 4, 64]}` → `args={[project.size * 1.5, 0.06, 4, 16]}`

**Moon component** (~line 155): replace sphere with dodecahedron + flatShading:
```jsx
{/* before: */}
<sphereGeometry args={[0.2, 8, 8]} />
{schematic ? <meshBasicMaterial .../> : <meshStandardMaterial color="#90CAF9" roughness={0.6} />}

{/* after: */}
<dodecahedronGeometry args={[0.2, 0]} />
{schematic ? <meshBasicMaterial .../> : <meshStandardMaterial color="#90CAF9" roughness={0.7} flatShading />}
```

**ScanRing** (~line 180): `torusGeometry args={[radius * 1.3, 0.03, 4, 64]}` → `args={[radius * 1.3, 0.03, 4, 16]}`

**IntroPlanet** surface torus (~line 559): `torusGeometry args={[0.42, 0.012, 4, 24]}` → `args={[0.42, 0.012, 4, 12]}`

- [ ] **Step 1: Edit Planet mesh geometry and material**

  Apply dodecahedron swap + flatShading + reduced metalness/emissive + reduced torus segments.

- [ ] **Step 2: Edit Moon, ScanRing, IntroPlanet**

  Apply remaining changes.

- [ ] **Step 3: Visual check**

  In orbit view, click a planet to see its panel open correctly. All planets should appear faceted/low-poly. Moons should be faceted. Scan ring on hover still animates.

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/OrbitScene.jsx
  git commit -m "feat: planets → dodecahedron + flatShading, moon faceted, ring segments reduced"
  ```

---

### Task 8: OrbitScene — DeathStar + FlightShip segments

**DeathStar** (~line 394):
- Main sphere: `sphereGeometry args={[4, 32, 32]}` → `args={[4, 12, 12]}`
- Dish: `sphereGeometry args={[1.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]}` → `args={[1.2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]}`
- Trench torus: `torusGeometry args={[4.02, 0.08, 4, 64]}` → `args={[4.02, 0.08, 4, 16]}`
- Glow sphere: `sphereGeometry args={[5.5, 24, 24]}` → `args={[5.5, 8, 8]}`
- Main material: add `flatShading`, change `metalness={0.4}` → `metalness={0.1}`

**FlightShip** (~line 443):
- Fuselage: `capsuleGeometry args={[0.4, 2.5, 8, 16]}` → `args={[0.4, 2.5, 4, 8]}`
- Canopy: `capsuleGeometry args={[0.3, 1.0, 8, 16]}` → `args={[0.3, 1.0, 4, 8]}`
- Engine cylinders (×2): `cylinderGeometry args={[0.2, 0.25, 0.6, 16]}` → `args={[0.2, 0.25, 0.6, 8]}`
- Engine glow spheres (×2): `sphereGeometry args={[0.18, 16, 16]}` → `args={[0.18, 8, 8]}`

- [ ] **Step 1: Edit DeathStar geometry and material**

  Apply all segment reductions + flatShading + metalness change.

- [ ] **Step 2: Edit FlightShip geometry**

  Apply all segment reductions.

- [ ] **Step 3: Visual check**

  In orbit, unlock flight mode (↑↑↓↓←→), fly toward sector 7G. DeathStar should fade in and appear faceted. Flight ship visible and well-shaped.

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/OrbitScene.jsx
  git commit -m "feat: DeathStar + FlightShip segments reduced, DeathStar flatShading"
  ```

---

## Chunk 4: domainMaterials + modelLoader infrastructure

**Files:**
- Modify: `src/utils/domainMaterials.js`
- Create: `src/utils/modelLoader.js`
- Create: `public/models/README.md`

### Task 9: domainMaterials — enforce flatShading + clamp PBR params

Current `src/utils/domainMaterials.js` has these texture type materials:
- `icy`: roughness 0.3, metalness 0.1
- `metallic`: roughness 0.2, metalness 0.8
- `gaseous`: roughness 0.9, metalness 0.0
- `rocky`: roughness 0.95, metalness 0.0
- `geometric`: roughness 0.5, metalness 0.5
- `default`: roughness 0.7, metalness 0.1

Low-poly targets: metalness max 0.15, roughness min 0.6. Plus `flatShading: true` on all.

New values:
- `icy`: roughness 0.65, metalness 0.1 (already fine), add `flatShading`
- `metallic`: roughness 0.65, metalness 0.15, add `flatShading`
- `gaseous`: roughness 0.9 ok, metalness 0.0 ok, add `flatShading`
- `rocky`: roughness 0.95 ok, metalness 0.0 ok, add `flatShading`
- `geometric`: roughness 0.65, metalness 0.15, add `flatShading`
- `default`: roughness 0.7 ok, metalness 0.1 ok, add `flatShading`

- [ ] **Step 1: Rewrite `src/utils/domainMaterials.js`**

  Replace the entire file with:

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
          color,
          roughness: 0.65,
          metalness: 0.1,
          flatShading: true,
          emissive: new THREE.Color(color).multiplyScalar(0.15),
        })
      case 'metallic':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.65,
          metalness: 0.15,
          flatShading: true,
        })
      case 'gaseous':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          metalness: 0.0,
          flatShading: true,
          emissive: new THREE.Color(color).multiplyScalar(0.2),
        })
      case 'rocky':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.95,
          metalness: 0.0,
          flatShading: true,
        })
      case 'geometric':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.65,
          metalness: 0.15,
          flatShading: true,
          emissive: new THREE.Color(color).multiplyScalar(0.3),
        })
      default:
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.7,
          metalness: 0.1,
          flatShading: true,
        })
    }
  }
  ```

- [ ] **Step 2: Visual check**

  Reload. Orbit view planets (which use domain materials if their texture type is set) should appear matte and faceted.

- [ ] **Step 3: Commit**

  ```bash
  git add src/utils/domainMaterials.js
  git commit -m "feat: domainMaterials flatShading everywhere, clamp metalness ≤0.15, roughness ≥0.65"
  ```

---

### Task 10: Create modelLoader.js — useModel hook for .glb import

- [ ] **Step 1: Create `src/utils/modelLoader.js`**

  ```js
  import { useGLTF } from '@react-three/drei'
  import * as THREE from 'three'

  /**
   * Hook to load a .glb model from public/models/.
   * Returns { scene, nodes, materials } or null if path is not provided.
   * Automatically applies flatShading to all loaded materials to match scene style.
   *
   * Usage:
   *   const model = useModel('/models/spacecraft.glb')
   *   if (model) return <primitive object={model.scene} />
   *   // else: render procedural fallback geometry
   */
  export function useModel(path) {
    if (!path) return null

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const gltf = useGLTF(path)

    // Inject flatShading on all standard materials to match low-poly scene style
    gltf.scene.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.flatShading = true
            mat.needsUpdate = true
          }
        })
      }
    })

    return gltf
  }

  /**
   * Eagerly preload a model so it's ready before the component mounts.
   * Call this at module level outside components.
   *
   * Usage:
   *   preloadModel('/models/spacecraft.glb')
   */
  export function preloadModel(path) {
    if (path) useGLTF.preload(path)
  }
  ```

- [ ] **Step 2: Verify import works**

  Open `src/utils/modelLoader.js` and confirm it saved correctly. No runtime check needed until a model is actually dropped in.

- [ ] **Step 3: Commit**

  ```bash
  git add src/utils/modelLoader.js
  git commit -m "feat: add useModel hook and preloadModel utility for .glb Blender imports"
  ```

---

### Task 11: Create public/models/README.md — Blender export guidelines

- [ ] **Step 1: Create `public/models/README.md`**

  ```markdown
  # Models Directory

  Drop `.glb` files here to override procedural geometry in the scene.

  ## Naming Convention

  | File | Replaces |
  |------|----------|
  | `spacecraft.glb` | `Spacecraft` in IntroScene / LiftoffScene |
  | `astronaut.glb`  | `Astronaut` in IntroScene |
  | `flight_ship.glb`| `FlightShip` in OrbitScene |

  ## Blender Export Settings

  - **Format:** glTF 2.0 Binary (`.glb`) — single file, smaller
  - **Apply transforms** before export (Object → Apply → All Transforms)
  - **Geometry:** Apply Flat Shading in Blender, or the loader will inject it
  - **Target poly count:** ≤ 500 triangles per object for low-poly style
  - **Materials:** One material per mesh where possible; use solid colors (no textures needed)
  - **Mesh naming:** Use descriptive names, e.g. `Body`, `Wing_L`, `Engine_R`
  - **Scale:** Export in meters. Scene units = 1 unit ≈ 1 meter.

  ## Integration Pattern

  ```jsx
  import { useModel } from '../utils/modelLoader'

  function Spacecraft() {
    const model = useModel('/models/spacecraft.glb')
    if (model) return <primitive object={model.scene} />
    // Fallback: procedural geometry
    return (
      <group>
        <mesh>
          <capsuleGeometry args={[0.5, 2.2, 4, 6]} />
          ...
        </mesh>
      </group>
    )
  }
  ```
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add public/models/README.md
  git commit -m "docs: add public/models/ directory with Blender export guidelines"
  ```

---

## Final verification

- [ ] Run `npm run dev` and walk through the full experience:
  - [ ] Intro prologue sweep: star visible, planets visible in background
  - [ ] Surface scene: astronaut on planet, rocket nearby, star on horizon — all faceted
  - [ ] Launch sequence: rocket lifts off with faceted body and flame
  - [ ] Orbit view: all planets faceted/dodecahedral, star has visible facets, orbit rings visible
  - [ ] Click a planet: planet panel opens correctly
  - [ ] Click star: star core panel opens
  - [ ] Cockpit entry: screens load, zoom in/out works
  - [ ] No console errors
- [ ] Run `npm run build` — confirm no build errors

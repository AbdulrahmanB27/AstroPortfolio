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
- **Apply transforms** before export (Object > Apply > All Transforms)
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

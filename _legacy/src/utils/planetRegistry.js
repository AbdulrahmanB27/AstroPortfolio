/**
 * Module-level mutable registry for planet world positions.
 *
 * Planet components write here each frame (via useFrame).
 * Camera handlers read from here when flying to a planet.
 *
 * Deliberately NOT in Zustand — positions change 60fps and don't need
 * to trigger React re-renders. Mutable JS object is the right tool here.
 */
const planetRegistry = {
  positions: {},
  flightShip: {
    position: { x: 0, y: 10, z: 80 },
    rotation: { x: 0, y: 0, z: 0 }
  }
}

export default planetRegistry

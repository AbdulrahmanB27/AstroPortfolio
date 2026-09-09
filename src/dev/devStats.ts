/**
 * Renderer statistics shared between the canvas (writer: DevHelpers, once per frame from
 * `gl.info`) and the DOM overlay (reader: DevOverlay, on its own rAF loop). A plain
 * mutable object keeps per-frame work out of React state.
 */
export interface DevStats {
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  programs: number;
  /** performance.now() of the last write; 0 until DevHelpers has run once. */
  updatedAt: number;
}

export const devStats: DevStats = {
  drawCalls: 0,
  triangles: 0,
  points: 0,
  lines: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  updatedAt: 0,
};

export function resetDevStats(): void {
  devStats.drawCalls = 0;
  devStats.triangles = 0;
  devStats.points = 0;
  devStats.lines = 0;
  devStats.geometries = 0;
  devStats.textures = 0;
  devStats.programs = 0;
  devStats.updatedAt = 0;
}

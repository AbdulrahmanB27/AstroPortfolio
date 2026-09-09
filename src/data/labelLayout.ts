/**
 * Screen-space label placement for planets. Greedy, deterministic, cheap enough to run
 * every frame for a few dozen labels. Labels never overlap each other, the star, or other
 * planets; emphasized (selected / hovered) labels are placed first and always shown.
 */

export type LabelAnchor = 'right' | 'left' | 'below' | 'above' | 'upper-right' | 'lower-right' | 'upper-left' | 'lower-left';
export type LabelEmphasis = 'selected' | 'hover' | 'normal';
export type LabelDensity = 'all' | 'balanced' | 'minimal';

export interface LabelInput {
  id: string;
  /** Planet center in CSS pixels. */
  x: number;
  y: number;
  planetRadiusPx: number;
  /** Measured label box size in CSS pixels. */
  width: number;
  height: number;
  /** Higher wins a slot when space is tight. */
  priority: number;
  emphasis: LabelEmphasis;
}

export interface LabelObstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/** Rectangular no-go zones (HUD controls, panels). */
export type LabelObstacleRect = Rect & { id: string };

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelPlacement {
  id: string;
  /** Top-left corner of the label box. */
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: LabelAnchor;
  opacity: number;
  visible: boolean;
}

export interface LabelLayoutOptions {
  density?: LabelDensity;
  /** Screen rectangles labels must avoid (e.g. HUD buttons). */
  blockedRects?: LabelObstacleRect[];
  /** Gap between a planet's edge and its label. */
  gap?: number;
  /** Minimum distance from the viewport edge. */
  margin?: number;
}

/**
 * Anchor preference for one planet, ordered outward from the centre of the system.
 *
 * Trying 'right' first for every planet put a label on the inside of the disc whenever the
 * outside would have left the viewport, so two neighbouring planets could end up with
 * their names on opposite sides — and the reader could not tell which name belonged to
 * which. Preferring the outward side keeps the association obvious and keeps the text off
 * the orbit lines and the star.
 */
function anchorOrder(x: number, y: number, centreX: number, centreY: number): LabelAnchor[] {
  const left = x < centreX;
  const up = y < centreY;
  const horizontal: LabelAnchor[] = left ? ['left', 'right'] : ['right', 'left'];
  const diagonals: LabelAnchor[] = left
    ? up
      ? ['upper-left', 'lower-left', 'upper-right', 'lower-right']
      : ['lower-left', 'upper-left', 'lower-right', 'upper-right']
    : up
      ? ['upper-right', 'lower-right', 'upper-left', 'lower-left']
      : ['lower-right', 'upper-right', 'lower-left', 'upper-left'];
  const vertical: LabelAnchor[] = up ? ['above', 'below'] : ['below', 'above'];
  return [...horizontal, ...vertical, ...diagonals];
}
const EMPHASIS_RANK: Record<LabelEmphasis, number> = { selected: 3, hover: 2, normal: 1 };

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function circleRect(x: number, y: number, r: number): Rect {
  return { left: x - r, top: y - r, right: x + r, bottom: y + r };
}

function boxFor(label: LabelInput, anchor: LabelAnchor, gap: number): Rect {
  const r = label.planetRadiusPx + gap;
  const { width: w, height: h, x, y } = label;
  switch (anchor) {
    case 'right':
      return { left: x + r, top: y - h / 2, right: x + r + w, bottom: y + h / 2 };
    case 'left':
      return { left: x - r - w, top: y - h / 2, right: x - r, bottom: y + h / 2 };
    case 'below':
      return { left: x - w / 2, top: y + r, right: x + w / 2, bottom: y + r + h };
    case 'above':
      return { left: x - w / 2, top: y - r - h, right: x + w / 2, bottom: y - r };
    case 'lower-right':
      return { left: x + r * 0.7, top: y + r * 0.7, right: x + r * 0.7 + w, bottom: y + r * 0.7 + h };
    case 'upper-right':
      return { left: x + r * 0.7, top: y - r * 0.7 - h, right: x + r * 0.7 + w, bottom: y - r * 0.7 };
    case 'lower-left':
      return { left: x - r * 0.7 - w, top: y + r * 0.7, right: x - r * 0.7, bottom: y + r * 0.7 + h };
    case 'upper-left':
      return { left: x - r * 0.7 - w, top: y - r * 0.7 - h, right: x - r * 0.7, bottom: y - r * 0.7 };
  }
}

function insideViewport(box: Rect, width: number, height: number, margin: number): boolean {
  return box.left >= margin && box.top >= margin && box.right <= width - margin && box.bottom <= height - margin;
}

function clampToViewport(box: Rect, width: number, height: number, margin: number): Rect {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const left = Math.min(Math.max(box.left, margin), Math.max(margin, width - margin - w));
  const top = Math.min(Math.max(box.top, margin), Math.max(margin, height - margin - h));
  return { left, top, right: left + w, bottom: top + h };
}

function opacityFor(emphasis: LabelEmphasis, density: LabelDensity): number {
  if (emphasis !== 'normal') return 1;
  // These drive the project name. The category line is rendered at 62% of whatever this
  // returns, so the pair keeps its hierarchy at every density. The balanced value used to
  // be 0.55 against a category pinned at 1, which inverted the hierarchy — the name is now
  // the brighter half and the pair still carries less ink overall than that arrangement.
  switch (density) {
    case 'all':
      return 0.9;
    case 'balanced':
      return 0.72;
    case 'minimal':
      return 0.6;
  }
}

export function layoutLabels(
  labels: LabelInput[],
  obstacles: LabelObstacle[],
  viewport: { width: number; height: number },
  options: LabelLayoutOptions = {},
): LabelPlacement[] {
  const { density = 'balanced', gap = 6, margin = 8, blockedRects = [] } = options;
  const ordered = [...labels].sort(
    (a, b) => EMPHASIS_RANK[b.emphasis] - EMPHASIS_RANK[a.emphasis] || b.priority - a.priority || a.id.localeCompare(b.id),
  );

  const fixedObstacles: Rect[] = [...obstacles.map((o) => circleRect(o.x, o.y, o.radius + gap / 2)), ...blockedRects];
  const planetDiscs = new Map(labels.map((l) => [l.id, circleRect(l.x, l.y, l.planetRadiusPx + gap / 2)]));
  const placedBoxes: Rect[] = [];
  const results = new Map<string, LabelPlacement>();

  for (const label of ordered) {
    const blockers = [
      ...fixedObstacles,
      ...placedBoxes,
      ...[...planetDiscs.entries()].filter(([id]) => id !== label.id).map(([, rect]) => rect),
    ];
    let chosen: { anchor: LabelAnchor; box: Rect } | null = null;
    for (const anchor of anchorOrder(label.x, label.y, viewport.width / 2, viewport.height / 2)) {
      const box = boxFor(label, anchor, gap);
      if (!insideViewport(box, viewport.width, viewport.height, margin)) continue;
      if (blockers.some((b) => rectsOverlap(box, b))) continue;
      chosen = { anchor, box };
      break;
    }

    const forced = label.emphasis !== 'normal';
    if (!chosen && forced) {
      // Emphasized labels must always be readable: fall back to the right anchor, clamped.
      const box = clampToViewport(boxFor(label, 'right', gap), viewport.width, viewport.height, margin);
      chosen = { anchor: 'right', box };
    }

    const minimalHidden = density === 'minimal' && label.emphasis === 'normal' && label.priority < 1;
    if (!chosen || minimalHidden) {
      const box = clampToViewport(boxFor(label, 'right', gap), viewport.width, viewport.height, margin);
      results.set(label.id, {
        id: label.id,
        x: box.left,
        y: box.top,
        width: label.width,
        height: label.height,
        anchor: 'right',
        opacity: 0,
        visible: false,
      });
      continue;
    }

    placedBoxes.push(chosen.box);
    results.set(label.id, {
      id: label.id,
      x: chosen.box.left,
      y: chosen.box.top,
      width: label.width,
      height: label.height,
      anchor: chosen.anchor,
      opacity: opacityFor(label.emphasis, density),
      visible: true,
    });
  }

  return labels.map((l) => results.get(l.id)!);
}

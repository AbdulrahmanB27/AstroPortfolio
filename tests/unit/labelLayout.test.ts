import { describe, expect, it } from 'vitest';
import { layoutLabels, rectsOverlap, type LabelInput, type LabelObstacle, type Rect } from '../../src/data/labelLayout';

const viewport = { width: 1440, height: 900 };

function label(id: string, x: number, y: number, extra: Partial<LabelInput> = {}): LabelInput {
  return { id, x, y, planetRadiusPx: 18, width: 120, height: 18, priority: 1, emphasis: 'normal', ...extra };
}

function boxOf(p: { x: number; y: number; width: number; height: number }): Rect {
  return { left: p.x, top: p.y, right: p.x + p.width, bottom: p.y + p.height };
}

describe('layoutLabels', () => {
  it('places every label at a distinct anchor with no overlaps between visible labels', () => {
    const labels = [
      label('a', 700, 450),
      label('b', 760, 452),
      label('c', 720, 500),
      label('d', 690, 405),
    ];
    const placed = layoutLabels(labels, [], viewport);
    const visible = placed.filter((p) => p.visible);
    expect(visible.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        expect(rectsOverlap(boxOf(visible[i]!), boxOf(visible[j]!))).toBe(false);
      }
    }
  });

  it('never covers the star or other planets', () => {
    const star: LabelObstacle = { id: 'star', x: 720, y: 400, radius: 60 };
    const other: LabelObstacle = { id: 'p2', x: 860, y: 450, radius: 22 };
    const placed = layoutLabels([label('a', 780, 450)], [star, other], viewport);
    const a = placed[0]!;
    expect(a.visible).toBe(true);
    const box = boxOf(a);
    const starBox: Rect = { left: 660, top: 340, right: 780, bottom: 460 };
    const otherBox: Rect = { left: 838, top: 428, right: 882, bottom: 472 };
    expect(rectsOverlap(box, starBox)).toBe(false);
    expect(rectsOverlap(box, otherBox)).toBe(false);
  });

  it('puts the name on the side away from the centre of the system', () => {
    // Two planets at the same height on opposite sides used to end up with their names on
    // whichever side happened to fit, so a reader could not tell which name belonged to
    // which planet. Names now sit outward, off the orbit lines and away from the star.
    const right = layoutLabels([label('r', 1100, 450)], [], viewport)[0]!;
    expect(right.anchor).toBe('right');
    expect(right.x).toBeGreaterThan(1100 + 18);

    const left = layoutLabels([label('l', 340, 450)], [], viewport)[0]!;
    expect(left.anchor).toBe('left');
    expect(left.x + left.width).toBeLessThan(340 - 18);
  });

  it('keeps neighbouring planets on the same side when both sit outward', () => {
    // Far enough apart that each label is unambiguously next to its own planet.
    const placed = layoutLabels([label('a', 1080, 220), label('b', 1160, 480)], [], viewport);
    const sides = placed.filter((p) => p.visible).map((p) => p.anchor);
    expect(sides.every((s) => s.includes('right'))).toBe(true);
  });

  /**
   * Outward-flanking is right for isolated planets and wrong for a tight pair: the left one
   * takes 'left', the right one takes 'right', and two names end up on opposite sides of a
   * small gap with nothing to say which belongs to which. Inside CROWD_DISTANCE_PX the
   * labels stack instead, on the same axis as the planets they name.
   */
  it('stacks labels vertically when two planets are crowded together', () => {
    const placed = layoutLabels([label('a', 1080, 300), label('b', 1140, 380)], [], viewport);
    const visible = placed.filter((p) => p.visible);
    expect(visible).toHaveLength(2);
    for (const p of visible) {
      expect(['above', 'below'], `${p.id} anchor`).toContain(p.anchor);
    }
    // And they still do not collide.
    const [a, b] = visible.map(boxOf);
    const overlap = a!.left < b!.right && a!.right > b!.left && a!.top < b!.bottom && a!.bottom > b!.top;
    expect(overlap).toBe(false);
  });

  it('keeps labels inside the viewport', () => {
    const placed = layoutLabels([label('edge', 1430, 890)], [], viewport);
    const box = boxOf(placed[0]!);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height);
  });

  it('gives selected and hovered labels full opacity and places them first', () => {
    const placed = layoutLabels(
      [label('n', 500, 500), label('s', 505, 505, { emphasis: 'selected' }), label('h', 510, 510, { emphasis: 'hover' })],
      [],
      viewport,
    );
    const s = placed.find((p) => p.id === 's')!;
    const h = placed.find((p) => p.id === 'h')!;
    expect(s.visible).toBe(true);
    expect(s.opacity).toBe(1);
    expect(h.opacity).toBe(1);
    expect(h.visible).toBe(true);
  });

  it('hides the lowest-priority label when no free slot exists in a dense cluster', () => {
    const cluster = Array.from({ length: 12 }, (_, i) => label(`c${i}`, 600 + (i % 4) * 10, 400 + Math.floor(i / 4) * 10, { priority: 12 - i }));
    const placed = layoutLabels(cluster, [], viewport);
    const hidden = placed.filter((p) => !p.visible);
    expect(hidden.length).toBeGreaterThan(0);
    // Highest priority always wins a slot; hidden labels are always lower priority than the first placed.
    const top = placed.find((p) => p.id === 'c0')!;
    expect(top.visible).toBe(true);
    for (const h of hidden) expect(cluster.find((c) => c.id === h.id)!.priority).toBeLessThan(12);
  });

  it('de-emphasizes normal labels with the balanced density setting', () => {
    const placed = layoutLabels([label('a', 300, 300)], [], viewport, { density: 'balanced' });
    expect(placed[0]!.opacity).toBeLessThan(1);
    expect(placed[0]!.opacity).toBeGreaterThan(0.3);
  });
});

import { describe, expect, it } from 'vitest';
import { createFrameBudget } from '../../src/lib/frameBudget';

const feed = (b: ReturnType<typeof createFrameBudget>, ms: number, n: number) => {
  let tripped = false;
  for (let i = 0; i < n; i++) tripped = b.push(ms) || tripped;
  return tripped;
};

describe('frame budget', () => {
  it('holds the tier at 60fps and at a capped 30fps', () => {
    const b = createFrameBudget({ windowSize: 10, slowMs: 35, strikes: 2 });
    expect(feed(b, 16.7, 100)).toBe(false);
    expect(feed(b, 33.4, 100)).toBe(false);
  });

  it('steps down after consecutive slow windows, not one', () => {
    const b = createFrameBudget({ windowSize: 10, slowMs: 35, strikes: 2 });
    expect(feed(b, 50, 10)).toBe(false);
    expect(feed(b, 50, 10)).toBe(true);
  });

  it('forgives a slow window followed by a good one', () => {
    const b = createFrameBudget({ windowSize: 10, slowMs: 35, strikes: 2 });
    feed(b, 50, 10);
    feed(b, 16, 10);
    expect(feed(b, 50, 10)).toBe(false);
  });

  it('judges by the median, so a few hitches do not count', () => {
    const b = createFrameBudget({ windowSize: 10, slowMs: 35, strikes: 1 });
    for (let i = 0; i < 4; i++) b.push(200);
    expect(feed(b, 16, 6)).toBe(false);
  });

  it('ignores frames that measure a background tab, not the scene', () => {
    const b = createFrameBudget({ windowSize: 4, slowMs: 35, strikes: 1 });
    expect(feed(b, 5000, 20)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PortfolioSchema, validatePortfolio } from '../../src/data/schema';
import { computeOrbitLayout } from '../../src/data/orbitLayout';

const raw = JSON.parse(readFileSync(new URL('../../src/data/portfolio.json', import.meta.url), 'utf8'));

describe('portfolio.json', () => {
  it('satisfies the schema', () => {
    const result = validatePortfolio(raw);
    if (!result.ok) throw new Error(result.issues.join('\n'));
    expect(result.data.projects.length).toBeGreaterThan(0);
  });

  it('references media files that exist in public/', () => {
    const data = PortfolioSchema.parse(raw);
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    for (const p of data.projects) {
      for (const m of p.media) {
        expect(existsSync(new URL(`../../public/${m.src}`, import.meta.url)), `${p.id}: ${m.src}`).toBe(true);
      }
    }
  });

  it('lays out every project on an orbit', () => {
    const data = PortfolioSchema.parse(raw);
    const layout = computeOrbitLayout(
      data.projects.map((p) => ({ id: p.id, order: p.order, featured: p.featured, size: p.planet.size, orbit: p.planet.orbit })),
    );
    expect(layout.placements).toHaveLength(data.projects.length);
  });

  it('rejects unknown categories and duplicate ids', () => {
    const broken = structuredClone(raw);
    broken.projects[0].category = 'nope';
    broken.projects[1].id = broken.projects[2].id;
    const result = validatePortfolio(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes('Unknown category'))).toBe(true);
      expect(result.issues.some((i) => i.includes('Duplicate project id'))).toBe(true);
    }
  });
});

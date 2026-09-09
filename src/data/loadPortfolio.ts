import raw from './portfolio.json';
import { PortfolioSchema, type Portfolio, type Project } from './schema';
import { computeOrbitLayout, type OrbitLayout, type PlanetPlacement } from './orbitLayout';
import { WORLD } from '../lib/constants';

export interface LoadedPortfolio {
  data: Portfolio;
  layout: OrbitLayout;
  placementById: Map<string, PlanetPlacement>;
  projectById: Map<string, Project>;
  categoryById: Map<string, Portfolio['categories'][number]>;
}

export function buildLayout(data: Portfolio): OrbitLayout {
  return computeOrbitLayout(
    data.projects.map((p) => ({
      id: p.id,
      order: p.order,
      featured: p.featured,
      size: p.planet.size,
      orbit: p.planet.orbit,
    })),
    { baseRadius: WORLD.orbitBaseRadius, ringSpacing: WORLD.orbitRingSpacing, planetUnit: 15 },
  );
}

export function loadPortfolioFrom(input: unknown): LoadedPortfolio {
  const data = PortfolioSchema.parse(input);
  const layout = buildLayout(data);
  return {
    data,
    layout,
    placementById: new Map(layout.placements.map((p) => [p.id, p])),
    projectById: new Map(data.projects.map((p) => [p.id, p])),
    categoryById: new Map(data.categories.map((c) => [c.id, c])),
  };
}

/** Parsed once at module load; the JSON is bundled so there is nothing to fetch. */
export const portfolio: LoadedPortfolio = loadPortfolioFrom(raw);

/** Resolve a site-relative asset path against the deployed base path. */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/?$/, '/') + path.replace(/^\//, '');
}

import { useMemo } from 'react';
import { buildLayout } from '../../data/loadPortfolio';
import type { Portfolio } from '../../data/schema';
import { WORLD } from '../../lib/constants';

interface OrbitPreviewProps {
  draft: Portfolio;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

interface Dot {
  index: number;
  id: string;
  title: string;
  x: number;
  y: number;
  ring: number;
  angleDeg: number;
  planetRadius: number;
  color: string;
  rings: boolean;
  moons: number;
}

/**
 * Top-down map of the whole system computed by the same `buildLayout()` the scene uses.
 * Scene convention: a planet at angle θ sits at (r·cos θ, 0, r·sin θ) and the camera looks
 * in from +Z, so +Z is drawn downward: the bottom edge of the map is the viewer's side.
 */
export function OrbitPreview({ draft, selectedIndex, onSelect }: OrbitPreviewProps) {
  const model = useMemo(() => {
    try {
      const layout = buildLayout(draft);
      const rings = layout.rings.filter((r) => Number.isFinite(r.radius));
      const dots: Dot[] = [];
      let skipped = 0;
      for (const placement of layout.placements) {
        const index = draft.projects.findIndex((p) => p.id === placement.id);
        const project = draft.projects[index];
        const ok = project && [placement.radius, placement.angleDeg, placement.planetRadius].every(Number.isFinite);
        if (!ok) {
          skipped++;
          continue;
        }
        const theta = (placement.angleDeg * Math.PI) / 180;
        const color =
          typeof project.planet?.color === 'string' && HEX.test(project.planet.color)
            ? project.planet.color
            : '#67718a';
        dots.push({
          index,
          id: project.id,
          title: project.title || project.id,
          x: placement.radius * Math.cos(theta),
          y: placement.radius * Math.sin(theta),
          ring: placement.ring,
          angleDeg: placement.angleDeg,
          planetRadius: placement.planetRadius,
          color,
          rings: !!project.planet?.rings,
          moons: Number.isFinite(project.planet?.moons)
            ? Math.max(0, Math.min(3, Math.round(project.planet.moons)))
            : 0,
        });
      }
      const outer = Math.max(layout.outerRadius, WORLD.homeRingRadius, WORLD.orbitBaseRadius);
      return {
        rings,
        dots,
        outer: Number.isFinite(outer) ? outer : WORLD.orbitBaseRadius,
        skipped,
      };
    } catch {
      return null;
    }
  }, [draft]);

  if (!model) {
    return (
      <div className="preview preview--empty" role="status">
        The orbit preview needs a structurally valid draft. Fix the issues listed on the left.
      </div>
    );
  }

  const R = model.outer + 130;
  const fontSize = R / 28;
  // Labels sit to the right of their planet unless that would leave the map; then they flip inward.
  const flipAt = model.outer * 0.55;
  const selected = model.dots.find((d) => d.index === selectedIndex);

  return (
    <div className="preview">
      <svg
        viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
        role="img"
        aria-label={`Orbit map: ${model.dots.length} planets on ${model.rings.length} rings${selected ? `, ${selected.title} highlighted` : ''}`}
      >
        <title>Orbit preview</title>
        {/* Home planet ring for scale (not a project). */}
        <circle
          r={WORLD.homeRingRadius}
          fill="none"
          stroke="var(--ink-500)"
          strokeOpacity={0.45}
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={0}
          y={-WORLD.homeRingRadius - fontSize * 0.6}
          textAnchor="middle"
          fontSize={fontSize * 0.85}
          className="preview__label preview__label--muted"
        >
          home
        </text>

        {/* Central star. */}
        <circle r={WORLD.starRadius} fill="var(--star-core)" />
        <circle
          r={WORLD.starRadius + 12}
          fill="none"
          stroke="var(--star-glow)"
          strokeOpacity={0.4}
          vectorEffect="non-scaling-stroke"
        />

        {/* Project rings. */}
        {model.rings.map((ring) => (
          <circle
            key={ring.index}
            r={ring.radius}
            fill="none"
            stroke="var(--ink-500)"
            strokeOpacity={0.55}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Planets, sized by planetRadius from the layout. */}
        {model.dots.map((dot) => {
          const isSelected = dot.index === selectedIndex;
          return (
            <g
              key={`${dot.id}-${dot.index}`}
              transform={`translate(${dot.x.toFixed(2)} ${dot.y.toFixed(2)})`}
              className={`preview__planet${isSelected ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${dot.title}: ring ${dot.ring + 1}, angle ${Math.round(dot.angleDeg)} degrees`}
              onClick={() => onSelect(dot.index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(dot.index);
                }
              }}
            >
              {/* Generous invisible hit area so small dots are easy to click. */}
              <circle r={dot.planetRadius + 16} fill="transparent" />
              {isSelected ? (
                <circle
                  r={dot.planetRadius + 12}
                  fill="none"
                  stroke="var(--star-glow)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {dot.rings ? (
                <ellipse
                  rx={dot.planetRadius * 1.9}
                  ry={dot.planetRadius * 0.55}
                  fill="none"
                  stroke={dot.color}
                  strokeOpacity={0.8}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <circle r={dot.planetRadius} fill={dot.color} />
              {Array.from({ length: dot.moons }, (_, m) => {
                const a = (m / dot.moons) * Math.PI * 2 + 0.6;
                const d = dot.planetRadius * 1.55;
                return (
                  <circle
                    key={m}
                    cx={Math.cos(a) * d}
                    cy={Math.sin(a) * d}
                    r={Math.max(2, dot.planetRadius * 0.18)}
                    fill="var(--ink-300)"
                  />
                );
              })}
              <text
                x={dot.x > flipAt ? -(dot.planetRadius + fontSize * 0.5) : dot.planetRadius + fontSize * 0.5}
                y={fontSize * 0.35}
                textAnchor={dot.x > flipAt ? 'end' : 'start'}
                fontSize={fontSize}
                className={`preview__label${isSelected ? ' preview__label--strong' : ''}`}
              >
                {dot.title}
              </text>
            </g>
          );
        })}

        {/* Where the system camera looks in from. */}
        <text
          x={0}
          y={R - fontSize * 0.8}
          textAnchor="middle"
          fontSize={fontSize * 0.85}
          className="preview__label preview__label--muted"
        >
          viewer
        </text>
      </svg>
      <p className="preview__caption">
        Top-down view from <code>buildLayout()</code>: rings start at {WORLD.orbitBaseRadius} world units and step by{' '}
        {WORLD.orbitRingSpacing}; dot size follows planet size and featured. The system camera looks in from the bottom
        edge. Click a planet to edit it.
        {model.skipped ? ` ${model.skipped} planet(s) could not be placed until their issues are fixed.` : ''}
      </p>
    </div>
  );
}

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { portfolio } from '../data/loadPortfolio';
import { drawnExtent } from '../scene/system/planetExtent';
import { layoutLabels, type LabelInput } from '../data/labelLayout';
import { WORLD } from '../lib/constants';
import { useApp } from '../state/store';
import { planetWorldPositions } from '../scene/system/planetRegistry';
import { focusProject } from '../sequences/system';
import { labelState } from './labelState';

export { setLabelsAlpha } from './labelState';

/**
 * DOM labels for planets. A bridge inside the canvas projects planet positions every
 * frame and runs the collision-free layout; the DOM side updates element styles directly
 * (no React state per frame).
 */

interface LabelSlot {
  el: HTMLButtonElement;
  width: number;
  height: number;
}

const slots = new Map<string, LabelSlot>();
let labelsEnabled = false;

const tmp = new Vector3();

/** Lives inside the R3F canvas: projects planets and positions the DOM labels. */
export function LabelBridge() {
  const { camera, size } = useThree();
  const density = useApp((s) => s.settings.labels.density);

  useFrame(() => {
    if (!labelsEnabled || slots.size === 0) return;
    const state = useApp.getState();
    const inputs: LabelInput[] = [];
    const behind = new Set<string>();
    for (const [id, slot] of slots) {
      const pos = planetWorldPositions.get(id);
      const placement = portfolio.placementById.get(id);
      const project = portfolio.projectById.get(id);
      if (!pos || !placement || !project) continue;
      tmp.copy(pos).project(camera);
      if (tmp.z > 1) {
        behind.add(id);
        continue;
      }
      const x = ((tmp.x + 1) / 2) * size.width;
      const y = ((1 - tmp.y) / 2) * size.height;
      // Screen radius: project a point one drawn-extent above the center.
      // Rings and moons reach well past the body, and the keep-out disc has to cover the
      // whole drawing or a moon lands on a glyph — which is what happened to MYKITCHEN,
      // whose single moon reaches 1.96 body radii against a keep-out set at 1.9.
      const drawnRadius = placement.planetRadius * drawnExtent(project.planet);
      const edge = new Vector3(pos.x, pos.y + drawnRadius, pos.z).project(camera);
      const ey = ((1 - edge.y) / 2) * size.height;
      const radiusPx = Math.max(6, Math.abs(ey - y));
      const emphasis = state.selectedProjectId === id ? 'selected' : state.hoveredProjectId === id ? 'hover' : 'normal';
      inputs.push({
        id,
        x,
        y,
        planetRadiusPx: radiusPx,
        width: slot.width,
        height: slot.height,
        priority: (project.featured ? 2 : 1) + placement.planetRadius / 24,
        emphasis,
      });
    }
    // The star is an obstacle; project its disc.
    tmp.set(0, 0, 0).project(camera);
    const sx = ((tmp.x + 1) / 2) * size.width;
    const sy = ((1 - tmp.y) / 2) * size.height;
    const sEdge = new Vector3(0, WORLD.starRadius * 1.4, 0).project(camera);
    const sr = Math.abs(((1 - sEdge.y) / 2) * size.height - sy);
    const blockedRects = [...document.querySelectorAll<HTMLElement>('[data-label-obstacle]')].map((el, i) => {
      const r = el.getBoundingClientRect();
      return { id: `hud-${i}`, left: r.left - 6, top: r.top - 6, right: r.right + 6, bottom: r.bottom + 6 };
    });
    const placed = layoutLabels(inputs, [{ id: 'star', x: sx, y: sy, radius: sr }], size, { density, blockedRects });
    for (const p of placed) {
      const slot = slots.get(p.id);
      if (!slot) continue;
      slot.el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
      // The element only shows or hides; the resting dim is applied to the project name
      // alone, so the category tag keeps the contrast it was authored for.
      slot.el.style.opacity = String(p.visible ? labelState.alpha : 0);
      slot.el.style.setProperty('--label-alpha', String(p.opacity));
      slot.el.style.pointerEvents = p.visible && labelState.alpha > 0.5 ? 'auto' : 'none';
      slot.el.dataset.anchor = p.anchor;
    }
    for (const id of behind) {
      const slot = slots.get(id);
      if (slot) slot.el.style.opacity = '0';
    }
  });
  return null;
}

/** DOM side: one button per project, positioned by the bridge. */
export function PlanetLabels() {
  const scene = useApp((s) => s.scene);
  const setHovered = useApp((s) => s.setHoveredProject);
  const active = scene === 'system';
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const projects = useMemo(() => portfolio.data.projects, []);

  useLayoutEffect(() => {
    const measure = () => {
      slots.clear();
      for (const [id, el] of refs.current) {
        const rect = el.getBoundingClientRect();
        slots.set(id, { el, width: rect.width || 120, height: rect.height || 20 });
      }
    };
    measure();
    // Re-measure once web fonts arrive; mono label widths change noticeably.
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    fonts?.ready.then(measure).catch(() => undefined);
    return () => slots.clear();
  }, [projects]);

  useEffect(() => {
    labelsEnabled = active;
    if (!active) {
      for (const slot of slots.values()) {
        slot.el.style.opacity = '0';
        slot.el.style.pointerEvents = 'none';
      }
    }
  }, [active]);

  return (
    <div className="planet-labels" aria-hidden={!active}>
      {projects.map((p) => {
        const category = portfolio.categoryById.get(p.category);
        return (
          <button
            key={p.id}
            type="button"
            className="planet-label"
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            tabIndex={-1}
            style={{ opacity: 0, pointerEvents: 'none' }}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => focusProject(p.id)}
          >
            <span className="planet-label__name">{p.title}</span>
            <span className="planet-label__cat" style={{ color: category?.color }}>
              {category?.name ?? p.category}
              {p.featured ? ' · featured' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

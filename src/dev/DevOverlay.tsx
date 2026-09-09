import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Settings } from '../data/schema';
import { breakpointFor } from '../lib/constants';
import type { QualityTier } from '../lib/quality';
import { rig } from '../scene/rig';
import { orbitClock } from '../scene/system/orbitClock';
import { useApp } from '../state/store';
import { canReplayIntro, devJump, firstProjectId, replayIntro, resetVisitorFlags } from './devActions';
import { devStats } from './devStats';
import { useDevStore } from './devStore';

/**
 * Hidden developer overlay (Ctrl+Alt+Shift+D or `?dev=true`). Renders nothing unless
 * dev mode is on. Live readouts (fps, renderer stats, camera, orbit clock) are written
 * straight to the DOM from a rAF loop; only real state changes go through React.
 */
export function DevOverlay() {
  const devMode = useApp((s) => s.devMode);
  if (!devMode) return null;
  return <DevPanel />;
}

const QUALITY_TIERS: QualityTier[] = ['high', 'medium', 'low'];
const LABEL_DENSITIES: Settings['labels']['density'][] = ['all', 'balanced', 'minimal'];

type LiveField = 'fps' | 'calls' | 'triangles' | 'geometries' | 'textures' | 'programs' | 'camPos' | 'camTarget' | 'fov' | 'orbitT';

function vec(v: { x: number; y: number; z: number }): string {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;
}

function fmtInt(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** rAF loop that measures fps (1s average) and refreshes the live readouts at ~10 Hz. */
function useLiveReadouts() {
  const refs = useRef<Partial<Record<LiveField, HTMLElement | null>>>({});
  const bind = useCallback(
    (field: LiveField) => (el: HTMLElement | null) => {
      refs.current[field] = el;
    },
    [],
  );

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();
    let windowLength = 500; // first estimate after half a second, then 1s averages
    let lastWrite = 0;
    const write = (field: LiveField, text: string) => {
      const el = refs.current[field];
      if (el && el.textContent !== text) el.textContent = text;
    };
    const loop = (now: number) => {
      frames++;
      if (now - windowStart >= windowLength) {
        write('fps', ((frames * 1000) / (now - windowStart)).toFixed(0));
        frames = 0;
        windowStart = now;
        windowLength = 1000;
      }
      if (now - lastWrite >= 100) {
        lastWrite = now;
        const fresh = devStats.updatedAt > 0;
        write('calls', fresh ? String(devStats.drawCalls) : '—');
        write('triangles', fresh ? fmtInt(devStats.triangles) : '—');
        write('geometries', fresh ? String(devStats.geometries) : '—');
        write('textures', fresh ? String(devStats.textures) : '—');
        write('programs', fresh ? String(devStats.programs) : '—');
        write('camPos', vec(rig.position));
        write('camTarget', vec(rig.target));
        write('fov', rig.fov.toFixed(1));
        write('orbitT', `${orbitClock.t.toFixed(1)}s${orbitClock.running ? '' : ' · paused'}`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return bind;
}

function DevPanel() {
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const hovered = useApp((s) => s.hoveredProjectId);
  const selected = useApp((s) => s.selectedProjectId);
  const settings = useApp((s) => s.settings);
  const quality = useApp((s) => s.quality);
  const reducedMotion = useApp((s) => s.reducedMotion);
  const updateSettings = useApp((s) => s.updateSettings);
  const setQualityTier = useApp((s) => s.setQualityTier);
  const setDevMode = useApp((s) => s.setDevMode);
  const toggles = useDevStore();
  const bind = useLiveReadouts();

  const [breakpoint, setBreakpoint] = useState(() => breakpointFor(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setBreakpoint(breakpointFor(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * Collapsed by default: an expanded panel sits over the primary navigation, so turning
   * dev mode on must not make the site itself unusable. The choice is remembered.
   */
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem('astro.dev.expanded') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('astro.dev.expanded', expanded ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }, [expanded]);

  const setGrid = (patch: Partial<Settings['grid']>) => updateSettings({ grid: { ...settings.grid, ...patch } });
  const replayEnabled = canReplayIntro() && scene === 'home' && !busy;

  return (
    <aside
      className="dev-panel"
      role="region"
      aria-label="Developer overlay"
      data-dev-overlay
      data-scene={scene}
      data-expanded={expanded}
    >
      <header className="dev-panel__head">
        <button
          type="button"
          className="dev-panel__title"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse developer overlay' : 'Expand developer overlay'}
          data-dev="toggle"
        >
          <i aria-hidden="true" /> dev
        </button>
        <button type="button" className="dev-panel__close" onClick={() => setDevMode(false)} aria-label="Close developer overlay" data-dev="close">
          close
        </button>
      </header>

      <Row k="state">
        <span data-dev-field="scene">{scene}</span>
        {busy && <span className="dev-tag">busy</span>}
        {reducedMotion && <span className="dev-tag">reduced motion</span>}
      </Row>
      <Row k="fps">
        <span ref={bind('fps')} data-dev-field="fps">
          —
        </span>
      </Row>
      <Row k="renderer">
        <span className="dev-stats">
          <span>
            calls <b ref={bind('calls')} data-dev-field="calls">—</b>
          </span>
          <span>
            tris <b ref={bind('triangles')} data-dev-field="triangles">—</b>
          </span>
          <span>
            geoms <b ref={bind('geometries')} data-dev-field="geometries">—</b>
          </span>
          <span>
            textures <b ref={bind('textures')} data-dev-field="textures">—</b>
          </span>
          <span>
            programs <b ref={bind('programs')} data-dev-field="programs">—</b>
          </span>
        </span>
      </Row>
      <Row k="camera">
        <span className="dev-stack">
          <span>
            pos <b ref={bind('camPos')} data-dev-field="camPos">—</b>
          </span>
          <span>
            target <b ref={bind('camTarget')} data-dev-field="camTarget">—</b>
          </span>
          <span>
            fov <b ref={bind('fov')} data-dev-field="fov">—</b>
          </span>
        </span>
      </Row>
      <Row k="viewport">
        <span data-dev-field="breakpoint">{breakpoint}</span>
        <span className="dev-inline">
          quality
          <select
            className="dev-select"
            value={quality.tier}
            onChange={(e) => setQualityTier(e.target.value as QualityTier)}
            aria-label="Quality tier"
            data-dev="quality"
          >
            {QUALITY_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </span>
      </Row>
      <Row k="project">
        {/* Always two lines so a long id never reflows the controls below. */}
        <span className="dev-stack">
          <span>
            hover <b data-dev-field="hovered">{hovered ?? '—'}</b>
          </span>
          <span>
            selected <b data-dev-field="selected">{selected ?? '—'}</b>
          </span>
        </span>
      </Row>
      <Row k="orbit t">
        <span ref={bind('orbitT')} data-dev-field="orbitT">
          —
        </span>
      </Row>

      <section className="dev-section">
        <h3 className="dev-section__title">Grid</h3>
        <label className="dev-check">
          <input type="checkbox" checked={settings.grid.enabled} onChange={(e) => setGrid({ enabled: e.target.checked })} data-dev="grid-enabled" />
          enabled
        </label>
        <Range k="opacity" min={0} max={0.3} step={0.005} value={settings.grid.opacity} format={(v) => v.toFixed(3)} onChange={(v) => setGrid({ opacity: v })} name="grid-opacity" />
        <Range k="density" min={4} max={36} step={1} value={settings.grid.density} format={(v) => String(v)} onChange={(v) => setGrid({ density: Math.round(v) })} name="grid-density" />
        <Range k="radius" min={100} max={3000} step={10} value={settings.grid.radius} format={(v) => String(Math.round(v))} onChange={(v) => setGrid({ radius: v })} name="grid-radius" />
      </section>

      <section className="dev-section">
        <h3 className="dev-section__title">Labels · motion · intro</h3>
        <label className="dev-inline dev-field">
          <span className="dev-field__k">labels</span>
          <select
            className="dev-select"
            value={settings.labels.density}
            onChange={(e) => updateSettings({ labels: { density: e.target.value as Settings['labels']['density'] } })}
            data-dev="labels-density"
          >
            {LABEL_DENSITIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <Range
          k="orbit speed"
          min={0}
          max={4}
          step={0.1}
          value={settings.motion.orbitSpeedScale}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => updateSettings({ motion: { orbitSpeedScale: v } })}
          name="orbit-speed"
        />
        <label className="dev-check">
          <input type="checkbox" checked={settings.intro.enabled} onChange={(e) => updateSettings({ intro: { enabled: e.target.checked } })} data-dev="intro-enabled" />
          intro enabled
        </label>
      </section>

      <section className="dev-section">
        <h3 className="dev-section__title">Helpers</h3>
        <label className="dev-check">
          <input type="checkbox" checked={toggles.showHitAreas} onChange={(e) => toggles.set({ showHitAreas: e.target.checked })} data-dev="show-hit-areas" />
          show hit areas
        </label>
        <label className="dev-check">
          <input type="checkbox" checked={toggles.showNames} onChange={(e) => toggles.set({ showNames: e.target.checked })} data-dev="show-names" />
          show object names
        </label>
        <label className="dev-check">
          <input type="checkbox" checked={toggles.showOrbitValues} onChange={(e) => toggles.set({ showOrbitValues: e.target.checked })} data-dev="show-orbit-values" />
          show orbit values
        </label>
      </section>

      <section className="dev-section">
        <h3 className="dev-section__title">Actions</h3>
        <div className="dev-actions">
          <button type="button" className="dev-btn" onClick={replayIntro} disabled={!replayEnabled} title="Available from the idle home state" data-dev="replay-intro">
            replay intro
          </button>
          <button type="button" className="dev-btn" onClick={resetVisitorFlags} title="Clears astro.* localStorage keys and reloads" data-dev="reset-flags">
            reset visitor flags
          </button>
        </div>
        <div className="dev-actions" aria-label="Jump to">
          <span className="dev-actions__k">jump</span>
          <button type="button" className="dev-btn" onClick={() => devJump('home')} data-dev="jump-home">
            home
          </button>
          <button type="button" className="dev-btn" onClick={() => devJump('cockpit')} data-dev="jump-cockpit">
            cockpit
          </button>
          <button type="button" className="dev-btn" onClick={() => devJump('system')} data-dev="jump-system">
            system
          </button>
          <button type="button" className="dev-btn" onClick={() => devJump('project')} disabled={!firstProjectId()} data-dev="jump-project">
            first project
          </button>
        </div>
      </section>
    </aside>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="dev-row">
      <span className="dev-row__k">{k}</span>
      <span className="dev-row__v">{children}</span>
    </div>
  );
}

interface RangeProps {
  k: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function Range({ k, name, min, max, step, value, format, onChange }: RangeProps) {
  return (
    <label className="dev-range">
      <span className="dev-range__k">{k}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-dev={name} />
      <span className="dev-range__v" data-dev-value={name}>
        {format(value)}
      </span>
    </label>
  );
}

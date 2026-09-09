import { useMemo } from 'react';
import { buildLayout } from '../../data/loadPortfolio';
import type { PlanetStyle } from '../../data/schema';
import { CheckboxInput, ColorInput, NumberInput, SelectInput } from '../components/fields';
import { OrbitPreview } from '../components/OrbitPreview';
import type { SectionProps } from '../lib/sections';

const STYLE_OPTIONS: readonly { value: PlanetStyle; label: string }[] = [
  { value: 'rocky', label: 'Rocky' },
  { value: 'terra', label: 'Terra' },
  { value: 'gas', label: 'Gas giant' },
  { value: 'ice', label: 'Ice' },
  { value: 'lava', label: 'Lava' },
  { value: 'metal', label: 'Metal' },
  { value: 'ocean', label: 'Ocean' },
];

interface PlanetSectionProps extends SectionProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

interface OverrideRowProps {
  label: string;
  hint: string;
  value: number | undefined;
  autoValue: number | undefined;
  min: number;
  max: number;
  step: number;
  onChange: (value: number | undefined) => void;
}

/** "Auto" leaves the key out so buildLayout() decides; unchecking pins the current value. */
function OverrideRow({ label, hint, value, autoValue, min, max, step, onChange }: OverrideRowProps) {
  const auto = value === undefined;
  return (
    <div className="override">
      <CheckboxInput
        label={`${label}: auto${auto && autoValue !== undefined ? ` (currently ${Math.round(autoValue * 100) / 100})` : ''}`}
        checked={auto}
        onChange={(checked) => onChange(checked ? undefined : (autoValue ?? min))}
      />
      <NumberInput
        label={label}
        slider
        min={min}
        max={max}
        step={step}
        value={auto ? (autoValue ?? min) : value}
        onChange={onChange}
        disabled={auto}
        hint={hint}
      />
    </div>
  );
}

export function PlanetSection({ draft, set, selectedIndex, onSelect }: PlanetSectionProps) {
  const project = draft.projects[selectedIndex];
  const placement = useMemo(() => {
    if (!project) return undefined;
    try {
      const layout = buildLayout(draft);
      return layout.placements.find((p) => p.id === project.id);
    } catch {
      return undefined;
    }
  }, [draft, project]);

  if (!project) return <p className="list__empty">No projects yet. Add one in the Projects section.</p>;

  const planet = project.planet;
  const base = ['projects', selectedIndex, 'planet'] as const;
  const options = draft.projects.map((p, i) => ({
    value: `${i}`,
    label: `${p.title || p.id}  (${p.id})`,
  }));

  return (
    <div className="planet-grid">
      <div>
        <SelectInput
          label="Project"
          value={`${selectedIndex}`}
          options={options}
          onChange={(v) => onSelect(Number(v))}
        />
        <SelectInput
          label="Style"
          value={planet.style}
          options={STYLE_OPTIONS}
          onChange={(v) => set([...base, 'style'], v)}
          hint="Surface shader and silhouette."
        />
        <div className="grid-2">
          <ColorInput
            label="Color"
            value={planet.color}
            onChange={(v) => set([...base, 'color'], v ?? '')}
            hint="Base surface color, #rrggbb."
          />
          <ColorInput
            label="Accent"
            optional
            value={planet.accent}
            onChange={(v) => set([...base, 'accent'], v)}
            hint="Highlights, bands and ring tint."
          />
        </div>
        <NumberInput
          label="Size"
          slider
          min={0.5}
          max={3}
          step={0.05}
          value={planet.size}
          onChange={(v) => set([...base, 'size'], v)}
          hint="1 ≈ a normal planet, 2 ≈ featured hero. Also drives label priority."
        />
        <div className="grid-2">
          <CheckboxInput
            label="Rings"
            checked={planet.rings}
            onChange={(v) => set([...base, 'rings'], v)}
            hint="Decoration; best on featured planets."
          />
          <NumberInput
            label="Moons"
            slider
            min={0}
            max={3}
            step={1}
            value={planet.moons}
            onChange={(v) => set([...base, 'moons'], v)}
          />
        </div>

        <h3 className="list__title">Orbit overrides</h3>
        <p className="field__hint">
          The layout places planets from order, featured and size. Override only when the composition needs it.
        </p>
        <OverrideRow
          label="Ring"
          hint="0 = innermost project ring."
          value={planet.orbit.ring}
          autoValue={placement?.ring}
          min={0}
          max={11}
          step={1}
          onChange={(v) => set([...base, 'orbit', 'ring'], v)}
        />
        <OverrideRow
          label="Angle"
          hint="Starting angle in degrees; the sector around 270° sits behind the star."
          value={planet.orbit.angle}
          autoValue={placement ? Math.round(placement.angleDeg) : undefined}
          min={0}
          max={360}
          step={1}
          onChange={(v) => set([...base, 'orbit', 'angle'], v)}
        />
        <OverrideRow
          label="Speed"
          hint="Multiplier on the ring's default orbital speed."
          value={planet.orbit.speed}
          autoValue={1}
          min={0}
          max={4}
          step={0.1}
          onChange={(v) => set([...base, 'orbit', 'speed'], v)}
        />
      </div>
      <div className="planet-grid__preview">
        <h3 className="list__title">System preview</h3>
        <OrbitPreview draft={draft} selectedIndex={selectedIndex} onSelect={onSelect} />
        {placement ? (
          <dl className="facts">
            <div>
              <dt>Ring</dt>
              <dd className="mono">{placement.ring + 1}</dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd className="mono">{placement.radius}</dd>
            </div>
            <div>
              <dt>Angle</dt>
              <dd className="mono">{Math.round(placement.angleDeg)}°</dd>
            </div>
            <div>
              <dt>Planet radius</dt>
              <dd className="mono">{Math.round(placement.planetRadius * 10) / 10}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}

import { CheckboxInput, NumberInput, SelectInput } from '../components/fields';
import type { SectionProps } from '../lib/sections';

const DENSITY_OPTIONS = [
  { value: 'all', label: 'All labels' },
  { value: 'balanced', label: 'Balanced (default)' },
  { value: 'minimal', label: 'Minimal' },
] as const;

export function SettingsSection({ draft, set }: SectionProps) {
  const s = draft.settings;
  return (
    <>
      <h3 className="list__title">Schematic grid</h3>
      <CheckboxInput
        label="Show the grid in the system view"
        checked={s.grid.enabled}
        onChange={(v) => set(['settings', 'grid', 'enabled'], v)}
      />
      <div className="grid-2">
        <NumberInput
          label="Grid opacity"
          slider
          min={0}
          max={1}
          step={0.01}
          value={s.grid.opacity}
          onChange={(v) => set(['settings', 'grid', 'opacity'], v)}
          hint="Art direction caps this at 0.10."
        />
        <NumberInput
          label="Radial spokes"
          slider
          min={4}
          max={36}
          step={1}
          value={s.grid.density}
          onChange={(v) => set(['settings', 'grid', 'density'], v)}
        />
        <NumberInput
          label="Fade-out radius (world units)"
          slider
          min={100}
          max={3000}
          step={10}
          value={s.grid.radius}
          onChange={(v) => set(['settings', 'grid', 'radius'], v)}
        />
      </div>

      <h3 className="list__title">Intro and audio</h3>
      <CheckboxInput
        label="Play the opening cinematic on first visit"
        checked={s.intro.enabled}
        onChange={(v) => set(['settings', 'intro', 'enabled'], v)}
      />
      <CheckboxInput
        label="Audio available (off by default for visitors)"
        checked={s.audio.enabled}
        onChange={(v) => set(['settings', 'audio', 'enabled'], v)}
      />

      <h3 className="list__title">Labels and motion</h3>
      <div className="grid-2">
        <SelectInput
          label="Planet label density"
          value={s.labels.density}
          options={DENSITY_OPTIONS}
          onChange={(v) => set(['settings', 'labels', 'density'], v)}
        />
        <NumberInput
          label="Orbit speed scale"
          slider
          min={0}
          max={4}
          step={0.1}
          value={s.motion.orbitSpeedScale}
          onChange={(v) => set(['settings', 'motion', 'orbitSpeedScale'], v)}
          hint="1 = one revolution per 12–20 minutes. 0 freezes the orbits."
        />
      </div>
    </>
  );
}

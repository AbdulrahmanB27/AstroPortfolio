import { useId, useState, type ReactNode } from 'react';

/**
 * Small labelled inputs. Every control has a real <label>; optional text fields map an
 * empty value to `undefined` so the exported JSON omits the key instead of failing the
 * schema with an empty string.
 */

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  mono?: boolean;
  children: ReactNode;
}

function FieldShell({ id, label, hint, mono, children }: FieldShellProps) {
  return (
    <div className="field">
      <label className={`field__label${mono ? ' field__label--mono' : ''}`} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Empty string becomes undefined (the key is dropped from the JSON). */
  optional?: boolean;
  mono?: boolean;
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'url';
  autoComplete?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  optional,
  mono,
  hint,
  placeholder,
  type = 'text',
  autoComplete = 'off',
}: TextInputProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} mono={mono}>
      <input
        id={id}
        className={`input${mono ? ' input--mono' : ''}`}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={!mono}
        onChange={(e) => {
          const next = e.target.value;
          onChange(optional && next === '' ? undefined : next);
        }}
      />
    </FieldShell>
  );
}

interface TextAreaProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  optional?: boolean;
  hint?: string;
  rows?: number;
  placeholder?: string;
}

export function TextArea({ label, value, onChange, optional, hint, rows = 4, placeholder }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea
        id={id}
        className="input"
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          onChange(optional && next === '' ? undefined : next);
        }}
      />
    </FieldShell>
  );
}

interface SelectInputProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}

export function SelectInput<T extends string>({ label, value, options, onChange, hint }: SelectInputProps<T>) {
  const id = useId();
  const known = options.some((o) => o.value === value);
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select id={id} className="input input--select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {!known ? (
          <option value={value} disabled>
            {value ? `${value} (unknown)` : '— choose —'}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface CheckboxInputProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}

export function CheckboxInput({ label, checked, onChange, hint }: CheckboxInputProps) {
  const id = useId();
  return (
    <div className="field field--check">
      <div className="check">
        <input id={id} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseNumber(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return Number.NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  /** Show a slider next to the number box. */
  slider?: boolean;
  disabled?: boolean;
}

/**
 * Keeps the typed text locally so "1." or "" can exist while typing; the draft receives
 * NaN for an empty box, which the schema reports as an issue instead of silently using 0.
 */
export function NumberInput({ label, value, onChange, min, max, step, hint, slider, disabled }: NumberInputProps) {
  const id = useId();
  const [text, setText] = useState(() => formatNumber(value));
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    if (!Object.is(parseNumber(text), value)) setText(formatNumber(value));
  }
  const commit = (raw: string) => {
    setText(raw);
    onChange(parseNumber(raw));
  };
  const box = (
    <input
      id={id}
      className="input input--number"
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step ?? 'any'}
      disabled={disabled}
      onChange={(e) => commit(e.target.value)}
    />
  );
  return (
    <FieldShell id={id} label={label} hint={hint}>
      {slider ? (
        <div className="range-row">
          <input
            type="range"
            aria-label={`${label} slider`}
            value={Number.isFinite(value) ? value : (min ?? 0)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => commit(e.target.value)}
          />
          {box}
        </div>
      ) : (
        box
      )}
    </FieldShell>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

interface ColorInputProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  optional?: boolean;
  hint?: string;
}

/** Native picker plus a mono hex box; the text box may hold an invalid value (it is reported as an issue). */
export function ColorInput({ label, value, onChange, optional, hint }: ColorInputProps) {
  const id = useId();
  const valid = typeof value === 'string' && HEX.test(value);
  return (
    <FieldShell id={id} label={label} hint={hint} mono>
      <div className="color-row">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          className="input input--mono"
          type="text"
          value={value ?? ''}
          placeholder="#rrggbb"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            const next = e.target.value;
            onChange(optional && next === '' ? undefined : next);
          }}
        />
        <span className="color-swatch" aria-hidden="true" style={{ background: valid ? value : 'transparent' }} />
      </div>
    </FieldShell>
  );
}

/** Small reusable button set used by every list. */
export function RowActions({
  index,
  count,
  onMove,
  onRemove,
  label,
  extra,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  label: string;
  extra?: ReactNode;
}) {
  return (
    <div className="row-actions">
      {extra}
      <button
        type="button"
        className="btn btn--ghost btn--small"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label={`Move ${label} up`}
      >
        Up
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        disabled={index >= count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label={`Move ${label} down`}
      >
        Down
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => onRemove(index)}
        aria-label={`Remove ${label}`}
      >
        Remove
      </button>
    </div>
  );
}

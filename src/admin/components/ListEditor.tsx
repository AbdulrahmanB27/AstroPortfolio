import type { ReactNode } from 'react';
import { moveItem, removeItem, replaceItem } from '../lib/paths';
import { RowActions } from './fields';

interface ListEditorProps<T> {
  label: string;
  hint?: string;
  items: readonly T[] | undefined;
  onChange: (items: T[]) => void;
  create: () => T;
  /** Card title; falls back to "<noun> N". */
  title?: (item: T, index: number) => string;
  noun: string;
  addLabel?: string;
  children: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
}

/** Editable list of objects (education, experience, links, media, skill groups, categories). */
export function ListEditor<T>({
  label,
  hint,
  items,
  onChange,
  create,
  title,
  noun,
  addLabel,
  children,
}: ListEditorProps<T>) {
  const list = items ?? [];
  return (
    <section className="list list--cards" aria-label={label}>
      <h3 className="list__title">{label}</h3>
      {hint ? <p className="field__hint">{hint}</p> : null}
      {list.length === 0 ? <p className="list__empty">Nothing yet.</p> : null}
      {list.map((item, i) => {
        const heading = title?.(item, i) || `${noun} ${i + 1}`;
        return (
          <div key={i} className="card">
            <div className="card__head">
              <span className="card__title">{heading}</span>
              <RowActions
                index={i}
                count={list.length}
                label={`${noun} ${i + 1}`}
                onMove={(from, to) => onChange(moveItem(list, from, to))}
                onRemove={(idx) => onChange(removeItem(list, idx))}
              />
            </div>
            {children(item, (patch) => onChange(replaceItem(list, i, { ...item, ...patch })), i)}
          </div>
        );
      })}
      <button type="button" className="btn btn--small" onClick={() => onChange([...list, create()])}>
        {addLabel ?? `Add ${noun}`}
      </button>
    </section>
  );
}

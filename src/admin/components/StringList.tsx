import { moveItem, removeItem, replaceItem } from '../lib/paths';
import { RowActions } from './fields';

interface StringListProps {
  label: string;
  items: readonly string[] | undefined;
  onChange: (items: string[]) => void;
  /** Paragraph-sized entries use a textarea. */
  multiline?: boolean;
  mono?: boolean;
  hint?: string;
  addLabel?: string;
  placeholder?: string;
  /** Singular noun for accessible button names ("paragraph", "skill"). */
  noun?: string;
}

/** Editable list of strings: bio paragraphs, interests, technologies, bullets, notes. */
export function StringList({
  label,
  items,
  onChange,
  multiline,
  mono,
  hint,
  addLabel,
  placeholder,
  noun = 'item',
}: StringListProps) {
  const list = items ?? [];
  return (
    <fieldset className="list">
      <legend className="field__label">{label}</legend>
      {hint ? <p className="field__hint">{hint}</p> : null}
      {list.length === 0 ? <p className="list__empty">Nothing yet.</p> : null}
      <ol className="list__rows">
        {list.map((item, i) => {
          const name = `${label} ${noun} ${i + 1}`;
          const cls = `input${mono ? ' input--mono' : ''}`;
          return (
            <li key={i} className="list__row">
              {multiline ? (
                <textarea
                  className={cls}
                  rows={3}
                  value={item}
                  aria-label={name}
                  placeholder={placeholder}
                  onChange={(e) => onChange(replaceItem(list, i, e.target.value))}
                />
              ) : (
                <input
                  className={cls}
                  type="text"
                  value={item}
                  aria-label={name}
                  placeholder={placeholder}
                  spellCheck={!mono}
                  autoComplete="off"
                  onChange={(e) => onChange(replaceItem(list, i, e.target.value))}
                />
              )}
              <RowActions
                index={i}
                count={list.length}
                label={name}
                onMove={(from, to) => onChange(moveItem(list, from, to))}
                onRemove={(idx) => onChange(removeItem(list, idx))}
              />
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn--small" onClick={() => onChange([...list, ''])}>
        {addLabel ?? `Add ${noun}`}
      </button>
    </fieldset>
  );
}

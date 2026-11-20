import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Issue } from '../content/schema'

export const IssuesContext = createContext<readonly Issue[]>([])

export function Field({
  name, label, children,
}: {
  name: string
  label: string
  children: (attrs: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode
}) {
  const issues = useContext(IssuesContext).filter((issue) => issue.path === name)
  const messageId = issues.length ? `${name}-feedback` : undefined
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children({
        id: name,
        'aria-invalid': issues.some((issue) => issue.level === 'error') ? true : undefined,
        'aria-describedby': messageId,
      })}
      {messageId && <div id={messageId}>
        {issues.map((issue) => <div key={issue.message} className={issue.level}>{issue.message}</div>)}
      </div>}
    </div>
  )
}

type TextProps = {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  inputMode?: 'email' | 'url'
}

export function Text({ name, label, value, onChange, multiline, inputMode }: TextProps) {
  return (
    <Field name={name} label={label}>
      {(attrs) => multiline
        ? <textarea {...attrs} rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
        : <input {...attrs} type="text" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  )
}

export function Toggle({ name, label, value, onChange }: {
  name: string; label: string; value: boolean; onChange: (value: boolean) => void
}) {
  return <label className="toggle" htmlFor={name}>
    <input id={name} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>
}

export function Range({ name, label, value, min, max, step, onChange }: {
  name: string; label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void
}) {
  return (
    <Field name={name} label={label}>
      {(attrs) => <div className="range-control">
        <input {...attrs} type="range" value={value} min={min} max={max} step={step}
          onChange={(event) => onChange(event.target.valueAsNumber)} />
        <output htmlFor={name}>{Number(value.toFixed(2))}</output>
      </div>}
    </Field>
  )
}

export function Select<T extends string>({ name, label, value, options, onChange }: {
  name: string; label: string; value: T; options: readonly T[]; onChange: (value: T) => void
}) {
  return <Field name={name} label={label}>
    {(attrs) => <select {...attrs} value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>}
  </Field>
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export function RowActions({ label, index, length, move, remove, children }: {
  label: string; index: number; length: number; move: (to: number) => void; remove: () => void; children?: ReactNode
}) {
  return (
    <div className="actions row-actions">
      {children}
      <button type="button" disabled={index === 0} onClick={() => move(index - 1)} aria-label={`Move up ${label}`}>Up</button>
      <button type="button" disabled={index === length - 1} onClick={() => move(index + 1)} aria-label={`Move down ${label}`}>Down</button>
      <button type="button" className="delete" onClick={remove} aria-label={`Delete ${label}`}>Delete</button>
    </div>
  )
}

let nextRowKey = 0

export function Rows<T>({ name, label, itemLabel, items, onChange, create, render, compact = false }: {
  name: string
  label: string
  itemLabel: string
  items: T[]
  onChange: (items: T[]) => void
  create: () => T
  render: (item: T, update: (next: T) => void, path: string, index: number) => ReactNode
  compact?: boolean
}) {
  const [keys, setKeys] = useState(() => items.map(() => nextRowKey++))
  return (
    <fieldset id={name} className={compact ? 'collection compact' : 'collection'} tabIndex={-1}>
      <legend>{label}</legend>
      {items.length === 0 && <p className="muted">No entries yet.</p>}
      {items.map((item, index) => {
        const rowLabel = `${itemLabel} ${index + 1}`
        const update = (next: T) => onChange(items.map((current, position) => position === index ? next : current))
        return (
          <div className="collection-row" key={keys[index]}>
            <div className="collection-row-head">
              {!compact && <strong>{rowLabel}</strong>}
              <RowActions label={rowLabel} index={index} length={items.length}
                move={(to) => {
                  setKeys(moveItem(keys, index, to))
                  onChange(moveItem(items, index, to))
                }}
                remove={() => {
                  setKeys(keys.filter((_, position) => position !== index))
                  onChange(items.filter((_, position) => position !== index))
                }} />
            </div>
            {render(item, update, `${name}[${index}]`, index)}
          </div>
        )
      })}
      <button type="button" onClick={() => {
        setKeys([...keys, nextRowKey++])
        onChange([...items, create()])
      }}>Add {itemLabel.toLowerCase()}</button>
    </fieldset>
  )
}

export function TextList({ name, label, itemLabel, items, onChange, multiline }: {
  name: string; label: string; itemLabel: string; items: string[]; onChange: (items: string[]) => void; multiline?: boolean
}) {
  return <Rows name={name} label={label} itemLabel={itemLabel} items={items} onChange={onChange} create={() => ''} compact
    render={(item, update, path, index) =>
      <Text name={path} label={`${itemLabel} ${index + 1}`} value={item} onChange={update} multiline={multiline} />} />
}

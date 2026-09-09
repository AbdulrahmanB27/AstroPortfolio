/**
 * Tiny immutable path helpers used by every editor section. A path is a list of keys
 * into the draft, e.g. ['projects', 2, 'planet', 'color']. Writing `undefined` removes
 * the key from an object so optional fields drop out of the exported JSON instead of
 * being exported as empty strings (which the schema would reject).
 */

export type PathKey = string | number;
export type Path = readonly PathKey[];

type Bag = Record<PathKey, unknown>;

export function getAt(source: unknown, path: Path): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Bag)[key];
  }
  return current;
}

export function setAt<T>(source: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const head = path[0] as PathKey;
  const rest = path.slice(1);
  const existing = source !== null && typeof source === 'object' ? (source as unknown as Bag) : null;
  const child = existing ? existing[head] : undefined;
  const next = setAt(child, rest, value);

  if (Array.isArray(source)) {
    const copy = [...(source as unknown[])];
    copy[head as number] = next;
    return copy as unknown as T;
  }
  const copy: Bag = existing ? { ...existing } : {};
  if (next === undefined) delete copy[head];
  else copy[head] = next;
  return copy as unknown as T;
}

/** Array helpers that return new arrays (the draft is never mutated in place). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

export function removeItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function insertItem<T>(items: readonly T[], index: number, item: T): T[] {
  const copy = [...items];
  copy.splice(index, 0, item);
  return copy;
}

export function replaceItem<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

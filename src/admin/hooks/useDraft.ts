import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio } from '../../data/schema';
import { clearStoredDraft, loadedData, readStoredDraft, sameContent, writeStoredDraft } from '../lib/draft';
import { setAt, type Path } from '../lib/paths';

export interface DraftApi {
  draft: Portfolio;
  /** Write a value at a path (undefined removes an optional key). */
  set: (path: Path, value: unknown) => void;
  /** Replace the whole draft (import). */
  replace: (data: Portfolio) => void;
  /** Back to the data compiled into the page; clears the autosaved draft. */
  reset: () => void;
  /** True when the draft differs from the loaded data. */
  dirty: boolean;
  /** Set when a previous session's draft was restored from localStorage. */
  restored: { savedAt: string } | null;
  keepRestored: () => void;
  discardRestored: () => void;
}

interface State {
  draft: Portfolio;
  restored: { savedAt: string } | null;
}

function initialState(): State {
  const stored = readStoredDraft();
  if (stored && !sameContent(stored.data, loadedData)) {
    return { draft: stored.data, restored: { savedAt: stored.savedAt } };
  }
  return { draft: loadedData, restored: null };
}

export function useDraft(): DraftApi {
  const [state, setState] = useState<State>(initialState);
  const { draft, restored } = state;

  const dirty = useMemo(() => draft !== loadedData && !sameContent(draft, loadedData), [draft]);

  // Autosave, debounced so typing does not serialize on every keystroke.
  useEffect(() => {
    if (!dirty) {
      clearStoredDraft();
      return;
    }
    const timer = window.setTimeout(() => writeStoredDraft(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, dirty]);

  const set = useCallback((path: Path, value: unknown) => {
    setState((s) => ({ ...s, draft: setAt(s.draft, path, value) }));
  }, []);

  const replace = useCallback((data: Portfolio) => {
    setState((s) => ({ ...s, draft: data }));
  }, []);

  const reset = useCallback(() => {
    clearStoredDraft();
    setState({ draft: loadedData, restored: null });
  }, []);

  const keepRestored = useCallback(() => setState((s) => ({ ...s, restored: null })), []);
  const discardRestored = useCallback(() => {
    clearStoredDraft();
    setState({ draft: loadedData, restored: null });
  }, []);

  return {
    draft,
    set,
    replace,
    reset,
    dirty,
    restored,
    keepRestored,
    discardRestored,
  };
}

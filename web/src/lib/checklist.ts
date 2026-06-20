import { useState, useCallback, useEffect } from 'react';
import { apiGet, apiSend } from './api';

// Per-job field checklists, persisted to the OS3 backend (shared across
// users). Keyed by namespace (module) + item id (job). Same hook surface
// as before — load is async, toggles persist via PUT.

type ChecklistState = Record<string, string[]>;

export function useChecklist(ns: string) {
  const [state, setState] = useState<ChecklistState>({});

  useEffect(() => {
    let alive = true;
    apiGet<ChecklistState>(`/checklists/${encodeURIComponent(ns)}`)
      .then((m) => { if (alive) setState(m && typeof m === 'object' ? m : {}); })
      .catch(() => { /* keep empty on failure */ });
    return () => { alive = false; };
  }, [ns]);

  const toggle = useCallback(
    (itemId: string, step: string) => {
      setState((s) => {
        const cur = new Set(s[itemId] || []);
        if (cur.has(step)) cur.delete(step);
        else cur.add(step);
        const steps = [...cur];
        const next = { ...s, [itemId]: steps };
        apiSend('PUT', `/checklists/${encodeURIComponent(ns)}/${encodeURIComponent(itemId)}`, { steps }).catch(() => {});
        return next;
      });
    },
    [ns],
  );

  const has = useCallback((itemId: string, step: string) => (state[itemId] || []).includes(step), [state]);
  const count = useCallback((itemId: string) => (state[itemId] || []).length, [state]);

  return { has, toggle, count };
}

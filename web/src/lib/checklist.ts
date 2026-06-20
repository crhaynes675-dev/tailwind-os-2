import { useState, useCallback } from 'react';

// Lightweight localStorage-backed checklist, keyed by namespace + item id.
// Used by field modules (Installation, Post-Install, Delivery) to track
// per-job step progress that isn't part of the core job record.

type ChecklistState = Record<string, string[]>;

function load(ns: string): ChecklistState {
  try {
    return JSON.parse(localStorage.getItem(`os3_checklist_${ns}`) || '{}');
  } catch {
    return {};
  }
}

export function useChecklist(ns: string) {
  const [state, setState] = useState<ChecklistState>(() => load(ns));

  const toggle = useCallback(
    (itemId: string, step: string) => {
      setState((s) => {
        const cur = new Set(s[itemId] || []);
        if (cur.has(step)) cur.delete(step);
        else cur.add(step);
        const next = { ...s, [itemId]: [...cur] };
        try {
          localStorage.setItem(`os3_checklist_${ns}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [ns],
  );

  const has = useCallback((itemId: string, step: string) => (state[itemId] || []).includes(step), [state]);
  const count = useCallback((itemId: string) => (state[itemId] || []).length, [state]);

  return { has, toggle, count };
}

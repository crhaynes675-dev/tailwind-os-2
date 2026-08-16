import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Calendar reminders — dated items that aren't work orders.
 *
 * Kept deliberately separate from jobs: a reminder has no status pipeline, no
 * crew, and no readiness. Folding it into Job would mean every consumer of a
 * job had to start asking "but is it a real job?"
 */
export interface Reminder {
  id: string;
  title: string;
  date: string;            // YYYY-MM-DD
  endDate?: string;        // inclusive last day, for multi-day reminders
  time?: string;           // HH:MM
  owner?: string;
  notes?: string;
  jobId?: string;
  done?: boolean;
  /** Text this number ahead of the reminder. */
  smsTo?: string;
  smsLeadDays?: number;
}

export type ReminderDraft = Omit<Reminder, 'id'>;

export function useReminders(from: string, to: string) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Promise chain rather than async/await: this runs from an effect, and the
  // lint rule that guards against synchronous setState in effects can't see
  // through `await`.
  const load = useCallback(
    () =>
      apiGet<Reminder[]>(`/reminders?from=${from}&to=${to}`)
        .then((items) => {
          setReminders(Array.isArray(items) ? items : []);
          setError(null);
        })
        .catch((e) => {
          // A reminder-loading failure must not take the calendar down with it.
          setReminders([]);
          setError(e instanceof Error ? e.message : 'Could not load reminders.');
        }),
    [from, to],
  );

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (draft: ReminderDraft) => {
    const saved = await apiSend<Reminder>('POST', '/reminders', draft);
    setReminders((r) => [...r, saved]);
    return saved;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Reminder>) => {
    setReminders((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const saved = await apiSend<Reminder>('PUT', `/reminders/${id}`, patch);
      setReminders((r) => r.map((x) => (x.id === id ? saved : x)));
    } catch (e) {
      await load();
      throw e;
    }
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const before = reminders;
    setReminders((r) => r.filter((x) => x.id !== id));
    try {
      await apiSend('DELETE', `/reminders/${id}`);
    } catch (e) {
      setReminders(before);
      throw e;
    }
  }, [reminders]);

  return { reminders, error, reload: load, create, update, remove };
}

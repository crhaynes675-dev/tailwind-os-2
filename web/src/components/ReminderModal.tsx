import { useState } from 'react';
import type { Reminder, ReminderDraft } from '../data/reminders';

interface Props {
  /** Existing reminder to edit, or the date a new one starts on. */
  initial: Reminder | { date: string };
  onSave: (draft: ReminderDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

const isExisting = (v: Props['initial']): v is Reminder => 'id' in v;

export default function ReminderModal({ initial, onSave, onDelete, onCancel }: Props) {
  const existing = isExisting(initial) ? initial : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [time, setTime] = useState(existing?.time ?? '');
  const [owner, setOwner] = useState(existing?.owner ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [smsTo, setSmsTo] = useState(existing?.smsTo ?? '');
  const [smsLeadDays, setSmsLeadDays] = useState(String(existing?.smsLeadDays ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        date,
        endDate: endDate && endDate >= date ? endDate : undefined,
        time: time || undefined,
        owner: owner.trim() || undefined,
        notes: notes.trim() || undefined,
        done: existing?.done ?? false,
        smsTo: smsTo.trim() || undefined,
        // Lead time is meaningless without a number to text.
        smsLeadDays: smsTo.trim() ? Number(smsLeadDays) || 0 : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this reminder.');
      setBusy(false);
    }
  }

  async function del() {
    if (!onDelete || busy) return;
    setBusy(true);
    try { await onDelete(); } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this reminder.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={onCancel}>
      <div className="glass w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-faint">
          {existing ? 'Edit reminder' : 'New reminder'}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">What</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Call builder about site access"
            className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-glass bg-white/[0.04] px-2 py-2 text-xs text-text outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Ends</span>
            <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-glass bg-white/[0.04] px-2 py-2 text-xs text-text outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-glass bg-white/[0.04] px-2 py-2 text-xs text-text outline-none focus:border-accent" />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Owner</span>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who it's for"
            className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full resize-none rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </label>

        <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Text a reminder</div>
          <div className="mt-2 flex gap-2">
            <input
              value={smsTo}
              onChange={(e) => setSmsTo(e.target.value)}
              placeholder="(555) 123-4567"
              inputMode="tel"
              className="min-w-0 flex-1 rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
            />
            <select
              value={smsLeadDays}
              onChange={(e) => setSmsLeadDays(e.target.value)}
              disabled={!smsTo.trim()}
              className="rounded-lg border border-glass bg-white/[0.04] px-2 py-2 text-xs text-text outline-none focus:border-accent disabled:opacity-40"
            >
              <option value="0">On the day</option>
              <option value="1">1 day before</option>
              <option value="2">2 days before</option>
              <option value="7">A week before</option>
            </select>
          </div>
          <p className="mt-1.5 text-[0.62rem] text-faint">
            Sent automatically in the morning. Leave blank for no text.
          </p>
        </div>

        {error && <p className="mt-3 text-[0.72rem] text-[#f4607a]">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          {existing && onDelete && (
            <button onClick={del} disabled={busy}
              className="rounded-lg border border-[#f0554c]/40 px-3 py-2 text-xs font-semibold text-[#f0554c] transition hover:bg-[#f0554c]/10 disabled:opacity-40">
              Delete
            </button>
          )}
          <button onClick={onCancel} className="ml-auto rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || busy}
            className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? 'Saving…' : existing ? 'Save' : 'Add reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

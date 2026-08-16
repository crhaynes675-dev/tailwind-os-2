import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';
import ReminderModal from '../components/ReminderModal';
import { useReminders, type Reminder, type ReminderDraft } from '../data/reminders';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DATE_ROW = 22; // px reserved at the top of each week cell for the day number
const LANE_H = 22;   // px per stacked job bar
// Readiness chips are colored per job so steps from different jobs are
// distinguishable at a glance. Color is a stable hash of the job id.
const READINESS_PALETTE = ['#3b82c4', '#9b6dff', '#e8a427', '#34d39a', '#f4607a', '#22d3ee', '#c4763b', '#5b8def', '#d36ec4', '#7bbf3b'];
function jobColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return READINESS_PALETTE[h % READINESS_PALETTE.length];
}

const pad = (n: number) => String(n).padStart(2, '0');
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
// Timezone-proof string date math (dates are 'YYYY-MM-DD').
function toNum(s: string) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDaysStr(s: string, n: number) { const d = new Date(toNum(s) + n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function diffDaysStr(a: string, b: string) { return Math.round((toNum(b) - toNum(a)) / 86400000); }

type DragMode = 'new' | 'move' | 'resize';
interface DragState { mode: DragMode; id: string; step?: string }

type CalItem =
  | { kind: 'job'; job: Job; start: string; end: string }
  | { kind: 'task'; job: Job; step: string; owner?: string; done: boolean; start: string; end: string }
  | { kind: 'reminder'; reminder: Reminder; start: string; end: string };
interface Bar { item: CalItem; lane: number; startCol: number; endCol: number; startsHere: boolean; endsHere: boolean }

function QueueRow({ job, onSchedule, onOpen, dragging, onDragStart, onDragEnd }: {
  job: Job;
  onSchedule: () => void;
  onOpen: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06] ${dragging ? 'cursor-grabbing opacity-40' : 'cursor-grab'}`}
    >
      <div className="min-w-0 flex-1" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] font-semibold text-accent">{job.workOrder}</span>
          {job.priority === 'High' && <span className="rounded-full bg-[#f4607a]/15 px-2 py-px text-[0.5rem] font-bold uppercase text-[#f4607a]">High</span>}
        </div>
        <div className="mt-0.5 truncate text-[0.8rem] font-semibold text-text">{job.name}</div>
        <div className="truncate text-[0.64rem] text-muted">{job.customer} · {job.address || 'no address'}</div>
      </div>
      <button onClick={onSchedule} className="flex-shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-[0.66rem] font-semibold text-white transition hover:brightness-105">
        Schedule →
      </button>
    </div>
  );
}

export default function Schedule() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [pending, setPending] = useState<Job | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const todayStr = ymd(today);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const queue = useMemo(() => jobs.filter((j) => j.status === 'Unscheduled'), [jobs]);

  // The grid always renders six weeks, so fetch a window wide enough to cover
  // the days bleeding in from the neighbouring months.
  const [windowFrom, windowTo] = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 41);
    return [ymd(start), ymd(end)];
  }, [cursor]);
  const { reminders, create: createReminder, update: updateReminder, remove: removeReminder } =
    useReminders(windowFrom, windowTo);
  const [editing, setEditing] = useState<Reminder | { date: string } | null>(null);

  // Everything that lands on the calendar: scheduled job spans + dated readiness
  // steps (single-day tasks). Completed work drops off.
  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];
    for (const j of jobs) {
      if (j.status === 'Completed') continue;
      if (j.scheduledDate) {
        const end = j.scheduledEndDate && j.scheduledEndDate >= j.scheduledDate ? j.scheduledEndDate : j.scheduledDate;
        out.push({ kind: 'job', job: j, start: j.scheduledDate, end });
      }
      for (const r of j.readiness || []) {
        if (r.dueDate) {
          const end = r.endDate && r.endDate >= r.dueDate ? r.endDate : r.dueDate;
          out.push({ kind: 'task', job: j, step: r.step, owner: r.owner, done: !!r.done, start: r.dueDate, end });
        }
      }
    }
    for (const r of reminders) {
      const end = r.endDate && r.endDate >= r.date ? r.endDate : r.date;
      out.push({ kind: 'reminder', reminder: r, start: r.date, end });
    }
    return out;
  }, [jobs, reminders]);

  // Build 6 weeks; for each, lay its intersecting items into non-overlapping lanes.
  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 6 }, (_, w) => {
      const cells = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + i);
        return { date: d, str: ymd(d), inMonth: d.getMonth() === cursor.m };
      });
      const weekStart = cells[0].str;
      const weekEnd = cells[6].str;
      const hits = items
        .filter((s) => s.start <= weekEnd && s.end >= weekStart)
        .sort((a, b) => a.start.localeCompare(b.start) || diffDaysStr(a.start, a.end) - diffDaysStr(b.start, b.end) || (a.kind === b.kind ? 0 : a.kind === 'job' ? -1 : 1));
      const laneEnds: number[] = []; // last endCol occupied per lane
      const bars: Bar[] = hits.map((s) => {
        const startCol = s.start <= weekStart ? 0 : diffDaysStr(weekStart, s.start);
        const endCol = s.end >= weekEnd ? 6 : diffDaysStr(weekStart, s.end);
        let lane = laneEnds.findIndex((e) => e < startCol);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(endCol); } else laneEnds[lane] = endCol;
        return { item: s, lane, startCol, endCol, startsHere: s.start >= weekStart, endsHere: s.end <= weekEnd };
      });
      const laneCount = Math.max(1, laneEnds.length);
      return { cells, bars, height: DATE_ROW + laneCount * LANE_H + 4 };
    });
  }, [cursor, items]);

  function colFromEvent(e: React.DragEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(6, Math.floor((e.clientX - r.left) / (r.width / 7))));
  }

  function apply(job: Job, patch: Partial<Job>, msg: string) {
    updateJob(job.id, patch).then(() => setToast(msg)).catch(() => setToast('Update failed'));
  }

  // Move / resize a single readiness step, persisting back onto the WO's readiness array.
  function applyReadiness(job: Job, step: string, mode: DragMode, date: string) {
    const cur = (job.readiness || []).find((r) => r.step === step);
    if (!cur) return;
    const start = cur.dueDate || date;
    const end = cur.endDate && cur.endDate >= start ? cur.endDate : start;
    let patch: { dueDate: string; endDate: string };
    let msg: string;
    if (mode === 'resize') {
      const newEnd = date < start ? start : date;
      const span = diffDaysStr(start, newEnd) + 1;
      patch = { dueDate: start, endDate: newEnd };
      msg = `${step} · ${span} day${span > 1 ? 's' : ''}`;
    } else {
      const dur = diffDaysStr(start, end);
      patch = { dueDate: date, endDate: addDaysStr(date, dur) };
      msg = `${step} → ${date.slice(5)}`;
    }
    const arr = (job.readiness || []).map((r) => (r.step === step ? { ...r, ...patch } : r));
    updateJob(job.id, { readiness: arr }).then(() => setToast(`${job.workOrder} · ${msg}`)).catch(() => setToast('Update failed'));
  }

  function onDrop(e: React.DragEvent, cells: { str: string }[]) {
    e.preventDefault();
    const d = drag;
    setDrag(null); setOverDate(null);
    if (!d) return;
    const date = cells[colFromEvent(e)].str;
    const job = jobs.find((j) => j.id === d.id);
    if (!job) return;
    if (d.step) { applyReadiness(job, d.step, d.mode, date); return; }
    if (d.mode === 'resize') {
      const start = job.scheduledDate!;
      const end = date < start ? start : date;
      const span = diffDaysStr(start, end) + 1;
      apply(job, { scheduledEndDate: end }, `${job.workOrder} · ${span} day${span > 1 ? 's' : ''} (${start.slice(5)}–${end.slice(5)})`);
    } else if (d.mode === 'move') {
      const start = job.scheduledDate!;
      const dur = diffDaysStr(start, job.scheduledEndDate && job.scheduledEndDate >= start ? job.scheduledEndDate : start);
      const patch: Partial<Job> = { scheduledDate: date, scheduledEndDate: addDaysStr(date, dur) };
      if (job.status === 'Unscheduled') patch.status = 'Scheduled';
      apply(job, patch, `${job.workOrder} moved to ${date.slice(5)}`);
    } else {
      apply(job, { status: 'Scheduled', scheduledDate: date, scheduledEndDate: date }, `${job.workOrder} scheduled for ${date.slice(5)}`);
    }
  }

  function goMonth(delta: number) {
    setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  }

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 03</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Schedule</h1>
        <p className="mt-1.5 text-sm text-muted">Drag a job onto a day to schedule it. Drag a job box to move it, or drag its right edge to stretch it across multiple days.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
          {/* Needs scheduling */}
          <section className="glass flex flex-col rounded-2xl lg:max-h-[calc(100vh-20rem)]">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Needs Scheduling</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{queue.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 overflow-y-auto p-3">
              {queue.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">Queue is clear — nothing waiting to schedule.</div>
              ) : queue.map((j) => (
                <QueueRow
                  key={j.id}
                  job={j}
                  dragging={drag?.id === j.id}
                  onSchedule={() => setPending(j)}
                  onOpen={() => select(j.id)}
                  onDragStart={() => setDrag({ mode: 'new', id: j.id })}
                  onDragEnd={() => { setDrag(null); setOverDate(null); }}
                />
              ))}
            </div>
          </section>

          {/* Calendar — fills the viewport so week rows get real vertical room
              instead of collapsing to the height of their job bars. */}
          <section className="glass flex flex-col rounded-2xl lg:h-[calc(100vh-20rem)]">
            <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
              <span className="text-sm font-semibold text-text">{MONTHS[cursor.m]} {cursor.y}</span>
              <span className="hidden items-center gap-1.5 text-[0.56rem] text-faint sm:flex">
                <span className="inline-block h-2 w-3 rounded-sm border border-dashed border-muted" />
                readiness step (color = job)
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => setEditing({ date: cursor.y === today.getFullYear() && cursor.m === today.getMonth() ? todayStr : ymd(new Date(cursor.y, cursor.m, 1)) })}
                  className="rounded-lg border border-glass bg-white/5 px-2.5 py-1 text-[0.62rem] font-semibold text-muted transition hover:border-accent hover:text-accent"
                >
                  + Reminder
                </button>
                <button onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })} className="rounded-lg border border-glass bg-white/5 px-2.5 py-1 text-[0.62rem] font-semibold text-muted transition hover:text-text">Today</button>
                <button onClick={() => goMonth(-1)} className="grid h-7 w-7 place-items-center rounded-lg border border-glass bg-white/5 text-muted transition hover:text-text">‹</button>
                <button onClick={() => goMonth(1)} className="grid h-7 w-7 place-items-center rounded-lg border border-glass bg-white/5 text-muted transition hover:text-text">›</button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-white/5">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-1.5 text-center text-[0.56rem] font-semibold uppercase tracking-wider text-faint">{d}</div>
              ))}
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto">
              {weeks.map((week, wi) => (
                <div
                  key={wi}
                  // flex-1 shares leftover height across the weeks; minHeight
                  // keeps a busy week tall enough for its stacked bars, and the
                  // parent scrolls when every week is at its minimum.
                  className="relative flex-1 border-b border-white/5"
                  style={{ minHeight: week.height }}
                  onDragOver={(e) => { if (drag) { e.preventDefault(); setOverDate(week.cells[colFromEvent(e)].str); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverDate(null); }}
                  onDrop={(e) => onDrop(e, week.cells)}
                >
                  {/* Day-cell background grid */}
                  <div className="absolute inset-0 grid grid-cols-7">
                    {week.cells.map((cell, i) => {
                      const isToday = cell.str === todayStr;
                      const isOver = !!drag && overDate === cell.str;
                      return (
                        <div
                          key={cell.str}
                          onDoubleClick={() => setEditing({ date: cell.str })}
                          title="Double-click to add a reminder"
                          className={`border-r border-white/5 ${i === 6 ? 'border-r-0' : ''} ${cell.inMonth ? '' : 'bg-black/15'} ${isOver ? 'bg-accent/10 ring-2 ring-inset ring-accent/60' : ''}`}
                        >
                          <div className={`mx-auto mt-1 flex h-5 w-5 items-center justify-center text-[0.62rem] font-semibold ${isToday ? 'rounded-full bg-accent text-black' : cell.inMonth ? 'text-muted' : 'text-faint'}`}>
                            {cell.date.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Job bars + readiness tasks */}
                  {week.bars.map((bar) => {
                    const common = {
                      left: `calc(${(bar.startCol / 7) * 100}% + 2px)`,
                      width: `calc(${((bar.endCol - bar.startCol + 1) / 7) * 100}% - 4px)`,
                      top: DATE_ROW + bar.lane * LANE_H,
                      height: LANE_H - 4,
                    };

                    // Reminder — not a work order, so it reads differently from
                    // a job bar: dashed, neutral, and struck through when done.
                    if (bar.item.kind === 'reminder') {
                      const r = bar.item.reminder;
                      return (
                        <div
                          key={r.id}
                          onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                          title={`${r.title}${r.time ? ` at ${r.time}` : ''}${r.owner ? ` · ${r.owner}` : ''}${r.smsTo ? ' · texts a reminder' : ''}`}
                          className={`absolute z-10 flex cursor-pointer items-center gap-1 overflow-hidden rounded-md border border-dashed px-1.5 text-[0.58rem] transition hover:brightness-125 ${r.done ? 'opacity-50' : ''}`}
                          style={{ ...common, background: '#8da3c71f', borderColor: '#8da3c7' }}
                        >
                          <span className="flex-shrink-0 text-[0.6rem] text-[#8da3c7]">{r.done ? '✓' : '🔔'}</span>
                          <span className={`truncate font-semibold text-[#b9c8dd] ${r.done ? 'line-through' : ''}`}>
                            {r.time ? `${r.time} ` : ''}{r.title}
                          </span>
                          {r.smsTo && <span className="ml-auto flex-shrink-0 text-[0.55rem] text-[#8da3c7]" aria-label="texts a reminder">✉</span>}
                        </div>
                      );
                    }

                    // Readiness step — a single-day task chip (not draggable).
                    if (bar.item.kind === 'task') {
                      const { job: j, step, owner, done } = bar.item;
                      const rc = jobColor(j.id);
                      const dragging = drag?.id === j.id && drag?.step === step;
                      return (
                        <div
                          key={`${j.id}:${step}`}
                          draggable
                          onDragStart={() => setDrag({ mode: 'move', id: j.id, step })}
                          onDragEnd={() => { setDrag(null); setOverDate(null); }}
                          onClick={() => select(j.id)}
                          title={`Readiness · ${step}${owner ? ` · ${owner}` : ''} · ${j.workOrder} ${j.name}${done ? ' · done' : ''} — drag to move, drag right edge to span days`}
                          className={`absolute z-10 flex items-center gap-1 overflow-hidden border border-dashed px-1.5 text-[0.58rem] transition hover:brightness-125 ${bar.startsHere ? 'rounded-l-md' : ''} ${bar.endsHere ? 'rounded-r-md' : ''} ${done ? 'opacity-55' : ''} ${dragging ? 'opacity-40' : ''} cursor-grab`}
                          style={{ ...common, background: `${rc}1f`, borderColor: rc }}
                        >
                          <span className="flex-shrink-0 text-[0.6rem]" style={{ color: rc }}>{done ? '✓' : '◷'}</span>
                          <span className={`truncate font-semibold ${done ? 'line-through' : ''}`} style={{ color: rc }}>{j.workOrder} · {step}</span>
                          {bar.endsHere && (
                            <span
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); setDrag({ mode: 'resize', id: j.id, step }); }}
                              onDragEnd={(e) => { e.stopPropagation(); setDrag(null); setOverDate(null); }}
                              onClick={(e) => e.stopPropagation()}
                              title="Drag to change how many days this step spans"
                              className="ml-auto h-full w-2 flex-shrink-0 cursor-ew-resize rounded-r-md"
                              style={{ background: `${rc}55` }}
                            />
                          )}
                        </div>
                      );
                    }

                    // Scheduled job span — draggable to move / resize.
                    const j = bar.item.job;
                    const color = STATUS_META[j.status]?.color || '#7c6cff';
                    const span = diffDaysStr(j.scheduledDate!, (j.scheduledEndDate && j.scheduledEndDate >= j.scheduledDate! ? j.scheduledEndDate : j.scheduledDate!)) + 1;
                    return (
                      <div
                        key={j.id}
                        draggable
                        onDragStart={() => setDrag({ mode: 'move', id: j.id })}
                        onDragEnd={() => { setDrag(null); setOverDate(null); }}
                        onClick={() => select(j.id)}
                        title={`${j.workOrder} · ${j.name} · ${STATUS_META[j.status]?.short || j.status} · ${span} day${span > 1 ? 's' : ''}${j.crew ? ` · ${j.crew}` : ''}`}
                        className={`absolute z-10 flex items-center gap-1 overflow-hidden border px-1.5 text-[0.6rem] transition hover:brightness-125 ${bar.startsHere ? 'rounded-l-md' : ''} ${bar.endsHere ? 'rounded-r-md' : ''} ${drag?.id === j.id ? 'opacity-40' : ''} cursor-grab`}
                        style={{
                          ...common,
                          background: `${color}26`,
                          borderColor: color,
                          borderLeftWidth: bar.startsHere ? 3 : 1,
                        }}
                      >
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
                        <span className="truncate font-semibold" style={{ color }}>{j.name}</span>
                        {bar.endsHere && (
                          <span
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); setDrag({ mode: 'resize', id: j.id }); }}
                            onDragEnd={(e) => { e.stopPropagation(); setDrag(null); setOverDate(null); }}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to change how many days this job spans"
                            className="ml-auto h-full w-2 flex-shrink-0 cursor-ew-resize rounded-r-md"
                            style={{ background: `${color}55` }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {pending && (
        <TransitionModal job={pending} to="Scheduled" onCancel={() => setPending(null)} onConfirm={(patch) => { updateJob(pending.id, patch).catch(() => {}); setPending(null); }} />
      )}

      {editing && (
        <ReminderModal
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (draft: ReminderDraft) => {
            if ('id' in editing) await updateReminder(editing.id, draft);
            else await createReminder(draft);
            setEditing(null);
          }}
          onDelete={'id' in editing ? async () => { await removeReminder(editing.id); setEditing(null); } : undefined}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="glass rounded-full px-5 py-2.5 text-sm text-text">{toast}</div>
        </div>
      )}
    </>
  );
}

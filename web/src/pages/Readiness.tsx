import { useState, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { useChecklist } from '../lib/checklist';
import { WORKFLOWS } from '../domain/workflows';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

// Workflow 02 readiness steps (skip the "Job Setup" entry step).
const STEPS = WORKFLOWS.find((w) => w.id === '02')!.steps.slice(1).map((s) => s.step);
const ACCENT = '#3b82c4';

export default function Readiness() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const cl = useChecklist('readiness');
  const [pending, setPending] = useState<Job | null>(null);

  const queue = useMemo(() => jobs.filter((j) => j.status === 'Unscheduled'), [jobs]);

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 02</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Readiness</h1>
        <p className="mt-1.5 text-sm text-muted">Clear the preconstruction gate — RO walk, builder coordination, material verification — then send to scheduling.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center text-sm text-muted">No unscheduled jobs awaiting readiness.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
          {queue.map((j) => {
            const done = cl.count(j.id);
            const pct = Math.round((done / STEPS.length) * 100);
            const ready = done === STEPS.length;
            return (
              <div key={j.id} className="glass flex flex-col rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 cursor-pointer" onClick={() => select(j.id)}>
                    <div className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</div>
                    <div className="truncate text-[0.86rem] font-semibold text-text">{j.name}</div>
                    <div className="truncate text-[0.64rem] text-muted">{j.customer}</div>
                  </div>
                  {ready ? (
                    <span className="flex-shrink-0 rounded-full bg-[#34d39a]/15 px-2 py-0.5 text-[0.55rem] font-bold uppercase text-[#34d39a]">Ready</span>
                  ) : (
                    <span className="flex-shrink-0 text-[0.6rem] font-semibold" style={{ color: ACCENT }}>{pct}%</span>
                  )}
                </div>

                <div className="my-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT, boxShadow: `0 0 8px ${ACCENT}80` }} />
                </div>

                <div className="flex flex-col gap-1.5">
                  {STEPS.map((step) => (
                    <label key={step} className="flex cursor-pointer items-center gap-2.5 text-[0.74rem] text-muted">
                      <input type="checkbox" checked={cl.has(j.id, step)} onChange={() => cl.toggle(j.id, step)} className="h-3.5 w-3.5" style={{ accentColor: ACCENT }} />
                      <span className={cl.has(j.id, step) ? 'text-text line-through opacity-70' : ''}>{step}</span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={() => setPending(j)}
                  disabled={!ready}
                  className="mt-4 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white transition enabled:hover:brightness-105 disabled:opacity-40"
                >
                  {ready ? 'Send to scheduling →' : 'Complete readiness to schedule'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <TransitionModal
          job={pending}
          to="Scheduled"
          onCancel={() => setPending(null)}
          onConfirm={(patch) => {
            updateJob(pending.id, patch).catch(() => {});
            setPending(null);
          }}
        />
      )}
    </>
  );
}

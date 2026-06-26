import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { buildReadinessPlan as buildPlan } from '../domain/readiness';
import type { Job, ReadinessStep } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

const ACCENT = '#3b82c4';

export default function Readiness() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [pending, setPending] = useState<Job | null>(null);
  const [plans, setPlans] = useState<Record<string, ReadinessStep[]>>({});

  const queue = useMemo(() => jobs.filter((j) => j.status === 'Unscheduled'), [jobs]);

  // Seed a local editable plan for any job we haven't loaded yet.
  useEffect(() => {
    setPlans((prev) => {
      const next = { ...prev };
      for (const j of queue) if (!next[j.id]) next[j.id] = buildPlan(j);
      return next;
    });
  }, [queue]);

  function applyStep(job: Job, stepName: string, patch: Partial<ReadinessStep>, save: boolean) {
    const base = plans[job.id] || buildPlan(job);
    const arr = base.map((r) => (r.step === stepName ? { ...r, ...patch } : r));
    setPlans((prev) => ({ ...prev, [job.id]: arr }));
    if (save) updateJob(job.id, { readiness: arr }).catch(() => {});
  }

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 02</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Readiness</h1>
        <p className="mt-1.5 text-sm text-muted">Schedule each preconstruction step — owner and target date — then mark it done. The plan stays on the work order through its whole life.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center text-sm text-muted">No unscheduled jobs awaiting readiness.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))' }}>
          {queue.map((j) => {
            const plan = plans[j.id] || buildPlan(j);
            const done = plan.filter((r) => r.done).length;
            const pct = Math.round((done / plan.length) * 100);
            const ready = done === plan.length;
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
                    <span className="flex-shrink-0 text-[0.6rem] font-semibold" style={{ color: ACCENT }}>{done}/{plan.length}</span>
                  )}
                </div>

                <div className="my-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT, boxShadow: `0 0 8px ${ACCENT}80` }} />
                </div>

                <div className="flex flex-col gap-2">
                  {plan.map((r) => (
                    <div key={r.step} className={`rounded-xl border px-3 py-2 transition ${r.done ? 'border-[#34d39a]/30 bg-[#34d39a]/[0.06]' : 'border-white/5 bg-white/[0.02]'}`}>
                      <label className="flex cursor-pointer items-center gap-2.5 text-[0.76rem]">
                        <input
                          type="checkbox"
                          checked={!!r.done}
                          onChange={(e) => applyStep(j, r.step, { done: e.target.checked, completedAt: e.target.checked ? new Date().toISOString() : undefined }, true)}
                          className="h-3.5 w-3.5 flex-shrink-0"
                          style={{ accentColor: '#34d39a' }}
                        />
                        <span className={`font-semibold ${r.done ? 'text-text line-through opacity-70' : 'text-text'}`}>{r.step}</span>
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-0.5 block text-[0.52rem] font-semibold uppercase tracking-wider text-faint">Target date</label>
                          <input
                            type="date"
                            value={r.dueDate || ''}
                            onChange={(e) => applyStep(j, r.step, { dueDate: e.target.value }, true)}
                            className="w-full rounded-md border border-glass bg-white/[0.04] px-2 py-1 text-[0.72rem] text-text outline-none focus:border-accent"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[0.52rem] font-semibold uppercase tracking-wider text-faint">Owner</label>
                          <input
                            type="text"
                            value={r.owner || ''}
                            placeholder="Assign…"
                            onChange={(e) => applyStep(j, r.step, { owner: e.target.value }, false)}
                            onBlur={() => applyStep(j, r.step, {}, true)}
                            className="w-full rounded-md border border-glass bg-white/[0.04] px-2 py-1 text-[0.72rem] text-text outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                    </div>
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

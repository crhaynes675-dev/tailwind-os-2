import { useState, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { STATUS_META } from '../domain/status';
import { useChecklist } from '../lib/checklist';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

const STEPS = ['On Site', 'Install In Progress', 'Punch Completion'];

function PageHero() {
  return (
    <div className="mb-6">
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 05</div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Installation</h1>
      <p className="mt-1.5 text-sm text-muted">Active installs on site. Work the punch list, then complete to trigger the post-install walk.</p>
    </div>
  );
}

export default function Installation() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const cl = useChecklist('install');
  const [pending, setPending] = useState<Job | null>(null);

  const active = useMemo(() => jobs.filter((j) => j.status === 'In Progress'), [jobs]);
  const meta = STATUS_META['In Progress'];

  return (
    <>
      <PageHero />
      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : active.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center text-sm text-muted">No active installations right now.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
          {active.map((j) => {
            const done = cl.count(j.id);
            const pct = Math.round((done / STEPS.length) * 100);
            return (
              <div key={j.id} className="glass flex flex-col rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 cursor-pointer" onClick={() => select(j.id)}>
                    <div className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</div>
                    <div className="truncate text-[0.86rem] font-semibold text-text">{j.name}</div>
                    <div className="truncate text-[0.64rem] text-muted">{j.crew ? `${j.crew} · ` : ''}{j.address || j.customer}</div>
                  </div>
                  <span className="flex-shrink-0 text-[0.6rem] font-semibold" style={{ color: meta.color }}>{pct}%</span>
                </div>

                <div className="my-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color, boxShadow: `0 0 8px ${meta.color}80` }} />
                </div>

                <div className="flex flex-col gap-1.5">
                  {STEPS.map((step) => (
                    <label key={step} className="flex cursor-pointer items-center gap-2.5 text-[0.74rem] text-muted">
                      <input type="checkbox" checked={cl.has(j.id, step)} onChange={() => cl.toggle(j.id, step)} className="h-3.5 w-3.5 accent-[#29c3ec]" />
                      <span className={cl.has(j.id, step) ? 'text-text line-through opacity-70' : ''}>{step}</span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={() => setPending(j)}
                  className="mt-4 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-105"
                >
                  Install Complete →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <TransitionModal
          job={pending}
          to="Ready for Post-Install Walk"
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

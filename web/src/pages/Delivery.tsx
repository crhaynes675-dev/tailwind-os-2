import { useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { useChecklist } from '../lib/checklist';

const STEPS = ['Material Ready', 'Warehouse Pick', 'Quality Check', 'Load Truck', 'Delivery', 'Site Verification'];
const ACCENT = '#9b4dca';

export default function Delivery() {
  const { jobs, loading, select } = useJobsCtx();
  const cl = useChecklist('delivery');

  // Deliveries are coordinated for jobs that are scheduled (need material on site to install).
  const deliveries = useMemo(
    () =>
      jobs
        .filter((j) => j.status === 'Scheduled' || j.status === 'In Progress')
        .sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')),
    [jobs],
  );

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">
          Module · Workflow 04 <span className="rounded-full bg-accent2/20 px-1.5 py-px text-[0.5rem] font-bold text-accent2">new</span>
        </div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Delivery</h1>
        <p className="mt-1.5 text-sm text-muted">Stage, load, and verify material delivery for scheduled jobs.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : deliveries.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center text-sm text-muted">No deliveries to coordinate.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
          {deliveries.map((j) => {
            const done = cl.count(j.id);
            const pct = Math.round((done / STEPS.length) * 100);
            const complete = done === STEPS.length;
            return (
              <div key={j.id} className="glass flex flex-col rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 cursor-pointer" onClick={() => select(j.id)}>
                    <div className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</div>
                    <div className="truncate text-[0.84rem] font-semibold text-text">{j.name}</div>
                    <div className="truncate text-[0.64rem] text-muted">{j.scheduledDate || 'no date'} · {j.address || j.customer}</div>
                  </div>
                  {complete ? (
                    <span className="flex-shrink-0 rounded-full bg-[#34d39a]/15 px-2 py-0.5 text-[0.55rem] font-bold uppercase text-[#34d39a]">Delivered</span>
                  ) : (
                    <span className="flex-shrink-0 text-[0.6rem] font-semibold" style={{ color: ACCENT }}>{pct}%</span>
                  )}
                </div>

                <div className="my-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT, boxShadow: `0 0 8px ${ACCENT}80` }} />
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {STEPS.map((step) => (
                    <label key={step} className="flex cursor-pointer items-center gap-2 text-[0.7rem] text-muted">
                      <input type="checkbox" checked={cl.has(j.id, step)} onChange={() => cl.toggle(j.id, step)} className="h-3.5 w-3.5" style={{ accentColor: ACCENT }} />
                      <span className={cl.has(j.id, step) ? 'text-text line-through opacity-70' : ''}>{step}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

import { useState, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { useChecklist } from '../lib/checklist';
import { WORKFLOWS } from '../domain/workflows';

const DAILY = WORKFLOWS.find((w) => w.id === '10')!.steps;
const WEEKLY = WORKFLOWS.find((w) => w.id === '11')!.steps;

const today = new Date().toISOString().slice(0, 10);
function weekKey() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

export default function Manager() {
  const { jobs, loading } = useJobsCtx();
  const cl = useChecklist('manager');
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');

  const ctx = useMemo(() => {
    const scheduledToday = jobs.filter((j) => j.status === 'Scheduled' && j.scheduledDate === today).length;
    const activeCrews = new Set(jobs.filter((j) => j.status === 'In Progress').map((j) => j.crew || 'Unassigned')).size;
    const inProgress = jobs.filter((j) => j.status === 'In Progress').length;
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const forecast = jobs
      .filter((j) => j.scheduledDate && j.scheduledDate >= today && j.scheduledDate <= in14 && j.status !== 'Completed')
      .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
    return { scheduledToday, activeCrews, inProgress, forecast };
  }, [jobs]);

  const dailyStat: Record<string, string> = {
    'Review Schedule': `${ctx.scheduledToday} scheduled today`,
    'Verify Crews': `${ctx.activeCrews} crew${ctx.activeCrews === 1 ? '' : 's'} active`,
    'Verify Deliveries': `${ctx.inProgress} in field`,
    'Field Support / Site Visits': `${ctx.inProgress} active`,
  };

  const steps = tab === 'daily' ? DAILY : WEEKLY;
  const itemId = tab === 'daily' ? `daily:${today}` : `weekly:${weekKey()}`;
  const done = cl.count(itemId);

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflows 10 / 11</div>
          <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Install Manager</h1>
          <p className="mt-1.5 text-sm text-muted">Daily operating rhythm and weekly planning. {done}/{steps.length} complete.</p>
        </div>
        <div className="flex gap-1 rounded-full border border-glass bg-white/5 p-1">
          {(['daily', 'weekly'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${tab === t ? 'bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] text-white' : 'text-muted hover:text-text'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(320px,1fr) minmax(280px,1fr)' }}>
          {/* checklist */}
          <section className="glass rounded-2xl p-5">
            <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">
              {tab === 'daily' ? `Today · ${today}` : `Week of ${weekKey()}`}
            </div>
            <div className="flex flex-col gap-2.5">
              {steps.map((s) => {
                const checked = cl.has(itemId, s.step);
                const stat = tab === 'daily' ? dailyStat[s.step] : undefined;
                return (
                  <label key={s.step} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.05]">
                    <input type="checkbox" checked={checked} onChange={() => cl.toggle(itemId, s.step)} className="mt-0.5 h-4 w-4 accent-[#29c3ec]" />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[0.8rem] font-medium ${checked ? 'text-faint line-through' : 'text-text'}`}>{s.step}</div>
                      <div className="text-[0.62rem] text-muted">{s.owner} · {s.output}</div>
                    </div>
                    {stat && <span className="flex-shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.58rem] font-semibold text-accent">{stat}</span>}
                  </label>
                );
              })}
            </div>
          </section>

          {/* forecast */}
          <section className="glass rounded-2xl p-5">
            <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">2-week forecast · {ctx.forecast.length} jobs</div>
            {ctx.forecast.length === 0 ? (
              <div className="py-8 text-center text-[0.72rem] text-faint">Nothing scheduled in the next two weeks.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {ctx.forecast.map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[0.74rem] font-medium text-text">{j.name}</div>
                      <div className="truncate text-[0.6rem] text-muted">{j.crew || 'unassigned'}</div>
                    </div>
                    <span className="flex-shrink-0 text-[0.62rem] text-faint">{j.scheduledDate}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

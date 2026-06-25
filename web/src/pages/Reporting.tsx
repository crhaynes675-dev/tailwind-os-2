import { useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { STATUS_PIPELINE, STATUS_META, type JobStatus } from '../domain/status';
import type { Job } from '../data/jobs';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function exportJobsCsv(jobs: Job[]) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ['Work Order', 'Job', 'Customer', 'Status', 'Crew', 'Scheduled', 'Completed', 'Contract', 'Material', 'Labor', 'Margin', 'Invoice'];
  const rows = jobs.map((j) => [
    j.workOrder, j.name, j.customer, j.status, j.crew ?? '', j.scheduledDate ?? '',
    j.completedAt ? j.completedAt.slice(0, 10) : '',
    j.contractAmount ?? '', j.materialCost ?? '', j.laborCost ?? '',
    (j.contractAmount ?? 0) - (j.materialCost ?? 0) - (j.laborCost ?? 0),
    j.invoiceStatus ?? 'none',
  ]);
  const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `os3-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Tile({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full" style={{ background: `radial-gradient(circle, ${color}33, transparent 68%)` }} />
      <div className="relative text-[0.55rem] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="relative mt-2 text-[2.3rem] font-bold leading-none tracking-tight" style={{ color }}>{value}</div>
    </div>
  );
}

export default function Reporting() {
  const { jobs, loading } = useJobsCtx();

  const stats = useMemo(() => {
    const byStatus = {} as Record<JobStatus, number>;
    STATUS_PIPELINE.forEach((s) => (byStatus[s] = 0));
    jobs.forEach((j) => (byStatus[j.status] += 1));

    const crew = new Map<string, number>();
    jobs
      .filter((j) => j.status === 'Scheduled' || j.status === 'In Progress')
      .forEach((j) => crew.set(j.crew || 'Unassigned', (crew.get(j.crew || 'Unassigned') || 0) + 1));
    const crewLoad = [...crew.entries()].sort((a, b) => b[1] - a[1]);

    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    const upcoming = jobs
      .filter((j) => j.scheduledDate && j.scheduledDate >= todayStr && j.scheduledDate <= in7 && j.status !== 'Completed')
      .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

    let revenue = 0, collected = 0, ar = 0, margin = 0, completedCount = 0, cycleSum = 0, cycleN = 0;
    jobs.forEach((j) => {
      const amt = j.contractAmount ?? 0;
      revenue += amt;
      margin += amt - (j.materialCost ?? 0) - (j.laborCost ?? 0);
      if (j.invoiceStatus === 'paid') collected += amt;
      else if (j.invoiceStatus === 'invoiced') ar += amt;
      if (j.status === 'Completed') {
        completedCount += 1;
        if (j.scheduledDate && j.completedAt) {
          const d = (new Date(j.completedAt).getTime() - new Date(j.scheduledDate).getTime()) / 86400000;
          if (isFinite(d) && d >= 0) { cycleSum += d; cycleN += 1; }
        }
      }
    });
    const avgCycleDays = cycleN ? Math.round(cycleSum / cycleN) : null;

    return { total: jobs.length, byStatus, crewLoad, upcoming, revenue, collected, ar, margin, completedCount, avgCycleDays };
  }, [jobs]);

  const active = stats.byStatus['In Progress'] + stats.byStatus['Ready for Post-Install Walk'];
  const maxStatus = Math.max(1, ...STATUS_PIPELINE.map((s) => stats.byStatus[s]));
  const maxCrew = Math.max(1, ...stats.crewLoad.map(([, n]) => n));

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Reporting</div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Reporting</h1>
          <button
            onClick={() => exportJobsCsv(jobs)}
            className="rounded-lg border border-glass bg-white/5 px-3.5 py-2 text-xs font-semibold text-accent transition hover:bg-white/10"
          >
            ↓ Export CSV
          </button>
        </div>
        <p className="mt-1.5 text-sm text-muted">Live pipeline throughput, workload, and financials across the OS3 status architecture.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <>
          <div className="mb-3.5 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <Tile label="Revenue (contracted)" value={usd(stats.revenue)} color="#29c3ec" />
            <Tile label="Gross margin" value={usd(stats.margin)} color="#34d39a" />
            <Tile label="Outstanding AR" value={usd(stats.ar)} color="#fb7185" />
            <Tile label="Collected" value={usd(stats.collected)} color="#7c6cff" />
            <Tile label="Avg schedule→done" value={stats.avgCycleDays != null ? `${stats.avgCycleDays}d` : '—'} color="#f0a23c" />
          </div>

          <div className="mb-6 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <Tile label="Total jobs" value={stats.total} color="#29c3ec" />
            <Tile label="Active on site" value={active} color={STATUS_META['In Progress'].color} />
            <Tile label="Scheduled" value={stats.byStatus.Scheduled} color={STATUS_META.Scheduled.color} />
            <Tile label="Unscheduled" value={stats.byStatus.Unscheduled} color={STATUS_META.Unscheduled.color} />
            <Tile label="Completed" value={stats.byStatus.Completed} color={STATUS_META.Completed.color} />
          </div>

          <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(320px,1.2fr) minmax(280px,1fr)' }}>
            {/* Pipeline distribution */}
            <section className="glass rounded-2xl p-5">
              <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Pipeline distribution</div>
              <div className="flex flex-col gap-3">
                {STATUS_PIPELINE.map((s) => {
                  const meta = STATUS_META[s];
                  const n = stats.byStatus[s];
                  const pct = stats.total ? Math.round((n / stats.total) * 100) : 0;
                  return (
                    <div key={s}>
                      <div className="mb-1 flex items-center justify-between text-[0.68rem]">
                        <span className="text-muted">{meta.short}</span>
                        <span className="font-semibold" style={{ color: meta.color }}>{n} <span className="text-faint">· {pct}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(n / maxStatus) * 100}%`, background: meta.color, boxShadow: `0 0 10px ${meta.color}80` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Crew workload */}
            <section className="glass rounded-2xl p-5">
              <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Crew workload · active + scheduled</div>
              {stats.crewLoad.length === 0 ? (
                <div className="py-8 text-center text-[0.72rem] text-faint">No assigned work yet.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {stats.crewLoad.map(([crew, n]) => (
                    <div key={crew}>
                      <div className="mb-1 flex items-center justify-between text-[0.68rem]">
                        <span className="text-muted">{crew}</span>
                        <span className="font-semibold text-text">{n}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#22d3ee] to-[#7c6cff]" style={{ width: `${(n / maxCrew) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Upcoming */}
          <section className="glass mt-5 rounded-2xl p-5">
            <div className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Upcoming · next 7 days</div>
            {stats.upcoming.length === 0 ? (
              <div className="py-6 text-center text-[0.72rem] text-faint">Nothing scheduled in the next week.</div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
                {stats.upcoming.map((j) => {
                  const meta = STATUS_META[j.status];
                  return (
                    <div key={j.id} className="rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</span>
                        <span className="text-[0.6rem] text-faint">{j.scheduledDate}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[0.76rem] font-semibold text-text">{j.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[0.6rem]" style={{ color: meta.color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                        {meta.short}{j.crew ? ` · ${j.crew}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

import { useState, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

const today = new Date().toISOString().slice(0, 10);

function crewInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function Dispatch() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [pending, setPending] = useState<Job | null>(null);

  const ready = useMemo(
    () =>
      jobs
        .filter((j) => j.status === 'Scheduled')
        .sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')),
    [jobs],
  );

  const activeByCrew = useMemo(() => {
    const map = new Map<string, Job[]>();
    jobs
      .filter((j) => j.status === 'In Progress')
      .forEach((j) => {
        const c = j.crew || 'Unassigned';
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(j);
      });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  const sched = STATUS_META.Scheduled;
  const prog = STATUS_META['In Progress'];

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 05</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Dispatch</h1>
        <p className="mt-1.5 text-sm text-muted">Send scheduled crews on-site. Dispatching confirms arrival and starts installation.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(300px,1fr) minmax(320px,1.3fr)' }}>
          {/* Ready to dispatch */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ background: sched.color, boxShadow: `0 0 8px ${sched.color}` }} />
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Ready to Dispatch</span>
              <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{ready.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 p-3">
              {ready.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">Nothing scheduled to dispatch.</div>
              ) : (
                ready.map((j) => {
                  const isToday = j.scheduledDate === today;
                  return (
                    <div key={j.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06]">
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => select(j.id)}>
                        <div className="flex items-center gap-2">
                          <span className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</span>
                          {isToday && <span className="rounded-full bg-[#34d39a]/15 px-2 py-px text-[0.5rem] font-bold uppercase text-[#34d39a]">Today</span>}
                        </div>
                        <div className="mt-0.5 truncate text-[0.8rem] font-semibold text-text">{j.name}</div>
                        <div className="truncate text-[0.64rem] text-muted">{j.crew ? `${j.crew} · ` : ''}{j.scheduledDate || 'no date'}</div>
                      </div>
                      <button
                        onClick={() => setPending(j)}
                        className="flex-shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-[0.66rem] font-semibold text-white transition hover:brightness-105"
                      >
                        Dispatch →
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Active on site, by crew */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ background: prog.color, boxShadow: `0 0 8px ${prog.color}` }} />
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Active · On Site</span>
            </div>
            <div className="flex flex-col gap-4 p-3">
              {activeByCrew.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">No crews active right now.</div>
              ) : (
                activeByCrew.map(([crew, list]) => (
                  <div key={crew}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full text-[0.55rem] font-bold" style={{ background: `${prog.color}22`, color: prog.color }}>
                        {crewInitials(crew)}
                      </span>
                      <span className="text-[0.7rem] font-semibold text-text">{crew}</span>
                      <span className="text-[0.6rem] text-faint">{list.length} active</span>
                    </div>
                    <div className="flex flex-col gap-2 pl-1">
                      {list.map((j) => (
                        <div key={j.id} onClick={() => select(j.id)} className="cursor-pointer rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</span>
                            <span className="text-[0.6rem]" style={{ color: prog.color }}>On site</span>
                          </div>
                          <div className="mt-0.5 truncate text-[0.78rem] font-semibold text-text">{j.name}</div>
                          <div className="truncate text-[0.64rem] text-muted">{j.address || j.customer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {pending && (
        <TransitionModal
          job={pending}
          to="In Progress"
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

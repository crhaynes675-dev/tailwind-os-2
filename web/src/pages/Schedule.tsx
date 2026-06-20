import { useState, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

function QueueRow({ job, onSchedule, onOpen }: { job: Job; onSchedule: () => void; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06]">
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] font-semibold text-accent">{job.workOrder}</span>
          {job.priority === 'High' && <span className="rounded-full bg-[#f4607a]/15 px-2 py-px text-[0.5rem] font-bold uppercase text-[#f4607a]">High</span>}
        </div>
        <div className="mt-0.5 truncate text-[0.8rem] font-semibold text-text">{job.name}</div>
        <div className="truncate text-[0.64rem] text-muted">{job.customer} · {job.address || 'no address'}</div>
      </div>
      <button
        onClick={onSchedule}
        className="flex-shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-[0.66rem] font-semibold text-white transition hover:brightness-105"
      >
        Schedule →
      </button>
    </div>
  );
}

export default function Schedule() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [pending, setPending] = useState<Job | null>(null);

  const queue = useMemo(() => jobs.filter((j) => j.status === 'Unscheduled'), [jobs]);
  const scheduledByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    jobs
      .filter((j) => j.status === 'Scheduled')
      .forEach((j) => {
        const d = j.scheduledDate || 'No date';
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(j);
      });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  const meta = STATUS_META.Scheduled;

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 03</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Schedule</h1>
        <p className="mt-1.5 text-sm text-muted">Assign crew + date to move jobs through the scheduling gate.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(280px,1fr) minmax(320px,1.4fr)' }}>
          {/* Needs scheduling */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Needs Scheduling</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{queue.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 p-3">
              {queue.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">Queue is clear — nothing waiting to schedule.</div>
              ) : (
                queue.map((j) => <QueueRow key={j.id} job={j} onSchedule={() => setPending(j)} onOpen={() => select(j.id)} />)
              )}
            </div>
          </section>

          {/* Scheduled by date */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Scheduled</span>
            </div>
            <div className="flex flex-col gap-4 p-3">
              {scheduledByDate.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">No scheduled jobs yet.</div>
              ) : (
                scheduledByDate.map(([date, list]) => (
                  <div key={date}>
                    <div className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-faint">{date} · {list.length}</div>
                    <div className="flex flex-col gap-2">
                      {list.map((j) => (
                        <div key={j.id} onClick={() => select(j.id)} className="cursor-pointer rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</span>
                            {j.crew && <span className="text-[0.62rem]" style={{ color: meta.color }}>● {j.crew}</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[0.78rem] font-semibold text-text">{j.name}</div>
                          <div className="truncate text-[0.64rem] text-muted">{j.customer}</div>
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

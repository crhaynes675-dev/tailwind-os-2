import { useState, useEffect, useCallback } from 'react';
import { STATUS_PIPELINE, STATUS_META, type JobStatus } from '../domain/status';
import { type Job } from '../data/jobs';
import { useJobs } from '../data/useJobs';

interface Toast {
  msg: string;
  kind: 'ok' | 'err';
  undo?: () => void;
}

function PageHero({ count, onReload, loading }: { count: number; onReload: () => void; loading: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div>
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Operations</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">
          Dashboard Hub
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {count} live job{count === 1 ? '' : 's'} · drag a card to advance its stage
        </p>
      </div>
      <button
        onClick={onReload}
        disabled={loading}
        className="rounded-full border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {loading ? 'Loading…' : '↻ Refresh'}
      </button>
    </div>
  );
}

function StatTiles({ jobs }: { jobs: Job[] }) {
  return (
    <div className="mb-6 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      {STATUS_PIPELINE.map((status) => {
        const meta = STATUS_META[status];
        const count = jobs.filter((j) => j.status === status).length;
        return (
          <div key={status} className="glass relative overflow-hidden rounded-2xl p-4">
            <div className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full" style={{ background: `radial-gradient(circle, ${meta.color}33, transparent 68%)` }} />
            <div className="relative flex items-center gap-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
              <span className="truncate text-[0.55rem] font-medium uppercase tracking-wide text-muted">{meta.short}</span>
            </div>
            <div className="relative mt-2 text-[2.3rem] font-bold leading-none tracking-tight" style={{ color: meta.color }}>
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job, onDragStart, onDragEnd, dragging }: { job: Job; onDragStart: () => void; onDragEnd: () => void; dragging: boolean }) {
  const meta = STATUS_META[job.status];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-xl border border-white/5 bg-white/[0.03] p-3 transition active:cursor-grabbing hover:bg-white/[0.06] ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.6rem] font-semibold text-accent">{job.workOrder}</span>
        {job.priority === 'High' && (
          <span className="rounded-full bg-[#f4607a]/15 px-2 py-px text-[0.5rem] font-bold uppercase text-[#f4607a]">High</span>
        )}
      </div>
      <div className="mt-1 truncate text-[0.8rem] font-semibold text-text">{job.name}</div>
      <div className="truncate text-[0.66rem] text-muted">{job.customer}</div>
      <div className="mt-2 flex items-center gap-2 text-[0.6rem] text-faint">
        {job.crew && <span style={{ color: meta.color }}>● {job.crew}</span>}
        {job.scheduledDate && <span>{job.scheduledDate}</span>}
      </div>
    </div>
  );
}

function PipelineBoard({ jobs, onMove }: { jobs: Job[]; onMove: (id: string, from: JobStatus, to: JobStatus) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<JobStatus | null>(null);

  const dragJob = jobs.find((j) => j.id === dragId) || null;

  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${STATUS_PIPELINE.length}, minmax(190px, 1fr))` }}>
      {STATUS_PIPELINE.map((status) => {
        const meta = STATUS_META[status];
        const colJobs = jobs.filter((j) => j.status === status);
        const isTarget = !!dragJob && overStatus === status && dragJob.status !== status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (dragJob) {
                e.preventDefault();
                setOverStatus(status);
              }
            }}
            onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragJob && dragJob.status !== status) onMove(dragJob.id, dragJob.status, status);
              setDragId(null);
              setOverStatus(null);
            }}
            className={`glass flex flex-col rounded-2xl transition ${isTarget ? 'ring-2 ring-accent/70' : ''}`}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">{meta.short}</span>
              </div>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{colJobs.length}</span>
            </div>
            <div className="flex min-h-[60px] flex-col gap-2.5 p-2.5">
              {colJobs.length === 0 ? (
                <div className="py-6 text-center text-[0.62rem] text-faint">{isTarget ? 'Drop to move here' : 'No jobs'}</div>
              ) : (
                colJobs.map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    dragging={dragId === j.id}
                    onDragStart={() => setDragId(j.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStatus(null);
                    }}
                  />
                ))
              )}
            </div>
            <div className="mt-auto border-t border-white/5 px-3.5 py-2 text-[0.55rem] text-faint">
              {meta.owner} · {meta.output}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToastBar({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className={`glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm ${toast.kind === 'err' ? 'text-[#f4607a]' : 'text-text'}`}>
        <span>{toast.msg}</span>
        {toast.undo && (
          <button onClick={() => { toast.undo!(); onClose(); }} className="font-semibold text-accent hover:underline">
            Undo
          </button>
        )}
        <button onClick={onClose} className="text-faint hover:text-text">✕</button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { jobs, loading, error, reload, updateStatus } = useJobs();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const move = useCallback(
    (id: string, from: JobStatus, to: JobStatus) => {
      const job = jobs.find((j) => j.id === id);
      const label = job?.workOrder || 'Job';
      updateStatus(id, to)
        .then(() =>
          setToast({
            kind: 'ok',
            msg: `${label} → ${STATUS_META[to].short}`,
            undo: () => updateStatus(id, from).catch(() => {}),
          }),
        )
        .catch((e: unknown) => setToast({ kind: 'err', msg: `Move failed: ${e instanceof Error ? e.message : 'error'}` }));
    },
    [jobs, updateStatus],
  );

  return (
    <>
      <PageHero count={jobs.length} onReload={reload} loading={loading} />

      {error ? (
        <div className="glass rounded-2xl border-[#f4607a]/30 p-6 text-center">
          <div className="text-sm font-semibold text-[#f4607a]">Couldn’t load jobs</div>
          <div className="mt-1 text-xs text-muted">{error}</div>
          <button onClick={reload} className="mt-4 rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-accent hover:bg-white/10">
            Try again
          </button>
        </div>
      ) : loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading live jobs…</div>
      ) : (
        <>
          <StatTiles jobs={jobs} />
          <div className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-faint">Job Pipeline · Status Architecture</div>
          <div className="overflow-x-auto pb-2">
            <PipelineBoard jobs={jobs} onMove={move} />
          </div>
        </>
      )}

      {toast && <ToastBar toast={toast} onClose={() => setToast(null)} />}
    </>
  );
}

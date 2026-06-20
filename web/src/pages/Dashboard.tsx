import { STATUS_PIPELINE, STATUS_META } from '../domain/status';
import { JOBS, type Job } from '../data/jobs';

function PageHero() {
  return (
    <div className="mb-6">
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">
        Operations
      </div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">
        Dashboard Hub
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Live job pipeline across the OS3 status architecture
      </p>
    </div>
  );
}

function StatTiles() {
  return (
    <div className="mb-6 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      {STATUS_PIPELINE.map((status) => {
        const meta = STATUS_META[status];
        const count = JOBS.filter((j) => j.status === status).length;
        return (
          <div key={status} className="glass relative overflow-hidden rounded-2xl p-4">
            <div
              className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full"
              style={{ background: `radial-gradient(circle, ${meta.color}33, transparent 68%)` }}
            />
            <div className="relative flex items-center gap-2">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }}
              />
              <span className="truncate text-[0.55rem] font-medium uppercase tracking-wide text-muted">
                {meta.short}
              </span>
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

function JobCard({ job }: { job: Job }) {
  const meta = STATUS_META[job.status];
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 transition hover:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.6rem] font-semibold text-accent">{job.workOrder}</span>
        {job.priority === 'High' && (
          <span className="rounded-full bg-[#f4607a]/15 px-2 py-px text-[0.5rem] font-bold uppercase text-[#f4607a]">
            High
          </span>
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

function PipelineBoard() {
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${STATUS_PIPELINE.length}, minmax(190px, 1fr))` }}>
      {STATUS_PIPELINE.map((status) => {
        const meta = STATUS_META[status];
        const jobs = JOBS.filter((j) => j.status === status);
        return (
          <div key={status} className="glass flex flex-col rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">{meta.short}</span>
              </div>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{jobs.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 p-2.5">
              {jobs.length === 0 ? (
                <div className="py-6 text-center text-[0.62rem] text-faint">No jobs</div>
              ) : (
                jobs.map((j) => <JobCard key={j.id} job={j} />)
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

export default function Dashboard() {
  return (
    <>
      <PageHero />
      <StatTiles />
      <div className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-faint">
        Job Pipeline · Status Architecture
      </div>
      <div className="overflow-x-auto pb-2">
        <PipelineBoard />
      </div>
    </>
  );
}

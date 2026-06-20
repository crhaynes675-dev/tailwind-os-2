import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { apiGet } from '../lib/api';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

interface ApiUser { username: string; givenName?: string; familyName?: string; role?: string }
const TECH_ROLES = ['service_technician', 'project_manager', 'installer', 'foreman', 'lead_installer', 'apprentice'];
interface Resource { id: string; name: string; kind: 'crew' | 'tech'; role?: string }

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

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
      <button onClick={onSchedule} className="flex-shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-[0.66rem] font-semibold text-white transition hover:brightness-105">
        Schedule →
      </button>
    </div>
  );
}

export default function Schedule() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [pending, setPending] = useState<Job | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { apiGet<ApiUser[]>('/users').then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const queue = useMemo(() => jobs.filter((j) => j.status === 'Unscheduled'), [jobs]);
  const scheduledByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    jobs.filter((j) => j.status === 'Scheduled').forEach((j) => {
      const d = j.scheduledDate || 'No date';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(j);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  const resources = useMemo<Resource[]>(() => {
    const techs: Resource[] = users
      .filter((u) => TECH_ROLES.includes(u.role || ''))
      .map((u) => ({ id: u.username, name: `${u.givenName || ''} ${u.familyName || ''}`.trim() || u.username, kind: 'tech', role: u.role }));
    const techNames = new Set(techs.map((t) => t.name));
    const crews: Resource[] = [...new Set(jobs.map((j) => j.crew).filter(Boolean) as string[])]
      .filter((n) => !techNames.has(n))
      .map((n) => ({ id: n, name: n, kind: 'crew' }));
    return [...crews, ...techs];
  }, [users, jobs]);

  const crewRes = resources.filter((r) => r.kind === 'crew');
  const techRes = resources.filter((r) => r.kind === 'tech');
  const dragJob = jobs.find((j) => j.id === dragId) || null;
  const assignedCount = (name: string) => jobs.filter((j) => j.crew === name && (j.status === 'Scheduled' || j.status === 'In Progress')).length;

  function assign(jobId: string, res: Resource) {
    const job = jobs.find((j) => j.id === jobId);
    updateJob(jobId, { crew: res.name }).then(() => setToast(`${job?.workOrder || 'Job'} → ${res.name}`)).catch(() => setToast('Assign failed'));
  }

  const meta = STATUS_META.Scheduled;
  const prog = STATUS_META['In Progress'];

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 03</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Schedule</h1>
        <p className="mt-1.5 text-sm text-muted">Schedule jobs, then drag scheduled work onto a crew or service tech to assign it.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Needs scheduling */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Needs Scheduling</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{queue.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 p-3">
              {queue.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">Queue is clear — nothing waiting to schedule.</div>
              ) : queue.map((j) => <QueueRow key={j.id} job={j} onSchedule={() => setPending(j)} onOpen={() => select(j.id)} />)}
            </div>
          </section>

          {/* Scheduled by date — draggable */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Scheduled</span>
              <span className="ml-auto text-[0.56rem] text-faint">drag → assign</span>
            </div>
            <div className="flex flex-col gap-4 p-3">
              {scheduledByDate.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">No scheduled jobs yet.</div>
              ) : scheduledByDate.map(([date, list]) => (
                <div key={date}>
                  <div className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-faint">{date} · {list.length}</div>
                  <div className="flex flex-col gap-2">
                    {list.map((j) => (
                      <div
                        key={j.id}
                        draggable
                        onDragStart={() => setDragId(j.id)}
                        onDragEnd={() => { setDragId(null); setOverId(null); }}
                        className={`rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06] ${dragId === j.id ? 'opacity-40' : 'cursor-grab'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="cursor-pointer text-[0.6rem] font-semibold text-accent" onClick={() => select(j.id)}>{j.workOrder}</span>
                          {j.crew ? <span className="text-[0.62rem]" style={{ color: meta.color }}>● {j.crew}</span> : <span className="text-[0.6rem] text-faint">unassigned</span>}
                        </div>
                        <div className="mt-0.5 truncate text-[0.78rem] font-semibold text-text">{j.name}</div>
                        <div className="truncate text-[0.64rem] text-muted">{j.customer}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Crews & Service Techs — drop targets */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="border-b border-white/5 px-4 py-3 text-[0.62rem] font-semibold uppercase tracking-wide text-text">Crews &amp; Service Techs</div>
            <div className="flex flex-col gap-4 p-3">
              {([['Crews', crewRes], ['Service Techs', techRes]] as const).map(([label, list]) => (
                <div key={label}>
                  <div className="mb-1.5 text-[0.56rem] font-semibold uppercase tracking-wider text-faint">{label}</div>
                  {list.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-[0.62rem] text-faint">{label === 'Crews' ? 'No named crews in use yet.' : 'No service techs found.'}</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {list.map((r) => {
                        const isOver = !!dragJob && overId === r.id;
                        return (
                          <div
                            key={r.id}
                            onDragOver={(e) => { if (dragJob) { e.preventDefault(); setOverId(r.id); } }}
                            onDragLeave={() => setOverId((o) => (o === r.id ? null : o))}
                            onDrop={(e) => { e.preventDefault(); if (dragJob) assign(dragJob.id, r); setDragId(null); setOverId(null); }}
                            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${isOver ? 'border-accent ring-2 ring-accent/60 bg-accent/5' : 'border-white/5 bg-white/[0.03]'}`}
                          >
                            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[0.6rem] font-bold" style={{ background: `${r.kind === 'crew' ? '#7c6cff' : prog.color}22`, color: r.kind === 'crew' ? '#9b8cff' : prog.color }}>{initials(r.name)}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[0.78rem] font-semibold text-text">{r.name}</div>
                              <div className="text-[0.58rem] capitalize text-muted">{r.kind === 'crew' ? 'Crew' : (r.role || 'tech').replace(/_/g, ' ')}</div>
                            </div>
                            <span className="flex-shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[0.58rem] font-semibold text-muted">{assignedCount(r.name)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <div className="text-center text-[0.58rem] text-faint">Drag a scheduled job here to assign it.</div>
            </div>
          </section>
        </div>
      )}

      {pending && (
        <TransitionModal job={pending} to="Scheduled" onCancel={() => setPending(null)} onConfirm={(patch) => { updateJob(pending.id, patch).catch(() => {}); setPending(null); }} />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="glass rounded-full px-5 py-2.5 text-sm text-text">{toast}</div>
        </div>
      )}
    </>
  );
}

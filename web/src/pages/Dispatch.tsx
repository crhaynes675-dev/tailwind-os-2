import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { apiGet } from '../lib/api';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

interface ApiUser { username: string; givenName?: string; familyName?: string; role?: string }
const TECH_ROLES = ['service_technician', 'project_manager', 'installer', 'foreman', 'lead_installer', 'apprentice'];
const today = new Date().toISOString().slice(0, 10);

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

interface Resource { id: string; name: string; kind: 'crew' | 'tech'; role?: string }

export default function Dispatch() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pending, setPending] = useState<Job | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { apiGet<ApiUser[]>('/users').then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const scheduled = useMemo(
    () => jobs.filter((j) => j.status === 'Scheduled').sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')),
    [jobs],
  );

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

  const prog = STATUS_META['In Progress'];

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 05</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Dispatch</h1>
        <p className="mt-1.5 text-sm text-muted">Drag scheduled work onto a crew or service tech to assign it, then dispatch on-site.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(300px,1fr) minmax(300px,1fr)' }}>
          {/* Scheduled work — draggable */}
          <section className="glass flex flex-col rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Scheduled Work</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{scheduled.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 p-3">
              {scheduled.length === 0 ? (
                <div className="py-10 text-center text-[0.72rem] text-faint">No scheduled work.</div>
              ) : scheduled.map((j) => (
                <div
                  key={j.id}
                  draggable
                  onDragStart={() => setDragId(j.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  className={`flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06] ${dragId === j.id ? 'opacity-40' : 'cursor-grab'}`}
                >
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => select(j.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-[0.6rem] font-semibold text-accent">{j.workOrder}</span>
                      {j.scheduledDate === today && <span className="rounded-full bg-[#34d39a]/15 px-2 py-px text-[0.5rem] font-bold uppercase text-[#34d39a]">Today</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[0.8rem] font-semibold text-text">{j.name}</div>
                    <div className="truncate text-[0.62rem] text-muted">
                      {j.crew ? <span className="text-accent">● {j.crew}</span> : <span className="text-faint">unassigned</span>}
                      {j.scheduledDate ? ` · ${j.scheduledDate}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setPending(j)} className="flex-shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-[0.64rem] font-semibold text-white transition hover:brightness-105">Dispatch →</button>
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
        <TransitionModal job={pending} to="In Progress" onCancel={() => setPending(null)} onConfirm={(patch) => { updateJob(pending.id, patch).catch(() => {}); setPending(null); }} />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="glass rounded-full px-5 py-2.5 text-sm text-text">{toast}</div>
        </div>
      )}
    </>
  );
}

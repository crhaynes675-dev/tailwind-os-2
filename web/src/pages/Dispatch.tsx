import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { apiGet } from '../lib/api';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';
import DispatchMap from '../components/DispatchMap';

interface ApiUser { username: string; givenName?: string; familyName?: string; role?: string }
const TECH_ROLES = ['service_technician', 'project_manager', 'installer', 'foreman', 'lead_installer', 'apprentice'];

function crewInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function Dispatch() {
  const { jobs, loading, select, updateJob } = useJobsCtx();
  const [pending, setPending] = useState<Job | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);

  useEffect(() => { apiGet<ApiUser[]>('/users').then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {}); }, []);

  const ready = useMemo(
    () => jobs.filter((j) => j.status === 'Scheduled').sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')),
    [jobs],
  );

  const activeByCrew = useMemo(() => {
    const map = new Map<string, Job[]>();
    jobs.filter((j) => j.status === 'In Progress').forEach((j) => {
      const c = j.crew || 'Unassigned';
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(j);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  const techs = useMemo(() => {
    return users
      .filter((u) => TECH_ROLES.includes(u.role || ''))
      .map((u) => {
        const name = `${u.givenName || ''} ${u.familyName || ''}`.trim() || u.username;
        const count = jobs.filter((j) => j.crew === name && (j.status === 'Scheduled' || j.status === 'In Progress')).length;
        return { name, count };
      });
  }, [users, jobs]);

  const prog = STATUS_META['In Progress'];

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 05</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Dispatched</h1>
        <p className="mt-1.5 text-sm text-muted">Scheduled work on the map with your service techs, and crews active on site.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Top: live map */}
          <div style={{ height: 'min(620px, 70vh)' }}>
            <DispatchMap jobs={ready} techs={techs} />
          </div>

          {/* Bottom: active on site (horizontal) */}
          <section className="glass rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ background: prog.color, boxShadow: `0 0 8px ${prog.color}` }} />
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">Active · On Site</span>
            </div>
            {activeByCrew.length === 0 ? (
              <div className="py-8 text-center text-[0.72rem] text-faint">No crews active right now.</div>
            ) : (
              <div className="flex gap-3 overflow-x-auto p-3">
                {activeByCrew.map(([crew, list]) => (
                  <div key={crew} className="w-56 flex-shrink-0 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full text-[0.55rem] font-bold" style={{ background: `${prog.color}22`, color: prog.color }}>{crewInitials(crew)}</span>
                      <span className="text-[0.72rem] font-semibold text-text">{crew}</span>
                      <span className="ml-auto text-[0.56rem] text-faint">{list.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {list.map((j) => (
                        <div key={j.id} onClick={() => select(j.id)} className="cursor-pointer rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5 transition hover:bg-white/[0.06]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[0.56rem] font-semibold text-accent">{j.workOrder}</span>
                            <span className="text-[0.54rem]" style={{ color: prog.color }}>On site</span>
                          </div>
                          <div className="truncate text-[0.7rem] font-medium text-text">{j.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {pending && (
        <TransitionModal job={pending} to="In Progress" onCancel={() => setPending(null)} onConfirm={(patch) => { updateJob(pending.id, patch).catch(() => {}); setPending(null); }} />
      )}
    </>
  );
}

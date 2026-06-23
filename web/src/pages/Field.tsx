import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../lib/api';
import { useChecklist } from '../lib/checklist';
import { STATUS_META, type JobStatus } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from '../components/TransitionModal';

interface ApiUser { username: string; givenName?: string; familyName?: string }
const INSTALL_STEPS = ['On Site', 'Install In Progress', 'Punch Completion'];
const FIELD_STATUSES: JobStatus[] = ['Scheduled', 'In Progress', 'Ready for Post-Install Walk'];

function fieldAction(job: Job): { label: string; to: JobStatus } | null {
  if (job.status === 'Scheduled') return { label: "I'm on site", to: 'In Progress' };
  if (job.status === 'In Progress') return { label: 'Mark install complete', to: 'Ready for Post-Install Walk' };
  return null;
}
function mapsUrl(addr: string) { return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`; }

export default function Field() {
  const { jobs, loading, updateJob } = useJobsCtx();
  const { user } = useAuth();
  const [myName, setMyName] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ job: Job; to: JobStatus } | null>(null);
  const cl = useChecklist('install');

  useEffect(() => {
    apiGet<ApiUser[]>('/users').then((us) => {
      const me = (us || []).find((u) => u.username === user?.username);
      if (me) { const n = `${me.givenName || ''} ${me.familyName || ''}`.trim(); if (n) { setMyName(n); setScope('mine'); } }
    }).catch(() => {});
  }, [user?.username]);

  const fieldJobs = useMemo(() => {
    let list = jobs.filter((j) => FIELD_STATUSES.includes(j.status));
    if (scope === 'mine' && myName) list = list.filter((j) => j.crew === myName);
    return list.sort((a, b) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999'));
  }, [jobs, scope, myName]);

  const openJob = jobs.find((j) => j.id === openId) || null;
  const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="mx-auto w-full max-w-md">
      {/* header */}
      <div className="mb-4">
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-accent">Field App</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[1.7rem] font-bold leading-tight tracking-tight text-transparent">My Day</h1>
        <p className="mt-0.5 text-[0.78rem] text-muted">{todayStr}{myName ? ` · ${myName}` : ''}</p>
      </div>

      {/* mine / all */}
      <div className="mb-4 flex rounded-xl border border-glass bg-white/[0.04] p-1">
        {(['mine', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            disabled={s === 'mine' && !myName}
            className={`flex-1 rounded-lg py-2 text-[0.8rem] font-semibold capitalize transition disabled:opacity-30 ${scope === s ? 'bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] text-white' : 'text-muted'}`}
          >
            {s === 'mine' ? 'My jobs' : 'All field'}
          </button>
        ))}
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : fieldJobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center text-sm text-muted">{scope === 'mine' ? 'No jobs assigned to you.' : 'No active field work.'}</div>
      ) : (
        <div className="flex flex-col gap-3 pb-24">
          {fieldJobs.map((j) => {
            const meta = STATUS_META[j.status];
            return (
              <button key={j.id} onClick={() => setOpenId(j.id)} className="glass overflow-hidden rounded-2xl p-0 text-left transition active:scale-[0.99]">
                <div className="h-1 w-full" style={{ background: meta.color }} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[0.62rem] font-semibold text-accent">{j.workOrder}</span>
                    <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.short}</span>
                  </div>
                  <div className="mt-1 text-[0.95rem] font-semibold text-text">{j.name}</div>
                  <div className="mt-0.5 truncate text-[0.74rem] text-muted">{j.customer}</div>
                  {j.address && <div className="mt-1.5 flex items-center gap-1 text-[0.72rem] text-faint"><span className="text-accent">📍</span><span className="truncate">{j.address}</span></div>}
                  <div className="mt-1 text-[0.66rem] text-faint">{j.scheduledDate || 'no date'}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* bottom sheet */}
      {openJob && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpenId(null)} />
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-glass bg-[#0b1322]/95 backdrop-blur-xl">
            <div className="sticky top-0 flex items-center justify-between gap-2 bg-[#0b1322]/95 px-5 pb-3 pt-4">
              <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
            </div>
            <div className="px-5 pb-8">
              <div className="text-[0.62rem] font-semibold text-accent">{openJob.workOrder}</div>
              <div className="text-lg font-bold text-text">{openJob.name}</div>
              <div className="mt-0.5 text-[0.8rem] text-muted">{openJob.customer}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.66rem] font-semibold" style={{ color: STATUS_META[openJob.status].color, background: `${STATUS_META[openJob.status].color}1a` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_META[openJob.status].color }} />{STATUS_META[openJob.status].short}
              </div>

              {openJob.address && (
                <a href={mapsUrl(openJob.address)} target="_blank" rel="noreferrer" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-glass bg-white/5 py-3.5 text-sm font-semibold text-accent active:scale-[0.99]">
                  🧭 Navigate · {openJob.address.length > 28 ? openJob.address.slice(0, 28) + '…' : openJob.address}
                </a>
              )}

              {/* field checklist while installing */}
              {openJob.status === 'In Progress' && (
                <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Install checklist</div>
                  <div className="flex flex-col gap-1">
                    {INSTALL_STEPS.map((s) => (
                      <label key={s} className="flex items-center gap-3 rounded-lg px-1 py-2 text-[0.84rem] text-muted">
                        <input type="checkbox" checked={cl.has(openJob.id, s)} onChange={() => cl.toggle(openJob.id, s)} className="h-5 w-5 accent-[#29c3ec]" />
                        <span className={cl.has(openJob.id, s) ? 'text-text line-through opacity-70' : ''}>{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* primary status action */}
              {(() => {
                const act = fieldAction(openJob);
                if (!act) return <div className="mt-4 rounded-xl bg-white/5 py-3 text-center text-[0.78rem] text-muted">Awaiting office review.</div>;
                return (
                  <button onClick={() => setPending({ job: openJob, to: act.to })} className="mt-4 w-full rounded-xl bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] py-4 text-base font-semibold text-white shadow-[0_8px_22px_-8px_rgba(41,195,236,0.55)] active:scale-[0.99]">
                    {act.label}
                  </button>
                );
              })()}

              <button onClick={() => setOpenId(null)} className="mt-3 w-full rounded-xl border border-glass bg-white/5 py-3 text-sm font-semibold text-muted">Close</button>
            </div>
          </div>
        </>
      )}

      {pending && (
        <TransitionModal
          job={pending.job}
          to={pending.to}
          onCancel={() => setPending(null)}
          onConfirm={(patch) => { updateJob(pending.job.id, patch).catch(() => {}); setPending(null); setOpenId(null); }}
        />
      )}
    </div>
  );
}

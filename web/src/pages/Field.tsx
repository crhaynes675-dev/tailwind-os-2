import { useState, useEffect, useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../lib/api';
import { STATUS_META } from '../domain/status';
import type { Job } from '../data/jobs';
import { FIELD_STATUSES, mapsUrl, fieldStep, STEP_LABEL, STEP_STYLE } from '../domain/field';
import FieldMap from '../components/FieldMap';
import FieldJobDrawer from '../components/FieldJobDrawer';

interface ApiUser { username: string; givenName?: string; familyName?: string }
const byDate = (a: Job, b: Job) => (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999');

function JobCard({ job, selected, onSelect, onStep, busy }: {
  job: Job; selected: boolean; onSelect: (id: string) => void; onStep: (job: Job, patch: Partial<Job>) => void; busy: boolean;
}) {
  const meta = STATUS_META[job.status];
  const st = fieldStep(job);
  return (
    <div onClick={() => onSelect(job.id)}
      className={`glass cursor-pointer rounded-xl p-3 transition ${selected ? 'ring-2 ring-[rgba(41,195,236,0.55)]' : 'hover:bg-white/[0.03]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.62rem] font-semibold text-accent">{job.workOrder}</span>
        <span className="rounded-full px-2 py-0.5 text-[0.56rem] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.short}</span>
      </div>
      <div className="mt-0.5 text-sm font-semibold text-text">{job.name}</div>
      <div className="truncate text-[0.72rem] text-muted">{job.customer}</div>
      {job.address && <div className="mt-1 flex items-center gap-1 text-[0.7rem] text-faint"><span className="text-accent">📍</span><span className="truncate">{job.address}</span></div>}
      {(job.scheduledDate || job.onSiteAt) && (
        <div className="mt-1 text-[0.64rem] text-faint">{job.scheduledDate || ''}{job.onSiteAt ? ' · on site' : job.enrouteAt ? ' · en route' : ''}</div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        {job.address && (
          <a onClick={(e) => e.stopPropagation()} href={mapsUrl(job.address)} target="_blank" rel="noreferrer"
            className="rounded-lg border border-glass bg-white/5 py-2 text-center text-xs font-semibold text-accent active:scale-[0.99]">🧭 Navigate</a>
        )}
        {st ? (
          <button
            onClick={(e) => { e.stopPropagation(); if (st.label === 'Complete') onSelect(job.id); else onStep(job, st.patch); }}
            disabled={busy}
            className={`rounded-lg py-2 text-xs font-semibold text-white disabled:opacity-50 ${STEP_STYLE[st.label]} ${job.address ? '' : 'col-span-2'}`}>
            {busy ? '…' : STEP_LABEL[st.label]}
          </button>
        ) : (
          <div className={`rounded-lg bg-white/5 py-2 text-center text-[0.66rem] font-semibold text-completed ${job.address ? '' : 'col-span-2'}`}>Done</div>
        )}
      </div>
    </div>
  );
}

export default function Field() {
  const { jobs, loading, updateJob } = useJobsCtx();
  const { user } = useAuth();
  const [me, setMe] = useState<{ first: string; last: string; full: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ApiUser[]>('/users').then((us) => {
      const u = (us || []).find((x) => x.username === user?.username);
      if (u) {
        const first = (u.givenName || '').trim(), last = (u.familyName || '').trim();
        const full = `${first} ${last}`.trim();
        if (full) setMe({ first, last, full });
      }
    }).catch(() => {});
  }, [user?.username]);

  function isMine(job: Job): boolean {
    if (!me) return true;
    const crew = (job.crew || '').toLowerCase();
    if (!crew) return false;
    const full = me.full.toLowerCase(), first = me.first.toLowerCase(), last = me.last.toLowerCase();
    return crew.split(/[,/&]+/).map((s) => s.trim()).filter(Boolean).some((p) =>
      full.includes(p) || p.includes(full) || (!!first && p.includes(first)) || (!!last && p.includes(last)),
    );
  }

  const myJobs = useMemo(() => jobs.filter((j) => FIELD_STATUSES.includes(j.status) && isMine(j)), [jobs, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = useMemo(() => myJobs.filter((j) => j.status === 'In Progress' || !j.scheduledDate || j.scheduledDate <= todayStr).sort(byDate), [myJobs, todayStr]);
  const future = useMemo(() => myJobs.filter((j) => j.status !== 'In Progress' && j.scheduledDate && j.scheduledDate > todayStr).sort(byDate), [myJobs, todayStr]);

  const open = (id: string) => { setSelectedId(id); setOpenId(id); };
  async function onStep(job: Job, patch: Partial<Job>) { setBusyId(job.id); try { await updateJob(job.id, patch); } finally { setBusyId(null); } }
  const cardProps = (job: Job) => ({ job, selected: selectedId === job.id, onSelect: open, onStep, busy: busyId === job.id });
  const headerDate = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col lg:h-[calc(100vh-9.5rem)]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-accent">Field App</div>
          <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[1.7rem] font-bold leading-tight tracking-tight text-transparent">My Jobs</h1>
        </div>
        <div className="text-right text-[0.78rem] text-muted">{headerDate}{me ? ` · ${me.full}` : ''}</div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_1fr] lg:overflow-hidden">
        <div className="flex flex-col gap-5 lg:overflow-y-auto lg:pr-1">
          {loading && myJobs.length === 0 ? (
            <div className="glass grid place-items-center rounded-2xl py-16 text-sm text-muted">Loading…</div>
          ) : myJobs.length === 0 ? (
            <div className="glass grid place-items-center rounded-2xl py-16 text-center text-sm text-muted">No jobs assigned to you.</div>
          ) : (
            <>
              <div>
                <div className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-accent">Today · {today.length}</div>
                {today.length === 0 ? <div className="text-[0.74rem] text-faint">Nothing scheduled for today.</div>
                  : <div className="flex flex-col gap-2.5">{today.map((j) => <JobCard key={j.id} {...cardProps(j)} />)}</div>}
              </div>
              {future.length > 0 && (
                <div>
                  <div className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Future · {future.length}</div>
                  <div className="flex flex-col gap-2.5">{future.map((j) => <JobCard key={j.id} {...cardProps(j)} />)}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="min-h-[320px]">
          <FieldMap jobs={myJobs} onSelect={open} focusId={selectedId || undefined} height="h-80 lg:h-full" />
        </div>
      </div>

      {openId && <FieldJobDrawer jobId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

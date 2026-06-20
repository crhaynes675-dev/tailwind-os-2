import { useState, useEffect } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { apiGet } from '../lib/api';
import { STATUS_META, nextStatus, type JobStatus } from '../domain/status';
import type { Job } from '../data/jobs';
import TransitionModal from './TransitionModal';

interface AuditEntry {
  action?: string;
  user?: string;
  ts?: string;
  changes?: Record<string, unknown>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
    </div>
  );
}

export default function JobDrawer() {
  const { jobs, selectedId, select, updateJob } = useJobsCtx();
  const job = jobs.find((j) => j.id === selectedId) || null;

  const [form, setForm] = useState<Partial<Job>>({});
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingTo, setPendingTo] = useState<JobStatus | null>(null);

  useEffect(() => {
    if (!job) return;
    setForm({ name: job.name, address: job.address, crew: job.crew || '', scheduledDate: job.scheduledDate || '' });
    setAudit(null);
    apiGet<AuditEntry[]>(`/jobs/${job.id}/audit`)
      .then((a) => setAudit(Array.isArray(a) ? a : []))
      .catch(() => setAudit([]));
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null;
  const meta = STATUS_META[job.status];
  const next = nextStatus(job.status);
  const dirty =
    form.name !== job.name || form.address !== job.address || (form.crew || '') !== (job.crew || '') || (form.scheduledDate || '') !== (job.scheduledDate || '');

  async function save() {
    setSaving(true);
    try {
      await updateJob(job!.id, {
        name: form.name,
        address: form.address,
        crew: form.crew || undefined,
        scheduledDate: form.scheduledDate || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={() => select(null)} />
      <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-glass bg-[#0b1322]/95 backdrop-blur-xl">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <div className="text-[0.62rem] font-semibold text-accent">{job.workOrder}</div>
            <div className="text-base font-semibold text-text">{job.name}</div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.short}
            </div>
          </div>
          <button onClick={() => select(null)} className="rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-text">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* advance */}
          <div className="glass mb-5 rounded-xl p-4">
            <div className="text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Current stage gate</div>
            <div className="mt-1.5 text-[0.74rem] text-muted">
              <div><span className="text-faint">Owner:</span> {meta.owner}</div>
              <div><span className="text-faint">Output:</span> {meta.output}</div>
            </div>
            {next ? (
              <button
                onClick={() => setPendingTo(next)}
                className="mt-3 w-full rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-105"
              >
                Advance to {STATUS_META[next].short} →
              </button>
            ) : (
              <div className="mt-3 text-center text-[0.72rem] text-completed">Final stage — job completed.</div>
            )}
          </div>

          {/* details */}
          <div className="flex flex-col gap-3">
            <Field label="Job name" value={form.name || ''} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <div>
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Customer</label>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-muted">{job.customer}</div>
            </div>
            <Field label="Address" value={form.address || ''} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
            <Field label="Crew" value={form.crew || ''} onChange={(v) => setForm((f) => ({ ...f, crew: v }))} />
            <Field label="Scheduled date" type="date" value={form.scheduledDate || ''} onChange={(v) => setForm((f) => ({ ...f, scheduledDate: v }))} />
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="mt-1 self-start rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-accent transition enabled:hover:bg-white/10 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          {/* history */}
          <div className="mt-6">
            <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">History</div>
            {audit === null ? (
              <div className="text-[0.72rem] text-faint">Loading…</div>
            ) : audit.length === 0 ? (
              <div className="text-[0.72rem] text-faint">No history yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {audit
                  .slice()
                  .reverse()
                  .map((a, i) => (
                    <div key={i} className="rounded-lg border-l-2 border-accent/40 bg-white/[0.02] px-3 py-1.5 text-[0.7rem]">
                      <span className="font-medium text-text">{a.action || 'updated'}</span>
                      {a.user && <span className="text-faint"> · {a.user}</span>}
                      {a.ts && <span className="text-faint"> · {new Date(a.ts).toLocaleString()}</span>}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {pendingTo && (
        <TransitionModal
          job={job}
          to={pendingTo}
          onCancel={() => setPendingTo(null)}
          onConfirm={(patch) => {
            updateJob(job.id, patch).catch(() => {});
            setPendingTo(null);
          }}
        />
      )}
    </>
  );
}

import { useState } from 'react';
import { STATUS_META, STATUS_GATE, transitionKind, type JobStatus } from '../domain/status';
import type { Job } from '../data/jobs';

interface Props {
  job: Job;
  to: JobStatus;
  onConfirm: (patch: Partial<Job>) => void;
  onCancel: () => void;
}

export default function TransitionModal({ job, to, onConfirm, onCancel }: Props) {
  const from = job.status;
  const kind = transitionKind(from, to);
  const fields = STATUS_GATE[to];
  const meta = STATUS_META[to];

  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const f of fields) {
      if (f.type === 'confirm') init[f.key] = false;
      else if (f.key === 'assignedTo') init[f.key] = job.crew || '';
      else if (f.key === 'scheduledDate') init[f.key] = job.scheduledDate || new Date().toISOString().slice(0, 10);
      else init[f.key] = '';
    }
    return init;
  });
  const [touched, setTouched] = useState(false);

  const missing = fields.filter((f) => f.required && (f.type === 'confirm' ? !values[f.key] : !String(values[f.key] || '').trim()));

  function confirm() {
    setTouched(true);
    if (missing.length) return;
    const patch: Partial<Job> = { status: to };
    if (typeof values.assignedTo === 'string' && values.assignedTo.trim()) patch.crew = values.assignedTo.trim();
    if (typeof values.scheduledDate === 'string' && values.scheduledDate) patch.scheduledDate = values.scheduledDate;
    onConfirm(patch);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={onCancel}>
      <div className="glass w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-faint">Stage transition</div>
        <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-md px-2 py-0.5" style={{ color: STATUS_META[from].color, background: `${STATUS_META[from].color}1a` }}>
            {STATUS_META[from].short}
          </span>
          <span className="text-faint">→</span>
          <span className="rounded-md px-2 py-0.5" style={{ color: meta.color, background: `${meta.color}1a` }}>
            {meta.short}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted">{job.workOrder} · {job.name}</div>

        {(kind === 'skip' || kind === 'back') && (
          <div className="mt-3 rounded-lg border border-[#d4851f]/35 bg-[#d4851f]/10 px-3 py-2 text-[0.72rem] text-[#e8a427]">
            {kind === 'skip' ? '⚠ Skipping one or more stages.' : '⚠ Moving a job backward.'} Confirm this is intentional.
          </div>
        )}

        <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-[0.72rem] text-muted">
          <div><span className="text-faint">Owner:</span> {meta.owner}</div>
          <div><span className="text-faint">Gate:</span> {meta.trigger}</div>
          <div><span className="text-faint">Output:</span> {meta.output}</div>
        </div>

        {fields.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                {f.type === 'confirm' ? (
                  <label className="flex cursor-pointer items-center gap-2.5 text-[0.82rem] text-text">
                    <input
                      type="checkbox"
                      checked={!!values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                      className="h-4 w-4 accent-[#29c3ec]"
                    />
                    {f.label}
                  </label>
                ) : (
                  <>
                    <label className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">{f.label}</label>
                    <input
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={String(values[f.key] ?? '')}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {touched && missing.length > 0 && (
          <div className="mt-3 text-[0.72rem] text-[#f4607a]">Please complete: {missing.map((m) => m.label).join(', ')}.</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={confirm}
            className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_22px_-8px_rgba(41,195,236,0.55)] transition hover:brightness-105"
          >
            Confirm move
          </button>
        </div>
      </div>
    </div>
  );
}

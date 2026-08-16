import { useState, useRef } from 'react';
import { STATUS_META, STATUS_GATE, SIGNATURE_GATE_KEY, transitionKind, type JobStatus } from '../domain/status';
import type { Job } from '../data/jobs';
import SignaturePad, { type SignaturePadHandle } from './SignaturePad';
import { uploadSignature } from '../lib/api';

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
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const missing = fields.filter((f) => {
    if (!f.required) return false;
    if (f.type === 'confirm') return !values[f.key];
    if (f.type === 'signature') return !hasInk;
    return !String(values[f.key] || '').trim();
  });

  async function confirm() {
    setTouched(true);
    if (missing.length || busy) return;

    const patch: Partial<Job> = { status: to };
    if (typeof values.assignedTo === 'string' && values.assignedTo.trim()) patch.crew = values.assignedTo.trim();
    if (typeof values.scheduledDate === 'string' && values.scheduledDate) patch.scheduledDate = values.scheduledDate;
    // Non-underscore gate keys are persisted fields (see STATUS_GATE).
    if (typeof values.postInstallSignedBy === 'string' && values.postInstallSignedBy.trim()) {
      patch.postInstallSignedBy = values.postInstallSignedBy.trim();
      patch.postInstallSignedAt = new Date().toISOString();
    }

    // The signature is uploaded here rather than handed to the caller, so all
    // eight places that open this modal get sign-off capture for free.
    const sig = SIGNATURE_GATE_KEY[to] ? padRef.current?.toDataUrl() : null;
    if (sig) {
      setBusy(true);
      try {
        await uploadSignature(job.id, sig, 'crewsignoff');
      } catch (e) {
        setBusy(false);
        // Advancing the stage without the signature that justifies it would
        // leave exactly the unprovable gate this sign-off exists to prevent.
        setUploadError(e instanceof Error ? e.message : 'Could not save the signature. Please try again.');
        return;
      }
      setBusy(false);
    }

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
                {f.type === 'signature' ? (
                  <>
                    <label className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">{f.label}</label>
                    <SignaturePad ref={padRef} onChange={setHasInk} />
                  </>
                ) : f.type === 'confirm' ? (
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
        {uploadError && <div className="mt-3 text-[0.72rem] text-[#f4607a]">{uploadError}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_22px_-8px_rgba(41,195,236,0.55)] transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? 'Saving sign-off…' : 'Confirm move'}
          </button>
        </div>
      </div>
    </div>
  );
}

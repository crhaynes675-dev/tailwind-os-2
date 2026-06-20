import { useState } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { WORKFLOWS } from '../domain/workflows';

const HANDOFF = WORKFLOWS.find((w) => w.id === '01')!;
// The handoff confirmation steps (everything up to "Job Setup", which is
// the create action itself).
const HANDOFF_STEPS = HANDOFF.steps.slice(0, -1); // Lead, Quote, Sale Awarded, Sales Handoff, Operations Review

function Input({ label, value, onChange, placeholder, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">
        {label}{required && <span className="text-accent"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
    </div>
  );
}

export default function Import() {
  const { createJob } = useJobsCtx();
  const [f, setF] = useState({
    jobName: '', customerName: '', customerCompany: '', customerPhone: '',
    address: '', quoteNum: '', scope: '', openItems: '', scheduledDate: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const [done, setDone] = useState<Set<string>>(new Set());
  const toggle = (s: string) => setDone((cur) => { const n = new Set(cur); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const allConfirmed = HANDOFF_STEPS.every((s) => done.has(s.step));
  const canSubmit = !!f.jobName.trim() && allConfirmed;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    const notes = [
      f.scope.trim() && `Scope: ${f.scope.trim()}`,
      f.openItems.trim() && `Open items / risk flags: ${f.openItems.trim()}`,
      `Handoff confirmed: ${HANDOFF_STEPS.map((s) => s.step).join(', ')}`,
    ].filter(Boolean).join('\n');
    try {
      await createJob({
        jobName: f.jobName.trim(),
        customerName: f.customerName.trim() || undefined,
        customerCompany: f.customerCompany.trim() || undefined,
        customerPhone: f.customerPhone.trim() || undefined,
        address: f.address.trim() || undefined,
        quoteNum: f.quoteNum.trim() || undefined,
        scheduledDate: f.scheduledDate || undefined,
        notes,
      });
      setMsg({ kind: 'ok', text: `Handoff complete — “${f.jobName.trim()}” created and routed to the Unscheduled pipeline (next: Readiness).` });
      setF({ jobName: '', customerName: '', customerCompany: '', customerPhone: '', address: '', quoteNum: '', scope: '', openItems: '', scheduledDate: '' });
      setDone(new Set());
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to create job' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 01 · Sales → Operations Handoff</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Intake</h1>
        <p className="mt-1.5 text-sm text-muted">Receive an awarded job from Sales, review it, and complete the handoff — the final Job Setup step creates the job.</p>
      </div>

      {/* Handoff flow */}
      <div className="glass mb-5 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
        <span className="mr-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-faint">Handoff flow</span>
        {HANDOFF.steps.map((s, i) => (
          <span key={s.step} className="flex items-center gap-2">
            <span className={`rounded-md border px-2.5 py-1 text-[0.66rem] ${i === HANDOFF.steps.length - 1 ? 'border-accent/40 text-accent' : 'border-white/10 text-text'}`} title={`${s.owner} · ${s.output}`}>{s.step}</span>
            {i < HANDOFF.steps.length - 1 && <span className="text-faint">→</span>}
          </span>
        ))}
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(320px,1.3fr) minmax(280px,1fr)' }}>
        {/* Handoff package details */}
        <section className="glass rounded-2xl p-5">
          <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Handoff package</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Job name" value={f.jobName} onChange={set('jobName')} placeholder="e.g. Belmont Estate — Patio Doors" required /></div>
            <Input label="Customer" value={f.customerName} onChange={set('customerName')} />
            <Input label="Company / GC" value={f.customerCompany} onChange={set('customerCompany')} />
            <Input label="Phone" value={f.customerPhone} onChange={set('customerPhone')} />
            <Input label="Quote / Award #" value={f.quoteNum} onChange={set('quoteNum')} placeholder="contract / bid ref" />
            <div className="col-span-2"><Input label="Job address" value={f.address} onChange={set('address')} /></div>
            <div className="col-span-2">
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Scope (drawings, specs)</label>
              <textarea value={f.scope} onChange={(e) => set('scope')(e.target.value)} rows={2} className="w-full resize-y rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Operations review — risk flags / open items</label>
              <textarea value={f.openItems} onChange={(e) => set('openItems')(e.target.value)} rows={2} placeholder="anything Ops flagged during review" className="w-full resize-y rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </div>
          </div>
        </section>

        {/* Handoff checklist + create */}
        <section className="glass flex flex-col rounded-2xl p-5">
          <div className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Confirm handoff steps</div>
          <div className="flex flex-col gap-2">
            {HANDOFF_STEPS.map((s) => (
              <label key={s.step} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.05]">
                <input type="checkbox" checked={done.has(s.step)} onChange={() => toggle(s.step)} className="mt-0.5 h-4 w-4 accent-[#29c3ec]" />
                <div className="min-w-0">
                  <div className={`text-[0.78rem] font-medium ${done.has(s.step) ? 'text-faint line-through' : 'text-text'}`}>{s.step}</div>
                  <div className="text-[0.6rem] text-muted">{s.owner} · {s.output}</div>
                </div>
              </label>
            ))}
          </div>

          {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-[0.74rem] ${msg.kind === 'err' ? 'bg-[#f4607a]/10 text-[#f4607a]' : 'bg-[#34d39a]/10 text-[#34d39a]'}`}>{msg.text}</div>}

          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="mt-4 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-105 disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Complete handoff · Job Setup →'}
          </button>
          {!canSubmit && (
            <div className="mt-2 text-center text-[0.62rem] text-faint">
              {f.jobName.trim() ? 'Confirm all handoff steps to create the job.' : 'Enter a job name and confirm the handoff steps.'}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

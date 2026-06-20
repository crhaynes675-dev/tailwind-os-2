import { useState } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { WORKFLOWS } from '../domain/workflows';

const HANDOFF = WORKFLOWS.find((w) => w.id === '01')!;

export default function Import() {
  const { createJob } = useJobsCtx();
  const [jobName, setJobName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit() {
    if (!jobName.trim()) {
      setMsg({ kind: 'err', text: 'Job name is required.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await createJob({
        jobName: jobName.trim(),
        customerName: customerName.trim() || undefined,
        address: address.trim() || undefined,
        scheduledDate: scheduledDate || undefined,
      });
      setMsg({ kind: 'ok', text: `Created “${jobName.trim()}” — it’s now in the Unscheduled pipeline.` });
      setJobName('');
      setCustomerName('');
      setAddress('');
      setScheduledDate('');
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to create job' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 01 · Intake &amp; Handoff</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Intake</h1>
        <p className="mt-1.5 text-sm text-muted">Sales → Operations handoff. Bring awarded jobs into the pipeline (intake creates the job record). Automated PDF parsing is a later port.</p>
      </div>

      {/* Sales → Ops handoff flow (workflow 01) */}
      <div className="glass mb-5 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
        <span className="mr-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-faint">Handoff flow</span>
        {HANDOFF.steps.map((s, i) => (
          <span key={s.step} className="flex items-center gap-2">
            <span className="rounded-md border border-white/10 px-2.5 py-1 text-[0.66rem] text-text" title={`${s.owner} · ${s.output}`}>{s.step}</span>
            {i < HANDOFF.steps.length - 1 && <span className="text-faint">→</span>}
          </span>
        ))}
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(300px,1fr) minmax(260px,0.8fr)' }}>
        {/* manual intake */}
        <section className="glass rounded-2xl p-5">
          <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Manual intake</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Job name *</label>
              <input value={jobName} onChange={(e) => setJobName(e.target.value)} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </div>
            <div>
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Customer</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </div>
            <div>
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </div>
            <div>
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Scheduled date (optional)</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </div>
            {msg && <div className={`rounded-lg px-3 py-2 text-[0.74rem] ${msg.kind === 'err' ? 'bg-[#f4607a]/10 text-[#f4607a]' : 'bg-[#34d39a]/10 text-[#34d39a]'}`}>{msg.text}</div>}
            <button onClick={submit} disabled={busy} className="self-start rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
              {busy ? 'Creating…' : 'Create job'}
            </button>
          </div>
        </section>

        {/* pdf dropzone placeholder */}
        <section className="glass grid place-items-center rounded-2xl p-5">
          <div className="grid w-full place-items-center rounded-xl border-2 border-dashed border-white/10 py-12 text-center">
            <div className="text-3xl opacity-40">📄</div>
            <div className="mt-2 text-sm font-semibold text-text">PDF auto-import</div>
            <div className="mt-1 max-w-[220px] text-[0.72rem] text-muted">Drag a quote/estimate PDF here. Parsing is being ported from the legacy engine — coming soon.</div>
          </div>
        </section>
      </div>
    </>
  );
}

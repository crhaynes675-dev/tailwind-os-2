import { useState } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { uploadAttachment, apiSend } from '../lib/api';

// Sales → Operations Handoff (Workflow 01) as a step-by-step wizard.
// Each stage is a form; you progress stage to stage until Job Setup,
// which creates the job.
const STAGES = [
  { key: 'lead', name: 'Lead', owner: 'Sales', goal: 'Qualified opportunity' },
  { key: 'quote', name: 'Quote', owner: 'Sales / Estimating', goal: 'Submitted bid' },
  { key: 'awarded', name: 'Sale Awarded', owner: 'Sales', goal: 'Award notification' },
  { key: 'handoff', name: 'Sales Handoff', owner: 'Sales → Ops', goal: 'Ops briefed' },
  { key: 'review', name: 'Operations Review', owner: 'Ops Manager', goal: 'Risk flags, open items' },
  { key: 'setup', name: 'Job Setup', owner: 'Ops / Admin', goal: 'Job created in system' },
] as const;

interface Form {
  customerName: string; customerCompany: string; customerPhone: string; email: string; whyLead: string;
  jobName: string; scope: string; quoteNum: string;
  contractRef: string; awardDate: string; address: string;
  hContract: boolean; hDocs: boolean; hScope: boolean;
  openItems: string; scheduledDate: string;
}

const EMPTY: Form = {
  customerName: '', customerCompany: '', customerPhone: '', email: '', whyLead: '',
  jobName: '', scope: '', quoteNum: '',
  contractRef: '', awardDate: '', address: '',
  hContract: false, hDocs: false, hScope: false,
  openItems: '', scheduledDate: '',
};

function Field({ label, value, onChange, placeholder, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{label}{required && <span className="text-accent"> *</span>}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
    </div>
  );
}
function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{label}</label>
      <textarea value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
    </div>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-[0.82rem] text-text transition hover:bg-white/[0.05]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#29c3ec]" />
      {label}
    </label>
  );
}
function FileInput({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      {label && <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{label}</label>}
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-glass bg-white/[0.03] px-3 py-2 text-[0.76rem] text-muted transition hover:border-accent hover:text-text">
        <span className="text-accent">📎</span>
        <span className="truncate">{file ? file.name : 'Attach file…'}</span>
        <input type="file" className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
        {file && <span onClick={(e) => { e.preventDefault(); onChange(null); }} className="ml-auto text-faint hover:text-[#f4607a]">✕</span>}
      </label>
    </div>
  );
}

export default function Import() {
  const { createJob } = useJobsCtx();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Attachments collected during the wizard, uploaded after the job is created.
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [hoContract, setHoContract] = useState<File | null>(null);
  const [hoDocs, setHoDocs] = useState<File | null>(null);
  const [hoScope, setHoScope] = useState<File | null>(null);
  const [reviewFile, setReviewFile] = useState<File | null>(null);

  const stepValid = (i: number): boolean => {
    switch (STAGES[i].key) {
      case 'lead': return !!f.customerName.trim();
      case 'quote': return !!f.jobName.trim();
      case 'handoff': return f.hContract && f.hDocs && f.hScope;
      default: return true;
    }
  };

  const isLast = step === STAGES.length - 1;

  function next() {
    if (!stepValid(step)) return;
    if (!isLast) setStep((s) => s + 1);
  }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  async function create() {
    setBusy(true); setMsg(null);
    const notes = [
      f.whyLead.trim() && `Lead reason: ${f.whyLead.trim()}`,
      f.scope.trim() && `Scope: ${f.scope.trim()}`,
      f.contractRef.trim() && `Contract/Award ref: ${f.contractRef.trim()}`,
      f.awardDate && `Awarded: ${f.awardDate}`,
      'Handoff received: Contract, Job docs, Scope',
      f.openItems.trim() && `Ops review — open items: ${f.openItems.trim()}`,
    ].filter(Boolean).join('\n');
    try {
      // Add the lead to the customer database.
      await apiSend('POST', '/customers', {
        name: f.customerName.trim(),
        customerName: f.customerName.trim(),
        company: f.customerCompany.trim() || undefined,
        customerCompany: f.customerCompany.trim() || undefined,
        phone: f.customerPhone.trim() || undefined,
        customerPhone: f.customerPhone.trim() || undefined,
        email: f.email.trim() || undefined,
        address: f.address.trim() || undefined,
        notes: f.whyLead.trim() || undefined,
        source: 'Intake / Lead',
      }).catch(() => { /* don't block the handoff if CDB write fails */ });

      const jobId = await createJob({
        jobName: f.jobName.trim(),
        customerName: f.customerName.trim() || undefined,
        customerCompany: f.customerCompany.trim() || undefined,
        customerPhone: f.customerPhone.trim() || undefined,
        address: f.address.trim() || undefined,
        quoteNum: f.quoteNum.trim() || undefined,
        scheduledDate: f.scheduledDate || undefined,
        notes,
      });
      const files = [quoteFile, hoContract, hoDocs, hoScope, reviewFile].filter(Boolean) as File[];
      let uploaded = 0;
      if (jobId && files.length) {
        for (const file of files) {
          try { await uploadAttachment(jobId, file); uploaded++; } catch { /* keep going */ }
        }
      }
      const attachNote = files.length ? `, ${uploaded}/${files.length} attachment${files.length === 1 ? '' : 's'} uploaded` : '';
      setMsg({ kind: 'ok', text: `Handoff complete — “${f.jobName.trim()}” created, ${f.customerName.trim() || 'lead'} added to the customer database${attachNote}. Routed to Unscheduled → Readiness.` });
      setF(EMPTY); setStep(0);
      setQuoteFile(null); setHoContract(null); setHoDocs(null); setHoScope(null); setReviewFile(null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to create job' });
    } finally { setBusy(false); }
  }

  const stage = STAGES[step];

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Workflow 01 · Sales → Operations Handoff</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Intake</h1>
        <p className="mt-1.5 text-sm text-muted">Work the handoff stage by stage. The final Job Setup step creates the job.</p>
      </div>

      {/* Stepper */}
      <div className="glass mb-5 flex flex-wrap items-center gap-1.5 rounded-2xl px-4 py-3">
        {STAGES.map((s, i) => {
          const stateCls = i === step ? 'border-accent/50 bg-[var(--grad-soft)] text-white'
            : i < step ? 'border-white/10 text-[#34d39a]' : 'border-white/10 text-faint';
          return (
            <span key={s.key} className="flex items-center gap-1.5">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[0.66rem] font-medium transition ${stateCls} ${i < step ? 'cursor-pointer hover:bg-white/5' : ''}`}
              >
                <span className="font-mono text-[0.6rem] opacity-70">{i < step ? '✓' : i + 1}</span>{s.name}
              </button>
              {i < STAGES.length - 1 && <span className="text-faint">→</span>}
            </span>
          );
        })}
      </div>

      <div className="mx-auto max-w-2xl">
        <section className="glass rounded-2xl p-6">
          <div className="mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Step {step + 1} of {STAGES.length} · {stage.owner}</div>
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-text">{stage.name}</h2>
            <span className="text-[0.66rem] text-muted">Goal: {stage.goal}</span>
          </div>

          <div className="flex flex-col gap-3.5">
            {stage.key === 'lead' && (
              <>
                <Field label="Customer name" value={f.customerName} onChange={set('customerName')} required placeholder="Who is the lead?" />
                <div className="grid grid-cols-2 gap-3.5">
                  <Field label="Email" type="email" value={f.email} onChange={set('email')} placeholder="name@company.com" />
                  <Field label="Phone" type="tel" value={f.customerPhone} onChange={set('customerPhone')} placeholder="(704) 555-0000" />
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <Field label="Company / GC" value={f.customerCompany} onChange={set('customerCompany')} />
                  <Field label="Address" value={f.address} onChange={set('address')} />
                </div>
                <Area label="Why are they a lead?" value={f.whyLead} onChange={set('whyLead')} placeholder="Source, interest, project type, referral…" />
              </>
            )}
            {stage.key === 'quote' && (
              <>
                <Field label="Job name" value={f.jobName} onChange={set('jobName')} required placeholder="e.g. Belmont Estate — Patio Doors" />
                <Field label="Quote / Bid #" value={f.quoteNum} onChange={set('quoteNum')} />
                <Area label="Scope — drawings, specs" value={f.scope} onChange={set('scope')} />
                <FileInput label="Attachment — quote / drawings" file={quoteFile} onChange={setQuoteFile} />
              </>
            )}
            {stage.key === 'awarded' && (
              <>
                <div className="grid grid-cols-2 gap-3.5">
                  <Field label="Contract / Award ref" value={f.contractRef} onChange={set('contractRef')} placeholder="executed contract #" />
                  <Field label="Award date" type="date" value={f.awardDate} onChange={set('awardDate')} />
                </div>
                <Field label="Job site address" value={f.address} onChange={set('address')} placeholder="defaults to lead address" />
              </>
            )}
            {stage.key === 'handoff' && (
              <>
                <div className="text-[0.72rem] text-muted">Confirm Sales has handed the package to Operations, and attach each document.</div>
                <div className="flex flex-col gap-2">
                  <Check label="Executed contract received" checked={f.hContract} onChange={set('hContract')} />
                  <FileInput label="" file={hoContract} onChange={setHoContract} />
                </div>
                <div className="flex flex-col gap-2">
                  <Check label="Job documents received" checked={f.hDocs} onChange={set('hDocs')} />
                  <FileInput label="" file={hoDocs} onChange={setHoDocs} />
                </div>
                <div className="flex flex-col gap-2">
                  <Check label="Scope / drawings received" checked={f.hScope} onChange={set('hScope')} />
                  <FileInput label="" file={hoScope} onChange={setHoScope} />
                </div>
              </>
            )}
            {stage.key === 'review' && (
              <>
                <Area label="Risk flags / open items" value={f.openItems} onChange={set('openItems')} placeholder="anything Ops flagged during review" />
                <FileInput label="Attachment — review docs / notes" file={reviewFile} onChange={setReviewFile} />
                <Field label="Target schedule date (optional)" type="date" value={f.scheduledDate} onChange={set('scheduledDate')} />
              </>
            )}
            {stage.key === 'setup' && (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-[0.82rem]">
                <div className="mb-2 text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Review &amp; create</div>
                <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-muted">
                  <dt className="text-faint">Job</dt><dd className="text-text">{f.jobName || '—'}</dd>
                  <dt className="text-faint">Customer</dt><dd>{[f.customerName, f.customerCompany].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt className="text-faint">Contact</dt><dd>{[f.email, f.customerPhone].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt className="text-faint">Address</dt><dd>{f.address || '—'}</dd>
                  <dt className="text-faint">Why a lead</dt><dd>{f.whyLead || '—'}</dd>
                  <dt className="text-faint">Quote #</dt><dd>{f.quoteNum || '—'}</dd>
                  <dt className="text-faint">Award</dt><dd>{[f.contractRef, f.awardDate].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt className="text-faint">Open items</dt><dd>{f.openItems || 'none'}</dd>
                </dl>
              </div>
            )}
          </div>

          {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-[0.74rem] ${msg.kind === 'err' ? 'bg-[#f4607a]/10 text-[#f4607a]' : 'bg-[#34d39a]/10 text-[#34d39a]'}`}>{msg.text}</div>}

          <div className="mt-6 flex items-center justify-between">
            <button onClick={back} disabled={step === 0} className="rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-muted transition enabled:hover:text-text disabled:opacity-30">← Back</button>
            {isLast ? (
              <button onClick={create} disabled={busy || !f.jobName.trim()} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-105 disabled:opacity-40">
                {busy ? 'Creating…' : 'Create job →'}
              </button>
            ) : (
              <button onClick={next} disabled={!stepValid(step)} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-105 disabled:opacity-40">
                Next →
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

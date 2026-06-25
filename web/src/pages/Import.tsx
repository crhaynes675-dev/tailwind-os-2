import { useState, useEffect } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { uploadAttachment, apiSend, apiGet } from '../lib/api';

interface SavedQuote { quoteId: string; quoteNumber: string; jobName?: string; customerName?: string; customerCompany?: string; address?: string; totalToInvoice?: number }
const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

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
  awarded: string; contractRef: string; awardDate: string; address: string;
  hContract: boolean; hDocs: boolean; hScope: boolean;
  openItems: string; scheduledDate: string; lostReason: string;
}

const EMPTY: Form = {
  customerName: '', customerCompany: '', customerPhone: '', email: '', whyLead: '',
  jobName: '', scope: '', quoteNum: '',
  awarded: '', contractRef: '', awardDate: '', address: '',
  hContract: false, hDocs: false, hScope: false,
  openItems: '', scheduledDate: '', lostReason: '',
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
  const [lostPath, setLostPath] = useState(false); // diverted to "not awarded"
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

  // Saved estimator quotes — selectable in the Quote step.
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [pickedQuoteId, setPickedQuoteId] = useState('');
  const [quoteAmount, setQuoteAmount] = useState<number | undefined>(undefined);
  useEffect(() => { apiGet<SavedQuote[]>('/quotes').then((r) => setQuotes(Array.isArray(r) ? r : [])).catch(() => {}); }, []);

  function pickQuote(id: string) {
    setPickedQuoteId(id);
    const q = quotes.find((x) => x.quoteId === id);
    if (!q) { setQuoteAmount(undefined); return; }
    setQuoteAmount(q.totalToInvoice);
    setF((s) => ({
      ...s,
      jobName: s.jobName || q.jobName || '',
      quoteNum: q.quoteNumber || s.quoteNum,
      address: s.address || q.address || '',
      customerName: s.customerName || q.customerName || '',
      customerCompany: s.customerCompany || q.customerCompany || '',
    }));
  }

  const stepValid = (i: number): boolean => {
    switch (STAGES[i].key) {
      case 'lead': return !!f.customerName.trim();
      case 'quote': return !!f.jobName.trim();
      case 'awarded': return f.awarded === 'yes' || f.awarded === 'no';
      case 'handoff': return f.hContract && f.hDocs && f.hScope;
      default: return true;
    }
  };

  const isLast = step === STAGES.length - 1;

  function next() {
    if (!stepValid(step)) return;
    // Branch: not awarded → divert to the reason screen (no job).
    if (STAGES[step].key === 'awarded' && f.awarded === 'no') { setLostPath(true); return; }
    if (!isLast) setStep((s) => s + 1);
  }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  async function saveLostLead() {
    setBusy(true); setMsg(null);
    const notes = [
      f.whyLead.trim() && `Lead reason: ${f.whyLead.trim()}`,
      f.lostReason.trim() && `Not awarded — reason: ${f.lostReason.trim()}`,
    ].filter(Boolean).join('\n');
    try {
      await apiSend('POST', '/customers', {
        name: f.customerName.trim(), customerName: f.customerName.trim(),
        company: f.customerCompany.trim() || undefined, customerCompany: f.customerCompany.trim() || undefined,
        phone: f.customerPhone.trim() || undefined, customerPhone: f.customerPhone.trim() || undefined,
        email: f.email.trim() || undefined,
        address: f.address.trim() || undefined,
        notes: notes || undefined,
        source: 'Lost Lead',
        status: 'Not Awarded',
      });
      setMsg({ kind: 'ok', text: `${f.customerName.trim() || 'Lead'} saved to the customer database (not awarded). No job created.` });
      setF(EMPTY); setStep(0); setLostPath(false);
      setQuoteFile(null); setHoContract(null); setHoDocs(null); setHoScope(null); setReviewFile(null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to save lead' });
    } finally { setBusy(false); }
  }

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
        contractAmount: quoteAmount,
        quoteId: pickedQuoteId || undefined,
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

      {lostPath && (
        <div className="mx-auto max-w-2xl">
          <section className="glass rounded-2xl p-6">
            <div className="mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Lead outcome · Not awarded</div>
            <h2 className="mb-1 text-lg font-semibold text-text">Not awarded</h2>
            <p className="mb-5 text-[0.72rem] text-muted">Capture why this didn’t convert. {f.customerName.trim() || 'The lead'} will still be saved to the customer database — no job is created.</p>
            <Area label="Reason — why was it not awarded?" value={f.lostReason} onChange={set('lostReason')} placeholder="budget, timing, went with a competitor, project canceled…" />
            {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-[0.74rem] ${msg.kind === 'err' ? 'bg-[#f4607a]/10 text-[#f4607a]' : 'bg-[#34d39a]/10 text-[#34d39a]'}`}>{msg.text}</div>}
            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => setLostPath(false)} className="rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-muted transition hover:text-text">← Back</button>
              <button onClick={saveLostLead} disabled={busy || !f.customerName.trim()} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-105 disabled:opacity-40">
                {busy ? 'Saving…' : 'Save to customer database →'}
              </button>
            </div>
          </section>
        </div>
      )}

      {!lostPath && (
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
                {quotes.length > 0 && (
                  <div>
                    <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Use a saved estimate</label>
                    <select value={pickedQuoteId} onChange={(e) => pickQuote(e.target.value)}
                      className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent">
                      <option value="">— none (enter manually) —</option>
                      {quotes.map((q) => <option key={q.quoteId} value={q.quoteId}>{q.quoteNumber} · {q.jobName || 'Untitled'} · {fmtUsd(q.totalToInvoice || 0)}</option>)}
                    </select>
                    {quoteAmount != null && <div className="mt-1 text-[0.66rem] text-completed">Contract amount {fmtUsd(quoteAmount)} will carry onto the job.</div>}
                  </div>
                )}
                <Field label="Job name" value={f.jobName} onChange={set('jobName')} required placeholder="e.g. Belmont Estate — Patio Doors" />
                <Field label="Quote / Bid #" value={f.quoteNum} onChange={set('quoteNum')} />
                <Area label="Scope — drawings, specs" value={f.scope} onChange={set('scope')} />
                <FileInput label="Attachment — quote / drawings" file={quoteFile} onChange={setQuoteFile} />
              </>
            )}
            {stage.key === 'awarded' && (
              <>
                <div>
                  <label className="mb-1.5 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Was the sale awarded?</label>
                  <div className="flex gap-2">
                    {(['yes', 'no'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => set('awarded')(v)}
                        className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                          f.awarded === v
                            ? v === 'yes' ? 'border-[#34d39a]/50 bg-[#34d39a]/15 text-[#34d39a]' : 'border-[#f4607a]/50 bg-[#f4607a]/15 text-[#f4607a]'
                            : 'border-glass bg-white/[0.03] text-muted hover:text-text'
                        }`}
                      >
                        {v === 'yes' ? 'Yes — awarded' : 'No — not awarded'}
                      </button>
                    ))}
                  </div>
                </div>
                {f.awarded === 'yes' && (
                  <>
                    <div className="grid grid-cols-2 gap-3.5">
                      <Field label="Contract / Award ref" value={f.contractRef} onChange={set('contractRef')} placeholder="executed contract #" />
                      <Field label="Award date" type="date" value={f.awardDate} onChange={set('awardDate')} />
                    </div>
                    <Field label="Job site address" value={f.address} onChange={set('address')} placeholder="defaults to lead address" />
                  </>
                )}
                {f.awarded === 'no' && (
                  <div className="rounded-lg border border-[#f4607a]/25 bg-[#f4607a]/[0.06] px-3.5 py-2.5 text-[0.74rem] text-muted">
                    Not awarded. Next, add a reason — the customer will still be saved to the database, but no job is created.
                  </div>
                )}
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
      )}
    </>
  );
}

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { apiGet, apiSend } from '../lib/api';
import { STATUS_META, nextStatus, type JobStatus } from '../domain/status';
import { buildReadinessPlan, readinessComplete } from '../domain/readiness';
import type { Job } from '../data/jobs';
import TransitionModal from './TransitionModal';

interface ApiUser { username: string; givenName?: string; familyName?: string; role?: string }
const TECH_ROLES = ['service_technician', 'project_manager', 'installer', 'foreman', 'lead_installer', 'apprentice'];

interface AuditEntry {
  action?: string;
  user?: string;
  ts?: string;
  changes?: Record<string, unknown>;
}

interface Attachment {
  attachId: string;
  filename: string;
  contentType: string;
  category: string;
  uploadedBy?: string;
  uploadedAt?: string;
  url: string;
}

interface ChecklistItem { prompt: string; passed: boolean }
interface LineItem { description?: string; name?: string; qty?: number; quantity?: number; unitPrice?: number; price?: number; amount?: number; total?: number }
interface JobDetail {
  preFlight?: ChecklistItem[];
  inspection?: ChecklistItem[];
  enrouteAt?: string;
  onSiteAt?: string;
  completedAt?: string;
  scheduledTime?: string;
  scheduledEndDate?: string;
  customerName?: string;
  customerCompany?: string;
  customerPhone?: string;
  quoteNum?: string;
  quoteId?: string;
  parentJobId?: string;
  invoicedAt?: string;
  paidAt?: string;
  lineItems?: LineItem[];
  units?: Array<Record<string, unknown>>;
  createdAt?: string;
  updatedAt?: string;
  customerApprovedAt?: string;
  customerApprovedName?: string;
  workOrderNumber?: string;
}

function Checklist({ title, items }: { title: string; items: ChecklistItem[] }) {
  return (
    <div>
      <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-wide text-accent">{title}</div>
      <div className="flex flex-col gap-1">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[0.72rem]">
            <span className={it.passed ? 'text-completed' : 'text-faint'}>{it.passed ? '✓' : '○'}</span>
            <span className={it.passed ? 'text-muted' : 'text-faint'}>{it.prompt}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 text-[0.72rem]">
      <span className="flex-shrink-0 text-faint">{label}</span>
      <span className="text-right text-muted">{value}</span>
    </div>
  );
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtDate = (s?: string) => (s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString() : '');
const INV_META: Record<string, { label: string; color: string }> = {
  none: { label: 'Not invoiced', color: '#8da3c7' },
  invoiced: { label: 'Invoiced', color: '#f0a23c' },
  paid: { label: 'Paid', color: '#34d39a' },
};

/**
 * The customer-facing link for a job. Minting is explicit — a job is never
 * silently shareable — and re-minting invalidates the previous link, which is
 * how you cut off access after sending it to the wrong address.
 */
function CustomerLink({ jobId, approvedAt, approvedName }: { jobId: string; approvedAt?: string; approvedName?: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Mounted with key={job.id}, so switching jobs remounts with fresh state
  // and this effect never has to reset anything synchronously.
  useEffect(() => {
    let alive = true;
    apiGet<{ token: string | null }>(`/jobs/${jobId}/share`)
      .then((r) => { if (alive) setToken(r.token); })
      .catch(() => { if (alive) setToken(null); });
    return () => { alive = false; };
  }, [jobId]);

  const url = token ? `${window.location.origin}/j/${token}` : null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  const create = () => run(async () => {
    const r = await apiSend<{ token: string }>('POST', `/jobs/${jobId}/share`);
    setToken(r.token);
    setCopied(false);
  });

  const revoke = () => run(async () => {
    await apiSend('DELETE', `/jobs/${jobId}/share`);
    setToken(null);
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Copy failed — select the link and copy it manually.');
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">
        <span>Customer link</span>
        {approvedAt && (
          <span className="rounded-full bg-[#34d39a]/15 px-1.5 py-px text-[0.56rem] font-semibold text-[#34d39a]">
            approved
          </span>
        )}
      </div>

      {approvedAt && (
        <p className="mb-2 text-[0.72rem] text-[#34d39a]">
          Signed by {approvedName || 'the customer'} on {new Date(approvedAt).toLocaleDateString()}.
        </p>
      )}

      {token === undefined ? (
        <div className="text-[0.72rem] text-faint">Loading…</div>
      ) : token ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-glass bg-white/[0.04] px-2.5 py-1.5 font-mono text-[0.68rem] text-muted outline-none focus:border-accent"
            />
            <button
              onClick={copy}
              className="flex-shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-[0.66rem] font-semibold text-white transition hover:brightness-105"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex gap-3 text-[0.66rem]">
            <button onClick={create} disabled={busy} className="font-semibold text-muted underline underline-offset-2 hover:text-text disabled:opacity-40">
              Replace link
            </button>
            <button onClick={revoke} disabled={busy} className="font-semibold text-[#f0554c]/80 underline underline-offset-2 hover:text-[#f0554c] disabled:opacity-40">
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={create}
            disabled={busy}
            className="rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-[0.68rem] font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create customer link'}
          </button>
          <p className="mt-1.5 text-[0.66rem] text-faint">
            Shows schedule, progress photos, and collects sign-off. No pricing is visible.
          </p>
        </div>
      )}

      {err && <p className="mt-1.5 text-[0.66rem] text-[#f0554c]">{err}</p>}
    </div>
  );
}

export default function JobDrawer() {
  const { jobs, selectedId, select, updateJob } = useJobsCtx();
  const job = jobs.find((j) => j.id === selectedId) || null;

  const [form, setForm] = useState<Partial<Job>>({});
  const [fin, setFin] = useState({ contractAmount: '', materialCost: '', laborCost: '' });
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingFin, setSavingFin] = useState(false);
  const [pendingTo, setPendingTo] = useState<JobStatus | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);

  useEffect(() => { apiGet<ApiUser[]>('/users').then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {}); }, []);

  // Techs from the roster + any crew names already in use on jobs.
  const crewOptions = useMemo(() => {
    const techNames = users.filter((u) => TECH_ROLES.includes(u.role || '')).map((u) => `${u.givenName || ''} ${u.familyName || ''}`.trim() || u.username);
    const fromJobs = jobs.map((j) => j.crew).filter(Boolean) as string[];
    return [...new Set([...techNames, ...fromJobs])].sort((a, b) => a.localeCompare(b));
  }, [users, jobs]);

  useEffect(() => {
    if (!job) return;
    setForm({ name: job.name, address: job.address, crew: job.crew || '', scheduledDate: job.scheduledDate || '', notes: job.notes || '' });
    setFin({
      contractAmount: job.contractAmount != null ? String(job.contractAmount) : '',
      materialCost: job.materialCost != null ? String(job.materialCost) : '',
      laborCost: job.laborCost != null ? String(job.laborCost) : '',
    });
    setAudit(null);
    setAttachments(null);
    apiGet<AuditEntry[]>(`/jobs/${job.id}/audit`)
      .then((a) => setAudit(Array.isArray(a) ? a : []))
      .catch(() => setAudit([]));
    apiGet<{ attachments: Attachment[] }>(`/jobs/${job.id}/attachments`)
      .then((r) => setAttachments(r.attachments || []))
      .catch(() => setAttachments([]));
    setDetail(null);
    apiGet<JobDetail>(`/jobs/${job.id}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null;
  const meta = STATUS_META[job.status];
  const next = nextStatus(job.status);
  // Scheduling is gated on completing every readiness step.
  const scheduleGate = next === 'Scheduled' && !readinessComplete(job);
  const signature = attachments?.find((a) => a.category === 'signature') || null;
  const nonSig = (attachments || []).filter((a) => a.category !== 'signature');
  const photos = nonSig.filter((a) => a.contentType?.startsWith('image/'));
  const files = nonSig.filter((a) => !a.contentType?.startsWith('image/'));

  const num = (s: string) => (s === '' ? 0 : Number(s) || 0);
  const margin = num(fin.contractAmount) - num(fin.materialCost) - num(fin.laborCost);
  const marginPct = num(fin.contractAmount) > 0 ? Math.round((margin / num(fin.contractAmount)) * 100) : null;
  const finDirty =
    fin.contractAmount !== (job.contractAmount != null ? String(job.contractAmount) : '') ||
    fin.materialCost !== (job.materialCost != null ? String(job.materialCost) : '') ||
    fin.laborCost !== (job.laborCost != null ? String(job.laborCost) : '');
  const invMeta = INV_META[job.invoiceStatus ?? 'none'];

  async function saveFin() {
    setSavingFin(true);
    try {
      await updateJob(job!.id, {
        contractAmount: fin.contractAmount === '' ? 0 : Number(fin.contractAmount),
        materialCost: fin.materialCost === '' ? 0 : Number(fin.materialCost),
        laborCost: fin.laborCost === '' ? 0 : Number(fin.laborCost),
      });
    } finally {
      setSavingFin(false);
    }
  }
  const dirty =
    form.name !== job.name || form.address !== job.address || (form.crew || '') !== (job.crew || '') || (form.scheduledDate || '') !== (job.scheduledDate || '') || (form.notes || '') !== (job.notes || '');

  async function save() {
    setSaving(true);
    try {
      await updateJob(job!.id, {
        name: form.name,
        address: form.address,
        crew: form.crew || undefined,
        scheduledDate: form.scheduledDate || undefined,
        notes: form.notes || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleReadiness(stepName: string, checked: boolean) {
    const plan = buildReadinessPlan(job!).map((r) =>
      r.step === stepName ? { ...r, done: checked, completedAt: checked ? new Date().toISOString() : undefined } : r,
    );
    updateJob(job!.id, { readiness: plan }).catch(() => {});
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
            <div className="text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{job.status === 'Scheduled' ? 'Dispatch' : next === 'Scheduled' ? 'Schedule' : 'Current stage gate'}</div>
            <div className="mt-1.5 text-[0.74rem] text-muted">
              <div><span className="text-faint">Owner:</span> {meta.owner}</div>
              <div><span className="text-faint">Output:</span> {meta.output}</div>
            </div>

            {/* Crew / tech assignment — saves immediately so dispatch is one click. */}
            <div className="mt-3">
              <label className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">Assigned crew / tech</label>
              <select
                value={form.crew || ''}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, crew: v })); updateJob(job!.id, { crew: v || undefined }).catch(() => {}); }}
                className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Unassigned</option>
                {crewOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {next ? (
              <>
                <button
                  onClick={() => setPendingTo(next)}
                  disabled={scheduleGate}
                  className="mt-3 w-full rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {next === 'Scheduled' ? 'Schedule →' : job.status === 'Scheduled' ? 'Dispatch →' : `Advance to ${STATUS_META[next].short} →`}
                </button>
                {scheduleGate && (
                  <div className="mt-1.5 text-center text-[0.62rem] text-faint">Complete all readiness steps to schedule.</div>
                )}
                {job.status === 'Scheduled' && !form.crew && (
                  <div className="mt-1.5 text-center text-[0.62rem] text-faint">Tip: assign a crew above before dispatching.</div>
                )}
              </>
            ) : (
              <div className="mt-3 text-center text-[0.72rem] text-completed">Final stage — job completed.</div>
            )}
          </div>

          {/* customer & contact */}
          <div className="mb-5">
            <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Customer &amp; contact</div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <MetaRow label="Company" value={detail?.customerCompany || job.customer} />
              <MetaRow label="Contact" value={detail?.customerName} />
              <MetaRow
                label="Phone"
                value={(job.customerPhone || detail?.customerPhone)
                  ? <a href={`tel:${job.customerPhone || detail?.customerPhone}`} className="text-accent hover:underline">{job.customerPhone || detail?.customerPhone}</a>
                  : undefined}
              />
              <MetaRow
                label="Address"
                value={job.address
                  ? <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">{job.address}</a>
                  : undefined}
              />
            </div>
          </div>

          {/* work order details */}
          <div className="mb-5">
            <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Work order</div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <MetaRow label="Work order #" value={job.workOrder} />
              <MetaRow label="Priority" value={job.priority} />
              <MetaRow label="Crew / tech" value={job.crew || 'Unassigned'} />
              <MetaRow label="Scheduled" value={fmtDate(job.scheduledDate)} />
              <MetaRow label="Through" value={job.scheduledEndDate && job.scheduledEndDate !== job.scheduledDate ? fmtDate(job.scheduledEndDate) : undefined} />
              <MetaRow label="Time" value={detail?.scheduledTime} />
              <MetaRow label="Quote #" value={detail?.quoteNum} />
            </div>
          </div>

          {/* editable details */}
          <div className="flex flex-col gap-3">
            <Field label="Job name" value={form.name || ''} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field label="Address" value={form.address || ''} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
            <Field label="Scheduled date" type="date" value={form.scheduledDate || ''} onChange={(v) => setForm((f) => ({ ...f, scheduledDate: v }))} />
            <div>
              <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Notes</label>
              <textarea
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Add notes for this work order…"
                className="w-full resize-y rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="mt-1 self-start rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-accent transition enabled:hover:bg-white/10 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          {/* readiness plan — check steps off here; all done unlocks scheduling */}
          {(() => {
            const plan = buildReadinessPlan(job);
            const doneCount = plan.filter((r) => r.done).length;
            const allDone = doneCount === plan.length;
            return (
              <div className="mt-6">
                <div className="mb-2 flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">
                  <span>Readiness plan</span>
                  <span className="rounded-full bg-white/5 px-1.5 py-px text-[0.56rem] text-muted">{doneCount}/{plan.length}</span>
                  {allDone && <span className="rounded-full bg-[#34d39a]/15 px-1.5 py-px text-[0.56rem] font-bold uppercase text-[#34d39a]">Ready</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  {plan.map((r) => (
                    <label key={r.step} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition ${r.done ? 'border-[#34d39a]/30 bg-[#34d39a]/[0.06]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                      <input
                        type="checkbox"
                        checked={!!r.done}
                        onChange={(e) => toggleReadiness(r.step, e.target.checked)}
                        className="h-3.5 w-3.5 flex-shrink-0"
                        style={{ accentColor: '#34d39a' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[0.74rem] font-medium ${r.done ? 'text-muted line-through opacity-70' : 'text-text'}`}>{r.step}</div>
                        {r.owner && <div className="truncate text-[0.58rem] text-faint">{r.owner}</div>}
                      </div>
                      {r.dueDate && <span className="flex-shrink-0 text-[0.62rem] text-muted">{fmtDate(r.dueDate)}</span>}
                    </label>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* financials */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Financials</span>
              <span className="rounded-full px-2 py-0.5 text-[0.58rem] font-semibold" style={{ color: invMeta.color, background: `${invMeta.color}1a` }}>{invMeta.label}</span>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Contract amount ($)" type="number" value={fin.contractAmount} onChange={(v) => setFin((f) => ({ ...f, contractAmount: v }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Material cost ($)" type="number" value={fin.materialCost} onChange={(v) => setFin((f) => ({ ...f, materialCost: v }))} />
                <Field label="Labor cost ($)" type="number" value={fin.laborCost} onChange={(v) => setFin((f) => ({ ...f, laborCost: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-faint">Margin</span>
                <span className="text-sm font-bold" style={{ color: margin >= 0 ? '#34d39a' : '#fb7185' }}>
                  {usd(margin)}{marginPct !== null ? ` · ${marginPct}%` : ''}
                </span>
              </div>
              {(job.invoicedAt || job.paidAt) && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <MetaRow label="Invoiced" value={job.invoicedAt ? new Date(job.invoicedAt).toLocaleDateString() : undefined} />
                  <MetaRow label="Paid" value={job.paidAt ? new Date(job.paidAt).toLocaleDateString() : undefined} />
                </div>
              )}
              <button
                onClick={saveFin}
                disabled={!finDirty || savingFin}
                className="self-start rounded-lg border border-glass bg-white/5 px-4 py-2 text-xs font-semibold text-accent transition enabled:hover:bg-white/10 disabled:opacity-40"
              >
                {savingFin ? 'Saving…' : 'Save financials'}
              </button>
            </div>
          </div>

          {/* line items */}
          {detail?.lineItems && detail.lineItems.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Line items · {detail.lineItems.length}</div>
              <div className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                {detail.lineItems.map((li, i) => {
                  const desc = li.description || li.name || `Item ${i + 1}`;
                  const qty = li.qty ?? li.quantity;
                  const amt = li.amount ?? li.total ?? li.price ?? li.unitPrice;
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 text-[0.72rem]">
                      <span className="text-muted">{desc}{qty != null ? ` × ${qty}` : ''}</span>
                      {amt != null && <span className="flex-shrink-0 text-text">{usd(Number(amt))}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* customer portal link */}
          <CustomerLink key={job.id} jobId={job.id} approvedAt={detail?.customerApprovedAt} approvedName={detail?.customerApprovedName} />

          {/* field photos & signature */}
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">
              <span>Attachments</span>
              {attachments && attachments.length > 0 && <span className="rounded-full bg-white/5 px-1.5 py-px text-[0.56rem] text-muted">{attachments.length}</span>}
            </div>
            {attachments === null ? (
              <div className="text-[0.72rem] text-faint">Loading…</div>
            ) : attachments.length === 0 ? (
              <div className="text-[0.72rem] text-faint">No attachments on this work order yet.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {signature && (
                  <div>
                    <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-wider text-accent">Customer signature</div>
                    <a href={signature.url} target="_blank" rel="noreferrer">
                      <img src={signature.url} alt="Customer signature" className="w-full rounded-lg border border-glass bg-white" />
                    </a>
                    {signature.uploadedAt && (
                      <div className="mt-1 text-[0.62rem] text-faint">Signed {new Date(signature.uploadedAt).toLocaleString()}</div>
                    )}
                  </div>
                )}
                {photos.length > 0 && (
                  <div>
                    <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Photos · {photos.length}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((a) => (
                        <a
                          key={a.attachId}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative aspect-square overflow-hidden rounded-lg border border-glass"
                          title={`${a.category} · ${a.uploadedAt ? new Date(a.uploadedAt).toLocaleString() : ''}`}
                        >
                          <img src={a.url} alt={a.filename} className="h-full w-full object-cover transition group-hover:scale-105" />
                          <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[0.5rem] font-semibold uppercase tracking-wide text-white">{a.category}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {files.length > 0 && (
                  <div>
                    <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Documents &amp; files · {files.length}</div>
                    <div className="flex flex-col gap-1.5">
                      {files.map((a) => (
                        <a
                          key={a.attachId}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.06]"
                          title={a.uploadedAt ? new Date(a.uploadedAt).toLocaleString() : a.filename}
                        >
                          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-accent/15 text-[0.55rem] font-bold uppercase text-accent">
                            {(a.filename.split('.').pop() || 'file').slice(0, 4)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[0.72rem] font-medium text-text">{a.filename}</div>
                            <div className="truncate text-[0.56rem] uppercase tracking-wide text-faint">{a.category}</div>
                          </div>
                          <span className="flex-shrink-0 text-[0.62rem] text-accent">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* completion record */}
          {detail && (detail.enrouteAt || detail.onSiteAt || detail.completedAt || detail.preFlight?.length || detail.inspection?.length) && (
            <div className="mt-6">
              <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Completion record</div>
              <div className="flex flex-col gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                {(detail.enrouteAt || detail.onSiteAt || detail.completedAt) && (
                  <div className="flex flex-col gap-1 text-[0.72rem]">
                    {detail.enrouteAt && <div className="flex justify-between"><span className="text-faint">Enroute</span><span className="text-muted">{new Date(detail.enrouteAt).toLocaleString()}</span></div>}
                    {detail.onSiteAt && <div className="flex justify-between"><span className="text-faint">On site</span><span className="text-muted">{new Date(detail.onSiteAt).toLocaleString()}</span></div>}
                    {detail.completedAt && <div className="flex justify-between"><span className="text-faint">Completed</span><span className="text-muted">{new Date(detail.completedAt).toLocaleString()}</span></div>}
                    {detail.onSiteAt && detail.completedAt && (
                      <div className="flex justify-between border-t border-white/5 pt-1">
                        <span className="text-faint">Time on site</span>
                        <span className="font-semibold text-accent">{Math.max(0, Math.round((new Date(detail.completedAt).getTime() - new Date(detail.onSiteAt).getTime()) / 60000))} min</span>
                      </div>
                    )}
                  </div>
                )}
                {detail.preFlight && detail.preFlight.length > 0 && <Checklist title="Pre-flight" items={detail.preFlight} />}
                {detail.inspection && detail.inspection.length > 0 && <Checklist title="Inspection" items={detail.inspection} />}
              </div>
            </div>
          )}

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

          {/* record footer */}
          <div className="mt-6 flex flex-col gap-1 border-t border-white/5 pt-3">
            <MetaRow label="Job ID" value={<span className="font-mono text-[0.62rem]">{job.id}</span>} />
            {detail?.units && detail.units.length > 0 && <MetaRow label="Units" value={detail.units.length} />}
            {detail?.parentJobId && <MetaRow label="Parent job" value={<span className="font-mono text-[0.62rem]">{detail.parentJobId}</span>} />}
            {detail?.createdAt && <MetaRow label="Created" value={new Date(detail.createdAt).toLocaleString()} />}
            {detail?.updatedAt && <MetaRow label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />}
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

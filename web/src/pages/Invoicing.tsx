import { useMemo, useState } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import type { Job } from '../data/jobs';

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[0.55rem] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-[0.66rem] text-faint">{sub}</div>}
    </div>
  );
}

const INV_META: Record<string, { label: string; color: string }> = {
  none: { label: 'Not invoiced', color: '#8da3c7' },
  invoiced: { label: 'Invoiced', color: '#f0a23c' },
  paid: { label: 'Paid', color: '#34d39a' },
};

export default function Invoicing() {
  const { jobs, loading, updateJob, select } = useJobsCtx();
  const [busy, setBusy] = useState<string | null>(null);

  const billable = useMemo(
    () =>
      jobs
        .filter((j) => (j.contractAmount ?? 0) > 0 || j.status === 'Completed' || j.invoiceStatus)
        .sort((a, b) => (a.invoiceStatus || 'none').localeCompare(b.invoiceStatus || 'none')),
    [jobs],
  );

  const totals = useMemo(() => {
    let contracted = 0, readyAmt = 0, readyN = 0, arAmt = 0, arN = 0, paid = 0;
    for (const j of jobs) {
      const amt = j.contractAmount ?? 0;
      contracted += amt;
      const inv = j.invoiceStatus ?? 'none';
      if (inv === 'paid') paid += amt;
      else if (inv === 'invoiced') { arAmt += amt; arN++; }
      else if (j.status === 'Completed') { readyAmt += amt; readyN++; }
    }
    return { contracted, readyAmt, readyN, arAmt, arN, paid };
  }, [jobs]);

  async function setInvoice(j: Job, to: 'invoiced' | 'paid') {
    setBusy(j.id);
    const now = new Date().toISOString();
    try {
      await updateJob(j.id, to === 'invoiced'
        ? { invoiceStatus: 'invoiced', invoicedAt: now }
        : { invoiceStatus: 'paid', paidAt: now });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">
        Invoicing &amp; AR
      </h1>
      <p className="mt-1.5 text-sm text-muted">Bill completed jobs and track receivables.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total contracted" value={usd(totals.contracted)} color="#29c3ec" />
        <Tile label="Ready to invoice" value={usd(totals.readyAmt)} sub={`${totals.readyN} completed`} color="#f0a23c" />
        <Tile label="Outstanding AR" value={usd(totals.arAmt)} sub={`${totals.arN} invoiced, unpaid`} color="#fb7185" />
        <Tile label="Collected" value={usd(totals.paid)} color="#34d39a" />
      </div>

      <div className="glass mt-5 overflow-hidden rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-glass text-[0.62rem] uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-3 font-semibold">Work order</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Invoice</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {loading && jobs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            ) : billable.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No billable jobs yet. Add a contract amount on a job to start.</td></tr>
            ) : billable.map((j) => {
              const inv = j.invoiceStatus ?? 'none';
              const meta = INV_META[inv];
              const age = inv === 'invoiced' ? daysSince(j.invoicedAt) : j.status === 'Completed' ? daysSince(j.completedAt) : null;
              return (
                <tr key={j.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <button onClick={() => select(j.id)} className="font-semibold text-accent hover:underline">{j.workOrder}</button>
                    <div className="text-[0.66rem] text-faint">{j.name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{j.customer}</td>
                  <td className="px-4 py-3 font-semibold text-text">{j.contractAmount ? usd(j.contractAmount) : <span className="text-faint">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {age !== null ? <span className={age > 30 && inv === 'invoiced' ? 'font-semibold text-[#fb7185]' : ''}>{age}d</span> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv === 'none' && j.status === 'Completed' && (j.contractAmount ?? 0) > 0 && (
                      <button disabled={busy === j.id} onClick={() => setInvoice(j, 'invoiced')}
                        className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Invoice</button>
                    )}
                    {inv === 'invoiced' && (
                      <button disabled={busy === j.id} onClick={() => setInvoice(j, 'paid')}
                        className="rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-xs font-semibold text-completed hover:bg-white/10 disabled:opacity-50">Mark paid</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { useJobsCtx } from '../data/JobsContext';
import { STATUS_META } from '../domain/status';

interface Quote { quoteId: string; quoteNumber: string; jobName?: string; customerName?: string; customerCompany?: string; totalToInvoice?: number; createdAt?: string }

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface Customer {
  customerId?: string;
  id?: string;
  name?: string;
  customerName?: string;
  company?: string;
  customerCompany?: string;
  phone?: string;
  customerPhone?: string;
  email?: string;
  address?: string;
}

function field(c: Customer, ...keys: (keyof Customer)[]) {
  for (const k of keys) if (c[k]) return String(c[k]);
  return '';
}

export default function Customers() {
  const { jobs, select } = useJobsCtx();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Customer | null>(null);

  const activeJobs = useMemo(() => {
    if (!active) return [];
    const names = [field(active, 'name', 'customerName'), field(active, 'company', 'customerCompany')]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    return jobs.filter((j) => names.includes((j.customer || '').toLowerCase()));
  }, [active, jobs]);
  const activeValue = activeJobs.reduce((sum, j) => sum + (j.contractAmount ?? 0), 0);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const activeQuotes = useMemo(() => {
    if (!active) return [];
    const names = [field(active, 'name', 'customerName'), field(active, 'company', 'customerCompany')]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    return quotes
      .filter((qt) => names.includes((qt.customerCompany || '').toLowerCase()) || names.includes((qt.customerName || '').toLowerCase()))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [active, quotes]);

  useEffect(() => {
    apiGet<Customer[]>('/customers')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load customers'));
    apiGet<Quote[]>('/quotes').then((r) => setQuotes(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.toLowerCase();
    if (!s) return rows;
    return rows.filter((c) =>
      [field(c, 'name', 'customerName'), field(c, 'company', 'customerCompany'), field(c, 'phone', 'customerPhone'), field(c, 'email'), field(c, 'address')]
        .join(' ')
        .toLowerCase()
        .includes(s),
    );
  }, [rows, q]);

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module</div>
          <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Customer Database</h1>
          <p className="mt-1.5 text-sm text-muted">{rows ? `${rows.length} customers` : 'Loading…'}</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
          className="w-56 rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
      </div>

      {error ? (
        <div className="glass rounded-2xl p-6 text-center text-sm text-[#f4607a]">{error}</div>
      ) : rows === null ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.8rem]">
              <thead>
                <tr className="text-[0.58rem] uppercase tracking-wider text-faint">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Address</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No customers found.</td></tr>
                ) : (
                  filtered.map((c, i) => (
                    <tr key={c.customerId || c.id || i} onClick={() => setActive(c)} className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.03]">
                      <td className="px-4 py-3 font-medium text-text">{field(c, 'name', 'customerName') || '—'}</td>
                      <td className="px-4 py-3 text-muted">{field(c, 'company', 'customerCompany') || '—'}</td>
                      <td className="px-4 py-3 text-muted">{field(c, 'phone', 'customerPhone') || '—'}</td>
                      <td className="px-4 py-3 text-muted">{field(c, 'address') || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setActive(null)} />
          <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-glass bg-[#0b1322]/95 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div>
                <div className="text-base font-semibold text-text">{field(active, 'name', 'customerName') || field(active, 'company', 'customerCompany') || 'Customer'}</div>
                {field(active, 'company', 'customerCompany') && field(active, 'name', 'customerName') && (
                  <div className="text-xs text-muted">{field(active, 'company', 'customerCompany')}</div>
                )}
              </div>
              <button onClick={() => setActive(null)} className="rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-text">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-1.5 text-sm">
                {field(active, 'phone', 'customerPhone') && <a href={`tel:${field(active, 'phone', 'customerPhone')}`} className="text-accent hover:underline">{field(active, 'phone', 'customerPhone')}</a>}
                {field(active, 'email') && <a href={`mailto:${field(active, 'email')}`} className="text-accent hover:underline">{field(active, 'email')}</a>}
                {field(active, 'address') && <div className="text-muted">{field(active, 'address')}</div>}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="glass rounded-xl p-3">
                  <div className="text-[0.58rem] uppercase tracking-wide text-faint">Lifetime value</div>
                  <div className="mt-0.5 text-lg font-bold text-accent">{usd(activeValue)}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-[0.58rem] uppercase tracking-wide text-faint">Jobs</div>
                  <div className="mt-0.5 text-lg font-bold text-text">{activeJobs.length}</div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Job history</div>
                {activeJobs.length === 0 ? (
                  <div className="text-xs text-faint">No jobs linked to this customer yet.</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {activeJobs.map((j) => {
                      const meta = STATUS_META[j.status];
                      return (
                        <button key={j.id} onClick={() => { setActive(null); select(j.id); }}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left hover:bg-white/5">
                          <span className="truncate">
                            <span className="text-xs font-semibold text-accent">{j.workOrder}</span>{' '}
                            <span className="text-xs text-muted">{j.name}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {j.contractAmount ? <span className="text-[0.66rem] text-text">{usd(j.contractAmount)}</span> : null}
                            <span className="text-[0.6rem]" style={{ color: meta.color }}>{meta.short}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Quote history</div>
                {activeQuotes.length === 0 ? (
                  <div className="text-xs text-faint">No quotes for this customer yet.</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {activeQuotes.map((qt) => (
                      <Link
                        key={qt.quoteId}
                        to={`/estimator?quote=${qt.quoteId}`}
                        onClick={() => setActive(null)}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/5"
                      >
                        <span className="truncate">
                          <span className="text-xs font-semibold text-accent">{qt.quoteNumber}</span>{' '}
                          <span className="text-xs text-muted">{qt.jobName || 'Untitled'}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[0.66rem] text-text">{usd(qt.totalToInvoice || 0)}</span>
                          <span className="text-[0.6rem] text-accent">open →</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';
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
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ name: '', company: '', phone: '', email: '', address: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const activeNames = useMemo(() => {
    if (!active) return [] as string[];
    return [field(active, 'name', 'customerName'), field(active, 'company', 'customerCompany')]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, [active]);

  const activeJobs = useMemo(() => {
    if (!active) return [];
    return jobs.filter((j) => activeNames.includes((j.customer || '').trim().toLowerCase()));
  }, [active, jobs, activeNames]);
  const activeValue = activeJobs.reduce((sum, j) => sum + (j.contractAmount ?? 0), 0);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const activeQuotes = useMemo(() => {
    if (!active) return [];
    return quotes
      .filter((qt) =>
        activeNames.includes((qt.customerCompany || '').trim().toLowerCase()) ||
        activeNames.includes((qt.customerName || '').trim().toLowerCase()))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [active, quotes, activeNames]);

  const loadCustomers = () => apiGet<Customer[]>('/customers')
    .then((r) => setRows(Array.isArray(r) ? r : []))
    .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load customers'));
  useEffect(() => {
    loadCustomers();
    apiGet<Quote[]>('/quotes').then((r) => setQuotes(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ name: '', company: '', phone: '', email: '', address: '' });
  const [savingNc, setSavingNc] = useState(false);
  async function createCustomer() {
    if (!nc.name.trim() && !nc.company.trim()) return;
    setSavingNc(true);
    try {
      await apiSend('POST', '/customers', {
        name: nc.name.trim(), customerName: nc.name.trim(),
        company: nc.company.trim() || undefined, customerCompany: nc.company.trim() || undefined,
        phone: nc.phone.trim() || undefined, customerPhone: nc.phone.trim() || undefined,
        email: nc.email.trim() || undefined,
        address: nc.address.trim() || undefined,
        source: 'Manual',
      });
      setNc({ name: '', company: '', phone: '', email: '', address: '' });
      setCreating(false);
      await loadCustomers();
    } finally {
      setSavingNc(false);
    }
  }

  const custId = (c: Customer) => c.customerId || c.id || '';

  function startEdit() {
    if (!active) return;
    setEf({
      name: field(active, 'name', 'customerName'),
      company: field(active, 'company', 'customerCompany'),
      phone: field(active, 'phone', 'customerPhone'),
      email: field(active, 'email'),
      address: field(active, 'address'),
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!active) return;
    const id = custId(active);
    if (!id) return;
    setSavingEdit(true);
    try {
      // Full-overwrite PUT — start from the existing record so other fields
      // (source, status, notes, added) survive, then apply the edits.
      const payload: Record<string, unknown> = { ...active };
      delete payload.PK; delete payload.SK; delete payload.GSI1PK; delete payload.GSI1SK;
      payload.name = ef.name.trim(); payload.customerName = ef.name.trim();
      payload.company = ef.company.trim() || undefined; payload.customerCompany = ef.company.trim() || undefined;
      payload.phone = ef.phone.trim() || undefined; payload.customerPhone = ef.phone.trim() || undefined;
      payload.email = ef.email.trim() || undefined;
      payload.address = ef.address.trim() || undefined;
      await apiSend('PUT', `/customers/${id}`, payload);
      await loadCustomers();
      setEditing(false);
      setActive(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteCustomer() {
    if (!active) return;
    const id = custId(active);
    if (!id) return;
    const label = field(active, 'name', 'customerName') || field(active, 'company', 'customerCompany') || 'this customer';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await apiSend('DELETE', `/customers/${id}`).catch(() => {});
    await loadCustomers();
    setEditing(false);
    setActive(null);
  }

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
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
            className="w-56 rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
          <button onClick={() => setCreating(true)} className="shrink-0 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-sm font-semibold text-white">+ New customer</button>
        </div>
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
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Address</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No customers found.</td></tr>
                ) : (
                  filtered.map((c, i) => (
                    <tr key={c.customerId || c.id || i} onClick={() => { setEditing(false); setActive(c); }} className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.03]">
                      <td className="px-4 py-3 font-medium text-text">{field(c, 'name', 'customerName') || '—'}</td>
                      <td className="px-4 py-3 text-muted">{field(c, 'company', 'customerCompany') || '—'}</td>
                      <td className="px-4 py-3 text-muted">{field(c, 'phone', 'customerPhone') || '—'}</td>
                      <td className="px-4 py-3 text-muted">{field(c, 'email') || '—'}</td>
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
              <div className="flex items-center gap-1">
                {!editing && <button onClick={startEdit} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-accent hover:bg-white/5">Edit</button>}
                {!editing && <button onClick={deleteCustomer} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:text-[#fb7185]">Delete</button>}
                <button onClick={() => { setEditing(false); setActive(null); }} className="rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-text">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {editing ? (
                <div className="flex flex-col gap-2">
                  {([['name', 'Name'], ['company', 'Company'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']] as const).map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">{label}</span>
                      <input value={ef[k]} type={k === 'email' ? 'email' : 'text'} onChange={(e) => setEf((s) => ({ ...s, [k]: e.target.value }))}
                        className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
                    </label>
                  ))}
                  <div className="mt-1 flex items-center gap-2">
                    <button onClick={saveEdit} disabled={savingEdit || (!ef.name.trim() && !ef.company.trim())} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{savingEdit ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => setEditing(false)} className="rounded-lg border border-glass bg-white/5 px-4 py-2 text-sm font-semibold text-muted hover:bg-white/10">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 text-sm">
                  {field(active, 'phone', 'customerPhone') && <a href={`tel:${field(active, 'phone', 'customerPhone')}`} className="text-accent hover:underline">{field(active, 'phone', 'customerPhone')}</a>}
                  {field(active, 'email') && <a href={`mailto:${field(active, 'email')}`} className="text-accent hover:underline">{field(active, 'email')}</a>}
                  {field(active, 'address') && <div className="text-muted">{field(active, 'address')}</div>}
                </div>
              )}

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

      {creating && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setCreating(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-glass bg-[#0b1322]/95 p-5 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold text-text">New customer</div>
              <button onClick={() => setCreating(false)} className="rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-text">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              {([['name', 'Name'], ['company', 'Company'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']] as const).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{label}</span>
                  <input value={nc[k]} type={k === 'email' ? 'email' : 'text'} onChange={(e) => setNc((s) => ({ ...s, [k]: e.target.value }))}
                    className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
                </label>
              ))}
              <button onClick={createCustomer} disabled={savingNc || (!nc.name.trim() && !nc.company.trim())}
                className="mt-1 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
                {savingNc ? 'Saving…' : 'Add customer'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

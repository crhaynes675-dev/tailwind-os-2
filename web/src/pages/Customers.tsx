import { useState, useEffect, useMemo } from 'react';
import { apiGet } from '../lib/api';

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
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiGet<Customer[]>('/customers')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load customers'));
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
                    <tr key={c.customerId || c.id || i} className="border-t border-white/5 transition hover:bg-white/[0.03]">
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
    </>
  );
}

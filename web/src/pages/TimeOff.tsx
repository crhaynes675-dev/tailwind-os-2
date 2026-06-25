import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../lib/api';

interface Vacation {
  vacationId: string;
  techId: string;
  techName?: string;
  startDate: string;
  endDate: string;
  type: string;
  notes?: string;
}
interface ApiUser { username: string; givenName?: string; familyName?: string; role?: string }

const TYPES = ['vacation', 'pto', 'sick', 'unavailable'];
const TYPE_COLOR: Record<string, string> = { vacation: '#29c3ec', pto: '#7c6cff', sick: '#f0a23c', unavailable: '#fb7185' };
const TECH_ROLES = ['service_technician', 'work_coordinator', 'project_manager'];

export default function TimeOff() {
  const [rows, setRows] = useState<Vacation[] | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [form, setForm] = useState({ techId: '', startDate: '', endDate: '', type: 'vacation', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => apiGet<Vacation[]>('/vacations').then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  useEffect(() => {
    load();
    apiGet<ApiUser[]>('/users').then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {});
  }, []);

  const techs = users.filter((u) => !u.role || TECH_ROLES.includes(u.role));
  const techName = (id: string) => {
    const u = users.find((x) => x.username === id);
    return u ? `${u.givenName || ''} ${u.familyName || ''}`.trim() || id : id;
  };

  async function add() {
    if (!form.techId || !form.startDate) return;
    setSaving(true);
    try {
      await apiSend('POST', '/vacations', {
        techId: form.techId,
        techName: techName(form.techId),
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        type: form.type,
        notes: form.notes,
      });
      setForm({ techId: '', startDate: '', endDate: '', type: 'vacation', notes: '' });
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    await apiSend('DELETE', `/vacations/${id}`).catch(() => {});
    await load();
  }

  const sorted = (rows || []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Scheduling</div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Crew Time-Off</h1>
      <p className="mt-1.5 text-sm text-muted">Vacation, PTO, and unavailability so scheduling sees who's out.</p>

      {/* add block */}
      <div className="glass mt-5 rounded-2xl p-4">
        <div className="mb-3 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Add time off</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select value={form.techId} onChange={(e) => setForm((f) => ({ ...f, techId: e.target.value }))}
            className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent">
            <option value="">Select crew…</option>
            {techs.map((u) => <option key={u.username} value={u.username}>{`${u.givenName || ''} ${u.familyName || ''}`.trim() || u.username}</option>)}
          </select>
          <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent [color-scheme:dark]" />
          <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent [color-scheme:dark]" />
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm capitalize text-text outline-none focus:border-accent">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={add} disabled={!form.techId || !form.startDate || saving}
            className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* list */}
      <div className="glass mt-5 overflow-hidden rounded-2xl">
        {rows === null ? (
          <div className="py-16 text-center text-sm text-muted">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted">No time-off scheduled.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-glass text-[0.62rem] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-3 font-semibold">Crew</th>
                <th className="px-4 py-3 font-semibold">Dates</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => {
                const out = v.startDate <= todayStr && v.endDate >= todayStr;
                return (
                  <tr key={v.vacationId} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-text">
                      {v.techName || techName(v.techId)}
                      {out && <span className="ml-2 rounded-full bg-[#fb7185]/15 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase text-[#fb7185]">Out now</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{v.startDate}{v.endDate && v.endDate !== v.startDate ? ` → ${v.endDate}` : ''}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold capitalize" style={{ color: TYPE_COLOR[v.type] || '#8da3c7', background: `${TYPE_COLOR[v.type] || '#8da3c7'}1a` }}>{v.type}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{v.notes || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove(v.vacationId)} className="rounded-lg border border-glass bg-white/5 px-2.5 py-1 text-xs font-semibold text-muted hover:border-[#fb7185] hover:text-[#fb7185]">Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

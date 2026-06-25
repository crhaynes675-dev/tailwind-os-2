import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface User {
  username: string;
  email: string;
  givenName?: string;
  familyName?: string;
  role: string;
  status?: string;
  enabled?: boolean;
}

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'work_coordinator', label: 'Work Coordinator' },
  { value: 'sales', label: 'Sales' },
  { value: 'service_technician', label: 'Service Technician' },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label || r.replace(/_/g, ' ');
const roleColor: Record<string, string> = {
  admin: '#29c3ec', super_admin: '#29c3ec', project_manager: '#7c6cff', work_coordinator: '#26c6da',
  sales: '#d4851f', service_technician: '#34d39a',
};

export default function UserManagement() {
  const { user } = useAuth();
  const shortName = (un: string) => (user?.tenantId && un.startsWith(user.tenantId + '.') ? un.slice(user.tenantId.length + 1) : un);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [rows, setRows] = useState<User[] | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({ givenName: '', familyName: '', username: '', email: '', role: 'service_technician', password: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<User[]>('/users').then((u) => setRows(Array.isArray(u) ? u : [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  async function createUser() {
    if (!form.givenName || !form.familyName || !form.username || !form.email || !form.password) {
      setToast({ kind: 'err', text: 'All fields are required.' });
      return;
    }
    setBusy(true);
    try {
      await apiSend('POST', '/users', form);
      setToast({ kind: 'ok', text: `User “${form.username}” created.` });
      setForm({ givenName: '', familyName: '', username: '', email: '', role: 'service_technician', password: '' });
      load();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Create failed' });
    } finally { setBusy(false); }
  }

  async function changeRole(u: User, role: string) {
    setRows((r) => r?.map((x) => (x.username === u.username ? { ...x, role } : x)) ?? r);
    try { await apiSend('PUT', `/users/${u.username}`, { role }); setToast({ kind: 'ok', text: `${u.username} → ${roleLabel(role)}` }); }
    catch (e) { setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Update failed' }); load(); }
  }

  async function resetPassword(u: User) {
    const pw = window.prompt(`New password for ${u.username}:`);
    if (!pw) return;
    try { await apiSend('PUT', `/users/${u.username}/password`, { password: pw }); setToast({ kind: 'ok', text: `Password reset for ${u.username}.` }); }
    catch (e) { setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Reset failed' }); }
  }

  async function removeUser(u: User) {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try { await apiSend('DELETE', `/users/${u.username}`); setToast({ kind: 'ok', text: `Deleted ${u.username}.` }); load(); }
    catch (e) { setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Delete failed' }); }
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div>
          <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Admin</div>
          <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">User Management</h1>
          <p className="mt-1.5 text-sm text-muted">Create users, assign roles, reset passwords.</p>
        </div>
      </div>

      {!isAdmin ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center">
          <div>
            <div className="text-2xl">🔒</div>
            <div className="mt-2 text-sm font-semibold text-text">Admin access required</div>
            <div className="mt-1 text-xs text-muted">Your role ({roleLabel(user?.role || '')}) can’t manage users.</div>
          </div>
        </div>
      ) : (
        <>
          {/* Create user */}
          <section className="glass mb-5 rounded-2xl p-5">
            <div className="mb-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Create user</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[['First name', 'givenName'], ['Last name', 'familyName'], ['Username', 'username'], ['Email', 'email'], ['Temp password', 'password']].map(([label, key]) => (
                <div key={key}>
                  <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">{label}</label>
                  <input
                    type={key === 'password' ? 'text' : key === 'email' ? 'email' : 'text'}
                    value={(form as never)[key]}
                    onChange={(e) => set(key as keyof typeof form)(e.target.value)}
                    className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Role</label>
                <select value={form.role} onChange={(e) => set('role')(e.target.value)} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent">
                  {ROLES.map((r) => <option key={r.value} value={r.value} className="bg-[#0f1730]">{r.label}</option>)}
                </select>
              </div>
            </div>
            <button onClick={createUser} disabled={busy} className="mt-4 rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:brightness-105 disabled:opacity-50">
              {busy ? 'Creating…' : '+ Create user'}
            </button>
          </section>

          {/* Users table */}
          <section className="glass overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.8rem]">
                <thead>
                  <tr className="text-[0.56rem] uppercase tracking-wider text-faint">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Username</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows === null ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No users.</td></tr>
                  ) : rows.map((u) => {
                    const self = u.username === user?.username;
                    const c = roleColor[u.role] || '#8da3c7';
                    const locked = u.role === 'super_admin';
                    return (
                      <tr key={u.username} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-text">{`${u.givenName || ''} ${u.familyName || ''}`.trim() || '—'}{self && <span className="ml-2 rounded border border-white/10 px-1.5 py-px text-[0.5rem] uppercase text-faint">you</span>}</td>
                        <td className="px-4 py-3 text-muted">{shortName(u.username)}</td>
                        <td className="px-4 py-3 text-muted">{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          {locked ? (
                            <span className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold" style={{ color: c, background: `${c}1a` }}>Super Admin</span>
                          ) : (
                            <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} className="rounded-md border border-glass bg-white/[0.04] px-2 py-1 text-[0.72rem] outline-none focus:border-accent" style={{ color: c }}>
                              {ROLES.map((r) => <option key={r.value} value={r.value} className="bg-[#0f1730] text-text">{r.label}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[0.72rem] text-muted">{u.status === 'CONFIRMED' ? 'Active' : (u.status || '—')}{u.enabled === false ? ' · disabled' : ''}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => resetPassword(u)} className="rounded-md border border-glass bg-white/5 px-2.5 py-1 text-[0.62rem] font-semibold text-muted transition hover:text-accent">Reset PW</button>
                            <button onClick={() => removeUser(u)} disabled={self || locked} className="rounded-md border border-[#f4607a]/30 bg-[#f4607a]/5 px-2.5 py-1 text-[0.62rem] font-semibold text-[#f4607a] transition enabled:hover:bg-[#f4607a]/15 disabled:opacity-30">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className={`glass rounded-full px-5 py-2.5 text-sm ${toast.kind === 'err' ? 'text-[#f4607a]' : 'text-text'}`}>{toast.text}</div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

const INDUSTRIES = ['millwork', 'hvac', 'electrical', 'plumbing', 'roofing', 'painting', 'flooring', 'tile', 'countertops', 'general_contracting', 'framing', 'concrete', 'landscaping', 'property_management', 'inspection', 'other'];

interface TenantConfig {
  tenantId?: string;
  companyName?: string;
  industry?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminEmail?: string;
  adminPhone?: string;
  adminUsername?: string;
  plan?: string;
  status?: string;
  trialEndsAt?: string;
  createdAt?: string;
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
      <span className="text-[0.62rem] uppercase tracking-wide text-faint">{label}</span>
      <span className="text-sm text-text">{value || '—'}</span>
    </div>
  );
}

export default function Company() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<TenantConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ companyName: '', industry: 'millwork', adminFirstName: '', adminLastName: '', adminEmail: '', adminPhone: '' });
  const [saving, setSaving] = useState(false);

  const load = () => apiGet<TenantConfig>('/tenants/me').then(setCfg).catch(() => {}).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  const code = cfg?.tenantId || user?.tenantId || '—';
  const isAdmin = user?.role === 'admin';
  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  function startEdit() {
    setEf({
      companyName: cfg?.companyName || '',
      industry: cfg?.industry || 'millwork',
      adminFirstName: cfg?.adminFirstName || '',
      adminLastName: cfg?.adminLastName || '',
      adminEmail: cfg?.adminEmail || '',
      adminPhone: cfg?.adminPhone || '',
    });
    setEditing(true);
  }
  async function saveEdit() {
    setSaving(true);
    try {
      await apiSend('PUT', '/tenants/me', {
        companyName: ef.companyName.trim(),
        industry: ef.industry,
        adminFirstName: ef.adminFirstName.trim(),
        adminLastName: ef.adminLastName.trim(),
        adminEmail: ef.adminEmail.trim(),
        adminPhone: ef.adminPhone.trim(),
      });
      await load();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Admin</div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Company</h1>
      <p className="mt-1.5 text-sm text-muted">Your company code and account details.</p>

      {/* code */}
      <div className="glass mt-5 rounded-2xl p-5">
        <div className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-accent">Company code</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="select-all font-mono text-2xl font-bold text-text">{code}</span>
          <button onClick={copy} className="rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-white/10">
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-[0.72rem] text-muted">Share this with your team — everyone signs in with this code plus their own username and password.</p>
      </div>

      {/* profile */}
      <div className="glass mt-4 rounded-2xl p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-faint">Company profile</span>
          {isAdmin && cfg && !editing && (
            <button onClick={startEdit} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-accent hover:bg-white/5">Edit</button>
          )}
        </div>

        {!loaded ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : editing ? (
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Company name</span>
              <input value={ef.companyName} onChange={(e) => setEf((s) => ({ ...s, companyName: e.target.value }))}
                className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Industry</span>
              <select value={ef.industry} onChange={(e) => setEf((s) => ({ ...s, industry: e.target.value }))}
                className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm capitalize text-text outline-none focus:border-accent">
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Contact first name</span>
                <input value={ef.adminFirstName} onChange={(e) => setEf((s) => ({ ...s, adminFirstName: e.target.value }))} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Contact last name</span>
                <input value={ef.adminLastName} onChange={(e) => setEf((s) => ({ ...s, adminLastName: e.target.value }))} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Contact email</span>
              <input type="email" value={ef.adminEmail} onChange={(e) => setEf((s) => ({ ...s, adminEmail: e.target.value }))} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Contact phone</span>
              <input type="tel" value={ef.adminPhone} onChange={(e) => setEf((s) => ({ ...s, adminPhone: e.target.value }))} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button onClick={saveEdit} disabled={saving || !ef.companyName.trim()} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(false)} className="rounded-lg border border-glass bg-white/5 px-4 py-2 text-sm font-semibold text-muted hover:bg-white/10">Cancel</button>
            </div>
          </div>
        ) : cfg ? (
          <div>
            <Row label="Company name" value={cfg.companyName} />
            <Row label="Industry" value={cfg.industry?.replace(/_/g, ' ')} />
            <Row label="Plan" value={cfg.plan} />
            <Row label="Status" value={cfg.status} />
            <Row label="Trial ends" value={cfg.trialEndsAt ? new Date(cfg.trialEndsAt).toLocaleDateString() : undefined} />
            <Row label="Contact name" value={[cfg.adminFirstName, cfg.adminLastName].filter(Boolean).join(' ')} />
            <Row label="Contact email" value={cfg.adminEmail} />
            <Row label="Contact phone" value={cfg.adminPhone} />
            <Row label="Created" value={cfg.createdAt ? new Date(cfg.createdAt).toLocaleDateString() : undefined} />
          </div>
        ) : (
          <div className="text-[0.78rem] text-muted">A full profile isn't on file for this account yet (legacy company) — your company code is shown above.</div>
        )}
      </div>
    </div>
  );
}

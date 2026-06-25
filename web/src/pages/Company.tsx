import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface TenantConfig {
  tenantId?: string;
  companyName?: string;
  industry?: string;
  adminEmail?: string;
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

  useEffect(() => {
    apiGet<TenantConfig>('/tenants/me').then(setCfg).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const code = cfg?.tenantId || user?.tenantId || '—';
  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
        <div className="mb-2 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-faint">Company profile</div>
        {!loaded ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : cfg ? (
          <div>
            <Row label="Company name" value={cfg.companyName} />
            <Row label="Industry" value={cfg.industry?.replace(/_/g, ' ')} />
            <Row label="Plan" value={cfg.plan} />
            <Row label="Status" value={cfg.status} />
            <Row label="Trial ends" value={cfg.trialEndsAt ? new Date(cfg.trialEndsAt).toLocaleDateString() : undefined} />
            <Row label="Admin email" value={cfg.adminEmail} />
            <Row label="Created" value={cfg.createdAt ? new Date(cfg.createdAt).toLocaleDateString() : undefined} />
          </div>
        ) : (
          <div className="text-[0.78rem] text-muted">A full profile isn't on file for this account yet (legacy company) — your company code is shown above.</div>
        )}
      </div>
    </div>
  );
}

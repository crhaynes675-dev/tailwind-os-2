import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { signUpCompany } from '../lib/auth';

const INDUSTRIES = ['millwork', 'hvac', 'electrical', 'plumbing', 'roofing', 'painting', 'flooring', 'tile', 'countertops', 'general_contracting', 'framing', 'concrete', 'landscaping', 'property_management', 'inspection', 'other'];
const inputCls = 'w-full rounded-[7px] border border-[#1e2a3d] bg-[#0a0d12] px-3.5 py-2.5 text-sm text-[#dde5f0] outline-none transition-colors placeholder:text-[#475569] focus:border-[#1a8fff]';
const labelCls = 'text-xs font-medium text-[#7a8ba3]';

export default function Login() {
  const { signIn } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  // sign in
  const [companyCode, setCompanyCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // signup
  const [s, setS] = useState({ companyName: '', industry: 'millwork', adminFirstName: '', adminLastName: '', adminEmail: '', adminUsername: '', password: '' });
  const sset = (k: keyof typeof s) => (e: { target: { value: string } }) => setS((v) => ({ ...v, [k]: e.target.value }));
  const [sBusy, setSBusy] = useState(false);
  const [sError, setSError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ tenantId: string; companyName: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(username, password, companyCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setSError(null);
    setSBusy(true);
    try {
      const res = await signUpCompany(s);
      setCreated(res);
    } catch (err) {
      setSError(err instanceof Error ? err.message : 'Could not create company.');
    } finally {
      setSBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#0a0d12] px-5 py-10">
      <div className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="pointer-events-none fixed left-1/2 top-[-10%] z-0 h-[500px] w-[700px] -translate-x-1/2"
        style={{ background: 'radial-gradient(ellipse,rgba(26,143,255,0.07) 0%,transparent 65%)' }} />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-9 flex select-none flex-col items-center gap-2">
          <span className="text-[48px] font-bold leading-none tracking-[-1px] text-[#dde5f0]">Tailwind OS</span>
          <span className="text-[18px] font-semibold uppercase tracking-[3px] text-[#1a8fff]">Move Forward Faster</span>
        </div>

        <div className="mb-6 flex overflow-hidden rounded-[10px] border border-[#1e2a3d] bg-[#141924]">
          <button onClick={() => setTab('login')} className={`flex-1 py-2.5 text-[13px] font-semibold transition ${tab === 'login' ? 'bg-[#1a8fff] text-white' : 'text-[#7a8ba3]'}`}>Sign In</button>
          <button onClick={() => { setTab('signup'); setCreated(null); }} className={`flex-1 py-2.5 text-[13px] font-semibold transition ${tab === 'signup' ? 'bg-[#1a8fff] text-white' : 'text-[#7a8ba3]'}`}>Create Company</button>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#1e2a3d] bg-[#141924] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <div className="h-0.5" style={{ background: 'linear-gradient(90deg,transparent,#1a8fff,#00d4aa,transparent)' }} />

          {tab === 'login' ? (
            <form onSubmit={onSubmit} className="px-8 pb-7 pt-8">
              <div className="mb-6">
                <h2 className="text-[22px] font-bold text-[#dde5f0]">Welcome back</h2>
                <p className="mt-1.5 text-[13px] text-[#7a8ba3]">Sign in to your Tailwind OS account.</p>
              </div>

              <div className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Company code</label>
                  <input autoFocus value={companyCode} onChange={(e) => { setCompanyCode(e.target.value); setError(null); }}
                    placeholder="your-company-code" autoCapitalize="none" autoComplete="organization" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Username</label>
                  <input value={username} onChange={(e) => { setUsername(e.target.value); setError(null); }}
                    placeholder="Enter your username" autoComplete="username" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Password</label>
                  <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="••••••••" autoComplete="current-password" className={inputCls} />
                </div>
              </div>

              {error && <div className="mt-3.5 rounded-[7px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3.5 py-2.5 text-[13px] text-[#f87171]">{error}</div>}

              <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg bg-[#1a8fff] py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40">
                {busy ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>
          ) : created ? (
            <div className="px-8 pb-8 pt-8 text-center">
              <div className="text-[22px] font-bold text-[#dde5f0]">Company created 🎉</div>
              <p className="mt-2 text-[13px] text-[#7a8ba3]">{created.companyName} is ready. Save your company code — your whole team uses it to sign in:</p>
              <div className="mt-4 rounded-[10px] border border-[#1a8fff]/40 bg-[#0a0d12] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[2px] text-[#7a8ba3]">Company code</div>
                <div className="mt-1 select-all font-mono text-lg font-bold text-[#1a8fff]">{created.tenantId}</div>
              </div>
              <button
                onClick={() => { setCompanyCode(created.tenantId); setUsername(s.adminUsername); setTab('login'); setCreated(null); }}
                className="mt-5 w-full rounded-lg bg-[#1a8fff] py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Go to sign in →
              </button>
            </div>
          ) : (
            <form onSubmit={onSignup} className="px-8 pb-8 pt-8">
              <div className="mb-4">
                <h2 className="text-[22px] font-bold text-[#dde5f0]">Create your company</h2>
                <p className="mt-1.5 text-[13px] text-[#7a8ba3]">Get a company code and an admin login. 30-day trial.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Company name</label>
                  <input value={s.companyName} onChange={sset('companyName')} placeholder="Acme Millwork" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Industry</label>
                  <select value={s.industry} onChange={sset('industry')} className={inputCls}>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5"><label className={labelCls}>First name</label><input value={s.adminFirstName} onChange={sset('adminFirstName')} className={inputCls} /></div>
                  <div className="flex flex-col gap-1.5"><label className={labelCls}>Last name</label><input value={s.adminLastName} onChange={sset('adminLastName')} className={inputCls} /></div>
                </div>
                <div className="flex flex-col gap-1.5"><label className={labelCls}>Admin email</label><input type="email" value={s.adminEmail} onChange={sset('adminEmail')} placeholder="you@company.com" className={inputCls} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5"><label className={labelCls}>Admin username</label><input value={s.adminUsername} onChange={sset('adminUsername')} placeholder="admin" autoCapitalize="none" className={inputCls} /></div>
                  <div className="flex flex-col gap-1.5"><label className={labelCls}>Password</label><input type="password" value={s.password} onChange={sset('password')} placeholder="••••••••" className={inputCls} /></div>
                </div>
              </div>

              {sError && <div className="mt-3.5 rounded-[7px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3.5 py-2.5 text-[13px] text-[#f87171]">{sError}</div>}

              <button type="submit" disabled={sBusy || !s.companyName.trim() || !s.adminUsername.trim() || !s.password || !s.adminEmail.trim()}
                className="mt-5 w-full rounded-lg bg-[#1a8fff] py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40">
                {sBusy ? 'Creating…' : 'Create company →'}
              </button>
              <button type="button" onClick={() => setTab('login')} className="mt-3 w-full text-center text-[13px] font-semibold text-[#7a8ba3] hover:text-[#dde5f0]">← Back to sign in</button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[#334155]">Tailwind OS · Move Forward Faster</p>
      </div>
    </div>
  );
}

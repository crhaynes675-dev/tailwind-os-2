import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0d12] px-5 py-10">
      {/* grid + glows (legacy login look) */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-[-10%] z-0 h-[500px] w-[700px] -translate-x-1/2"
        style={{ background: 'radial-gradient(ellipse,rgba(26,143,255,0.10) 0%,transparent 65%)' }} />
      <div className="pointer-events-none absolute bottom-[5%] right-[10%] z-0 h-[300px] w-[400px]"
        style={{ background: 'radial-gradient(ellipse,rgba(0,212,170,0.06) 0%,transparent 65%)' }} />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* brand logo */}
        <div className="mb-8 flex justify-center">
          <div className="rounded-2xl bg-white px-7 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <img src="/logo.png" alt="Tailwind OS" className="h-24 w-auto" />
          </div>
        </div>

        {/* card */}
        <div className="overflow-hidden rounded-[14px] border border-[#1e2a3d] bg-[#141924] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <div className="h-0.5" style={{ background: 'linear-gradient(90deg,transparent,#1a8fff,#00d4aa,transparent)' }} />
          <form onSubmit={onSubmit} className="px-8 pb-7 pt-8">
            <div className="mb-6">
              <h2 className="text-[22px] font-bold text-[#dde5f0]">Welcome back</h2>
              <p className="mt-1.5 text-[13px] text-[#7a8ba3]">Sign in to continue to Tailwind OS</p>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#7a8ba3]">Username</label>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-[7px] border border-[#1e2a3d] bg-[#0a0d12] px-3.5 py-2.5 text-sm text-[#dde5f0] outline-none transition-colors focus:border-[#1a8fff]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#7a8ba3]">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[7px] border border-[#1e2a3d] bg-[#0a0d12] px-3.5 py-2.5 text-sm text-[#dde5f0] outline-none transition-colors focus:border-[#1a8fff]"
                />
              </div>
            </div>

            {error && (
              <div className="mt-3.5 rounded-[7px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3.5 py-2.5 text-[13px] text-[#f87171]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-[#1a8fff] py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </button>

            <div className="mt-4 text-center text-xs text-[#475569]">Move Forward Faster</div>
          </form>
        </div>
      </div>
    </div>
  );
}

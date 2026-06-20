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
    <div className="grid min-h-full place-items-center px-4">
      <form onSubmit={onSubmit} className="glass w-full max-w-sm rounded-2xl p-7">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] text-base font-bold text-[#04121a]">
            T
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">Tailwind OS3</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Field Operations</div>
          </div>
        </div>

        <label className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Username</label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3.5 w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />

        <label className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />

        {error && (
          <div className="mb-4 rounded-lg border border-[#f4607a]/30 bg-[#f4607a]/10 px-3 py-2 text-[0.72rem] text-[#f4607a]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_22px_-8px_rgba(41,195,236,0.55)] transition hover:brightness-105 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

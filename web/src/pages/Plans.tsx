import { useState } from 'react';
import { PLANS, PLAN_BY_ID, planRank } from '../domain/plans';
import { usePlan } from '../data/PlanContext';
import { useAuth } from '../auth/AuthContext';
import { apiSend } from '../lib/api';

export default function Plans() {
  const { plan, rawPlan, refresh } = usePlan();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function choose(id: string) {
    if (!isAdmin) return;
    setBusy(id);
    setMsg(null);
    try {
      await apiSend('PUT', '/tenants/me', { plan: id });
      refresh();
      setMsg(`You're now on ${PLAN_BY_ID[id as keyof typeof PLAN_BY_ID].name}.`);
    } catch {
      setMsg('Could not change plan.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Admin</div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Plans &amp; Billing</h1>
      <p className="mt-1.5 text-sm text-muted">
        {rawPlan === 'trial'
          ? "You're on a 30-day Pro trial."
          : `Current plan: ${PLAN_BY_ID[plan].name}.`}
      </p>

      <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#f0a23c]/30 bg-[#f0a23c]/10 px-3 py-1.5 text-[0.72rem] text-[#f0a23c]">
        Billing isn't connected yet — during setup, switching plans is instant and free.
      </div>
      {msg && <div className="mt-2 text-xs font-semibold text-completed">{msg}</div>}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === plan;
          const isDown = planRank(p.id) < planRank(plan);
          return (
            <div key={p.id} className={`glass rounded-2xl p-5 ${current ? 'ring-2 ring-[rgba(41,195,236,0.5)]' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-text">{p.name}</div>
                {current && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.58rem] font-semibold uppercase text-accent">Current</span>}
              </div>
              <div className="mt-1 text-2xl font-bold text-accent">{p.price}</div>
              <p className="mt-1.5 text-[0.78rem] text-muted">{p.blurb}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-[0.78rem] text-muted">
                    <span className="text-completed">✓</span><span>{h}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choose(p.id)}
                disabled={current || !isAdmin || busy === p.id}
                className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-40 ${current ? 'border border-glass bg-white/5 text-muted' : 'bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] text-white hover:brightness-105'}`}
              >
                {current ? 'Current plan' : busy === p.id ? 'Switching…' : isDown ? `Switch to ${p.name}` : `Upgrade to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {!isAdmin && <p className="mt-4 text-xs text-faint">Only a company admin can change the plan.</p>}
      <p className="mt-4 text-[0.7rem] text-faint">When Stripe is connected, the upgrade buttons will open secure checkout and the plan will update automatically after payment.</p>
    </div>
  );
}

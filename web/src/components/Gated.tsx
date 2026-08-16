import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePlan } from '../data/PlanContext';
import { MODULE_BY_ID } from '../domain/modules';
import { requiredPlan, PLAN_BY_ID } from '../domain/plans';

/** Wraps a routed page; shows an upgrade prompt if the plan doesn't include it. */
export default function Gated({ id, children }: { id: string; children: ReactNode }) {
  const { allowed, loaded, error, refresh } = usePlan();

  // The plan starts at the base tier, so gating is only meaningful once the
  // real plan has loaded — rendering the upsell before then would accuse
  // paying customers of not having paid.
  if (!loaded) {
    return <div className="mt-10 text-center text-sm text-muted">Loading…</div>;
  }

  if (allowed(id)) return <>{children}</>;

  // Denied because we couldn't read the plan, not because it's genuinely
  // out of tier. Offer a retry instead of an upsell.
  if (error) {
    return (
      <div className="mx-auto mt-10 max-w-md">
        <div className="glass rounded-2xl p-8 text-center">
          <div className="text-3xl">⚠️</div>
          <h2 className="mt-3 text-lg font-bold text-text">Couldn't load your plan</h2>
          <p className="mt-1.5 text-sm text-muted">{error}</p>
          <button
            onClick={refresh}
            className="mt-5 inline-block rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const mod = MODULE_BY_ID[id];
  const need = PLAN_BY_ID[requiredPlan(id)];
  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="glass rounded-2xl p-8 text-center">
        <div className="text-3xl">🔒</div>
        <h2 className="mt-3 text-lg font-bold text-text">{mod?.label || 'This feature'} is a {need.name} feature</h2>
        <p className="mt-1.5 text-sm text-muted">Upgrade to <span className="font-semibold text-accent">{need.name}</span> to unlock it.</p>
        <Link to="/plans" className="mt-5 inline-block rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white">View plans →</Link>
      </div>
    </div>
  );
}

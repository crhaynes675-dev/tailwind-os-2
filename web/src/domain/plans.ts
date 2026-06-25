// ── Tailwind OS3 — Subscription plans + feature gating ──────────────────

export type PlanId = 'starter' | 'pro' | 'enterprise';
export const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'enterprise'];

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  blurb: string;
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49/mo',
    blurb: 'Capture leads, estimate, schedule, and run the field.',
    highlights: ['Estimator + quotes', 'Intake & customers', 'Schedule', 'Field App', 'Users'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$149/mo',
    blurb: 'Full dispatch, field workflow, reporting & invoicing.',
    highlights: ['Everything in Starter', 'Dispatch + Routing + Readiness', 'Delivery → Closeout', 'Reporting + CSV export', 'Invoicing & AR'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    blurb: 'Service, workforce, and advanced tooling.',
    highlights: ['Everything in Pro', 'Service tickets', 'Crew Time-Off', 'Install Manager', 'Priority support'],
  },
];

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, Plan>;

// Module ids unlocked by each plan (cumulative).
const STARTER = ['dashboard', 'import', 'estimator', 'customers', 'schedule', 'field', 'users', 'company', 'plans'];
const PRO_ADDS = ['dispatch', 'routing', 'readiness', 'delivery', 'installation', 'postinstall', 'closeout', 'reporting', 'invoicing'];
const ENT_ADDS = ['service', 'timeoff', 'manager'];

export const PLAN_MODULES: Record<PlanId, string[]> = {
  starter: STARTER,
  pro: [...STARTER, ...PRO_ADDS],
  enterprise: [...STARTER, ...PRO_ADDS, ...ENT_ADDS],
};

export function planRank(p: PlanId): number {
  return PLAN_ORDER.indexOf(p);
}

/** Map a stored tenant plan string ('trial', 'pro', …) to an effective tier. */
export function effectivePlan(raw?: string): PlanId {
  const p = (raw || '').toLowerCase();
  if (p === 'starter' || p === 'pro' || p === 'enterprise') return p;
  if (p === 'trial') return 'pro'; // 30-day trial = Pro
  return 'enterprise'; // unknown / legacy (no config) → full access, never lock
}

/** Smallest plan that unlocks a given module (for the upgrade prompt). */
export function requiredPlan(moduleId: string): PlanId {
  for (const p of PLAN_ORDER) if (PLAN_MODULES[p].includes(moduleId)) return p;
  return 'enterprise';
}

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './dynamo';

// Mirrors web/src/domain/plans.ts. Server-side enforcement so gated
// features can't be reached by calling the API directly.
export type PlanId = 'starter' | 'pro' | 'enterprise';
const ORDER: PlanId[] = ['starter', 'pro', 'enterprise'];

// Tenant config lives in the main table; service/checklists run on the OS3
// table, so they pass CONFIG_TABLE to point this lookup at the right place.
const CONFIG_TABLE = process.env.CONFIG_TABLE || TABLE;

const STARTER = ['dashboard', 'import', 'estimator', 'customers', 'schedule', 'field', 'users', 'company', 'plans'];
const PRO_ADDS = ['dispatch', 'routing', 'readiness', 'delivery', 'installation', 'postinstall', 'closeout', 'reporting', 'invoicing'];
const ENT_ADDS = ['service', 'timeoff', 'manager'];

export const PLAN_MODULES: Record<PlanId, string[]> = {
  starter: STARTER,
  pro: [...STARTER, ...PRO_ADDS],
  enterprise: [...STARTER, ...PRO_ADDS, ...ENT_ADDS],
};

/**
 * Tenants predating plan config have no CONFIG row. That is a known,
 * legitimate state and keeps full access — kept deliberately distinct from an
 * unreadable or unrecognized plan, which is a fault and must not grant one.
 */
export const LEGACY_PLAN: PlanId = 'enterprise';

/** The tier to fall back to when the real plan can't be trusted. */
export const FALLBACK_PLAN: PlanId = 'starter';

export function effectivePlan(raw?: string): PlanId {
  const p = (raw || '').trim().toLowerCase();
  if (p === 'starter' || p === 'pro' || p === 'enterprise') return p as PlanId;
  if (p === 'trial') return 'pro';
  if (!p) return LEGACY_PLAN; // no plan on record → pre-billing tenant
  // A non-empty value we don't recognize means bad data, not a free upgrade.
  console.warn(`[plan] unrecognized plan ${JSON.stringify(raw)} — treating as ${FALLBACK_PLAN}`);
  return FALLBACK_PLAN;
}

export function rank(p: PlanId): number { return ORDER.indexOf(p); }

/** Throws if the tenant config can't be read — callers decide the fallback. */
export async function getTenantPlan(tenantId: string): Promise<PlanId> {
  const res = await ddb.send(new GetCommand({
    TableName: CONFIG_TABLE,
    Key: { PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' },
  }));
  return effectivePlan(res.Item?.plan as string | undefined);
}

/** True if the tenant's plan unlocks the given module/feature. */
export async function planAllows(tenantId: string, moduleId: string): Promise<boolean> {
  let plan: PlanId;
  try {
    plan = await getTenantPlan(tenantId);
  } catch (err) {
    // Fail closed to the base tier. Granting the top tier on a failed lookup
    // makes every paid feature reachable by inducing one — and the same table
    // outage would fail the rest of the request anyway.
    console.error(`[plan] lookup failed for tenant ${tenantId} — falling back to ${FALLBACK_PLAN}`, err);
    plan = FALLBACK_PLAN;
  }
  return PLAN_MODULES[plan].includes(moduleId);
}

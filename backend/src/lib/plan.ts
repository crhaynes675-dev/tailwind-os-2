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

export function effectivePlan(raw?: string): PlanId {
  const p = (raw || '').toLowerCase();
  if (p === 'starter' || p === 'pro' || p === 'enterprise') return p as PlanId;
  if (p === 'trial') return 'pro';
  return 'enterprise'; // unknown / legacy (no config) → full access, never lock
}

export function rank(p: PlanId): number { return ORDER.indexOf(p); }

export async function getTenantPlan(tenantId: string): Promise<PlanId> {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: CONFIG_TABLE,
      Key: { PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' },
    }));
    return effectivePlan(res.Item?.plan as string | undefined);
  } catch {
    return 'enterprise'; // fail open — don't lock people out on a lookup error
  }
}

/** True if the tenant's plan unlocks the given module/feature. */
export async function planAllows(tenantId: string, moduleId: string): Promise<boolean> {
  const plan = await getTenantPlan(tenantId);
  return PLAN_MODULES[plan].includes(moduleId);
}

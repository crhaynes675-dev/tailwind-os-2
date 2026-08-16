import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiGet, ApiError } from '../lib/api';
import { effectivePlan, FALLBACK_PLAN, LEGACY_PLAN, PLAN_MODULES, type PlanId } from '../domain/plans';

interface TenantCfg { plan?: string; companyName?: string }

interface PlanState {
  plan: PlanId;
  rawPlan: string;
  /** False until /tenants/me has resolved. Gating decisions before this are provisional. */
  loaded: boolean;
  /** Set when the plan lookup failed; the app is running on FALLBACK_PLAN. */
  error: string | null;
  allowed: (moduleId: string) => boolean;
  refresh: () => void;
}

const PlanContext = createContext<PlanState | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
  // Start locked down. Unlocking first and correcting later hands out paid
  // modules for free on every load — and permanently if the lookup fails.
  const [plan, setPlan] = useState<PlanId>(FALLBACK_PLAN);
  const [rawPlan, setRawPlan] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // No synchronous setState here — refresh() runs inside an effect on mount,
    // so any state clearing has to happen once the request settles.
    apiGet<TenantCfg>('/tenants/me')
      .then((c) => {
        setRawPlan(c?.plan || '');
        setPlan(effectivePlan(c?.plan));
        setError(null);
      })
      .catch((e) => {
        setRawPlan('');
        // 404 means the tenant simply has no config row yet. That is the
        // legacy/pre-billing case, not a fault: GET /tenants/me returns 404
        // rather than an empty plan, so effectivePlan's LEGACY_PLAN branch is
        // never reached from here and has to be applied explicitly.
        if (e instanceof ApiError && e.status === 404) {
          setPlan(LEGACY_PLAN);
          setError(null);
          return;
        }
        // Any other failure is a real fault — stay on the base tier rather
        // than assuming the most expensive one. The API enforces this
        // server-side too, so a wrong guess here only produces a broken screen.
        setPlan(FALLBACK_PLAN);
        setError(e instanceof Error ? e.message : 'Could not load your plan.');
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const allowed = useCallback((moduleId: string) => moduleId === 'plans' || PLAN_MODULES[plan].includes(moduleId), [plan]);

  return <PlanContext.Provider value={{ plan, rawPlan, loaded, error, allowed, refresh }}>{children}</PlanContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanState {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}

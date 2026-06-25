import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiGet } from '../lib/api';
import { effectivePlan, PLAN_MODULES, type PlanId } from '../domain/plans';

interface TenantCfg { plan?: string; companyName?: string }

interface PlanState {
  plan: PlanId;
  rawPlan: string;
  loaded: boolean;
  allowed: (moduleId: string) => boolean;
  refresh: () => void;
}

const PlanContext = createContext<PlanState | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PlanId>('enterprise'); // default unlocked until known (no false-lock flash)
  const [rawPlan, setRawPlan] = useState('');
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    apiGet<TenantCfg>('/tenants/me')
      .then((c) => { setRawPlan(c?.plan || ''); setPlan(effectivePlan(c?.plan)); })
      .catch(() => { setRawPlan(''); setPlan('enterprise'); }) // legacy / no config → unlocked
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const allowed = useCallback((moduleId: string) => moduleId === 'plans' || PLAN_MODULES[plan].includes(moduleId), [plan]);

  return <PlanContext.Provider value={{ plan, rawPlan, loaded, allowed, refresh }}>{children}</PlanContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanState {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}

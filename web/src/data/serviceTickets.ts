import { useState, useCallback } from 'react';

// Net-new Service module data. Local-first (localStorage) so the module
// is fully usable now; a backend table can replace this store later
// without changing the UI. Source: Workflows 08 (Service) & 09 (Leak).

export const SERVICE_STAGES = ['Logged', 'Triaged', 'Scheduled', 'Dispatched', 'Visited'] as const;
export type ServiceStage = (typeof SERVICE_STAGES)[number];

export const LEAK_STEPS = [
  'Visual Inspection',
  'Environmental Conditions',
  'Hose Test',
  'Diagnosis',
  'Corrective Action',
];

export interface ServiceTicket {
  id: string;
  customer: string;
  description: string;
  type: 'service' | 'leak';
  stage: ServiceStage;
  tech?: string;
  leakSteps?: string[];
  createdAt: string;
}

const KEY = 'os3_service_tickets';

function load(): ServiceTicket[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function save(t: ServiceTicket[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function useServiceTickets() {
  const [tickets, setTickets] = useState<ServiceTicket[]>(() => load());

  const persist = useCallback((next: ServiceTicket[]) => {
    save(next);
    setTickets(next);
  }, []);

  const create = useCallback(
    (partial: Pick<ServiceTicket, 'customer' | 'description' | 'type'>) => {
      const t: ServiceTicket = {
        id: 'svc_' + Date.now().toString(36),
        stage: 'Logged',
        createdAt: new Date().toISOString(),
        leakSteps: [],
        ...partial,
      };
      persist([t, ...load()]);
    },
    [persist],
  );

  const update = useCallback((id: string, patch: Partial<ServiceTicket>) => {
    persist(load().map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [persist]);

  const advance = useCallback((id: string) => {
    persist(
      load().map((t) => {
        if (t.id !== id) return t;
        const i = SERVICE_STAGES.indexOf(t.stage);
        return i < SERVICE_STAGES.length - 1 ? { ...t, stage: SERVICE_STAGES[i + 1] } : t;
      }),
    );
  }, [persist]);

  const remove = useCallback((id: string) => persist(load().filter((t) => t.id !== id)), [persist]);

  const toggleLeak = useCallback((id: string, step: string) => {
    persist(
      load().map((t) => {
        if (t.id !== id) return t;
        const cur = new Set(t.leakSteps || []);
        cur.has(step) ? cur.delete(step) : cur.add(step);
        return { ...t, leakSteps: [...cur] };
      }),
    );
  }, [persist]);

  return { tickets, create, update, advance, remove, toggleLeak };
}

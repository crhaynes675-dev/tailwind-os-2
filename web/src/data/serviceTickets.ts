import { useState, useCallback, useEffect } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Service tickets (Workflows 08/09) — persisted to the OS3 backend
// (/service), shared across users. Source: dedicated tailwind-os3 table.

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

export function useServiceTickets() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);

  const load = useCallback(() => {
    apiGet<ServiceTicket[]>('/service')
      .then((r) => setTickets(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback((partial: Pick<ServiceTicket, 'customer' | 'description' | 'type'>) => {
    apiSend<ServiceTicket>('POST', '/service', partial)
      .then((t) => setTickets((cur) => [t, ...cur]))
      .catch(() => {});
  }, []);

  const patch = useCallback((id: string, body: Partial<ServiceTicket>) => {
    setTickets((cur) => cur.map((t) => (t.id === id ? { ...t, ...body } : t)));
    apiSend('PUT', `/service/${id}`, body).catch(() => load());
  }, [load]);

  const update = useCallback((id: string, body: Partial<ServiceTicket>) => patch(id, body), [patch]);

  const advance = useCallback((id: string) => {
    setTickets((cur) =>
      cur.map((t) => {
        if (t.id !== id) return t;
        const i = SERVICE_STAGES.indexOf(t.stage);
        if (i >= SERVICE_STAGES.length - 1) return t;
        const stage = SERVICE_STAGES[i + 1];
        apiSend('PUT', `/service/${id}`, { stage }).catch(() => load());
        return { ...t, stage };
      }),
    );
  }, [load]);

  const remove = useCallback((id: string) => {
    setTickets((cur) => cur.filter((t) => t.id !== id));
    apiSend('DELETE', `/service/${id}`).catch(() => load());
  }, [load]);

  const toggleLeak = useCallback((id: string, step: string) => {
    setTickets((cur) =>
      cur.map((t) => {
        if (t.id !== id) return t;
        const set = new Set(t.leakSteps || []);
        set.has(step) ? set.delete(step) : set.add(step);
        const leakSteps = [...set];
        apiSend('PUT', `/service/${id}`, { leakSteps }).catch(() => load());
        return { ...t, leakSteps };
      }),
    );
  }, [load]);

  return { tickets, create, update, advance, remove, toggleLeak };
}

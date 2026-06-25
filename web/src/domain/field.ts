import type { Job } from '../data/jobs';
import type { JobStatus } from './status';

export const FIELD_STATUSES: JobStatus[] = ['Scheduled', 'In Progress', 'Ready for Post-Install Walk'];
export const mapsUrl = (addr: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;

/** The tech's next field action: En Route → On Site → Complete. */
export function fieldStep(job: Job): { label: 'En Route' | 'On Site' | 'Complete'; patch: Partial<Job> } | null {
  const now = new Date().toISOString();
  if (job.status === 'Scheduled') return { label: 'En Route', patch: { status: 'In Progress', enrouteAt: now } };
  if (job.status === 'In Progress' && !job.onSiteAt) return { label: 'On Site', patch: { onSiteAt: now } };
  if (job.status === 'In Progress' && job.onSiteAt) return { label: 'Complete', patch: { status: 'Ready for Post-Install Walk', completedAt: now } };
  return null;
}

export const STEP_LABEL: Record<string, string> = { 'En Route': '🚗 En Route', 'On Site': '📍 On Site', Complete: '✓ Complete' };
// Color progresses: En Route (blue) → On Site (amber) → Complete (green).
export const STEP_STYLE: Record<string, string> = {
  'En Route': 'bg-gradient-to-br from-[#38bdf8] to-[#2563eb]',
  'On Site': 'bg-gradient-to-br from-[#f59e0b] to-[#d97706]',
  Complete: 'bg-gradient-to-br from-[#22c55e] to-[#16a34a]',
};

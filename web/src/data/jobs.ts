import { type JobStatus, normalizeStatus } from '../domain/status';

export interface Job {
  id: string;
  workOrder: string;
  name: string;
  customer: string;
  address: string;
  status: JobStatus;
  crew?: string;
  scheduledDate?: string;
  priority?: 'High' | 'Normal' | 'Low';
}

// Temporary seed data so Phase 1 screens are real and interactive.
// Phase 2 swaps this for the live API (Cognito + /jobs), mapped through
// normalizeStatus() onto the canonical 6-state architecture.
const RAW: Array<Omit<Job, 'status'> & { status: string }> = [
  { id: 'j1', workOrder: 'WO-2026-0112', name: 'Belmont Estate — Patio Doors', customer: 'Hargrove Builders', address: '441 Belmont Ave, Charlotte NC', status: 'Unscheduled', priority: 'High' },
  { id: 'j2', workOrder: 'WO-2026-0113', name: 'Lakeside 12 — Window Pkg', customer: 'GDI Homes', address: '12 Lakeside Dr, Mooresville NC', status: 'Ready to Schedule', priority: 'Normal' },
  { id: 'j3', workOrder: 'WO-2026-0114', name: 'Cedar Ridge — Entry System', customer: 'Cedar Ridge LLC', address: '88 Cedar Ridge, Huntersville NC', status: 'Scheduled', crew: 'Alpha', scheduledDate: '2026-06-23', priority: 'Normal' },
  { id: 'j4', workOrder: 'WO-2026-0115', name: 'Magnolia 4 — Sliders', customer: 'Magnolia Dev', address: '4 Magnolia Ct, Davidson NC', status: 'Dispatched', crew: 'Bravo', scheduledDate: '2026-06-21' },
  { id: 'j5', workOrder: 'WO-2026-0116', name: 'Harbor Town — Bi-fold', customer: 'Harbor Town HOA', address: '9 Harbor Town, Cornelius NC', status: 'In Progress', crew: 'Alpha', scheduledDate: '2026-06-20' },
  { id: 'j6', workOrder: 'WO-2026-0117', name: 'Oakhurst 7 — French Doors', customer: 'Oakhurst Custom', address: '7 Oakhurst Ln, Charlotte NC', status: 'On Site', crew: 'Charlie', scheduledDate: '2026-06-20' },
  { id: 'j7', workOrder: 'WO-2026-0118', name: 'Riverside — Storefront', customer: 'Riverside Commercial', address: '210 River Rd, Belmont NC', status: 'Ready for Site Review', crew: 'Bravo', scheduledDate: '2026-06-18' },
  { id: 'j8', workOrder: 'WO-2026-0119', name: 'Pine Hollow 3 — Windows', customer: 'Pine Hollow', address: '3 Pine Hollow, Matthews NC', status: 'Final Walkthrough Ready', scheduledDate: '2026-06-17' },
  { id: 'j9', workOrder: 'WO-2026-0120', name: 'Westfield — Patio System', customer: 'Westfield Homes', address: '55 Westfield, Concord NC', status: 'Completed', scheduledDate: '2026-06-15' },
  { id: 'j10', workOrder: 'WO-2026-0121', name: 'Aspen Grove — Entry', customer: 'Aspen Grove', address: '14 Aspen Grove, Waxhaw NC', status: 'Completed', scheduledDate: '2026-06-14' },
  { id: 'j11', workOrder: 'WO-2026-0122', name: 'Brookstone 9 — Sliders', customer: 'Brookstone', address: '9 Brookstone, Indian Trail NC', status: 'Scheduled', crew: 'Charlie', scheduledDate: '2026-06-24' },
  { id: 'j12', workOrder: 'WO-2026-0123', name: 'Sterling Pointe — Windows', customer: 'Sterling Pointe', address: '30 Sterling, Gastonia NC', status: 'Unscheduled' },
];

export const JOBS: Job[] = RAW.map((j) => ({ ...j, status: normalizeStatus(j.status) }));

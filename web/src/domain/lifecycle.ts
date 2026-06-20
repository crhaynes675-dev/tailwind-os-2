// ── Tailwind OS3 — Core Job Lifecycle (14 stages) ───────────────────
// The human-facing lifecycle a job travels through. Distinct from the
// 6-state Status Architecture (status.ts), which is the system backbone.

export const LIFECYCLE_STAGES = [
  'Lead',
  'Estimate',
  'Awarded',
  'Job Setup',
  'Document Review',
  'Material Ready',
  'Ready to Schedule',
  'Scheduled',
  'Delivered',
  'In Installation',
  'QA / Punch',
  'Final Walkthrough',
  'Closed',
  'Service',
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export function stageNumber(stage: LifecycleStage): string {
  return String(LIFECYCLE_STAGES.indexOf(stage) + 1).padStart(2, '0');
}

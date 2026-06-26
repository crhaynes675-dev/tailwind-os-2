import { WORKFLOWS } from './workflows';
import type { Job, ReadinessStep } from '../data/jobs';

// Workflow 02 readiness steps (skip the "Job Setup" entry step), with default owners.
export const READINESS_STEP_DEFS = WORKFLOWS.find((w) => w.id === '02')!.steps.slice(1).map((s) => ({ step: s.step, owner: s.owner }));

// A job's readiness plan = saved entries merged onto the canonical step list,
// so every step always renders even before it's been touched.
export function buildReadinessPlan(job: Job): ReadinessStep[] {
  return READINESS_STEP_DEFS.map((def) => {
    const e = job.readiness?.find((r) => r.step === def.step);
    return { step: def.step, owner: e?.owner ?? def.owner, dueDate: e?.dueDate ?? '', endDate: e?.endDate, done: e?.done ?? false, completedAt: e?.completedAt };
  });
}

// True only when every readiness step is marked done — the gate to schedule the WO.
export function readinessComplete(job: Job): boolean {
  const plan = buildReadinessPlan(job);
  return plan.length > 0 && plan.every((r) => r.done);
}

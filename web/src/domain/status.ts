// ── Tailwind OS3 — Status Architecture (the backbone) ───────────────
// Canonical 6-state job status. Every module reads/writes this.
// Source: Process Map · Workflow 13 "Tailwind OS3 Status Architecture".

export const JOB_STATUSES = [
  'Unscheduled',
  'Scheduled',
  'In Progress',
  'Ready for Post-Install Walk',
  'Final Walkthrough Ready',
  'Completed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface StatusMeta {
  key: JobStatus;
  short: string;
  /** css color token name (see index.css @theme) */
  color: string;
  owner: string;
  trigger: string; // key input that moves a job INTO this state
  output: string; // key output produced in this state
}

export const STATUS_META: Record<JobStatus, StatusMeta> = {
  Unscheduled: {
    key: 'Unscheduled',
    short: 'Unscheduled',
    color: 'var(--color-unscheduled)',
    owner: 'System / Ops',
    trigger: 'Job record created',
    output: 'Awaiting scheduling gate',
  },
  Scheduled: {
    key: 'Scheduled',
    short: 'Scheduled',
    color: 'var(--color-scheduled)',
    owner: 'Install Mgr',
    trigger: 'Schedule published',
    output: 'Crew + resources assigned',
  },
  'In Progress': {
    key: 'In Progress',
    short: 'In Progress',
    color: 'var(--color-progress)',
    owner: 'Field',
    trigger: 'On-site confirmation',
    output: 'Active installation',
  },
  'Ready for Post-Install Walk': {
    key: 'Ready for Post-Install Walk',
    short: 'Post-Install Walk',
    color: 'var(--color-postwalk)',
    owner: 'Field Lead',
    trigger: 'Install complete signal',
    output: 'QA walk triggered',
  },
  'Final Walkthrough Ready': {
    key: 'Final Walkthrough Ready',
    short: 'Final Walk',
    color: 'var(--color-finalwalk)',
    owner: 'Ops / PM',
    trigger: 'Post-install approval',
    output: 'Closeout initiated',
  },
  Completed: {
    key: 'Completed',
    short: 'Completed',
    color: 'var(--color-completed)',
    owner: 'System / Ops',
    trigger: 'Customer approval',
    output: 'Job closed',
  },
};

/** Ordered pipeline for boards/dashboards. */
export const STATUS_PIPELINE: JobStatus[] = [...JOB_STATUSES];

/** Index of a status in the pipeline (for progress math). */
export function statusIndex(s: JobStatus): number {
  return STATUS_PIPELINE.indexOf(s);
}

/** The single allowed forward transition (linear gate model). */
export function nextStatus(s: JobStatus): JobStatus | null {
  const i = statusIndex(s);
  return i >= 0 && i < STATUS_PIPELINE.length - 1 ? STATUS_PIPELINE[i + 1] : null;
}

/** Map any legacy/free-form status string onto the canonical 6 states. */
const LEGACY_MAP: Record<string, JobStatus> = {
  unscheduled: 'Unscheduled',
  'needs review': 'Unscheduled',
  imported: 'Unscheduled',
  'ready to schedule': 'Unscheduled',
  scheduled: 'Scheduled',
  dispatched: 'Scheduled',
  'en route': 'In Progress',
  'on site': 'In Progress',
  'in progress': 'In Progress',
  'ready for site review': 'Ready for Post-Install Walk',
  'ready for post-install walk': 'Ready for Post-Install Walk',
  'final walkthrough ready': 'Final Walkthrough Ready',
  completed: 'Completed',
  closed: 'Completed',
};

export function normalizeStatus(raw: string | null | undefined): JobStatus {
  if (!raw) return 'Unscheduled';
  return LEGACY_MAP[raw.trim().toLowerCase()] ?? 'Unscheduled';
}

// ── Stage gates ─────────────────────────────────────────────────────
// Each transition can require inputs/confirmations (the "gate"). Keys
// starting with "_" are confirmation-only (not persisted); other keys
// are written to the job (e.g. assignedTo, scheduledDate).
export type GateFieldType = 'text' | 'date' | 'confirm' | 'signature';
export interface GateField {
  key: string;
  label: string;
  type: GateFieldType;
  required?: boolean;
  placeholder?: string;
}

export const STATUS_GATE: Record<JobStatus, GateField[]> = {
  Unscheduled: [],
  Scheduled: [
    { key: 'assignedTo', label: 'Assign crew', type: 'text', required: true, placeholder: 'e.g. Alpha' },
    { key: 'scheduledDate', label: 'Scheduled date', type: 'date', required: true },
  ],
  'In Progress': [{ key: '_onsite', label: 'Crew confirmed on-site', type: 'confirm', required: true }],
  'Ready for Post-Install Walk': [{ key: '_installComplete', label: 'Installation complete', type: 'confirm', required: true }],
  // Two sign-offs, and only two. The post-install walk is signed by the field
  // crew who did the work; the final walkthrough is signed by the customer
  // (captured through the customer portal, not here).
  'Final Walkthrough Ready': [
    { key: 'postInstallSignedBy', label: 'Field crew member signing off', type: 'text', required: true, placeholder: 'Name of crew member' },
    { key: '_crewSignature', label: 'Field crew sign-off signature', type: 'signature', required: true },
  ],
  Completed: [{ key: '_customerApproved', label: 'Customer approval received', type: 'confirm', required: true }],
};

/** Gate keys whose value is a captured signature image (PNG data URL). */
export const SIGNATURE_GATE_KEY: Partial<Record<JobStatus, string>> = {
  'Final Walkthrough Ready': '_crewSignature',
};

export type TransitionKind = 'same' | 'forward' | 'skip' | 'back';

export function transitionKind(from: JobStatus, to: JobStatus): TransitionKind {
  const d = statusIndex(to) - statusIndex(from);
  if (d === 0) return 'same';
  if (d === 1) return 'forward';
  if (d > 1) return 'skip';
  return 'back';
}

// What to PERSIST for each canonical state. Uses legacy-recognized strings
// so the existing (still-live) app stays consistent, while normalizeStatus()
// maps them back onto the same canonical OS3 state.
export const WRITE_STATUS: Record<JobStatus, string> = {
  Unscheduled: 'Unscheduled',
  Scheduled: 'Scheduled',
  'In Progress': 'In Progress',
  'Ready for Post-Install Walk': 'Ready for Site Review',
  'Final Walkthrough Ready': 'Final Walkthrough Ready',
  Completed: 'Completed',
};

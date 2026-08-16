/**
 * What a customer is allowed to see about their job.
 *
 * Kept as a pure function, separate from the handler, for one reason: this is
 * the boundary between internal data and a page anyone holding a link can
 * load. It has to be testable without AWS, and it has to be obvious on
 * inspection exactly which fields cross that line.
 *
 * The rule is allow-list only. Never spread the job record — a column added
 * upstream would silently become customer-visible.
 */

/** Internal status names are staff jargon; customers get plain language. */
export const CUSTOMER_STATUS: Record<string, { label: string; blurb: string; step: number }> = {
  Unscheduled:                   { label: 'Being scheduled',   blurb: "We're preparing your job and will confirm a date shortly.", step: 1 },
  Scheduled:                     { label: 'Scheduled',          blurb: 'Your installation date is confirmed.',                     step: 2 },
  'In Progress':                 { label: 'In progress',        blurb: 'Our crew is working on your installation.',                step: 3 },
  'Ready for Site Review':       { label: 'Quality check',      blurb: 'Installation is complete and being inspected.',            step: 4 },
  'Ready for Post-Install Walk': { label: 'Quality check',      blurb: 'Installation is complete and being inspected.',            step: 4 },
  'Final Walkthrough Ready':     { label: 'Ready for your approval', blurb: 'Please review the work and approve below.',           step: 5 },
  Completed:                     { label: 'Complete',           blurb: 'This job is closed. Thank you.',                           step: 6 },
};

export const STEP_COUNT = 6;

/** The step at which a customer may sign off (final walkthrough). */
export const APPROVAL_STEP = 5;

export function customerStatus(raw?: string) {
  return CUSTOMER_STATUS[String(raw ?? '')] ?? CUSTOMER_STATUS.Unscheduled;
}

export interface PortalPhoto { id: string; takenAt: string; url: string }

export interface CustomerInvoice {
  amountDue: number;
  currency: string;
  status: string;
  paidAt: string | null;
  payable: boolean;
}

/**
 * What the customer may see about money: the billed total once an invoice has
 * been issued, and nothing else. Cost and margin never appear.
 */
export function invoiceView(job: Record<string, any>, canTakeCard: boolean): { invoice: CustomerInvoice | null } {
  const status = String(job.invoiceStatus ?? 'none');
  const amount = typeof job.contractAmount === 'number' ? job.contractAmount : null;
  if (status === 'none' || !amount || amount <= 0) return { invoice: null };
  return {
    invoice: {
      amountDue: amount,
      currency: 'usd',
      status,
      paidAt: job.paidAt ?? null,
      // Only offer a card button if the contractor can actually take one.
      payable: status === 'invoiced' && canTakeCard,
    },
  };
}

/** Sign-off images are evidence, not progress photos — never shown as a gallery. */
export const isSignatureFile = (filename: unknown) =>
  /^(signature|crewsignoff|customersignoff)-/.test(String(filename ?? ''));

export interface CustomerViewInput {
  job: Record<string, any>;
  companyName?: string;
  photos: PortalPhoto[];
  canTakeCard: boolean;
}

/** Build the complete public payload for a job. Allow-list only. */
export function customerView({ job, companyName, photos, canTakeCard }: CustomerViewInput) {
  const cs = customerStatus(job.status as string);
  return {
    company:     companyName || 'Your installer',
    reference:   job.workOrderNumber ?? null,
    jobName:     job.jobName ?? 'Your installation',
    address:     job.address ?? null,
    status:      cs.label,
    statusBlurb: cs.blurb,
    step:        cs.step,
    stepCount:   STEP_COUNT,
    scheduledDate:    job.scheduledDate ?? null,
    scheduledEndDate: job.scheduledEndDate ?? null,
    onSiteAt:    job.onSiteAt ?? null,
    completedAt: job.completedAt ?? null,
    photos,
    awaitingApproval: cs.step === APPROVAL_STEP && !job.customerApprovedAt,
    approvedAt:  job.customerApprovedAt ?? null,
    approvedBy:  job.customerApprovedName ?? null,
    ...invoiceView(job, canTakeCard),
  };
}

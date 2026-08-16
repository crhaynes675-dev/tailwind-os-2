import { describe, it, expect } from 'vitest';
import { customerView, invoiceView, customerStatus, isSignatureFile } from './customerView';

/**
 * These guard a public, unauthenticated endpoint. A regression here doesn't
 * throw or crash — it quietly publishes job costs to anyone with a link — so
 * the leak tests assert on the whole payload rather than named fields.
 */

/** A job carrying every internal field we never want a customer to see. */
const fullJob = {
  jobId: 'j1',
  workOrderNumber: 'WO-2026-0042',
  jobName: 'Riverside Retail Fit-Out',
  address: '18 River Rd',
  status: 'Final Walkthrough Ready',
  scheduledDate: '2026-08-10',
  scheduledEndDate: '2026-08-12',
  onSiteAt: '2026-08-10T13:02:00Z',
  completedAt: '2026-08-12T21:40:00Z',
  // Everything below is internal.
  contractAmount: 18450,
  materialCost: 7200,
  laborCost: 4100,
  invoiceStatus: 'none',
  invoicedAt: '2026-08-13T00:00:00Z',
  paidAt: null,
  notes: 'Customer was difficult about the trim; watch margin on change orders.',
  assignedTo: 'Crew A',
  readiness: [{ step: 'Rough Opening Walk', owner: 'Field Lead', done: true }],
  createdBy: 'dana.admin',
  tenantId: 'demo',
  shareToken: 'Zk3xQp7RtY2mNb8vCw4Ls6Hj',
  customerPhone: '+15551234567',
  stripeSessionId: 'cs_test_123',
};

const view = (over: Record<string, unknown> = {}, canTakeCard = false) =>
  customerView({ job: { ...fullJob, ...over }, companyName: 'Morrison Millwork', photos: [], canTakeCard });

const serialized = (v: unknown) => JSON.stringify(v);

describe('customerView — redaction', () => {
  it('never exposes cost, margin or internal fields', () => {
    const out = serialized(view());
    for (const secret of ['materialCost', '7200', 'laborCost', '4100', 'Crew A', 'dana.admin', 'margin']) {
      expect(out).not.toContain(secret);
    }
  });

  it('never exposes internal notes', () => {
    expect(serialized(view())).not.toContain('difficult about the trim');
  });

  it('never exposes the share token or tenant id', () => {
    const out = serialized(view());
    expect(out).not.toContain('Zk3xQp7RtY2mNb8vCw4Ls6Hj');
    expect(out).not.toContain('tenantId');
  });

  it('never exposes readiness detail or crew assignment', () => {
    const out = serialized(view());
    expect(out).not.toContain('Rough Opening Walk');
    expect(out).not.toContain('assignedTo');
  });

  it('returns only known keys, so a new column cannot leak by default', () => {
    const keys = Object.keys(view()).sort();
    expect(keys).toEqual([
      'address', 'approvedAt', 'approvedBy', 'awaitingApproval', 'company',
      'completedAt', 'invoice', 'jobName', 'onSiteAt', 'photos', 'reference',
      'scheduledDate', 'scheduledEndDate', 'status', 'statusBlurb', 'step', 'stepCount',
    ]);
  });

  it('ignores unknown fields added to the job record', () => {
    const out = view({ secretNewColumn: 'must-not-appear' } as never);
    expect(serialized(out)).not.toContain('must-not-appear');
  });
});

describe('customerView — status language', () => {
  it('translates internal jargon into customer language', () => {
    expect(view({ status: 'Ready for Site Review' }).status).toBe('Quality check');
    expect(view({ status: 'Ready for Post-Install Walk' }).status).toBe('Quality check');
    expect(view({ status: 'Final Walkthrough Ready' }).status).toBe('Ready for your approval');
  });

  it('falls back to the first step for an unrecognized status', () => {
    expect(customerStatus('something-else').step).toBe(1);
    expect(customerStatus(undefined).step).toBe(1);
  });
});

describe('customerView — approval gate', () => {
  it('invites approval only at the final walkthrough', () => {
    expect(view({ status: 'In Progress' }).awaitingApproval).toBe(false);
    expect(view({ status: 'Ready for Site Review' }).awaitingApproval).toBe(false);
    expect(view({ status: 'Final Walkthrough Ready' }).awaitingApproval).toBe(true);
  });

  it('stops inviting approval once signed', () => {
    const out = view({ status: 'Final Walkthrough Ready', customerApprovedAt: '2026-08-14T00:00:00Z', customerApprovedName: 'Dana Whitfield' });
    expect(out.awaitingApproval).toBe(false);
    expect(out.approvedBy).toBe('Dana Whitfield');
  });
});

describe('invoiceView', () => {
  it('shows nothing before an invoice is issued', () => {
    expect(invoiceView({ invoiceStatus: 'none', contractAmount: 18450 }, true).invoice).toBeNull();
  });

  it('shows the billed total once invoiced, and no cost breakdown', () => {
    const { invoice } = invoiceView({ invoiceStatus: 'invoiced', contractAmount: 18450, materialCost: 7200 }, true);
    expect(invoice).toMatchObject({ amountDue: 18450, status: 'invoiced', payable: true });
    expect(JSON.stringify(invoice)).not.toContain('7200');
  });

  it('does not offer card payment when the contractor cannot take one', () => {
    expect(invoiceView({ invoiceStatus: 'invoiced', contractAmount: 100 }, false).invoice?.payable).toBe(false);
  });

  it('does not offer payment on an already-paid invoice', () => {
    expect(invoiceView({ invoiceStatus: 'paid', contractAmount: 100 }, true).invoice?.payable).toBe(false);
  });

  it('ignores zero, negative and non-numeric amounts', () => {
    expect(invoiceView({ invoiceStatus: 'invoiced', contractAmount: 0 }, true).invoice).toBeNull();
    expect(invoiceView({ invoiceStatus: 'invoiced', contractAmount: -50 }, true).invoice).toBeNull();
    expect(invoiceView({ invoiceStatus: 'invoiced', contractAmount: '100' }, true).invoice).toBeNull();
  });
});

describe('isSignatureFile', () => {
  it('recognizes every sign-off kind so none appears as a progress photo', () => {
    expect(isSignatureFile('crewsignoff-2026.png')).toBe(true);
    expect(isSignatureFile('customersignoff-2026.png')).toBe(true);
    expect(isSignatureFile('signature-2026.png')).toBe(true);
  });

  it('leaves real photos alone', () => {
    expect(isSignatureFile('during-install.jpg')).toBe(false);
    expect(isSignatureFile('after-3.png')).toBe(false);
    expect(isSignatureFile(undefined)).toBe(false);
  });
});

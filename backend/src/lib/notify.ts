import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';
import { ddb, TABLE } from './dynamo';
import { tpk, tgsi } from './tenant';

/**
 * Customer notifications on status change.
 *
 * Every notification is written to the SMS queue first and only then sent, so
 * there is always a record of what the system decided to say — including when
 * delivery is switched off or fails. Sending is opt-in per environment via
 * SMS_ENABLED, because SNS SMS needs account-level setup (spend limit and an
 * origination number) that isn't part of this stack.
 */

const sns = new SNSClient({ region: process.env.REGION ?? 'us-east-1' });
const SMS_ENABLED = process.env.SMS_ENABLED === 'true';
const PORTAL_BASE_URL = (process.env.PORTAL_BASE_URL ?? '').replace(/\/$/, '');

type Template = (ctx: { company: string; jobName: string; date?: string; link?: string }) => string;

/**
 * Which transitions are worth a message. Deliberately sparse — a notification
 * per stage would train customers to ignore them. These are the three moments
 * a customer actually wants to hear about.
 */
const TEMPLATES: Record<string, Template> = {
  Scheduled: ({ company, jobName, date, link }) =>
    `${company}: your installation for ${jobName} is scheduled${date ? ` for ${date}` : ''}.` +
    (link ? ` Track it here: ${link}` : ''),

  'In Progress': ({ company, jobName, link }) =>
    `${company}: our crew is on the way for ${jobName}.` + (link ? ` Details: ${link}` : ''),

  'Final Walkthrough Ready': ({ company, jobName, link }) =>
    `${company}: ${jobName} is complete and ready for your approval.` +
    (link ? ` Review and sign off here: ${link}` : ''),
};

// Persisted status strings differ from the canonical names in places.
const ALIAS: Record<string, string> = {
  'Ready for Site Review': 'Ready for Post-Install Walk',
};

export interface NotifyInput {
  tenantId: string;
  jobId: string;
  status: string;
  jobName?: string;
  scheduledDate?: string;
  customerPhone?: string;
  companyName?: string;
  shareToken?: string | null;
}

/** E.164-ish normalization for US numbers typed the way people actually type them. */
export function normalizePhone(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export interface SmsRecord {
  tenantId: string;
  to?: string | null;
  body: string;
  trigger: string;
  jobId?: string;
  reminderId?: string;
  /**
   * Stable id for messages that must only ever be sent once (a daily reminder
   * re-run, a retried invocation). Reusing the id overwrites the same row
   * rather than queueing a duplicate.
   */
  dedupeKey?: string;
}

/**
 * Queue a message, then send it if delivery is enabled. Never throws — a
 * notification problem must not fail whatever triggered it.
 *
 * Recording always happens first, so there is a log of what the system decided
 * to say even when sending is off or fails.
 */
export async function queueSms(rec: SmsRecord): Promise<'sent' | 'queued' | 'skipped' | 'failed'> {
  try {
    const to = normalizePhone(rec.to ?? undefined);
    const id = rec.dedupeKey ?? `sms_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const created = new Date().toISOString();
    // 'skipped' is a real outcome worth recording: it distinguishes "we had
    // nobody to text" from "we tried and it failed".
    const state = !to ? 'skipped:no-phone' : SMS_ENABLED ? 'sending' : 'skipped:disabled';

    await put(rec, id, created, to, state);
    if (!to) return 'skipped';
    if (!SMS_ENABLED) return 'skipped';

    try {
      await sns.send(new PublishCommand({ PhoneNumber: to, Message: rec.body }));
      await put(rec, id, created, to, 'sent');
      return 'sent';
    } catch (err) {
      console.error('[notify] SMS send failed', err);
      await put(rec, id, created, to, 'failed');
      return 'failed';
    }
  } catch (err) {
    console.error('[notify] could not queue message', err);
    return 'failed';
  }
}

function put(rec: SmsRecord, id: string, created: string, to: string | null, state: string) {
  return ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: tpk(rec.tenantId, 'SMS', id), SK: 'MESSAGE',
      GSI1PK: tgsi(rec.tenantId, 'SMS_QUEUE'),
      GSI1SK: `CREATED#${created}#${id}`,
      id, created, to, state,
      body: rec.body,
      trigger: rec.trigger,
      jobId: rec.jobId,
      reminderId: rec.reminderId,
      updatedAt: new Date().toISOString(),
    },
  }));
}

/** Queue the customer notification for a job status change. */
export async function notifyStatusChange(input: NotifyInput): Promise<void> {
  const status = ALIAS[input.status] ?? input.status;
  const template = TEMPLATES[status];
  if (!template) return;

  await queueSms({
    tenantId: input.tenantId,
    to: input.customerPhone,
    jobId: input.jobId,
    trigger: `status:${status}`,
    body: template({
      company: input.companyName || 'Your installer',
      jobName: input.jobName || 'your installation',
      date: input.scheduledDate?.slice(0, 10),
      link: portalLink(input.shareToken),
    }),
  });
}

export function portalLink(shareToken?: string | null): string | undefined {
  return shareToken && PORTAL_BASE_URL ? `${PORTAL_BASE_URL}/j/${shareToken}` : undefined;
}

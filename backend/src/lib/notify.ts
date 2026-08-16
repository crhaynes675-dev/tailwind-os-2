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

/**
 * Queue (and optionally send) the customer notification for a status change.
 * Never throws — a notification problem must not fail the job update that
 * triggered it.
 */
export async function notifyStatusChange(input: NotifyInput): Promise<void> {
  try {
    const status = ALIAS[input.status] ?? input.status;
    const template = TEMPLATES[status];
    if (!template) return;

    const to = normalizePhone(input.customerPhone);
    const link = input.shareToken && PORTAL_BASE_URL ? `${PORTAL_BASE_URL}/j/${input.shareToken}` : undefined;

    const body = template({
      company: input.companyName || 'Your installer',
      jobName: input.jobName || 'your installation',
      date: input.scheduledDate?.slice(0, 10),
      link,
    });

    const id = `sms_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const created = new Date().toISOString();
    // 'skipped' is a real outcome worth recording: it distinguishes "we had
    // nobody to text" from "we tried and it failed".
    const state = !to ? 'skipped:no-phone' : SMS_ENABLED ? 'sending' : 'skipped:disabled';

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: tpk(input.tenantId, 'SMS', id), SK: 'MESSAGE',
        GSI1PK: tgsi(input.tenantId, 'SMS_QUEUE'),
        GSI1SK: `CREATED#${created}#${id}`,
        id, created, to, body, state,
        jobId: input.jobId,
        trigger: `status:${status}`,
      },
    }));

    if (!to || !SMS_ENABLED) return;

    try {
      await sns.send(new PublishCommand({ PhoneNumber: to, Message: body }));
      await markState(input.tenantId, id, created, to, body, input.jobId, status, 'sent');
    } catch (err) {
      console.error('[notify] SMS send failed', err);
      await markState(input.tenantId, id, created, to, body, input.jobId, status, 'failed');
    }
  } catch (err) {
    // Swallow: the job update already succeeded and must stay succeeded.
    console.error('[notify] could not queue notification', err);
  }
}

async function markState(
  tenantId: string, id: string, created: string, to: string,
  body: string, jobId: string, status: string, state: string,
) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: tpk(tenantId, 'SMS', id), SK: 'MESSAGE',
      GSI1PK: tgsi(tenantId, 'SMS_QUEUE'),
      GSI1SK: `CREATED#${created}#${id}`,
      id, created, to, body, state,
      jobId, trigger: `status:${status}`,
      updatedAt: new Date().toISOString(),
    },
  }));
}

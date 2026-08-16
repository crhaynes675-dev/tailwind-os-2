import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { queueSms, portalLink } from '../lib/notify';

/**
 * Daily reminder run (EventBridge, once a day).
 *
 * Status-change notifications only fire when someone moves a job. Appointment
 * reminders are the opposite: nothing happens, and *that* is the trigger. So
 * this sweeps forward-dated work and sends ahead of it.
 *
 * Two sources:
 *   • jobs scheduled `leadDays` from now  -> customer appointment reminder
 *   • calendar reminders with an SMS set  -> whoever the reminder is for
 *
 * Every message carries a deterministic dedupe key, so a retry, a manual
 * re-run, or two invocations in the same day overwrite one row instead of
 * texting a customer twice. That property matters more than anything else
 * here: a duplicate 6am text is the fastest way to get a number blocked.
 */

const REMINDERS_TABLE = process.env.REMINDERS_TABLE || TABLE;
const DEFAULT_LEAD_DAYS = 1;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(Date.UTC(y, m - 1, d + n)));
}

interface TenantCfg {
  tenantId: string;
  companyName?: string;
  remindersEnabled?: boolean;
  reminderLeadDays?: number;
}

/** Tenants that have opted in. Reminders are off until explicitly enabled. */
async function tenantsWithReminders(): Promise<TenantCfg[]> {
  // Config rows are few (one per tenant), so a filtered scan is appropriate
  // here in a way it would never be for jobs.
  const res = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'begins_with(PK, :p) AND SK = :s',
    ExpressionAttributeValues: { ':p': 'TENANT_CONFIG#', ':s': 'CONFIG' },
  }));
  return (res.Items ?? [])
    .map((it) => ({
      tenantId: String(it.PK).replace('TENANT_CONFIG#', ''),
      companyName: it.companyName as string | undefined,
      remindersEnabled: it.remindersEnabled !== false,
      reminderLeadDays: typeof it.reminderLeadDays === 'number' ? it.reminderLeadDays : DEFAULT_LEAD_DAYS,
    }))
    .filter((c) => c.remindersEnabled);
}

async function jobsOn(tenantId: string, date: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': `TENANT#${tenantId}#JOBS`,
      ':from': `DATE#${date}`,
      ':to': `DATE#${date}#~`,
    },
  }));
  return res.Items ?? [];
}

/**
 * Reminders can ask to be sent up to MAX_LEAD_DAYS ahead of their own date, so
 * "what do I send today" spans a window rather than a single day: everything
 * from today out to the furthest lead time.
 */
const MAX_LEAD_DAYS = 30;

async function remindersBetween(tenantId: string, from: string, to: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: REMINDERS_TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': `TENANT#${tenantId}#REMINDERS`,
      ':from': `DATE#${from}`,
      ':to': `DATE#${to}#~`,
    },
  }));
  return res.Items ?? [];
}

/** Statuses where an appointment reminder still makes sense. */
const REMINDABLE = new Set(['Scheduled', 'scheduled', 'Dispatched', 'dispatched']);

export const handler = async (): Promise<{ sent: number; considered: number }> => {
  const today = ymd(new Date());
  let sent = 0;
  let considered = 0;

  for (const cfg of await tenantsWithReminders()) {
    const lead = cfg.reminderLeadDays ?? DEFAULT_LEAD_DAYS;
    const target = addDays(today, lead);

    // ── Job appointment reminders ────────────────────────────────────
    for (const job of await jobsOn(cfg.tenantId, target)) {
      considered++;
      if (!REMINDABLE.has(String(job.status ?? ''))) continue;
      if (!job.customerPhone) continue;

      const when = lead === 0 ? 'today' : lead === 1 ? 'tomorrow' : `on ${target}`;
      const link = portalLink(job.shareToken as string | undefined);
      const body =
        `${cfg.companyName || 'Your installer'}: a reminder that your installation ` +
        `for ${job.jobName || 'your job'} is scheduled ${when}` +
        `${job.scheduledTime ? ` at ${job.scheduledTime}` : ''}.` +
        (link ? ` Details: ${link}` : '');

      const state = await queueSms({
        tenantId: cfg.tenantId,
        to: job.customerPhone as string,
        jobId: job.jobId as string,
        trigger: `reminder:job:${target}`,
        // One reminder per job per target date, no matter how often this runs.
        dedupeKey: `rem_job_${job.jobId}_${target}`,
        body,
      });
      if (state === 'sent') sent++;
    }

    // ── Calendar reminder items ──────────────────────────────────────
    for (const rem of await remindersBetween(cfg.tenantId, today, addDays(today, MAX_LEAD_DAYS))) {
      considered++;
      if (rem.done || !rem.smsTo) continue;
      // A reminder dated D with lead L goes out on D-L, so today only sends
      // the ones whose send date is exactly today.
      const leadDays = typeof rem.smsLeadDays === 'number' ? rem.smsLeadDays : 0;
      if (addDays(String(rem.date), -leadDays) !== today) continue;

      const state = await queueSms({
        tenantId: cfg.tenantId,
        to: rem.smsTo as string,
        reminderId: rem.id as string,
        trigger: `reminder:item:${rem.date}`,
        dedupeKey: `rem_item_${rem.id}_${rem.date}`,
        body:
          `${cfg.companyName || 'Reminder'}: ${rem.title}` +
          `${rem.time ? ` at ${rem.time}` : ''}${leadDays > 0 ? ` (${rem.date})` : ''}`,
      });
      if (state === 'sent') sent++;
    }
  }

  console.log(`[scheduler] considered=${considered} sent=${sent}`);
  return { sent, considered };
};

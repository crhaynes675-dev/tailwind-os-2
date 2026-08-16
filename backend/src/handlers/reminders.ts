import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';
import { normalizePhone } from '../lib/notify';

/**
 * Calendar reminders — dated items that aren't jobs.
 *
 * Plenty of scheduled work isn't a work order: call a builder about access,
 * chase a material order, follow up after a walkthrough. Those lived in
 * someone's head or a paper diary; now they sit on the same calendar as the
 * installs they affect.
 *
 *   PK = TENANT#{t}#REMINDER#{id}   SK = METADATA
 *   GSI1PK = TENANT#{t}#REMINDERS   GSI1SK = DATE#{date}#{id}
 *
 * The GSI is keyed by date so the scheduled sender can pull "everything due on
 * this day" with one query, exactly like jobs.
 */

const ID_RE = /^rem_[A-Za-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReminderInput {
  title?: string;
  date?: string;
  endDate?: string;
  time?: string;
  owner?: string;
  notes?: string;
  jobId?: string;
  done?: boolean;
  /** Send an SMS ahead of this reminder. */
  smsTo?: string;
  smsLeadDays?: number;
}

/** Validate and normalize a reminder payload. Returns an error string or null. */
export function validateReminder(body: ReminderInput): string | null {
  const title = String(body.title ?? '').trim();
  if (title.length < 1) return 'A title is required.';
  if (title.length > 200) return 'That title is too long.';
  if (!DATE_RE.test(String(body.date ?? ''))) return 'A valid date (YYYY-MM-DD) is required.';
  if (body.endDate && !DATE_RE.test(body.endDate)) return 'End date must be YYYY-MM-DD.';
  if (body.endDate && body.endDate < String(body.date)) return 'End date cannot be before the start date.';
  if (body.time && !/^\d{2}:\d{2}$/.test(body.time)) return 'Time must be HH:MM.';
  if (body.smsTo && !normalizePhone(body.smsTo)) return 'That phone number is not a number we can text.';
  if (body.smsLeadDays !== undefined) {
    const n = Number(body.smsLeadDays);
    if (!Number.isInteger(n) || n < 0 || n > 30) return 'Lead time must be between 0 and 30 days.';
  }
  return null;
}

/** Shape a validated payload into the stored record. */
export function buildReminder(t: string, id: string, body: ReminderInput, now: string, createdAt?: string) {
  const date = String(body.date);
  return {
    PK: tpk(t, 'REMINDER', id),
    SK: 'METADATA',
    GSI1PK: tgsi(t, 'REMINDERS'),
    GSI1SK: `DATE#${date}#${id}`,
    tenantId: t,
    id,
    title: String(body.title).trim(),
    date,
    endDate: body.endDate && body.endDate >= date ? body.endDate : undefined,
    time: body.time || undefined,
    owner: body.owner?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    // Optional link back to a job, so a reminder can hang off a work order.
    jobId: body.jobId || undefined,
    done: !!body.done,
    smsTo: body.smsTo ? normalizePhone(body.smsTo) ?? undefined : undefined,
    smsLeadDays: body.smsLeadDays !== undefined ? Number(body.smsLeadDays) : undefined,
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, queryStringParameters } = event;
    const id = event.pathParameters?.reminderId;

    // GET /reminders?from=YYYY-MM-DD&to=YYYY-MM-DD
    if (httpMethod === 'GET' && !id) {
      const from = queryStringParameters?.from ?? '0000-00-00';
      const to = queryStringParameters?.to ?? '9999-99-99';
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': tgsi(t, 'REMINDERS'),
          ':from': `DATE#${from}`,
          ':to': `DATE#${to}#~`,
        },
      }));
      return ok(res.Items ?? [], event);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}') as ReminderInput;
      const invalid = validateReminder(body);
      if (invalid) return badRequest(invalid, event);

      const newId = `rem_${randomUUID().slice(0, 12)}`;
      const now = new Date().toISOString();
      const item = buildReminder(t, newId, body, now);
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, event);
    }

    if (!id || !ID_RE.test(id)) return badRequest('A valid reminderId is required', event);
    const key = { PK: tpk(t, 'REMINDER', id), SK: 'METADATA' };

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}') as ReminderInput;
      const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));
      if (!existing.Item) return notFound('Reminder not found', event);

      // Merge onto the stored record so a partial update (e.g. just `done`)
      // doesn't blank the fields it didn't mention.
      const merged = { ...existing.Item, ...body } as ReminderInput;
      const invalid = validateReminder(merged);
      if (invalid) return badRequest(invalid, event);

      const item = buildReminder(t, id, merged, new Date().toISOString(), existing.Item.createdAt as string);
      // A date change moves the GSI1SK, and the old row is replaced in place
      // because the primary key is unchanged.
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, event);
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: key }));
      return ok({ deleted: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

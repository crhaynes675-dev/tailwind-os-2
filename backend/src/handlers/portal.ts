import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../lib/response';
import { tpk } from '../lib/tenant';
import { resolveShareToken } from '../lib/share';
import { stripeRequest, StripeError } from '../lib/stripe';
import {
  customerView, customerStatus, invoiceView, isSignatureFile, APPROVAL_STEP,
} from '../lib/customerView';

const s3 = new S3Client({ region: process.env.REGION ?? 'us-east-1' });
const BUCKET = process.env.ATTACHMENTS_BUCKET!;

/**
 * Customer-facing job portal. PUBLIC — no authorizer sits in front of this,
 * so every response is built by explicitly picking fields onto a fresh object.
 * Never spread the job record: a future column added upstream would silently
 * become customer-visible.
 */


/** Photos only. Internal documents and paperwork never reach the portal. */
const PHOTO_TYPES = /^image\//;


export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = event.pathParameters?.token;
    const { httpMethod } = event;
    const link = await resolveShareToken(String(token ?? ''));
    // Same response for unknown, malformed, and revoked — a public endpoint
    // shouldn't confirm which job ids or tokens exist.
    if (!link) return notFound('This link is no longer active.', event);

    const { tenantId: t, jobId } = link;

    const jobRes = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: tpk(t, 'JOB', jobId), SK: 'METADATA' },
    }));
    const job = jobRes.Item;
    if (!job) return notFound('This link is no longer active.', event);

    if (httpMethod === 'GET') {
      const cfgRes = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `TENANT_CONFIG#${t}`, SK: 'CONFIG' },
        ProjectionExpression: 'companyName, stripeConnectId',
      }));
      const connect = cfgRes.Item;

      const attRes = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': tpk(t, 'JOB', jobId), ':sk': 'ATTACH#' },
      }));

      const photos = await Promise.all(
        (attRes.Items ?? [])
          .filter((it) => PHOTO_TYPES.test(String(it.contentType ?? '')))
          .filter((it) => !isSignatureFile(it.filename))
          .sort((a, b) => (String(a.uploadedAt) < String(b.uploadedAt) ? 1 : -1))
          .slice(0, 24)
          .map(async (it) => ({
            id: it.attachId,
            takenAt: it.uploadedAt,
            url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: it.s3Key }), { expiresIn: 3600 }),
          })),
      );

      // Every field a customer sees is decided by customerView — a pure,
      // tested allow-list rather than an inline object literal.
      return ok(customerView({
        job,
        companyName: connect?.companyName as string | undefined,
        photos,
        canTakeCard: !!connect?.stripeConnectId,
      }), event);
    }

    // POST /public/jobs/{token}/pay — start a card payment for the invoice.
    if (httpMethod === 'POST' && event.path?.endsWith('/pay')) {
      const cfg = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `TENANT_CONFIG#${t}`, SK: 'CONFIG' },
        ProjectionExpression: 'companyName, stripeConnectId',
      }));
      const acct = cfg.Item?.stripeConnectId as string | undefined;
      if (!acct) return badRequest('Card payment is not available for this job.', event);

      const inv = invoiceView(job, true).invoice;
      if (!inv || inv.status !== 'invoiced') return badRequest('This invoice is not open for payment.', event);

      const amountCents = Math.round(Number(inv.amountDue) * 100);
      if (!Number.isFinite(amountCents) || amountCents < 50) {
        return badRequest('This invoice amount cannot be charged.', event);
      }

      const base = (process.env.PORTAL_BASE_URL ?? '').replace(/\/$/, '');
      const session = await stripeRequest<any>('POST', '/v1/checkout/sessions', {
        mode: 'payment',
        // Stripe redirects back here; the portal then confirms server-side, so
        // payment never depends on a webhook being wired up correctly.
        success_url: `${base}/j/${link.token}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/j/${link.token}`,
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': amountCents,
        'line_items[0][price_data][product_data][name]':
          `${job.jobName ?? 'Installation'}${job.workOrderNumber ? ` (${job.workOrderNumber})` : ''}`,
        'metadata[jobId]': jobId,
        'metadata[tenantId]': t,
      }, {
        // Charges land in the contractor's account, not ours.
        stripeAccount: acct,
        idempotencyKey: `pay-${jobId}-${amountCents}`,
      });

      return ok({ url: session.url }, event);
    }

    // POST /public/jobs/{token}/pay/confirm — verify a returning session.
    if (httpMethod === 'POST' && event.path?.endsWith('/pay/confirm')) {
      const body = JSON.parse(event.body ?? '{}');
      const sessionId = String(body.sessionId ?? '');
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return badRequest('Unknown payment session.', event);

      const cfg = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `TENANT_CONFIG#${t}`, SK: 'CONFIG' },
        ProjectionExpression: 'stripeConnectId',
      }));
      const acct = cfg.Item?.stripeConnectId as string | undefined;
      if (!acct) return badRequest('Card payment is not available for this job.', event);

      const session = await stripeRequest<any>('GET', `/v1/checkout/sessions/${sessionId}`, undefined, { stripeAccount: acct });
      // Trust Stripe's own record of the session, not the query string — and
      // check it belongs to this job so one job's session can't clear another.
      if (session.payment_status !== 'paid' || session.metadata?.jobId !== jobId) {
        return badRequest('That payment could not be confirmed.', event);
      }

      const now = new Date().toISOString();
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'JOB', jobId), SK: 'METADATA' },
        UpdateExpression: 'SET invoiceStatus = :p, paidAt = if_not_exists(paidAt, :n), stripeSessionId = :s, updatedAt = :n',
        ExpressionAttributeValues: { ':p': 'paid', ':n': now, ':s': sessionId },
      }));

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tpk(t, 'JOB', jobId),
          SK: `AUDIT#${now}#${randomUUID()}`,
          jobId, at: now, by: 'customer:portal',
          action: 'payment_received',
          detail: `Paid via card (${sessionId})`,
        },
      }));

      return ok({ paid: true, paidAt: now }, event);
    }

    // POST /public/jobs/{token}/approve — the customer signs off.
    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const name = String(body.name ?? '').trim();
      const signature = String(body.signature ?? '');

      if (name.length < 2 || name.length > 120) return badRequest('Please enter your full name.', event);
      const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(signature);
      if (!m) return badRequest('Please sign in the box before submitting.', event);

      const buf = Buffer.from(m[2], 'base64');
      // A real signature is a few KB; anything large is not one.
      if (buf.length < 200 || buf.length > 2_000_000) return badRequest('That signature could not be read.', event);

      if (job.customerApprovedAt) return badRequest('This job has already been approved.', event);

      const cs = customerStatus(job.status as string);
      if (cs.step < APPROVAL_STEP) return badRequest('This job is not ready for approval yet.', event);

      const now = new Date().toISOString();
      const attachId = randomUUID();
      const s3Key = `tenants/${t}/jobs/${jobId}/${attachId}/customersignoff-${now}.png`;

      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: s3Key, Body: buf, ContentType: m[1],
      }));

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tpk(t, 'JOB', jobId),
          SK: `ATTACH#${attachId}`,
          attachId, jobId, s3Key,
          filename: `customersignoff-${now}.png`,
          contentType: m[1],
          uploadedBy: `customer:${name}`,
          uploadedAt: now,
        },
      }));

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'JOB', jobId), SK: 'METADATA' },
        UpdateExpression:
          'SET customerApprovedAt = :n, customerApprovedName = :name, customerSignatureKey = :k, updatedAt = :n',
        ExpressionAttributeValues: { ':n': now, ':name': name, ':k': s3Key },
        // Two people opening the link at once must not both sign.
        ConditionExpression: 'attribute_not_exists(customerApprovedAt)',
      }));

      // Audit the approval against the job, same shape the staff app writes.
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tpk(t, 'JOB', jobId),
          SK: `AUDIT#${now}#${randomUUID()}`,
          jobId, at: now,
          by: `customer:${name}`,
          action: 'customer_approved',
          detail: 'Approved via customer portal',
        },
      }));

      return ok({ approvedAt: now, approvedBy: name }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return badRequest('This job has already been approved.', event);
    }
    if (err instanceof StripeError) return badRequest(err.message, event);
    return serverError(err, event);
  }
};

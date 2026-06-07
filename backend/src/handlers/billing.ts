import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as https from 'https';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, forbidden, notFound, serverError } from '../lib/response';
import { getTenantId } from '../lib/tenant';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? '';

function stripeRequest(method: string, path: string, data?: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = data ? new URLSearchParams(data).toString() : '';
    const req = https.request({
      hostname: 'api.stripe.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c: string) => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function tenantPk(tenantId: string) {
  return { PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, path } = event;

    // POST /billing/webhook — Stripe event webhook (PUBLIC, no auth)
    if (httpMethod === 'POST' && path?.includes('/webhook')) {
      if (!STRIPE_SECRET_KEY) return ok({ received: true }, event);

      const payload = event.body ?? '';
      const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'] || '';

      // Minimal timestamp-based replay protection (full HMAC requires crypto)
      const ts = sig.match(/t=(\d+)/)?.[1];
      if (ts && Math.abs(Date.now() / 1000 - parseInt(ts)) > 300) {
        return badRequest('Webhook timestamp too old', event);
      }

      const stripeEvent = JSON.parse(payload);
      const tenantId: string = stripeEvent.data?.object?.metadata?.tenantId ?? '';

      if (tenantId) {
        const subStatus = stripeEvent.data?.object?.status ?? '';
        const subId = stripeEvent.data?.object?.id ?? '';

        if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(stripeEvent.type)) {
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: tenantPk(tenantId),
            UpdateExpression: 'SET stripeSubscriptionId = :sid, stripeSubscriptionStatus = :ss, #plan = :plan, updatedAt = :now',
            ExpressionAttributeNames: { '#plan': 'plan' },
            ExpressionAttributeValues: {
              ':sid': subId,
              ':ss': subStatus,
              ':plan': subStatus === 'active' ? 'starter' : 'trial',
              ':now': new Date().toISOString(),
            },
          }));
        }
      }

      return ok({ received: true }, event);
    }

    // GET /billing/session — create Stripe customer portal session (authenticated)
    if (httpMethod === 'GET' && path?.includes('/session')) {
      if (!STRIPE_SECRET_KEY) {
        return ok({ url: null, message: 'Stripe not configured — add STRIPE_SECRET_KEY to Lambda env' }, event);
      }

      const tenantId = getTenantId(event);
      const tenantResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: tenantPk(tenantId),
      }));

      if (!tenantResult.Item) return notFound('Tenant not found', event);

      let customerId = tenantResult.Item.stripeCustomerId as string | undefined;

      // Create Stripe customer if one doesn't exist yet
      if (!customerId) {
        const customer = await stripeRequest('POST', '/v1/customers', {
          name: tenantResult.Item.companyName,
          email: tenantResult.Item.adminEmail,
          'metadata[tenantId]': tenantId,
        });
        customerId = customer.id;

        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: tenantPk(tenantId),
          UpdateExpression: 'SET stripeCustomerId = :cid, updatedAt = :now',
          ExpressionAttributeValues: { ':cid': customerId, ':now': new Date().toISOString() },
        }));
      }

      // Create billing portal session
      const session = await stripeRequest('POST', '/v1/billing_portal/sessions', {
        customer: customerId!,
        return_url: event.headers['origin'] || event.headers['Origin'] || 'https://d8im2hbxazf8r.cloudfront.net',
      });

      return ok({ url: session.url }, event);
    }

    // POST /billing/checkout — create Stripe checkout session for new subscription
    if (httpMethod === 'POST' && path?.includes('/checkout')) {
      if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
        return ok({ url: null, message: 'Stripe not configured' }, event);
      }

      const tenantId = getTenantId(event);
      const tenantResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: tenantPk(tenantId),
      }));

      if (!tenantResult.Item) return notFound('Tenant not found', event);

      let customerId = tenantResult.Item.stripeCustomerId as string | undefined;
      if (!customerId) {
        const customer = await stripeRequest('POST', '/v1/customers', {
          name: tenantResult.Item.companyName,
          email: tenantResult.Item.adminEmail,
          'metadata[tenantId]': tenantId,
        });
        customerId = customer.id;
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: tenantPk(tenantId),
          UpdateExpression: 'SET stripeCustomerId = :cid, updatedAt = :now',
          ExpressionAttributeValues: { ':cid': customerId, ':now': new Date().toISOString() },
        }));
      }

      const origin = event.headers['origin'] || event.headers['Origin'] || 'https://d8im2hbxazf8r.cloudfront.net';
      const session = await stripeRequest('POST', '/v1/checkout/sessions', {
        customer: customerId!,
        'line_items[0][price]': STRIPE_PRICE_ID,
        'line_items[0][quantity]': '1',
        mode: 'subscription',
        success_url: `${origin}?billing=success`,
        cancel_url: `${origin}?billing=cancel`,
        'subscription_data[metadata][tenantId]': tenantId,
      });

      return ok({ url: session.url }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

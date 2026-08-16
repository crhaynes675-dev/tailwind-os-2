import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, forbidden, serverError } from '../lib/response';
import { getTenantId, getRole, isTenantAdmin } from '../lib/tenant';
import { stripeRequest, stripeConfigured, StripeError } from '../lib/stripe';

const APP_BASE_URL = (process.env.PORTAL_BASE_URL ?? '').replace(/\/$/, '');

const tenantPk = (tenantId: string) => ({ PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' });

/**
 * Stripe Connect onboarding — how a tenant becomes able to take card payments
 * from their own customers. Standard accounts are used deliberately: the
 * contractor keeps their own Stripe relationship, dashboard, and payout
 * schedule, and we never touch their funds or handle card data.
 *
 *   GET  /billing/connect  -> onboarding + charge-readiness status
 *   POST /billing/connect  -> create (or resume) onboarding, returns a URL
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!stripeConfigured()) return badRequest('Stripe is not configured on this environment.', event);

    const t = getTenantId(event);
    const cfgRes = await ddb.send(new GetCommand({ TableName: TABLE, Key: tenantPk(t) }));
    let accountId = cfgRes.Item?.stripeConnectId as string | undefined;

    if (event.httpMethod === 'GET') {
      if (!accountId) return ok({ connected: false, chargesEnabled: false }, event);
      const acct = await stripeRequest<any>('GET', `/v1/accounts/${accountId}`);
      return ok({
        connected: true,
        chargesEnabled: !!acct.charges_enabled,
        payoutsEnabled: !!acct.payouts_enabled,
        // Stripe asks for more information as volume grows; surfacing this is
        // what stops payments silently failing later.
        needsAttention: (acct.requirements?.currently_due ?? []).length > 0,
      }, event);
    }

    if (event.httpMethod === 'POST') {
      // Connecting a payout destination is a money decision, not an ops one.
      if (!isTenantAdmin(event)) {
        return forbidden(`Admin access required (your role is "${getRole(event) || 'unset'}")`, event);
      }

      if (!accountId) {
        const acct = await stripeRequest<any>('POST', '/v1/accounts', {
          type: 'standard',
          metadata: { tenantId: t },
        }, { idempotencyKey: `connect-acct-${t}` });
        accountId = acct.id as string;
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: tenantPk(t),
          UpdateExpression: 'SET stripeConnectId = :a, updatedAt = :n',
          ExpressionAttributeValues: { ':a': accountId, ':n': new Date().toISOString() },
        }));
      }

      // Account links are single-use and short-lived, so this is minted fresh
      // every time rather than stored.
      const link = await stripeRequest<any>('POST', '/v1/account_links', {
        account: accountId,
        type: 'account_onboarding',
        refresh_url: `${APP_BASE_URL}/plans?connect=retry`,
        return_url: `${APP_BASE_URL}/plans?connect=done`,
      });

      return ok({ url: link.url }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    if (err instanceof StripeError) return badRequest(err.message, event);
    return serverError(err, event);
  }
};

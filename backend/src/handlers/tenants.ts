import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, created, badRequest, notFound, forbidden, serverError } from '../lib/response';
import { getTenantId } from '../lib/tenant';

const cognito = new CognitoIdentityProviderClient({ region: process.env.REGION ?? 'us-east-1' });
const USER_POOL_ID = process.env.USER_POOL_ID!;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

function tenantPk(tenantId: string) {
  return { PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, path } = event;
    const isMe = path?.endsWith('/me');

    // GET /tenants/me — return current tenant config (authenticated)
    if (httpMethod === 'GET' && isMe) {
      const tenantId = getTenantId(event);
      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: tenantPk(tenantId),
      }));
      if (!result.Item) return notFound('Tenant not found');
      return ok(result.Item, event);
    }

    // POST /tenants — create a new company account (PUBLIC, no auth required)
    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const { companyName, industry, adminFirstName, adminLastName, adminEmail, adminUsername, password, adminPhone } = body;

      if (!companyName || !industry || !adminFirstName || !adminLastName || !adminEmail || !adminUsername || !password) {
        return badRequest('companyName, industry, adminFirstName, adminLastName, adminEmail, adminUsername, and password are all required', event);
      }

      // Gate public signup behind a shared access code (anti-abuse).
      const SIGNUP_ACCESS_CODE = process.env.SIGNUP_ACCESS_CODE || '';
      if (SIGNUP_ACCESS_CODE && String(body.accessCode || '').trim() !== SIGNUP_ACCESS_CODE) {
        return forbidden('Invalid signup access code. Contact Tailwind OS to get one.', event);
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(adminEmail))) {
        return badRequest('Enter a valid admin email.', event);
      }

      const VALID_INDUSTRIES = ['hvac','electrical','plumbing','roofing','painting','millwork',
        'flooring','tile','countertops','general_contracting','framing','concrete',
        'landscaping','property_management','inspection','other'];
      if (!VALID_INDUSTRIES.includes(industry)) {
        return badRequest('Invalid industry value', event);
      }

      const tenantId = slugify(companyName) + '-' + Date.now().toString(36).slice(-4);
      // Namespace the Cognito username by the company code so usernames can
      // repeat across companies and the entered code scopes login.
      const adminCognitoUsername = `${tenantId}.${adminUsername}`;
      const now = new Date().toISOString();
      const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Create Cognito admin user for this tenant
      try {
        await cognito.send(new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: adminCognitoUsername,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: password,
          UserAttributes: [
            { Name: 'email',           Value: adminEmail },
            { Name: 'email_verified',  Value: 'true' },
            { Name: 'given_name',      Value: adminFirstName },
            { Name: 'family_name',     Value: adminLastName },
            { Name: 'custom:role',     Value: 'admin' },
            { Name: 'custom:tenantId', Value: tenantId },
          ],
        }));
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === 'UsernameExistsException') return badRequest('That admin username is already taken — pick another.', event);
        if (name === 'InvalidPasswordException') return badRequest('Password too weak — use at least 8 characters with upper, lower, and a number.', event);
        throw e;
      }

      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: adminCognitoUsername,
        Password: password,
        Permanent: true,
      }));

      // Create tenant config record in DynamoDB
      const tenantItem = {
        ...tenantPk(tenantId),
        GSI1PK: 'ALL_TENANTS',
        GSI1SK: `CREATED#${now}#${tenantId}`,
        tenantId,
        companyName,
        industry,
        adminFirstName,
        adminLastName,
        adminPhone: adminPhone ?? '',
        adminEmail,
        adminUsername,
        plan: 'trial',
        status: 'active',
        trialEndsAt,
        createdAt: now,
        updatedAt: now,
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: tenantItem }));

      return created({ tenantId, companyName, status: 'active', plan: 'trial', trialEndsAt }, event);
    }

    // PUT /tenants/me — update own tenant config (admin only)
    if (httpMethod === 'PUT' && isMe) {
      const claims = (event.requestContext?.authorizer as any)?.claims ?? {};
      if (claims['custom:role'] !== 'admin') return forbidden('Admin access required', event);
      const tenantId = getTenantId(event);

      const body = JSON.parse(event.body ?? '{}');
      if (body.plan && !['starter', 'pro', 'enterprise', 'trial'].includes(body.plan)) {
        return badRequest('Invalid plan', event);
      }
      // NOTE: 'plan' is self-serve while billing is in placeholder mode.
      // When Stripe is wired, drop it here and let the webhook set the plan.
      const allowed = ['companyName', 'industry', 'adminFirstName', 'adminLastName', 'adminEmail', 'adminPhone', 'plan'];
      const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
      if (!updates.length) return badRequest('No updatable fields provided', event);

      const expr   = updates.map(([k], i) => `#f${i} = :v${i}`).join(', ');
      const names  = Object.fromEntries(updates.map(([k], i) => [`#f${i}`, k]));
      const values = Object.fromEntries(updates.map(([k, v], i) => [`:v${i}`, v]));
      values[':now'] = new Date().toISOString();
      names['#ua']  = 'updatedAt';

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: tenantPk(tenantId),
        UpdateExpression: `SET ${expr}, #ua = :now`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }));

      return ok({ updated: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      return badRequest('Username already exists', event);
    }
    if (err.name === 'InvalidPasswordException') {
      return badRequest('Password does not meet requirements: ' + err.message, event);
    }
    return serverError(err, event);
  }
};

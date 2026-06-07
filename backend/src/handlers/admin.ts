import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, forbidden, notFound, serverError } from '../lib/response';

const cognito = new CognitoIdentityProviderClient({ region: process.env.REGION ?? 'us-east-1' });
const USER_POOL_ID = process.env.USER_POOL_ID!;

function isSuperAdmin(event: APIGatewayProxyEvent): boolean {
  const claims = (event.requestContext?.authorizer as any)?.claims ?? {};
  return claims['custom:role'] === 'super_admin';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isSuperAdmin(event)) return forbidden('Super admin access required', event);

    const { httpMethod, pathParameters } = event;
    const tenantId = pathParameters?.tenantId;

    // GET /admin/tenants — list all tenants
    if (httpMethod === 'GET' && !tenantId) {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'ALL_TENANTS' },
        ScanIndexForward: false,
        Limit: 500,
      }));

      const tenants = result.Items ?? [];

      // Augment each tenant with user count from Cognito
      const augmented = await Promise.all(tenants.map(async (tenant) => {
        try {
          const users = await cognito.send(new ListUsersCommand({
            UserPoolId: USER_POOL_ID,
            Filter: `"custom:tenantId" = "${tenant.tenantId}"`,
            Limit: 60,
          }));
          return { ...tenant, userCount: users.Users?.length ?? 0 };
        } catch {
          return { ...tenant, userCount: 0 };
        }
      }));

      return ok(augmented, event);
    }

    // PUT /admin/tenants/:tenantId — update tenant status or plan
    if (httpMethod === 'PUT' && tenantId) {
      const body = JSON.parse(event.body ?? '{}');
      const allowed = ['status', 'plan', 'companyName'];
      const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
      if (!updates.length) return badRequest('No updatable fields provided', event);

      const expr   = updates.map(([k], i) => `#f${i} = :v${i}`).join(', ');
      const names  = Object.fromEntries(updates.map(([k], i) => [`#f${i}`, k]));
      const values = Object.fromEntries(updates.map(([k, v], i) => [`:v${i}`, v]));
      values[':now'] = new Date().toISOString();
      names['#ua']  = 'updatedAt';

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' },
        UpdateExpression: `SET ${expr}, #ua = :now`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }));

      return ok({ updated: true }, event);
    }

    // DELETE /admin/tenants/:tenantId — delete tenant config record
    if (httpMethod === 'DELETE' && tenantId) {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `TENANT_CONFIG#${tenantId}`, SK: 'CONFIG' },
      }));
      return ok({ deleted: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

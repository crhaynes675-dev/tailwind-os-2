import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk } from '../lib/tenant';

// Field step checklists (Readiness, Installation, Post-Install, Delivery,
// Manager) — stored in the OS3 table, shared across users.
//   PK = TENANT#{t}#CHECKLIST#{ns}   SK = {itemId}   steps: string[]
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const ns = pathParameters?.ns;
    const itemId = pathParameters?.itemId;
    if (!ns) return badRequest('ns is required', event);

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': tpk(t, 'CHECKLIST', ns) },
        Limit: 2000,
      }));
      const map: Record<string, string[]> = {};
      (result.Items ?? []).forEach((i) => { map[i.SK] = i.steps ?? []; });
      return ok(map, event);
    }

    if (httpMethod === 'PUT') {
      if (!itemId) return badRequest('itemId is required', event);
      const body = JSON.parse(event.body ?? '{}');
      const steps: string[] = Array.isArray(body.steps) ? body.steps : [];
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tpk(t, 'CHECKLIST', ns),
          SK: itemId,
          tenantId: t,
          ns,
          itemId,
          steps,
          updatedAt: new Date().toISOString(),
        },
      }));
      return ok({ ns, itemId, steps }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

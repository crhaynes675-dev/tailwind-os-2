import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, notFound, forbidden, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';
import { planAllows } from '../lib/plan';
import { randomUUID } from 'crypto';

// Service tickets (Workflows 08/09) — stored in the OS3 table.
//   PK = TENANT#{t}#SERVICE#{id}   SK = METADATA
//   GSI1PK = TENANT#{t}#SERVICE_TICKETS   GSI1SK = CREATED#{ts}#{id}
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    if (!(await planAllows(t, 'service'))) return forbidden('Service tickets require the Enterprise plan.', event);
    const { httpMethod, pathParameters } = event;
    const id = pathParameters?.id;

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': tgsi(t, 'SERVICE_TICKETS') },
        ScanIndexForward: false,
        Limit: 1000,
      }));
      return ok(result.Items ?? [], event);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      if (!body.customer) return badRequest('customer is required', event);
      const newId = 'svc_' + randomUUID().slice(0, 8);
      const now = new Date().toISOString();
      const item = {
        PK: tpk(t, 'SERVICE', newId), SK: 'METADATA',
        GSI1PK: tgsi(t, 'SERVICE_TICKETS'),
        GSI1SK: `CREATED#${now}#${newId}`,
        tenantId: t,
        id: newId,
        customer: body.customer,
        description: body.description ?? '',
        type: body.type === 'leak' ? 'leak' : 'service',
        stage: 'Logged',
        tech: body.tech ?? '',
        leakSteps: [] as string[],
        createdAt: now,
        updatedAt: now,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, event);
    }

    if (!id) return badRequest('id is required', event);

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: tpk(t, 'SERVICE', id), SK: 'METADATA' } }));
      if (!existing.Item) return notFound('Ticket not found', event);
      const merged = {
        ...existing.Item,
        ...body,
        PK: tpk(t, 'SERVICE', id), SK: 'METADATA',
        GSI1PK: tgsi(t, 'SERVICE_TICKETS'),
        GSI1SK: existing.Item.GSI1SK,
        id,
        tenantId: t,
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: merged }));
      return ok(merged, event);
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: tpk(t, 'SERVICE', id), SK: 'METADATA' } }));
      return ok({ deleted: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

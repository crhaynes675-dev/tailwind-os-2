import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const customerId = pathParameters?.customerId;

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': tgsi(t, 'CDB_RECORDS') },
        ScanIndexForward: false,
        Limit: 2000,
      }));
      return ok(result.Items ?? []);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const id   = body.id || ('cdb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const date = body.added || new Date().toISOString().slice(0, 10);
      const item = {
        PK: tpk(t, 'CDB', id), SK: 'RECORD',
        GSI1PK: tgsi(t, 'CDB_RECORDS'),
        GSI1SK: `ADDED#${date}#${id}`,
        ...body, id, added: date,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ id });
    }

    if (!customerId) return badRequest('customerId is required');

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const date = body.added || new Date().toISOString().slice(0, 10);
      const item = {
        PK: tpk(t, 'CDB', customerId), SK: 'RECORD',
        GSI1PK: tgsi(t, 'CDB_RECORDS'),
        GSI1SK: `ADDED#${date}#${customerId}`,
        ...body, id: customerId,
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ saved: true });
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'CDB', customerId), SK: 'RECORD' },
      }));
      return ok({ deleted: true });
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

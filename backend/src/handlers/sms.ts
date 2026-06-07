import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const messageId = pathParameters?.messageId;

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': tgsi(t, 'SMS_QUEUE') },
        ScanIndexForward: false,
        Limit: 200,
      }));
      return ok(result.Items ?? []);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const id   = body.id || ('sms_' + Date.now());
      const ts   = body.created || new Date().toISOString();
      const item = {
        PK: tpk(t, 'SMS', id), SK: 'MESSAGE',
        GSI1PK: tgsi(t, 'SMS_QUEUE'),
        GSI1SK: `CREATED#${ts}#${id}`,
        ...body, id, created: ts,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ id });
    }

    if (!messageId) return badRequest('messageId is required');

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const ts   = body.created || new Date().toISOString();
      const item = {
        PK: tpk(t, 'SMS', messageId), SK: 'MESSAGE',
        GSI1PK: tgsi(t, 'SMS_QUEUE'),
        GSI1SK: `CREATED#${ts}#${messageId}`,
        ...body, id: messageId,
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ saved: true });
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

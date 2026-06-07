import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const recordId = pathParameters?.recordId;

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': tgsi(t, 'NCI_RECORDS') },
        ScanIndexForward: false,
        Limit: 1000,
      }));
      return ok(result.Items ?? []);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const id   = body.id || ('nci_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const date = body.date || new Date().toISOString().slice(0, 10);
      const item = {
        PK: tpk(t, 'NCI', id), SK: 'RECORD',
        GSI1PK: tgsi(t, 'NCI_RECORDS'),
        GSI1SK: `DATE#${date}#${id}`,
        ...body, id,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ id });
    }

    if (!recordId) return badRequest('recordId is required');

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const date = body.date || new Date().toISOString().slice(0, 10);
      const item = {
        PK: tpk(t, 'NCI', recordId), SK: 'RECORD',
        GSI1PK: tgsi(t, 'NCI_RECORDS'),
        GSI1SK: `DATE#${date}#${recordId}`,
        ...body, id: recordId,
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ saved: true });
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'NCI', recordId), SK: 'RECORD' },
      }));
      return ok({ deleted: true });
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

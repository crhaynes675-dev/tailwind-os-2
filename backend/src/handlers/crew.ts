import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const crewId = pathParameters?.crewId;

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': tgsi(t, 'CREW_ROSTER') },
        Limit: 500,
      }));
      return ok(result.Items ?? []);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const id   = body.id || ('cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const name = body.name || 'Unknown';
      const item = {
        PK: tpk(t, 'CREW', id), SK: 'MEMBER',
        GSI1PK: tgsi(t, 'CREW_ROSTER'),
        GSI1SK: `NAME#${name}#${id}`,
        ...body, id,
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ id });
    }

    if (!crewId) return badRequest('crewId is required');

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const name = body.name || 'Unknown';
      const item = {
        PK: tpk(t, 'CREW', crewId), SK: 'MEMBER',
        GSI1PK: tgsi(t, 'CREW_ROSTER'),
        GSI1SK: `NAME#${name}#${crewId}`,
        ...body, id: crewId,
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ saved: true });
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'CREW', crewId), SK: 'MEMBER' },
      }));
      return ok({ deleted: true });
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

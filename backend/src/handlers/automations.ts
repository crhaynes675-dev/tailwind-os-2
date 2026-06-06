import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';

// Automation rules
// PK: AUTO#<id>  SK: RULE
// GSI1PK: AUTO_RULES  GSI1SK: CREATED#<ts>#<id>

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters } = event;
    const ruleId = pathParameters?.ruleId;

    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'AUTO_RULES' },
        ScanIndexForward: false,
        Limit: 500,
      }));
      return ok(result.Items ?? []);
    }

    if (httpMethod === 'POST') {
      const body    = JSON.parse(event.body ?? '{}');
      const id      = body.id || ('ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const created = body.created || new Date().toISOString();
      const item    = {
        PK: `AUTO#${id}`, SK: 'RULE',
        GSI1PK: 'AUTO_RULES',
        GSI1SK: `CREATED#${created}#${id}`,
        ...body,
        id,
        created,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ id });
    }

    if (!ruleId) return badRequest('ruleId is required');

    if (httpMethod === 'PUT') {
      const body    = JSON.parse(event.body ?? '{}');
      const created = body.created || new Date().toISOString();
      const item    = {
        PK: `AUTO#${ruleId}`, SK: 'RULE',
        GSI1PK: 'AUTO_RULES',
        GSI1SK: `CREATED#${created}#${ruleId}`,
        ...body,
        id: ruleId,
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ saved: true });
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `AUTO#${ruleId}`, SK: 'RULE' },
      }));
      return ok({ deleted: true });
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

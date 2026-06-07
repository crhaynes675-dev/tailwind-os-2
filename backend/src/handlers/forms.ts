import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, notFound, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk } from '../lib/tenant';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const formId = pathParameters?.formId;
    if (!formId) return badRequest('formId is required');

    if (httpMethod === 'GET') {
      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'FORM', formId), SK: 'SNAPSHOT' },
      }));
      if (!result.Item) return notFound('Form not found');
      return ok(result.Item);
    }

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const item = {
        PK:        tpk(t, 'FORM', formId),
        SK:        'SNAPSHOT',
        formId,
        fields:    body.fields    ?? {},
        unitRows:  body.unitRows  ?? [],
        dlVisible: body.dlVisible ?? false,
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

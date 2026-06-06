import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, notFound, badRequest, serverError } from '../lib/response';

// Stores the calculator form snapshot (fields + unit rows) keyed by a formId
// (typically the EJN / external job number, or a client-generated UUID).
// PK: FORM#<formId>   SK: SNAPSHOT

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters } = event;
    const formId = pathParameters?.formId;
    if (!formId) return badRequest('formId is required');

    if (httpMethod === 'GET') {
      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `FORM#${formId}`, SK: 'SNAPSHOT' },
      }));
      if (!result.Item) return notFound('Form not found');
      return ok(result.Item);
    }

    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');
      const item = {
        PK:        `FORM#${formId}`,
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

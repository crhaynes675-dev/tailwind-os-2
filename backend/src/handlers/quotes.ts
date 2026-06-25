import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, QueryCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';
import { randomUUID } from 'crypto';

// Saved estimator quotes.
//   PK     = TENANT#{t}#QUOTE#{id}   SK = METADATA
//   GSI1PK = TENANT#{t}#QUOTES       GSI1SK = CREATED#{ts}#{id}
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters } = event;
    const quoteId = pathParameters?.quoteId;

    if (httpMethod === 'GET' && !quoteId) {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': tgsi(t, 'QUOTES') },
        ScanIndexForward: false,
        Limit: 500,
      }));
      return ok(res.Items ?? [], event);
    }

    if (httpMethod === 'GET' && quoteId) {
      const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: tpk(t, 'QUOTE', quoteId), SK: 'METADATA' } }));
      if (!res.Item) return notFound('Not found', event);
      return ok(res.Item, event);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const id = randomUUID();
      const now = new Date().toISOString();
      const quoteNumber = body.quoteNumber || `Q-${now.slice(0, 4)}-${id.slice(0, 4).toUpperCase()}`;
      const item = {
        PK: tpk(t, 'QUOTE', id), SK: 'METADATA',
        GSI1PK: tgsi(t, 'QUOTES'), GSI1SK: `CREATED#${now}#${id}`,
        quoteId: id,
        quoteNumber,
        customerName: body.customerName ?? '',
        customerCompany: body.customerCompany ?? '',
        jobName: body.jobName ?? '',
        address: body.address ?? '',
        units: body.units ?? [],
        inputs: body.inputs ?? {},
        totalCost: body.totalCost ?? 0,
        totalToInvoice: body.totalToInvoice ?? 0,
        margin: body.margin ?? 0,
        totalUnits: body.totalUnits ?? 0,
        status: 'open',
        notes: body.notes ?? '',
        createdBy: (event.requestContext.authorizer?.claims?.['cognito:username'] as string) ?? 'unknown',
        createdAt: now,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok({ quoteId: id, quoteNumber }, event);
    }

    if (httpMethod === 'DELETE' && quoteId) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: tpk(t, 'QUOTE', quoteId), SK: 'METADATA' } }));
      return ok({ deleted: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

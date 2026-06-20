import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';

// Tech vacation / time-off blocks. One record per block.
//   PK     = TENANT#{t}#VACATION#{id}   SK = RECORD
//   GSI1PK = TENANT#{t}#VACATIONS       GSI1SK = DATE#{startDate}#{id}
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters, queryStringParameters } = event;
    const vacationId = pathParameters?.vacationId;

    // GET /vacations — list all blocks, optional ?from=YYYY-MM-DD&to=YYYY-MM-DD on start date
    if (httpMethod === 'GET') {
      const from = queryStringParameters?.from;
      const to   = queryStringParameters?.to;
      const useRange = !!(from || to);
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: useRange
          ? 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to'
          : 'GSI1PK = :pk',
        ExpressionAttributeValues: useRange
          ? { ':pk': tgsi(t, 'VACATIONS'), ':from': `DATE#${from ?? '0000-00-00'}`, ':to': `DATE#${to ?? '9999-99-99'}#~` }
          : { ':pk': tgsi(t, 'VACATIONS') },
        ScanIndexForward: true,
        Limit: 2000,
      }));
      return ok(result.Items ?? [], event);
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      if (!body.techId)    return badRequest('techId is required', event);
      if (!body.startDate) return badRequest('startDate is required', event);
      const id    = body.vacationId || ('vac_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const start = body.startDate;
      const end   = body.endDate || start;
      const now   = new Date().toISOString();
      const item = {
        PK: tpk(t, 'VACATION', id), SK: 'RECORD',
        GSI1PK: tgsi(t, 'VACATIONS'),
        GSI1SK: `DATE#${start}#${id}`,
        tenantId: t,
        vacationId: id,
        techId:    body.techId,
        techName:  body.techName ?? '',
        startDate: start,
        endDate:   end,
        type:      body.type ?? 'vacation',   // vacation | pto | sick | unavailable
        notes:     body.notes ?? '',
        createdAt: now,
        updatedAt: now,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, event);
    }

    if (!vacationId) return badRequest('vacationId is required', event);

    if (httpMethod === 'PUT') {
      const body  = JSON.parse(event.body ?? '{}');
      const start = body.startDate || new Date().toISOString().slice(0, 10);
      const end   = body.endDate || start;
      const now   = new Date().toISOString();
      const item = {
        PK: tpk(t, 'VACATION', vacationId), SK: 'RECORD',
        GSI1PK: tgsi(t, 'VACATIONS'),
        GSI1SK: `DATE#${start}#${vacationId}`,
        tenantId: t,
        vacationId,
        techId:    body.techId ?? '',
        techName:  body.techName ?? '',
        startDate: start,
        endDate:   end,
        type:      body.type ?? 'vacation',
        notes:     body.notes ?? '',
        updatedAt: now,
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(item, event);
    }

    if (httpMethod === 'DELETE') {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'VACATION', vacationId), SK: 'RECORD' },
      }));
      return ok({ deleted: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, created, noContent, notFound, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk, tgsi } from '../lib/tenant';
import { randomUUID } from 'crypto';

function callerUsername(event: APIGatewayProxyEvent): string {
  return (event.requestContext.authorizer?.claims?.['cognito:username'] as string) ?? 'unknown';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const { httpMethod, pathParameters, queryStringParameters } = event;
    const jobId = pathParameters?.jobId;

    // GET /jobs — list all jobs, optional ?from=YYYY-MM-DD&to=YYYY-MM-DD&parentJobId=UUID
    if (httpMethod === 'GET' && !jobId) {
      const from        = queryStringParameters?.from        ?? '0000-00-00';
      const to          = queryStringParameters?.to          ?? '9999-99-99';
      const parentJobId = queryStringParameters?.parentJobId ?? null;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk':   tgsi(t, 'JOBS'),
          ':from': `DATE#${from}`,
          ':to':   `DATE#${to}#~`,
        },
      }));

      let items = result.Items ?? [];
      if (parentJobId) {
        items = items.filter(i => i.parentJobId === parentJobId);
      }
      return ok(items);
    }

    // GET /jobs/:jobId — full job detail (metadata + all sub-items)
    if (httpMethod === 'GET' && jobId) {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': tpk(t, 'JOB', jobId) },
      }));
      if (!result.Items?.length) return notFound();

      const meta  = result.Items.find(i => i.SK === 'METADATA');
      const units = result.Items.filter(i => i.SK.startsWith('UNIT#'));
      return ok({ ...meta, units });
    }

    // POST /jobs — create a new job
    if (httpMethod === 'POST' && !jobId) {
      const body = JSON.parse(event.body ?? '{}');
      if (!body.jobName) return badRequest('jobName is required');

      const id  = randomUUID();
      const now = new Date().toISOString();
      const date = (body.scheduledDate ?? now.slice(0, 10));

      // Atomically increment per-tenant WO counter to get a sequential number
      const counterResult = await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `TENANT#${t}#COUNTER`, SK: 'WO_COUNTER' },
        UpdateExpression: 'ADD #cnt :one',
        ExpressionAttributeNames: { '#cnt': 'count' },
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'UPDATED_NEW',
      }));
      const woSeq = counterResult.Attributes?.count ?? 1;
      const workOrderNumber = `WO-${new Date().getFullYear()}-${String(woSeq).padStart(4, '0')}`;

      const item: Record<string, any> = {
        PK: tpk(t, 'JOB', id),
        SK: 'METADATA',
        GSI1PK: tgsi(t, 'JOBS'),
        GSI1SK: `DATE#${date}#${id}`,
        GSI2PK: body.assignedTo ? tgsi(t, `USER#${body.assignedTo}`) : undefined,
        GSI2SK: body.assignedTo ? `DATE#${date}#${id}` : undefined,
        tenantId: t,
        jobId: id,
        workOrderNumber,
        jobName: body.jobName,
        address: body.address ?? '',
        scheduledDate: date,
        assignedTo: body.assignedTo ?? '',
        status: body.status ?? 'scheduled',
        notes: body.notes ?? '',
        quoteNum: body.quoteNum ?? '',
        createdBy: callerUsername(event),
        createdAt: now,
        updatedAt: now,
      };

      // Preserve parent link for sub work orders created by the mobile app
      if (body.parentJobId) item.parentJobId = body.parentJobId;

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tpk(t, 'JOB', id),
          SK: `AUDIT#${now}#${randomUUID()}`,
          action: 'created',
          user: callerUsername(event),
          ts: now,
        },
      }));

      return created(item);
    }

    // PUT /jobs/:jobId — update job
    if (httpMethod === 'PUT' && jobId) {
      const body = JSON.parse(event.body ?? '{}');
      const now  = new Date().toISOString();

      const allowed = ['jobName', 'address', 'scheduledDate', 'assignedTo', 'status', 'notes', 'quoteNum', 'parentJobId'];
      const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
      if (!updates.length) return badRequest('No valid fields to update');

      const expr   = updates.map(([k], i) => `#f${i} = :v${i}`).join(', ');
      const names  = Object.fromEntries(updates.map(([k], i) => [`#f${i}`, k]));
      const values = Object.fromEntries(updates.map(([k, v], i) => [`:v${i}`, v]));
      values[':now'] = now;
      names['#ua']  = 'updatedAt';

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'JOB', jobId), SK: 'METADATA' },
        UpdateExpression: `SET ${expr}, #ua = :now`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }));

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tpk(t, 'JOB', jobId),
          SK: `AUDIT#${now}#${randomUUID()}`,
          action: 'updated',
          user: callerUsername(event),
          changes: Object.fromEntries(updates),
          ts: now,
        },
      }));

      return ok({ jobId, updated: true });
    }

    // DELETE /jobs/:jobId — delete job and all sub-items
    if (httpMethod === 'DELETE' && jobId) {
      const existing = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': tpk(t, 'JOB', jobId) },
        ProjectionExpression: 'PK, SK',
      }));

      const items = existing.Items ?? [];
      if (!items.length) return notFound();

      for (let i = 0; i < items.length; i += 25) {
        await ddb.send(new BatchWriteCommand({
          RequestItems: {
            [TABLE]: items.slice(i, i + 25).map(item => ({
              DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
            })),
          },
        }));
      }
      return noContent();
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

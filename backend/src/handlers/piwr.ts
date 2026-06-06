import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, created, noContent, notFound, badRequest, serverError } from '../lib/response';
import { randomUUID } from 'crypto';

function callerUsername(event: APIGatewayProxyEvent): string {
  return (event.requestContext.authorizer?.claims?.['cognito:username'] as string) ?? 'unknown';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters } = event;
    const jobId  = pathParameters?.jobId;
    const piwrId = pathParameters?.piwrId;

    if (!jobId) return badRequest('jobId is required');

    // GET /jobs/:jobId/piwr — list all PIWR rows for a job
    if (httpMethod === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk':     `JOB#${jobId}`,
          ':prefix': 'PIWR#',
        },
      }));
      return ok(result.Items ?? []);
    }

    // POST /jobs/:jobId/piwr — add a PIWR row
    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      const id   = randomUUID();
      const now  = new Date().toISOString();

      const item = {
        PK: `JOB#${jobId}`,
        SK: `PIWR#${id}`,
        piwrId: id,
        jobId,
        lineId:       body.lineId       ?? '',
        frameSize:    body.frameSize    ?? '',
        roughOpening: body.roughOpening ?? '',
        type:         body.type         ?? '',
        vendor:       body.vendor       ?? '',
        shims:        body.shims        ?? '',
        glass:        body.glass        ?? '',
        mullCovers:   body.mullCovers   ?? '',
        dripCap:      body.dripCap      ?? '',
        operates:     body.operates     ?? '',
        damage:       body.damage       ?? '',
        nailFins:     body.nailFins     ?? '',
        notes:        body.notes        ?? '',
        createdBy:    callerUsername(event),
        createdAt:    now,
        updatedAt:    now,
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return created(item);
    }

    // PUT /jobs/:jobId/piwr/:piwrId — update a PIWR row
    if (httpMethod === 'PUT' && piwrId) {
      const body = JSON.parse(event.body ?? '{}');
      const now  = new Date().toISOString();

      const fields = ['shims','glass','mullCovers','dripCap','operates','damage','nailFins','notes','lineId','frameSize','roughOpening','type','vendor'];
      const updates = Object.entries(body).filter(([k]) => fields.includes(k));
      if (!updates.length) return badRequest('No valid fields to update');

      const expr   = updates.map(([k], i) => `#f${i} = :v${i}`).join(', ');
      const names  = Object.fromEntries(updates.map(([k], i) => [`#f${i}`, k]));
      const values = Object.fromEntries(updates.map(([k, v], i) => [`:v${i}`, v]));
      values[':now'] = now;
      names['#ua']   = 'updatedAt';

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `JOB#${jobId}`, SK: `PIWR#${piwrId}` },
        UpdateExpression: `SET ${expr}, #ua = :now`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }));

      return ok({ piwrId, updated: true });
    }

    // DELETE /jobs/:jobId/piwr/:piwrId
    if (httpMethod === 'DELETE' && piwrId) {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `JOB#${jobId}`, SK: `PIWR#${piwrId}` },
        ConditionExpression: 'attribute_exists(PK)',
      }));
      return noContent();
    }

    return badRequest('Method not supported');
  } catch (err) {
    return serverError(err);
  }
};

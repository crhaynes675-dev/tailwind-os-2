import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../lib/response';
import { getTenantId, tpk } from '../lib/tenant';
import { createShareLink, getJobShareToken, revokeShareToken } from '../lib/share';

/**
 * Staff-side management of a job's customer link.
 *   GET    /jobs/{jobId}/share  -> current token (or null)
 *   POST   /jobs/{jobId}/share  -> mint a new token, revoking any previous one
 *   DELETE /jobs/{jobId}/share  -> revoke, leaving the job with no live link
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const jobId = event.pathParameters?.jobId;
    if (!jobId) return badRequest('jobId is required', event);

    const username = (event.requestContext.authorizer?.claims?.['cognito:username'] as string) ?? 'unknown';

    if (event.httpMethod === 'GET') {
      return ok({ token: await getJobShareToken(t, jobId) }, event);
    }

    if (event.httpMethod === 'POST') {
      // Only share a job that exists in *this* tenant — the token would
      // otherwise become a pointer to nothing (or to another tenant's id).
      const res = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'JOB', jobId), SK: 'METADATA' },
        ProjectionExpression: 'jobId',
      }));
      if (!res.Item) return notFound('Job not found', event);

      const link = await createShareLink(t, jobId, username);
      return ok({ token: link.token, createdAt: link.createdAt }, event);
    }

    if (event.httpMethod === 'DELETE') {
      const token = await getJobShareToken(t, jobId);
      if (token) await revokeShareToken(token);
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: tpk(t, 'JOB', jobId), SK: 'METADATA' },
        UpdateExpression: 'REMOVE shareToken, shareCreatedAt',
      }));
      return ok({ revoked: true }, event);
    }

    return badRequest('Method not supported', event);
  } catch (err) {
    return serverError(err, event);
  }
};

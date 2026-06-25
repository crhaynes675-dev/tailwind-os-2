import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { getTenantId, tpk } from '../lib/tenant';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.REGION ?? 'us-east-1' });
const BUCKET = process.env.ATTACHMENTS_BUCKET!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const t = getTenantId(event);
    const jobId = event.pathParameters?.jobId;
    if (!jobId) return badRequest('jobId is required');

    // GET /jobs/:jobId/attachments — list the job's attachments with
    // short-lived presigned download URLs so the web app (and mobile) can
    // view the field photos + signature that were uploaded against this job.
    if (event.httpMethod === 'GET') {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': tpk(t, 'JOB', jobId), ':sk': 'ATTACH#' },
      }));
      const attachments = await Promise.all((res.Items ?? []).map(async (it) => ({
        attachId:    it.attachId,
        filename:    it.filename,
        contentType: it.contentType,
        // The mobile app encodes the kind in the filename prefix
        // (during-…, after-…, signature-…), so derive a category from it.
        category:    String(it.filename ?? '').split('-')[0] || 'attachment',
        uploadedBy:  it.uploadedBy,
        uploadedAt:  it.uploadedAt,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: it.s3Key }),
          { expiresIn: 3600 }
        ),
      })));
      attachments.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
      return ok({ attachments }, event);
    }

    const body = JSON.parse(event.body ?? '{}');
    if (!body.filename || !body.contentType) {
      return badRequest('filename and contentType are required');
    }

    const attachId = randomUUID();
    const s3Key    = `tenants/${t}/jobs/${jobId}/${attachId}/${body.filename}`;
    const now      = new Date().toISOString();
    const username = (event.requestContext.authorizer?.claims?.['cognito:username'] as string) ?? 'unknown';

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: body.contentType }),
      { expiresIn: 300 }
    );

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: tpk(t, 'JOB', jobId),
        SK: `ATTACH#${attachId}`,
        attachId, jobId, s3Key,
        filename: body.filename,
        contentType: body.contentType,
        uploadedBy: username,
        uploadedAt: now,
      },
    }));

    return ok({ attachId, uploadUrl, s3Key });
  } catch (err) {
    return serverError(err);
  }
};

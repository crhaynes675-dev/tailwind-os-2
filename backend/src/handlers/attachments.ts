import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

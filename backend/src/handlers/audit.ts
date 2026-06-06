import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const jobId = event.pathParameters?.jobId;
    if (!jobId) return badRequest('jobId is required');

    const limit = parseInt(event.queryStringParameters?.limit ?? '50', 10);

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk':     `JOB#${jobId}`,
        ':prefix': 'AUDIT#',
      },
      ScanIndexForward: false, // newest first
      Limit: Math.min(limit, 200),
    }));

    return ok(result.Items ?? []);
  } catch (err) {
    return serverError(err);
  }
};

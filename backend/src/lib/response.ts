import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ALLOWED_ORIGINS = new Set([
  'https://app.morrisonmillwork.com',
  'https://d8im2hbxazf8r.cloudfront.net',
]);

const corsHeaders = (event?: Partial<APIGatewayProxyEvent>) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://d8im2hbxazf8r.cloudfront.net',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
};

export const ok = (body: unknown, event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: corsHeaders(event),
  body: JSON.stringify(body),
});

export const created = (body: unknown, event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => ({
  statusCode: 201,
  headers: corsHeaders(event),
  body: JSON.stringify(body),
});

export const noContent = (event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => ({
  statusCode: 204,
  headers: corsHeaders(event),
  body: '',
});

export const notFound = (msg = 'Not found', event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => ({
  statusCode: 404,
  headers: corsHeaders(event),
  body: JSON.stringify({ error: msg }),
});

export const badRequest = (msg: string, event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: corsHeaders(event),
  body: JSON.stringify({ error: msg }),
});

export const forbidden = (msg = 'Forbidden', event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => ({
  statusCode: 403,
  headers: corsHeaders(event),
  body: JSON.stringify({ error: msg }),
});

export const serverError = (err: unknown, event?: Partial<APIGatewayProxyEvent>): APIGatewayProxyResult => {
  console.error(err);
  return {
    statusCode: 500,
    headers: corsHeaders(event),
    body: JSON.stringify({ error: 'Internal server error' }),
  };
};

import { APIGatewayProxyResult } from 'aws-lambda';

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.morrisonmillwork.com',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const ok = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: CORS,
  body: JSON.stringify(body),
});

export const created = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 201,
  headers: CORS,
  body: JSON.stringify(body),
});

export const noContent = (): APIGatewayProxyResult => ({
  statusCode: 204,
  headers: CORS,
  body: '',
});

export const notFound = (msg = 'Not found'): APIGatewayProxyResult => ({
  statusCode: 404,
  headers: CORS,
  body: JSON.stringify({ error: msg }),
});

export const badRequest = (msg: string): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: CORS,
  body: JSON.stringify({ error: msg }),
});

export const serverError = (err: unknown): APIGatewayProxyResult => {
  console.error(err);
  return {
    statusCode: 500,
    headers: CORS,
    body: JSON.stringify({ error: 'Internal server error' }),
  };
};

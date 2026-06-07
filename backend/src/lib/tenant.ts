import { APIGatewayProxyEvent } from 'aws-lambda';

export function getTenantId(event: APIGatewayProxyEvent): string {
  const claims = (event.requestContext?.authorizer as any)?.claims ?? {};
  return (claims['custom:tenantId'] as string) || 'default';
}

export function tpk(tenantId: string, type: string, id: string): string {
  return `TENANT#${tenantId}#${type}#${id}`;
}

export function tgsi(tenantId: string, type: string): string {
  return `TENANT#${tenantId}#${type}`;
}

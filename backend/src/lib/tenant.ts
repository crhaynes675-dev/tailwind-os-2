import { APIGatewayProxyEvent } from 'aws-lambda';

export function getTenantId(event: APIGatewayProxyEvent): string {
  const claims = (event.requestContext?.authorizer as any)?.claims ?? {};
  return (claims['custom:tenantId'] as string) || 'default';
}

export function getRole(event: APIGatewayProxyEvent): string {
  const claims = (event.requestContext?.authorizer as any)?.claims ?? {};
  return (claims['custom:role'] as string) || '';
}

/**
 * Roles that administer the company itself (plan, users, company profile).
 * 'super_admin' outranks 'admin' — checking for 'admin' alone locks out the
 * highest-privilege role. Mirrors TENANT_ADMIN_ROLES in web/src/lib/auth.ts.
 */
export const TENANT_ADMIN_ROLES = ['admin', 'super_admin'];

export function isTenantAdmin(event: APIGatewayProxyEvent): boolean {
  return TENANT_ADMIN_ROLES.includes(getRole(event));
}

export function tpk(tenantId: string, type: string, id: string): string {
  return `TENANT#${tenantId}#${type}#${id}`;
}

export function tgsi(tenantId: string, type: string): string {
  return `TENANT#${tenantId}#${type}`;
}

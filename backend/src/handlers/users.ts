import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ok, created, noContent, badRequest, notFound, serverError, forbidden } from '../lib/response';
import { getTenantId } from '../lib/tenant';

const cognito = new CognitoIdentityProviderClient({ region: process.env.REGION ?? 'us-east-1' });
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const claims = (event.requestContext?.authorizer as any)?.claims ?? {};
    const isAdmin = claims['custom:role'] === 'admin';

    const { httpMethod } = event;
    const username = event.pathParameters?.username;
    const isPasswordPath = event.path?.endsWith('/password') ?? false;

    // GET /users — list Cognito users scoped to this tenant
    // Note: Cognito does not support filtering by custom attributes, so we
    // list all users and filter by tenantId client-side.
    if (httpMethod === 'GET') {
      const tenantId = getTenantId(event);
      const result = await cognito.send(new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
      }));
      const users = (result.Users ?? [])
        .map(u => {
          const attrs: Record<string, string> = {};
          (u.Attributes ?? []).forEach(a => { if (a.Name && a.Value) attrs[a.Name] = a.Value; });
          return {
            username: u.Username ?? '',
            email: attrs['email'] ?? '',
            givenName: attrs['given_name'] ?? '',
            familyName: attrs['family_name'] ?? '',
            role: attrs['custom:role'] ?? 'user',
            tenantId: attrs['custom:tenantId'] ?? '',
            status: u.UserStatus ?? '',
            enabled: u.Enabled ?? true,
          };
        })
        .filter(u => u.tenantId === tenantId);
      return ok(users, event);
    }

    // POST /users — create a new user in Cognito (admin only)
    if (httpMethod === 'POST' && !username) {
      if (!isAdmin) return forbidden('Admin access required', event);
      const tenantId = getTenantId(event);
      const body = JSON.parse(event.body ?? '{}');
      const { username: newUsername, email, givenName, familyName, password, role } = body;

      if (!newUsername || !email || !givenName || !familyName || !password) {
        return badRequest('username, email, givenName, familyName, and password are all required', event);
      }

      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: newUsername,
        MessageAction: 'SUPPRESS',
        TemporaryPassword: password,
        UserAttributes: [
          { Name: 'email',              Value: email },
          { Name: 'email_verified',     Value: 'true' },
          { Name: 'given_name',         Value: givenName },
          { Name: 'family_name',        Value: familyName },
          { Name: 'custom:role',        Value: role ?? 'installer' },
          { Name: 'custom:tenantId',    Value: tenantId },
        ],
      }));

      // Make the password permanent so the user doesn't have to reset on first login
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: newUsername,
        Password: password,
        Permanent: true,
      }));

      return created({ username: newUsername, created: true }, event);
    }

    if (!username) return badRequest('username is required', event);

    // PUT /users/{username} — update role, name, or email (admin only)
    if (httpMethod === 'PUT' && !isPasswordPath) {
      if (!isAdmin) return forbidden('Admin access required', event);
      const body = JSON.parse(event.body ?? '{}');
      const attrs: { Name: string; Value: string }[] = [];
      if (body.role)       attrs.push({ Name: 'custom:role',   Value: body.role });
      if (body.givenName)  attrs.push({ Name: 'given_name',    Value: body.givenName });
      if (body.familyName) attrs.push({ Name: 'family_name',   Value: body.familyName });
      if (body.email)      attrs.push({ Name: 'email',         Value: body.email },
                                      { Name: 'email_verified', Value: 'true' });
      if (!attrs.length) return badRequest('No valid fields to update', event);
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: attrs,
      }));
      return ok({ updated: true }, event);
    }

    // PUT /users/{username}/password — set a new permanent password (admin only)
    if (httpMethod === 'PUT' && isPasswordPath) {
      if (!isAdmin) return forbidden('Admin access required', event);
      const body = JSON.parse(event.body ?? '{}');
      const { password } = body;
      if (!password) return badRequest('password is required', event);

      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        Password: password,
        Permanent: true,
      }));
      return ok({ updated: true }, event);
    }

    // DELETE /users/{username} — remove user from Cognito (admin only)
    if (httpMethod === 'DELETE') {
      if (!isAdmin) return forbidden('Admin access required', event);
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      }));
      return noContent(event);
    }

    return badRequest('Method not supported', event);
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      return badRequest('Username already exists', event);
    }
    if (err.name === 'InvalidPasswordException') {
      return badRequest('Password does not meet requirements: ' + err.message, event);
    }
    if (err.name === 'UserNotFoundException') {
      return notFound('User not found', event);
    }
    return serverError(err, event);
  }
};

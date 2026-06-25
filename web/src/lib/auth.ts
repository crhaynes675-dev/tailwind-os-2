import { COGNITO_URL, CLIENT_ID, TOKEN_KEYS, API_BASE } from './config';

export interface AuthUser {
  username: string;
  role: string;
  email: string;
  tenantId: string;
}

export function parseJwt(token: string): Record<string, any> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.id);
}

export function isTokenExpired(): boolean {
  const t = getToken();
  if (!t) return true;
  const c = parseJwt(t);
  return !c.exp || c.exp < Math.floor(Date.now() / 1000);
}

export function getStoredUser(): AuthUser | null {
  const id = getToken();
  if (!id) return null;
  const claims = parseJwt(id);
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    signOut();
    return null;
  }
  const raw = localStorage.getItem(TOKEN_KEYS.user);
  if (raw) {
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      /* fall through */
    }
  }
  return userFromClaims(claims);
}

function userFromClaims(claims: Record<string, any>): AuthUser {
  return {
    username: claims['cognito:username'] || claims.username || '',
    role: claims['custom:role'] || 'installer',
    email: claims.email || '',
    tenantId: claims['custom:tenantId'] || '',
  };
}

/** Self-serve company signup — public, no auth. Returns the company code. */
export async function signUpCompany(payload: {
  companyName: string; industry: string; adminFirstName: string; adminLastName: string;
  adminEmail: string; adminUsername: string; password: string; accessCode: string;
}): Promise<{ tenantId: string; companyName: string }> {
  const res = await fetch(API_BASE + '/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Could not create company.');
  return data;
}

export async function signIn(username: string, password: string, companyCode?: string): Promise<AuthUser> {
  const code = (companyCode || '').trim();
  // New companies namespace the Cognito username by their code; legacy users
  // leave the code blank and authenticate with their raw username.
  const realUsername = code ? `${code}.${username.trim()}` : username.trim();
  const res = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: realUsername, PASSWORD: password },
      ClientId: CLIENT_ID,
    }),
  });
  const data = await res.json();

  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    throw new Error('A password reset is required. Please contact your administrator.');
  }
  if (!res.ok || !data.AuthenticationResult) {
    const msg: string = data.message || data.__type || '';
    throw new Error(
      msg.includes('NotAuthorized') || msg.includes('UserNotFound') || !msg
        ? 'Invalid username or password.'
        : msg,
    );
  }

  const t = data.AuthenticationResult;
  const claims = parseJwt(t.IdToken);
  const user = userFromClaims({ ...claims, 'cognito:username': claims['cognito:username'] || realUsername });
  localStorage.setItem(TOKEN_KEYS.id, t.IdToken);
  if (t.AccessToken) localStorage.setItem(TOKEN_KEYS.access, t.AccessToken);
  if (t.RefreshToken) localStorage.setItem(TOKEN_KEYS.refresh, t.RefreshToken);
  localStorage.setItem(TOKEN_KEYS.user, JSON.stringify(user));
  return user;
}

export function signOut(): void {
  Object.values(TOKEN_KEYS).forEach((k) => localStorage.removeItem(k));
}

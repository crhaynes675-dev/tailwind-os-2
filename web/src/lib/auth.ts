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

/**
 * Roles that administer the company itself (plan, users, company profile).
 * 'super_admin' outranks 'admin' — checking for 'admin' alone locks out the
 * highest-privilege role, so always compare through here.
 */
export const TENANT_ADMIN_ROLES = ['admin', 'super_admin'];

export function isTenantAdmin(user: AuthUser | null | undefined): boolean {
  return !!user && TENANT_ADMIN_ROLES.includes(user.role);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.id);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.refresh);
}

/**
 * Treat a token as expired slightly early so a request that takes a moment to
 * reach the API doesn't arrive with a token that died in flight.
 */
const EXPIRY_SKEW_SECONDS = 60;

export function isTokenExpired(skewSeconds = EXPIRY_SKEW_SECONDS): boolean {
  const t = getToken();
  if (!t) return true;
  const c = parseJwt(t);
  return !c.exp || c.exp < Math.floor(Date.now() / 1000) + skewSeconds;
}

export function getStoredUser(): AuthUser | null {
  const id = getToken();
  if (!id) return null;
  // Expired ID token is not the end of the session — the refresh token may
  // still be good, so leave storage intact and let refreshSession() try.
  // Checked with no skew: a token in its final seconds is still usable here.
  if (isTokenExpired(0)) return null;
  const claims = parseJwt(id);
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

interface CognitoTokens {
  IdToken: string;
  AccessToken?: string;
  RefreshToken?: string;
}

/** Persist a Cognito token set and return the user it describes. */
function persistTokens(t: CognitoTokens, usernameFallback?: string): AuthUser {
  const claims = parseJwt(t.IdToken);
  const user = userFromClaims(
    usernameFallback
      ? { ...claims, 'cognito:username': claims['cognito:username'] || usernameFallback }
      : claims,
  );
  localStorage.setItem(TOKEN_KEYS.id, t.IdToken);
  if (t.AccessToken) localStorage.setItem(TOKEN_KEYS.access, t.AccessToken);
  // Cognito only returns a new refresh token when rotation is enabled; keep
  // the existing one when it doesn't.
  if (t.RefreshToken) localStorage.setItem(TOKEN_KEYS.refresh, t.RefreshToken);
  localStorage.setItem(TOKEN_KEYS.user, JSON.stringify(user));
  return user;
}

function initiateAuth(body: Record<string, unknown>): Promise<Response> {
  return fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify(body),
  });
}

// ID tokens live 8h but refresh tokens live 30d, so an expired ID token is
// normally recoverable without sending the user back to Login. Concurrent
// callers share one in-flight request — a page that fires six requests on
// mount must not trigger six refreshes.
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await initiateAuth({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken },
      ClientId: CLIENT_ID,
    });
    const data = await res.json();
    const t = data?.AuthenticationResult;
    if (!res.ok || !t?.IdToken) return false;
    persistTokens(t);
    return true;
  } catch {
    return false; // offline or Cognito unreachable — caller decides what to do
  }
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
  adminEmail: string; adminPhone: string; adminUsername: string; password: string; accessCode: string;
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
  const res = await initiateAuth({
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: realUsername, PASSWORD: password },
    ClientId: CLIENT_ID,
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

  return persistTokens(data.AuthenticationResult, realUsername);
}

export function signOut(): void {
  Object.values(TOKEN_KEYS).forEach((k) => localStorage.removeItem(k));
}

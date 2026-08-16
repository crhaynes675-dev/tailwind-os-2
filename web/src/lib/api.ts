import { API_BASE } from './config';
import { getToken, signOut, isTokenExpired, refreshSession } from './auth';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** End the session everywhere: clear tokens + tell the app to show Login. */
function endSession() {
  signOut();
  window.dispatchEvent(new Event('os3-unauthorized'));
}

/**
 * Run before every request. An expired ID token is recoverable — the refresh
 * token outlives it by weeks — so try that before dropping the user at Login.
 */
async function ensureSession(): Promise<void> {
  if (!isTokenExpired()) return;
  if (await refreshSession()) return;
  endSession();
  throw new ApiError(401, 'Session expired — please sign in again.');
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const e = await res.json();
    return e.error || e.message || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const token = getToken();
  return fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  await ensureSession();
  let res = await send(method, path, body);

  // The token looked valid locally but the API rejected it (clock skew, a
  // revoked session, a rotated pool). Refresh once and replay before giving up.
  if (res.status === 401) {
    if (await refreshSession()) {
      res = await send(method, path, body);
    }
    if (res.status === 401) {
      endSession();
      throw new ApiError(401, 'Session expired — please sign in again.');
    }
  }

  // 403 is an authorization decision, not a dead session — most often a
  // plan gate. Surface the server's message; do NOT sign the user out.
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));

  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export function apiGet<T = unknown>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiSend<T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, body);
}

/**
 * Customer-portal calls. These run for visitors with no account, so they skip
 * the session guard and send no Authorization header — a 401 here means the
 * share link is dead, not that a staff session expired, and must never trigger
 * the sign-out path.
 */
export async function publicRequest<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/**
 * Upload a captured signature (PNG data URL) against a job.
 *
 * The filename prefix is what categorizes an attachment downstream, so the
 * three kinds of signature stay distinguishable:
 *   crewsignoff-     field crew, post-install walk
 *   customersignoff- customer, final walkthrough (written by the portal)
 *   signature-       legacy mobile-app capture
 */
export async function uploadSignature(jobId: string, dataUrl: string, prefix: string): Promise<void> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], `${prefix}-${new Date().toISOString()}.png`, { type: 'image/png' });
  await uploadAttachment(jobId, file);
}

/** Upload a file to a job via the presigned-URL flow (metadata → S3 PUT). */
export async function uploadAttachment(jobId: string, file: File): Promise<void> {
  const contentType = file.type || 'application/octet-stream';
  const meta = await apiSend<{ uploadUrl: string }>('POST', `/jobs/${jobId}/attachments`, {
    filename: file.name,
    contentType,
  });
  const put = await fetch(meta.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  if (!put.ok) throw new Error(`Upload failed for ${file.name}`);
}

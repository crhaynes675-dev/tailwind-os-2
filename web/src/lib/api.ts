import { API_BASE } from './config';
import { getToken, signOut } from './auth';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    signOut();
    throw new ApiError(res.status, 'Session expired — please sign in again.');
  }
  if (!res.ok) {
    let msg = 'Request failed (' + res.status + ')';
    try {
      const e = await res.json();
      msg = e.error || e.message || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function apiSend<T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) {
    signOut();
    throw new ApiError(res.status, 'Session expired — please sign in again.');
  }
  if (!res.ok) {
    let msg = 'Request failed (' + res.status + ')';
    try {
      const e = await res.json();
      msg = e.error || e.message || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

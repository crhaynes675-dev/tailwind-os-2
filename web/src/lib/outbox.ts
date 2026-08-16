import { apiSend, ApiError } from './api';

/**
 * Durable write queue for field mutations.
 *
 * Crews work in basements, new builds, and rural sites. Before this, a tap on
 * "On Site" or "Complete" issued a fetch that threw, and the work was simply
 * lost. Writes now go through here: they are persisted first, attempted
 * immediately, and replayed on reconnect or next launch.
 *
 * localStorage rather than IndexedDB deliberately — the queue is a handful of
 * tiny JSON records, and a synchronous write means an entry can't be lost to
 * the tab being closed mid-transaction.
 */

const KEY = 'os3_outbox';
const MAX_ATTEMPTS = 8;

export interface OutboxEntry {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** What the crew did, for the pending-writes UI. */
  label: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();

function read(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: OutboxEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage full or blocked — the in-flight attempt may still succeed */
  }
  listeners.forEach((l) => l(entries));
}

export function getOutbox(): OutboxEntry[] {
  return read();
}

export function subscribeOutbox(l: Listener): () => void {
  listeners.add(l);
  l(read());
  return () => { listeners.delete(l); };
}

/**
 * A failure that means "the network didn't carry this", as opposed to the
 * server rejecting it. Only the former is worth retrying — replaying a 400
 * forever would wedge the queue behind a write that can never succeed.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) {
    // 408/429 and 5xx are transient; 4xx means the request itself is wrong.
    return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return true; // TypeError from fetch — offline, DNS, connection dropped
}

let flushing = false;

/**
 * Queue a write, then try it right away. Resolves true if it went through
 * immediately, false if it was parked for later — callers can update the UI
 * optimistically either way.
 */
export async function enqueue(
  entry: Omit<OutboxEntry, 'id' | 'queuedAt' | 'attempts'>,
): Promise<boolean> {
  const full: OutboxEntry = {
    ...entry,
    id: `ob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  write([...read(), full]);
  const sent = await flush();
  return sent && !read().some((e) => e.id === full.id);
}

/** Attempt every queued write in order. Safe to call at any time. */
export async function flush(): Promise<boolean> {
  if (flushing) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  flushing = true;
  try {
    // Strictly in order: a status change queued after another must not
    // overtake it, or the job lands in the wrong state.
    for (const entry of read()) {
      try {
        await apiSend(entry.method, entry.path, entry.body);
        write(read().filter((e) => e.id !== entry.id));
      } catch (err) {
        const retryable = isRetryable(err);
        const attempts = entry.attempts + 1;
        const message = err instanceof Error ? err.message : 'Failed';

        if (!retryable || attempts >= MAX_ATTEMPTS) {
          // The server rejected this outright, so retrying can't help. Drop it
          // and surface the error — the caller's optimistic UI is now wrong and
          // needs to know, which a silently discarded write would never tell it.
          console.error('[outbox] giving up on queued write', entry.path, message);
          write(read().filter((e) => e.id !== entry.id));
          throw err;
        }
        write(read().map((e) => (e.id === entry.id ? { ...e, attempts, lastError: message } : e)));
        return false; // stop on first failure; order matters
      }
    }
    return true;
  } finally {
    flushing = false;
  }
}

/** Replay on reconnect and at startup. Call once, from the app root. */
export function startOutbox(): () => void {
  const onOnline = () => { flush().catch(() => {}); };
  window.addEventListener('online', onOnline);
  // A tab restored from background may have missed the online event.
  const onVisible = () => { if (document.visibilityState === 'visible') flush().catch(() => {}); };
  document.addEventListener('visibilitychange', onVisible);
  flush().catch(() => {});
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

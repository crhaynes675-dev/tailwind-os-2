import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The outbox is the difference between a crew's tap counting and being lost.
 * These cover the two rules that make it safe: replay strictly in order, and
 * never retry a write the server has already rejected (which would wedge the
 * queue behind something that can never succeed).
 */

const sent: Array<{ method: string; path: string; body: unknown }> = [];
let behaviour: (path: string) => void = () => {};

vi.mock('./api', async () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  }
  return {
    ApiError,
    apiSend: vi.fn(async (method: string, path: string, body?: unknown) => {
      behaviour(path);              // may throw to simulate failure
      sent.push({ method, path, body });
      return {};
    }),
  };
});

const { enqueue, flush, getOutbox } = await import('./outbox');
const { ApiError } = await import('./api');

beforeEach(() => {
  localStorage.clear();
  sent.length = 0;
  behaviour = () => {};
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const put = (n: number) => ({ method: 'PUT' as const, path: `/jobs/${n}`, body: { n }, label: `job ${n}` });

describe('outbox — online', () => {
  it('sends immediately and leaves nothing queued', async () => {
    const ok = await enqueue(put(1));
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(getOutbox()).toHaveLength(0);
  });
});

describe('outbox — offline', () => {
  it('keeps the write instead of losing it', async () => {
    behaviour = () => { throw new TypeError('Failed to fetch'); };
    const ok = await enqueue(put(1));
    expect(ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect(getOutbox()).toHaveLength(1);
  });

  it('persists across a reload', async () => {
    behaviour = () => { throw new TypeError('Failed to fetch'); };
    await enqueue(put(1));
    expect(JSON.parse(localStorage.getItem('os3_outbox')!)).toHaveLength(1);
  });

  it('replays in order once the network returns', async () => {
    behaviour = () => { throw new TypeError('Failed to fetch'); };
    await enqueue(put(1));
    await enqueue(put(2));
    await enqueue(put(3));
    expect(getOutbox()).toHaveLength(3);

    behaviour = () => {};
    await flush();
    expect(sent.map((s) => s.path)).toEqual(['/jobs/1', '/jobs/2', '/jobs/3']);
    expect(getOutbox()).toHaveLength(0);
  });

  it('stops at the first failure so a later write cannot overtake an earlier one', async () => {
    behaviour = () => { throw new TypeError('Failed to fetch'); };
    await enqueue(put(1));
    await enqueue(put(2));

    // Only the first succeeds on the next attempt.
    behaviour = (path) => { if (path !== '/jobs/1') throw new TypeError('Failed to fetch'); };
    await flush();
    expect(sent.map((s) => s.path)).toEqual(['/jobs/1']);
    expect(getOutbox().map((e) => e.path)).toEqual(['/jobs/2']);
  });
});

describe('outbox — server rejection', () => {
  it('drops a rejected write and surfaces the error rather than retrying forever', async () => {
    behaviour = () => { throw new ApiError(400, 'Invalid status'); };
    await expect(enqueue(put(1))).rejects.toThrow('Invalid status');
    // Dropped, so it cannot block everything queued behind it.
    expect(getOutbox()).toHaveLength(0);
  });

  it('does retry a server error, which is transient', async () => {
    behaviour = () => { throw new ApiError(503, 'Service Unavailable'); };
    const ok = await enqueue(put(1));
    expect(ok).toBe(false);
    expect(getOutbox()).toHaveLength(1);

    behaviour = () => {};
    await flush();
    expect(sent).toHaveLength(1);
    expect(getOutbox()).toHaveLength(0);
  });

  it('does not let a rejected write block the ones behind it', async () => {
    behaviour = () => { throw new TypeError('offline'); };
    await enqueue(put(1));
    await enqueue(put(2));

    behaviour = (path) => { if (path === '/jobs/1') throw new ApiError(400, 'Invalid'); };
    await expect(flush()).rejects.toThrow('Invalid');
    expect(getOutbox().map((e) => e.path)).toEqual(['/jobs/2']);

    await flush();
    expect(sent.map((s) => s.path)).toEqual(['/jobs/2']);
    expect(getOutbox()).toHaveLength(0);
  });
});

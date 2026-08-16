import { useEffect, useState } from 'react';
import { subscribeOutbox, flush, startOutbox, type OutboxEntry } from '../lib/outbox';

/**
 * Connectivity and pending-work indicator.
 *
 * A crew that taps "Complete" with no signal needs to know the tap counted.
 * Silence reads as failure and gets the work re-entered later (or lost), so
 * queued writes are always visible and always explained.
 */
export default function OfflineBar() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => startOutbox(), []);
  useEffect(() => subscribeOutbox(setPending), []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online && pending.length === 0) return null;

  async function retry() {
    setSyncing(true);
    try { await flush(); } catch { /* stays queued; the bar reflects it */ }
    finally { setSyncing(false); }
  }

  const offline = !online;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[0.72rem] font-semibold ${
        offline
          ? 'bg-[#d4851f]/15 text-[#e8a427] border-b border-[#d4851f]/30'
          : 'bg-[#22d3ee]/10 text-accent border-b border-[#22d3ee]/25'
      }`}
    >
      <span aria-hidden="true">{offline ? '📴' : '↑'}</span>
      <span>
        {offline ? "You're offline" : 'Syncing'}
        {pending.length > 0 && (
          <>
            {' — '}
            {pending.length} {pending.length === 1 ? 'change' : 'changes'} saved on this device
          </>
        )}
      </span>
      {offline && pending.length > 0 && (
        <span className="font-normal opacity-80">They'll upload automatically when you're back in range.</span>
      )}
      {!offline && pending.length > 0 && (
        <button
          onClick={retry}
          disabled={syncing}
          className="ml-auto rounded-md border border-current px-2 py-0.5 font-semibold disabled:opacity-50"
        >
          {syncing ? 'Sending…' : 'Retry now'}
        </button>
      )}
    </div>
  );
}

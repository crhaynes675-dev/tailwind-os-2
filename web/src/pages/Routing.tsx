import { useMemo } from 'react';
import { useJobsCtx } from '../data/JobsContext';

const today = new Date().toISOString().slice(0, 10);

function mapsUrl(stops: string[]) {
  const pts = stops.filter(Boolean).map(encodeURIComponent);
  if (!pts.length) return '#';
  return `https://www.google.com/maps/dir/${pts.join('/')}`;
}

export default function Routing() {
  const { jobs, loading, select } = useJobsCtx();

  const byCrew = useMemo(() => {
    const map = new Map<string, typeof jobs>();
    jobs
      .filter((j) => (j.status === 'In Progress' || (j.status === 'Scheduled' && j.scheduledDate === today)))
      .forEach((j) => {
        const c = j.crew || 'Unassigned';
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(j);
      });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Module · Routing</div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Routing</h1>
        <p className="mt-1.5 text-sm text-muted">Today’s stops per crew, in order. Open a full route in Maps.</p>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-24 text-sm text-muted">Loading…</div>
      ) : byCrew.length === 0 ? (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center text-sm text-muted">No stops scheduled for today.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
          {byCrew.map(([crew, list]) => {
            const stops = list.map((j) => j.address).filter(Boolean) as string[];
            return (
              <div key={crew} className="glass flex flex-col rounded-2xl">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                  <span className="text-[0.7rem] font-semibold text-text">{crew}</span>
                  <span className="text-[0.6rem] text-faint">{list.length} stop{list.length === 1 ? '' : 's'}</span>
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  {list.map((j, i) => (
                    <div key={j.id} onClick={() => select(j.id)} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.06]">
                      <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] text-[0.6rem] font-bold text-[#04121a]">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="truncate text-[0.76rem] font-semibold text-text">{j.name}</div>
                        <div className="truncate text-[0.62rem] text-muted">{j.address || 'no address'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <a
                  href={mapsUrl(stops)}
                  target="_blank"
                  rel="noreferrer"
                  className={`mx-3 mb-3 rounded-lg px-4 py-2 text-center text-xs font-semibold transition ${stops.length ? 'bg-white/5 text-accent hover:bg-white/10' : 'pointer-events-none bg-white/5 text-faint'}`}
                >
                  {stops.length ? '🗺 Open route in Maps' : 'No addresses to route'}
                </a>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

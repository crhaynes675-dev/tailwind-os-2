import { useEffect, useRef, useState } from 'react';
import type { Job } from '../data/jobs';

// Reuses the existing Google Maps key (same as the legacy app).
const MAPS_KEY = 'AIzaSyDPykjFdoKsoxeSNbU1OIBpvFIApmSFXZY';

/* eslint-disable @typescript-eslint/no-explicit-any */
let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('maps failed'));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0f1628' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8899aa' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e2a3d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#142236' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22365a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0e1a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

type Cache = Record<string, { lat: number; lng: number }>;
function loadCache(): Cache { try { return JSON.parse(localStorage.getItem('os3_geocache') || '{}'); } catch { return {}; } }
function saveCache(c: Cache) { try { localStorage.setItem('os3_geocache', JSON.stringify(c)); } catch { /* ignore */ } }

export default function DispatchMap({ jobs, techs }: { jobs: Job[]; techs: { name: string; count: number }[] }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const cacheRef = useRef<Cache>(loadCache());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    loadMaps()
      .then(() => {
        if (!elRef.current) return;
        const g = (window as any).google;
        mapRef.current = new g.maps.Map(elRef.current, {
          center: { lat: 35.2271, lng: -80.8431 },
          zoom: 10,
          styles: DARK,
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          backgroundColor: '#0f1628',
        });
        geocoderRef.current = new g.maps.Geocoder();
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    // drop markers for jobs no longer present
    Object.keys(markersRef.current).forEach((id) => {
      if (!jobs.find((j) => j.id === id)) { markersRef.current[id].setMap(null); delete markersRef.current[id]; }
    });

    const fit = () => {
      const b = new g.maps.LatLngBounds();
      let any = false;
      jobs.forEach((j) => { const p = j.address && cacheRef.current[j.address]; if (p) { b.extend(p); any = true; } });
      if (any) { map.fitBounds(b, 60); if (map.getZoom() > 14) map.setZoom(14); }
    };
    const place = (j: Job) => {
      const pos = j.address ? cacheRef.current[j.address] : undefined;
      if (!pos) return;
      if (markersRef.current[j.id]) { markersRef.current[j.id].setPosition(pos); return; }
      const label = (j.workOrder || '').replace('WO-', '').replace(/^\d{4}-/, '') || (j.name || '').slice(0, 4);
      const m = new g.maps.Marker({
        position: pos, map, title: `${j.name}${j.crew ? ' · ' + j.crew : ''}`,
        label: { text: label, color: '#04121a', fontSize: '9px', fontWeight: '700' },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#29c3ec', fillOpacity: 0.95, strokeColor: '#fff', strokeWeight: 2 },
      });
      const info = new g.maps.InfoWindow({ content: `<div style="font-family:Outfit,sans-serif;color:#111;min-width:150px"><b>${j.workOrder || ''}</b><br>${j.name}<br><span style="color:#555">${j.address || ''}</span><br><span style="color:#0a7">${j.crew || 'unassigned'}</span></div>` });
      m.addListener('click', () => info.open(map, m));
      markersRef.current[j.id] = m;
    };

    jobs.forEach((j) => { if (j.address && cacheRef.current[j.address]) place(j); });
    fit();

    // geocode the rest, sequentially (respect rate limits), then place
    const pending = jobs.filter((j) => j.address && !cacheRef.current[j.address!]);
    let i = 0;
    const next = () => {
      if (i >= pending.length) return;
      const j = pending[i++];
      geocoderRef.current.geocode({ address: j.address }, (res: any, st: string) => {
        if (st === 'OK' && res[0]) {
          const loc = res[0].geometry.location;
          cacheRef.current[j.address!] = { lat: loc.lat(), lng: loc.lng() };
          saveCache(cacheRef.current);
          place(j); fit();
        }
        setTimeout(next, 250);
      });
    };
    next();
  }, [status, jobs]);

  return (
    <div className="glass relative h-full w-full overflow-hidden rounded-2xl">
      <div ref={elRef} className="h-full w-full" />
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Loading map…</div>}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
          Map couldn’t load — the Google Maps key may be restricted to other domains.
        </div>
      )}
      <div className="absolute right-3 top-3 max-h-[64%] w-44 overflow-y-auto rounded-xl border border-glass bg-[#0b1322]/85 p-2 backdrop-blur-md">
        <div className="mb-1 px-1 text-[0.55rem] font-semibold uppercase tracking-wider text-faint">Service Techs</div>
        {techs.length === 0 ? (
          <div className="px-1 py-1 text-[0.6rem] text-faint">No techs found.</div>
        ) : techs.map((t) => (
          <div key={t.name} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[0.66rem] text-text">
            <span className="truncate">{t.name}</span>
            <span className="rounded-full bg-white/5 px-1.5 text-[0.56rem] text-muted">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Job } from '../data/jobs';
import { STATUS_META } from '../domain/status';

// Same key + loader the Dispatch map uses.
const MAPS_KEY = 'AIzaSyDPykjFdoKsoxeSNbU1OIBpvFIApmSFXZY';

/* eslint-disable @typescript-eslint/no-explicit-any */
let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=geometry,places`;
    s.async = true; s.defer = true;
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
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22365a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0e1a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

type Cache = Record<string, { lat: number; lng: number }>;
function loadCache(): Cache { try { return JSON.parse(localStorage.getItem('os3_geocache') || '{}'); } catch { return {}; } }
function saveCache(c: Cache) { try { localStorage.setItem('os3_geocache', JSON.stringify(c)); } catch { /* ignore */ } }

export default function FieldMap({ jobs, onSelect, focusId, height = 'h-[60vh]' }: { jobs: Job[]; onSelect?: (id: string) => void; focusId?: string; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const meRef = useRef<any>(null);
  const cacheRef = useRef<Cache>(loadCache());
  const firstFixRef = useRef(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading');
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  // init map
  useEffect(() => {
    (window as any).gm_authFailure = () => setStatus('denied');
    loadMaps().then(() => {
      if (!elRef.current) return;
      const g = (window as any).google;
      mapRef.current = new g.maps.Map(elRef.current, {
        center: { lat: 35.2271, lng: -80.8431 }, zoom: 10, styles: DARK,
        zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true, backgroundColor: '#0f1628',
      });
      geocoderRef.current = new g.maps.Geocoder();
      setStatus('ready');
    }).catch(() => setStatus('error'));
  }, []);

  // plot job pins
  useEffect(() => {
    if (status !== 'ready') return;
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    Object.keys(markersRef.current).forEach((id) => {
      if (!jobs.find((j) => j.id === id)) { markersRef.current[id].setMap(null); delete markersRef.current[id]; }
    });

    const fit = () => {
      const b = new g.maps.LatLngBounds();
      let any = false;
      jobs.forEach((j) => { const p = j.address && cacheRef.current[j.address]; if (p) { b.extend(p); any = true; } });
      if (meRef.current) { b.extend(meRef.current.getPosition()); any = true; }
      if (any) { map.fitBounds(b, 70); if (map.getZoom() > 15) map.setZoom(15); }
    };
    const place = (j: Job) => {
      const pos = j.address ? cacheRef.current[j.address] : undefined;
      if (!pos) return;
      const color = STATUS_META[j.status].color;
      if (markersRef.current[j.id]) { markersRef.current[j.id].setPosition(pos); return; }
      const m = new g.maps.Marker({
        position: pos, map, title: j.name,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 11, fillColor: color, fillOpacity: 0.95, strokeColor: '#fff', strokeWeight: 2 },
      });
      m.addListener('click', () => onSelect?.(j.id));
      markersRef.current[j.id] = m;
    };

    jobs.forEach((j) => { if (j.address && cacheRef.current[j.address]) place(j); });
    fit();

    const pending = jobs.filter((j) => j.address && !cacheRef.current[j.address!]);
    let i = 0;
    const next = () => {
      if (i >= pending.length) return;
      const j = pending[i++];
      geocoderRef.current.geocode({ address: j.address }, (res: any, st: string) => {
        if (st === 'OK' && res[0]) {
          const loc = res[0].geometry.location;
          cacheRef.current[j.address!] = { lat: loc.lat(), lng: loc.lng() };
          saveCache(cacheRef.current); place(j); fit();
        }
        setTimeout(next, 250);
      });
    };
    next();
  }, [status, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // live "me" location
  useEffect(() => {
    if (status !== 'ready' || !navigator.geolocation) { if (!navigator.geolocation) setGeoMsg('Location not available'); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const g = (window as any).google;
        const map = mapRef.current;
        if (!g || !map) return;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoMsg(null);
        if (!meRef.current) {
          meRef.current = new g.maps.Marker({
            position: p, map, title: 'You', zIndex: 999,
            icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#1a8fff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
          });
        } else {
          meRef.current.setPosition(p);
        }
        if (firstFixRef.current) { firstFixRef.current = false; map.panTo(p); }
      },
      () => setGeoMsg('Location blocked — allow location to see where you are.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [status]);

  // pan to a job when its card is selected
  useEffect(() => {
    if (status !== 'ready' || !focusId) return;
    const g = (window as any).google;
    const m = markersRef.current[focusId];
    if (m && mapRef.current) {
      mapRef.current.panTo(m.getPosition());
      if (mapRef.current.getZoom() < 13) mapRef.current.setZoom(13);
      m.setAnimation(g.maps.Animation.BOUNCE);
      setTimeout(() => m.setAnimation(null), 1400);
    }
  }, [focusId, status]);

  function recenter() {
    if (meRef.current && mapRef.current) { mapRef.current.panTo(meRef.current.getPosition()); mapRef.current.setZoom(14); }
  }

  return (
    <div className={`glass relative w-full overflow-hidden rounded-2xl ${height}`}>
      <div ref={elRef} className="h-full w-full" />
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Loading map…</div>}
      {status === 'error' && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">Map couldn’t load.</div>}
      {status === 'denied' && (
        <div className="absolute inset-0 grid place-items-center bg-[#0f1628] p-6 text-center">
          <div className="mx-auto max-w-sm text-xs leading-relaxed text-muted">
            Google Maps blocked this domain. Add <code className="rounded bg-white/10 px-1 text-accent">dkuo47zxewlgu.cloudfront.net/*</code> to the API key’s website restrictions.
          </div>
        </div>
      )}
      {status === 'ready' && (
        <button onClick={recenter} className="absolute bottom-3 right-3 rounded-full border border-glass bg-[#0b1322]/85 px-3 py-2 text-xs font-semibold text-accent backdrop-blur-md">◎ Me</button>
      )}
      {geoMsg && status === 'ready' && (
        <div className="absolute left-3 top-3 max-w-[70%] rounded-lg border border-glass bg-[#0b1322]/85 px-2.5 py-1.5 text-[0.62rem] text-muted backdrop-blur-md">{geoMsg}</div>
      )}
    </div>
  );
}

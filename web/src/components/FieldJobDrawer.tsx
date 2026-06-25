import { useState, useEffect, useRef } from 'react';
import { useJobsCtx } from '../data/JobsContext';
import { apiGet, uploadAttachment } from '../lib/api';
import { useChecklist } from '../lib/checklist';
import { STATUS_META } from '../domain/status';
import { fieldStep, mapsUrl, STEP_LABEL, STEP_STYLE } from '../domain/field';
import type { Job } from '../data/jobs';

interface Attachment { attachId: string; filename: string; contentType: string; category: string; url: string }
const INSTALL_STEPS = ['On Site', 'Install In Progress', 'Punch Completion'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function SignaturePad({ onSave, saving }: { onSave: (f: File) => void; saving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const point = (e: any) => {
    const cv = ref.current!; const r = cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (cv.width / r.width), y: (t.clientY - r.top) * (cv.height / r.height) };
  };
  const start = (e: any) => { drawing.current = true; const c = ref.current!.getContext('2d')!; const p = point(e.nativeEvent); c.beginPath(); c.moveTo(p.x, p.y); };
  const move = (e: any) => {
    if (!drawing.current) return; e.preventDefault();
    const c = ref.current!.getContext('2d')!; const p = point(e.nativeEvent);
    c.lineTo(p.x, p.y); c.strokeStyle = '#0b1322'; c.lineWidth = 2.5; c.lineCap = 'round'; c.stroke(); dirty.current = true;
  };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false; };
  const save = () => { if (!dirty.current) return; ref.current!.toBlob((b) => { if (b) onSave(new File([b], `signature-${Date.now()}.png`, { type: 'image/png' })); }, 'image/png'); };
  return (
    <div>
      <canvas ref={ref} width={340} height={150} className="w-full touch-none rounded-lg border border-glass bg-white"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="mt-2 flex gap-2">
        <button onClick={clear} className="rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-xs font-semibold text-muted">Clear</button>
        <button onClick={save} disabled={saving} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save signature'}</button>
      </div>
    </div>
  );
}

export default function FieldJobDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { jobs, updateJob } = useJobsCtx();
  const job = jobs.find((j) => j.id === jobId);
  const cl = useChecklist('install');
  const [att, setAtt] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [rOpen, setROpen] = useState(false);
  const [rDate, setRDate] = useState('');
  const [rReason, setRReason] = useState('');
  const [iOpen, setIOpen] = useState(false);
  const [issue, setIssue] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const loadAtt = () => apiGet<{ attachments: Attachment[] }>(`/jobs/${jobId}/attachments`).then((r) => setAtt(r.attachments || [])).catch(() => setAtt([]));
  useEffect(() => { setAtt(null); loadAtt(); setNotesDraft(job?.notes || ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jobId]);

  if (!job) return null;
  const meta = STATUS_META[job.status];
  const st = fieldStep(job);
  const photos = (att || []).filter((a) => a.category !== 'signature' && a.contentType?.startsWith('image/'));
  const signature = (att || []).find((a) => a.category === 'signature') || null;
  const canComplete = photos.length > 0 && !!signature;
  const phone = job.customerPhone;
  const voiceSupported = typeof window !== 'undefined' && !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

  async function doStep(patch: Partial<Job>) { setBusy(true); try { await updateJob(job!.id, patch); } finally { setBusy(false); } }
  async function addPhoto(file: File) { setUploading(true); try { await uploadAttachment(job!.id, file); await loadAtt(); } finally { setUploading(false); } }
  async function saveNotes() { setBusy(true); try { await updateJob(job!.id, { notes: notesDraft }); } finally { setBusy(false); } }
  async function reschedule() {
    if (!rDate) return; setBusy(true);
    const note = `${job!.notes ? job!.notes + '\n' : ''}[${new Date().toLocaleString()}] Rescheduled — customer not home.${rReason ? ' ' + rReason : ''}`;
    try { await updateJob(job!.id, { status: 'Scheduled', scheduledDate: rDate, enrouteAt: '', onSiteAt: '', notes: note }); onClose(); } finally { setBusy(false); }
  }
  async function reportIssue() {
    if (!issue.trim()) return; setBusy(true);
    const note = `${job!.notes ? job!.notes + '\n' : ''}[${new Date().toLocaleString()}] ISSUE: ${issue.trim()}`;
    try { await updateJob(job!.id, { notes: note }); setNotesDraft(note); setIssue(''); setIOpen(false); } finally { setBusy(false); }
  }
  function toggleVoice() {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    if (listening) { recRef.current?.stop(); return; }
    const r = new SR(); r.lang = 'en-US'; r.interimResults = false;
    r.onresult = (e: any) => { const t = e.results[0][0].transcript as string; setNotesDraft((n) => (n ? n + ' ' : '') + t); };
    r.onend = () => setListening(false);
    recRef.current = r; setListening(true); r.start();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-glass bg-[#0b1322]/95 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <div className="text-[0.62rem] font-semibold text-accent">{job.workOrder}</div>
            <div className="text-base font-semibold text-text">{job.name}</div>
            <div className="text-xs text-muted">{job.customer}</div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold" style={{ color: meta.color, background: `${meta.color}1a` }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />{meta.short}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-text">✕</button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* contact */}
          <div className="grid grid-cols-3 gap-2">
            {phone ? (
              <>
                <a href={`tel:${phone}`} className="rounded-lg border border-glass bg-white/5 py-2 text-center text-xs font-semibold text-accent">📞 Call</a>
                <a href={`sms:${phone}`} className="rounded-lg border border-glass bg-white/5 py-2 text-center text-xs font-semibold text-accent">💬 Text</a>
                <a href={`sms:${phone}?&body=${encodeURIComponent('On my way — see you soon.')}`} className="rounded-lg border border-glass bg-white/5 py-2 text-center text-[0.66rem] font-semibold text-accent">🚗 On my way</a>
              </>
            ) : <div className="col-span-3 text-[0.7rem] text-faint">No customer phone on file.</div>}
          </div>
          {job.address && <a href={mapsUrl(job.address)} target="_blank" rel="noreferrer" className="rounded-lg border border-glass bg-white/5 py-2.5 text-center text-sm font-semibold text-accent">🧭 Navigate · {job.address}</a>}

          {/* status step */}
          {st ? (st.label !== 'Complete' ? (
            <button onClick={() => doStep(st.patch)} disabled={busy} className={`w-full rounded-lg py-3 text-sm font-semibold text-white ${STEP_STYLE[st.label]} disabled:opacity-50`}>{busy ? '…' : `${STEP_LABEL[st.label]} →`}</button>
          ) : (
            <div>
              <button onClick={() => doStep(st.patch)} disabled={busy || !canComplete} className={`w-full rounded-lg py-3 text-sm font-semibold text-white ${STEP_STYLE.Complete} disabled:opacity-40`}>{busy ? '…' : '✓ Complete →'}</button>
              {!canComplete && <div className="mt-1 text-center text-[0.66rem] text-[#f0a23c]">Add a photo and a signature to complete.</div>}
            </div>
          )) : <div className="rounded-lg bg-white/5 py-2 text-center text-[0.72rem] font-semibold text-completed">Completed — awaiting review</div>}

          {/* checklist */}
          {job.status === 'In Progress' && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="mb-1 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Checklist</div>
              {INSTALL_STEPS.map((s) => (
                <label key={s} className="flex items-center gap-3 py-1.5 text-[0.82rem] text-muted">
                  <input type="checkbox" checked={cl.has(job.id, s)} onChange={() => cl.toggle(job.id, s)} className="h-5 w-5 accent-[#29c3ec]" />
                  <span className={cl.has(job.id, s) ? 'text-text line-through opacity-70' : ''}>{s}</span>
                </label>
              ))}
            </div>
          )}

          {/* photos */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Photos · {photos.length}</span>
              <label className="cursor-pointer text-xs font-semibold text-accent">{uploading ? 'Uploading…' : '+ Add photo'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {photos.map((p) => <a key={p.attachId} href={p.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md border border-glass"><img src={p.url} alt="" className="h-full w-full object-cover" /></a>)}
              </div>
            )}
          </div>

          {/* signature */}
          <div>
            <div className="mb-1.5 text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Customer signature {signature && <span className="text-completed">✓</span>}</div>
            {signature ? (
              <a href={signature.url} target="_blank" rel="noreferrer"><img src={signature.url} alt="signature" className="w-full rounded-lg border border-glass bg-white" /></a>
            ) : <SignaturePad onSave={addPhoto} saving={uploading} />}
          </div>

          {/* notes */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.58rem] font-semibold uppercase tracking-wider text-faint">Notes</span>
              {voiceSupported && <button onClick={toggleVoice} className={`text-xs font-semibold ${listening ? 'text-[#fb7185]' : 'text-accent'}`}>{listening ? '● Listening…' : '🎤 Voice'}</button>}
            </div>
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            <button onClick={saveNotes} disabled={busy} className="mt-1.5 rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50">Save notes</button>
          </div>

          {/* reschedule / report issue */}
          <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
            <button onClick={() => setROpen((v) => !v)} className="rounded-lg border border-glass bg-white/5 py-2 text-xs font-semibold text-muted hover:text-text">📅 Customer not home / reschedule</button>
            {rOpen && (
              <div className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent [color-scheme:dark]" />
                <input value={rReason} onChange={(e) => setRReason(e.target.value)} placeholder="Reason (optional)" className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                <button onClick={reschedule} disabled={!rDate || busy} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] py-2 text-xs font-semibold text-white disabled:opacity-40">Reschedule →</button>
              </div>
            )}
            <button onClick={() => setIOpen((v) => !v)} className="rounded-lg border border-glass bg-white/5 py-2 text-xs font-semibold text-muted hover:text-text">⚠️ Report an issue</button>
            {iOpen && (
              <div className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} placeholder="What's the problem?" className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                <button onClick={reportIssue} disabled={!issue.trim() || busy} className="rounded-lg bg-[#fb7185] py-2 text-xs font-semibold text-white disabled:opacity-40">Send to office</button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

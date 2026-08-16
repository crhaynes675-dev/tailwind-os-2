import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { publicRequest, ApiError } from '../lib/api';
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad';

interface PortalPhoto { id: string; takenAt: string; url: string }
interface PortalInvoice {
  amountDue: number;
  currency: string;
  status: 'invoiced' | 'paid';
  paidAt: string | null;
  payable: boolean;
}
interface PortalJob {
  company: string;
  reference: string | null;
  jobName: string;
  address: string | null;
  status: string;
  statusBlurb: string;
  step: number;
  stepCount: number;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  onSiteAt: string | null;
  completedAt: string | null;
  photos: PortalPhoto[];
  awaitingApproval: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  invoice: PortalInvoice | null;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

// Date-only strings are calendar dates — parsing them as UTC and rendering in
// local time can slip them a day, so build them as local explicitly.
function asLocal(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

function prettyDate(d: string | null) {
  return asLocal(d)?.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }) ?? null;
}

function dateRange(a: string | null, b: string | null) {
  const start = asLocal(a);
  if (!start) return null;
  const end = b && b.slice(0, 10) !== a?.slice(0, 10) ? asLocal(b) : null;
  // A single date gets the full friendly form; a range drops the weekday so
  // it stays on one line instead of wrapping mid-date.
  if (!end) return prettyDate(a);
  const short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, short)} — ${end.toLocaleDateString(undefined, { ...short, year: 'numeric' })}`;
}

export default function Portal() {
  const { token = '' } = useParams();
  const [job, setJob] = useState<PortalJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  // No synchronous setState here — load() runs from an effect on mount, and
  // `loading` already starts true. Re-loads after approval keep the page
  // visible rather than blanking it.
  const load = useCallback(() => {
    publicRequest<PortalJob>('GET', `/public/jobs/${encodeURIComponent(token)}`)
      .then((j) => { setJob(j); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this page.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Stripe sends the customer back with ?paid=<session id>. Confirm it
  // server-side rather than trusting the query string, then strip it so a
  // refresh or a shared URL can't replay the confirmation.
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('paid');
    if (!sessionId) return;
    let alive = true;
    publicRequest('POST', `/public/jobs/${encodeURIComponent(token)}/pay/confirm`, { sessionId })
      .catch(() => { if (alive) setPayError('We could not confirm that payment. If you were charged, contact us and we will sort it out.'); })
      .finally(() => {
        if (!alive) return;
        window.history.replaceState({}, '', window.location.pathname);
        load();
      });
    return () => { alive = false; };
  }, [token, load]);

  async function payNow() {
    setPaying(true);
    setPayError(null);
    try {
      const { url } = await publicRequest<{ url: string }>('POST', `/public/jobs/${encodeURIComponent(token)}/pay`);
      window.location.href = url;
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : 'Could not start the payment.');
      setPaying(false);
    }
  }

  async function approve() {
    const signature = padRef.current?.toDataUrl();
    if (!name.trim() || !signature) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await publicRequest('POST', `/public/jobs/${encodeURIComponent(token)}/approve`, {
        name: name.trim(),
        signature,
      });
      load();
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : 'Could not submit your approval.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Shell><p className="text-sm text-muted">Loading…</p></Shell>;
  }

  if (error || !job) {
    return (
      <Shell>
        <div className="glass rounded-2xl p-8 text-center">
          <div className="text-3xl">🔗</div>
          <h1 className="mt-3 text-lg font-bold text-text">This link isn't active</h1>
          <p className="mt-1.5 text-sm text-muted">{error ?? 'The link may have expired or been replaced.'}</p>
          <p className="mt-4 text-xs text-faint">Please contact your installer for an up-to-date link.</p>
        </div>
      </Shell>
    );
  }

  const scheduled = dateRange(job.scheduledDate, job.scheduledEndDate);

  return (
    <Shell>
      <header className="mb-6">
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">{job.company}</div>
        <h1 className="mt-1 text-[1.75rem] font-bold leading-tight text-text">{job.jobName}</h1>
        {job.address && <p className="mt-1 text-sm text-muted">{job.address}</p>}
        {job.reference && <p className="mt-0.5 text-xs text-faint">Reference {job.reference}</p>}
      </header>

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-lg font-bold text-text">{job.status}</span>
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-faint">
            Step {job.step} of {job.stepCount}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{job.statusBlurb}</p>

        <div
          className="mt-4 flex gap-1"
          role="progressbar"
          aria-valuenow={job.step}
          aria-valuemin={1}
          aria-valuemax={job.stepCount}
          aria-label="Job progress"
        >
          {Array.from({ length: job.stepCount }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < job.step ? 'bg-gradient-to-r from-[#22d3ee] to-[#6d6bff]' : 'bg-white/10'}`}
            />
          ))}
        </div>

        {(scheduled || job.completedAt) && (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {scheduled && (
              <div>
                <dt className="text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Scheduled</dt>
                <dd className="mt-0.5 text-sm text-text">{scheduled}</dd>
              </div>
            )}
            {job.completedAt && (
              <div>
                <dt className="text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Work completed</dt>
                <dd className="mt-0.5 text-sm text-text">{prettyDate(job.completedAt)}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {job.photos.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-faint">
            Progress photos
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {job.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-white/10">
                <img
                  src={p.url}
                  alt={`Installation progress, ${prettyDate(p.takenAt) ?? 'undated'}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition group-hover:brightness-110"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {job.invoice && (
        <section className="mt-5 glass rounded-2xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-text">
              {job.invoice.status === 'paid' ? 'Paid in full' : 'Amount due'}
            </h2>
            <span className={`text-2xl font-bold ${job.invoice.status === 'paid' ? 'text-[#34d39a]' : 'text-accent'}`}>
              {money(job.invoice.amountDue)}
            </span>
          </div>

          {job.invoice.status === 'paid' ? (
            <p className="mt-1 text-sm text-muted">
              Received{job.invoice.paidAt ? ` on ${prettyDate(job.invoice.paidAt)}` : ''}. Thank you.
            </p>
          ) : job.invoice.payable ? (
            <>
              <p className="mt-1 text-sm text-muted">Pay securely by card. You'll be taken to our payment provider.</p>
              <button
                onClick={payNow}
                disabled={paying}
                className="mt-4 w-full rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-40"
              >
                {paying ? 'Opening secure checkout…' : `Pay ${money(job.invoice.amountDue)}`}
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Your invoice is outstanding. Please contact {job.company} to arrange payment.
            </p>
          )}

          {payError && (
            <p className="mt-3 rounded-lg border border-[#f0554c]/30 bg-[#f0554c]/10 px-3 py-2 text-xs font-semibold text-[#f0554c]">
              {payError}
            </p>
          )}
        </section>
      )}

      {job.approvedAt && (
        <section className="mt-5 rounded-2xl border border-[#34d39a]/30 bg-[#34d39a]/10 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#34d39a]">
            <span aria-hidden="true">✓</span> Approved
          </div>
          <p className="mt-1 text-sm text-muted">
            Signed by {job.approvedBy} on {prettyDate(job.approvedAt)}. Thank you — nothing further is needed.
          </p>
        </section>
      )}

      {job.awaitingApproval && (
        <section className="mt-5 glass rounded-2xl p-5">
          <h2 className="text-base font-bold text-text">Approve this work</h2>
          <p className="mt-1 text-sm text-muted">
            Please review the work above. Signing here confirms the installation is complete
            and to your satisfaction.
          </p>

          <label className="mt-4 block">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Your full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Jane Doe"
            />
          </label>

          <div className="mt-4">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-faint">Signature</span>
            <div className="mt-1">
              <SignaturePad ref={padRef} onChange={setHasInk} />
            </div>
          </div>

          {submitError && (
            <p className="mt-3 rounded-lg border border-[#f0554c]/30 bg-[#f0554c]/10 px-3 py-2 text-xs font-semibold text-[#f0554c]">
              {submitError}
            </p>
          )}

          <button
            onClick={approve}
            disabled={!name.trim() || !hasInk || submitting}
            className="mt-4 w-full rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Approve installation'}
          </button>
          {(!name.trim() || !hasInk) && (
            <p className="mt-2 text-center text-[0.68rem] text-faint">
              Enter your name and sign above to continue.
            </p>
          )}
        </section>
      )}

      <p className="mt-8 text-center text-[0.66rem] text-faint">
        Questions about this job? Contact {job.company} directly.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}

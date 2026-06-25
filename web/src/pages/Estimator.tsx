import { useState, useMemo, useEffect } from 'react';
import { apiGet, apiSend } from '../lib/api';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Unit { id: string; type: string; qty: number; laborOn: boolean; labor: number; mat: number }
interface SavedQuote {
  quoteId: string; quoteNumber: string; jobName?: string; customerName?: string;
  customerCompany?: string; totalToInvoice?: number; totalUnits?: number; createdAt?: string;
}

let uid = 0;
const newUnit = (): Unit => ({ id: `u${++uid}_${Date.now()}`, type: '', qty: 1, laborOn: true, labor: 0, mat: 0 });

function NumField({ label, value, onChange, step = 1, prefix, suffix }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; prefix?: string; suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">{label}</span>
      <div className="flex items-center rounded-lg border border-glass bg-white/[0.04] focus-within:border-accent">
        {prefix && <span className="pl-2.5 text-xs text-faint">{prefix}</span>}
        <input type="number" value={value} step={step} min={0}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-full bg-transparent px-2.5 py-2 text-sm text-text outline-none" />
        {suffix && <span className="pr-2.5 text-xs text-faint">{suffix}</span>}
      </div>
    </label>
  );
}

export default function Estimator() {
  const [units, setUnits] = useState<Unit[]>([newUnit()]);
  // crew labor
  const [lr, setLr] = useState(65), [lh, setLh] = useState(8), [ld, setLd] = useState(1);
  const [lhc, setLhc] = useState(0), [lhr, setLhr] = useState(35), [lot, setLot] = useState(0);
  // travel & site
  const [tm, setTm] = useState(0), [tr2, setTr2] = useState(0.67), [tt, setTt] = useState(0), [tp, setTp] = useState(0);
  const [dlOn, setDlOn] = useState(false), [dlMi, setDlMi] = useState(0), [dlRate, setDlRate] = useState(0.67), [dlFlat, setDlFlat] = useState(0);
  // other costs
  const [mp, setMp] = useState(0), [md, setMd] = useState(0), [me, setMe] = useState(0), [ms, setMs] = useState(0), [mo, setMo] = useState(0);
  // markup
  const [mu, setMu] = useState(25);
  // quote info
  const [jobName, setJobName] = useState(''), [customerName, setCustomerName] = useState(''), [customerCompany, setCustomerCompany] = useState(''), [address, setAddress] = useState('');

  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadQuotes = () => apiGet<SavedQuote[]>('/quotes').then((r) => setQuotes(Array.isArray(r) ? r : [])).catch(() => {});
  useEffect(() => { loadQuotes(); }, []);

  const c = useMemo(() => {
    const tq = units.reduce((s, u) => s + (u.qty || 0), 0);
    const ul = units.reduce((s, u) => s + (u.qty || 0) * (u.laborOn ? u.labor || 0 : 0), 0);
    const um = units.reduce((s, u) => s + (u.qty || 0) * (u.mat || 0), 0);
    const cl = lr * lh * ld + lhc * lhr * lh * ld + lot;
    const tv = tm * tr2 + tt + tp;
    const dlCost = dlOn ? dlMi * dlRate + dlFlat : 0;
    const tvTotal = tv + dlCost;
    const other = mp + md + me + ms + mo;
    const tc = ul + um + cl + tvTotal + other;
    const ma = (tc * mu) / 100;
    const tch = tc + ma;
    const mg = tch > 0 ? (ma / tch) * 100 : 0;
    return { tq, ul, um, cl, tvTotal, other, tc, ma, tch, mg, costPerUnit: tq > 0 ? tc / tq : 0, pricePerUnit: tq > 0 ? tch / tq : 0 };
  }, [units, lr, lh, ld, lhc, lhr, lot, tm, tr2, tt, tp, dlOn, dlMi, dlRate, dlFlat, mp, md, me, ms, mo, mu]);

  const setUnit = (id: string, patch: Partial<Unit>) => setUnits((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  async function saveQuote() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await apiSend<{ quoteNumber?: string }>('POST', '/quotes', {
        jobName, customerName, customerCompany, address,
        units,
        inputs: { lr, lh, ld, lhc, lhr, lot, tm, tr2, tt, tp, dlOn, dlMi, dlRate, dlFlat, mp, md, me, ms, mo, mu },
        totalCost: c.tc, totalToInvoice: c.tch, margin: c.mg, totalUnits: c.tq,
      });
      setSavedMsg(`Saved as quote ${res?.quoteNumber || ''} — ${usd(c.tch)}`);
      await loadQuotes();
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuote(id: string) {
    await apiSend('DELETE', `/quotes/${id}`).catch(() => {});
    await loadQuotes();
  }

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">{title}</div>
      {children}
    </div>
  );

  return (
    <div>
      <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">Sales</div>
      <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Install Estimator</h1>
      <p className="mt-1.5 text-sm text-muted">Build a unit-by-unit install estimate, then save it as a quote for Intake.</p>

      {/* quote info */}
      <div className="glass mt-5 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block"><span className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">Job / project</span>
          <input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="Smith Residence — Patio Doors" className="w-full rounded-lg border border-glass bg-white/[0.04] px-2.5 py-2 text-sm text-text outline-none focus:border-accent" /></label>
        <label className="block"><span className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">Customer</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="John Smith" className="w-full rounded-lg border border-glass bg-white/[0.04] px-2.5 py-2 text-sm text-text outline-none focus:border-accent" /></label>
        <label className="block"><span className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">Company</span>
          <input value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} placeholder="Hargrove Builders" className="w-full rounded-lg border border-glass bg-white/[0.04] px-2.5 py-2 text-sm text-text outline-none focus:border-accent" /></label>
        <label className="block"><span className="mb-1 block text-[0.56rem] font-semibold uppercase tracking-wider text-faint">Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Charlotte NC" className="w-full rounded-lg border border-glass bg-white/[0.04] px-2.5 py-2 text-sm text-text outline-none focus:border-accent" /></label>
      </div>

      {/* unit schedule */}
      <div className="glass mt-4 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">📐 Unit schedule</div>
          <button onClick={() => setUnits([newUnit()])} className="text-[0.62rem] font-semibold text-muted hover:text-accent">✕ Clear all</button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[0.58rem] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Qty</th>
                <th className="px-4 py-2 font-semibold">Labor on</th>
                <th className="px-4 py-2 font-semibold">Labor/unit</th>
                <th className="px-4 py-2 font-semibold">Mat/unit</th>
                <th className="px-4 py-2 font-semibold">Line</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const line = (u.qty || 0) * ((u.laborOn ? u.labor || 0 : 0) + (u.mat || 0));
                return (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="px-4 py-2"><input value={u.type} onChange={(e) => setUnit(u.id, { type: e.target.value })} placeholder="e.g. Patio door" className="w-40 rounded-md border border-glass bg-white/[0.04] px-2 py-1.5 text-sm text-text outline-none focus:border-accent" /></td>
                    <td className="px-4 py-2"><input type="number" min={0} value={u.qty} onChange={(e) => setUnit(u.id, { qty: Number(e.target.value) || 0 })} className="w-16 rounded-md border border-glass bg-white/[0.04] px-2 py-1.5 text-sm text-text outline-none focus:border-accent" /></td>
                    <td className="px-4 py-2"><input type="checkbox" checked={u.laborOn} onChange={(e) => setUnit(u.id, { laborOn: e.target.checked })} className="h-4 w-4 accent-[#29c3ec]" /></td>
                    <td className="px-4 py-2"><input type="number" min={0} value={u.labor} onChange={(e) => setUnit(u.id, { labor: Number(e.target.value) || 0 })} disabled={!u.laborOn} className="w-24 rounded-md border border-glass bg-white/[0.04] px-2 py-1.5 text-sm text-text outline-none focus:border-accent disabled:opacity-40" /></td>
                    <td className="px-4 py-2"><input type="number" min={0} value={u.mat} onChange={(e) => setUnit(u.id, { mat: Number(e.target.value) || 0 })} className="w-24 rounded-md border border-glass bg-white/[0.04] px-2 py-1.5 text-sm text-text outline-none focus:border-accent" /></td>
                    <td className="px-4 py-2 text-muted">{usd2(line)}</td>
                    <td className="px-4 py-2 text-right"><button onClick={() => setUnits((us) => (us.length > 1 ? us.filter((x) => x.id !== u.id) : us))} className="text-faint hover:text-[#fb7185]">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4 pt-2"><button onClick={() => setUnits((us) => [...us, newUnit()])} className="rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-white/10">+ Add unit</button></div>
      </div>

      {/* inputs */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="👷 Crew labor">
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Lead rate /hr" prefix="$" value={lr} onChange={setLr} />
            <NumField label="Hours / day" value={lh} onChange={setLh} step={0.5} />
            <NumField label="Working days" value={ld} onChange={setLd} step={0.5} />
            <NumField label="Helper count" value={lhc} onChange={setLhc} />
            <NumField label="Helper rate /hr" prefix="$" value={lhr} onChange={setLhr} />
            <NumField label="OT / bonuses" prefix="$" value={lot} onChange={setLot} step={10} />
          </div>
        </Card>
        <Card title="🚛 Travel & site">
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Round-trip mi" value={tm} onChange={setTm} />
            <NumField label="Mile rate" prefix="$" value={tr2} onChange={setTr2} step={0.01} />
            <NumField label="Tolls" prefix="$" value={tt} onChange={setTt} />
            <NumField label="Parking" prefix="$" value={tp} onChange={setTp} />
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-wider text-label text-muted">
            <input type="checkbox" checked={dlOn} onChange={(e) => setDlOn(e.target.checked)} className="h-4 w-4 accent-[#29c3ec]" /> 🚚 Delivery & logistics
          </label>
          {dlOn && (
            <div className="mt-2 grid grid-cols-3 gap-3">
              <NumField label="Delivery mi" value={dlMi} onChange={setDlMi} />
              <NumField label="Fuel rate" prefix="$" value={dlRate} onChange={setDlRate} step={0.01} />
              <NumField label="Flat fee" prefix="$" value={dlFlat} onChange={setDlFlat} step={5} />
            </div>
          )}
        </Card>
        <Card title="🔧 Other costs">
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Permits" prefix="$" value={mp} onChange={setMp} step={10} />
            <NumField label="Disposal" prefix="$" value={md} onChange={setMd} step={10} />
            <NumField label="Equipment" prefix="$" value={me} onChange={setMe} step={10} />
            <NumField label="Sub-contract" prefix="$" value={ms} onChange={setMs} step={10} />
            <NumField label="Other" prefix="$" value={mo} onChange={setMo} step={10} />
            <NumField label="Markup %" suffix="%" value={mu} onChange={setMu} />
          </div>
        </Card>
      </div>

      {/* summary */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="💰 Cost breakdown">
          {[['Unit labor', c.ul], ['Unit materials', c.um], ['Crew labor', c.cl], ['Travel, site & delivery', c.tvTotal], ['Other costs', c.other]].map(([l, v]) => (
            <div key={l as string} className="flex justify-between py-1 text-[0.78rem]"><span className="text-muted">{l}</span><span className="text-text">{usd2(v as number)}</span></div>
          ))}
          <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold"><span className="text-faint">Total cost</span><span className="text-accent">{usd2(c.tc)}</span></div>
          <div className="flex justify-between py-1 text-[0.78rem]"><span className="text-muted">Markup ({mu}%)</span><span className="text-text">{usd2(c.ma)}</span></div>
        </Card>
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><div className="text-[0.56rem] uppercase tracking-wide text-faint">Total to invoice</div><div className="mt-1 text-2xl font-bold text-[#34d39a]">{usd(c.tch)}</div></div>
            <div><div className="text-[0.56rem] uppercase tracking-wide text-faint">Gross profit</div><div className="mt-1 text-2xl font-bold text-accent">{usd(c.ma)}</div></div>
            <div><div className="text-[0.56rem] uppercase tracking-wide text-faint">Gross margin</div><div className="mt-1 text-2xl font-bold text-text">{c.mg.toFixed(1)}%</div></div>
            <div><div className="text-[0.56rem] uppercase tracking-wide text-faint">Units</div><div className="mt-1 text-2xl font-bold text-text">{c.tq}</div></div>
            <div><div className="text-[0.56rem] uppercase tracking-wide text-faint">Cost / unit</div><div className="mt-1 text-lg font-semibold text-muted">{c.tq > 0 ? usd2(c.costPerUnit) : '—'}</div></div>
            <div><div className="text-[0.56rem] uppercase tracking-wide text-faint">Price / unit</div><div className="mt-1 text-lg font-semibold text-muted">{c.tq > 0 ? usd2(c.pricePerUnit) : '—'}</div></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={saveQuote} disabled={saving || c.tch <= 0}
              className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_22px_-8px_rgba(41,195,236,0.55)] disabled:opacity-40">
              {saving ? 'Saving…' : '💾 Save as quote'}
            </button>
            {savedMsg && <span className="text-xs font-semibold text-completed">{savedMsg}</span>}
          </div>
        </div>
      </div>

      {/* saved quotes */}
      <div className="glass mt-4 rounded-2xl p-4">
        <div className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">Saved quotes</div>
        {quotes.length === 0 ? (
          <div className="py-4 text-center text-xs text-faint">No saved quotes yet.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {quotes.map((q) => (
              <div key={q.quoteId} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
                <span className="truncate"><span className="font-semibold text-accent">{q.quoteNumber}</span> <span className="text-muted">{q.jobName || '—'}</span> <span className="text-faint">· {q.customerCompany || q.customerName || ''}</span></span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-text">{usd(q.totalToInvoice || 0)}</span>
                  <button onClick={() => deleteQuote(q.quoteId)} className="text-faint hover:text-[#fb7185]">✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

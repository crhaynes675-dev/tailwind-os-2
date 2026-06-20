import { useState } from 'react';
import { useServiceTickets, SERVICE_STAGES, LEAK_STEPS, type ServiceStage, type ServiceTicket } from '../data/serviceTickets';

const STAGE_COLOR: Record<ServiceStage, string> = {
  Logged: '#6b7a99',
  Triaged: '#d4851f',
  Scheduled: '#3b82c4',
  Dispatched: '#29c3ec',
  Visited: '#34d39a',
};

function NewTicket({ onCreate }: { onCreate: (t: { customer: string; description: string; type: 'service' | 'leak' }) => void }) {
  const [customer, setCustomer] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'service' | 'leak'>('service');

  function submit() {
    if (!customer.trim() || !description.trim()) return;
    onCreate({ customer: customer.trim(), description: description.trim(), type });
    setCustomer('');
    setDescription('');
    setType('service');
  }

  return (
    <div className="glass mb-5 rounded-2xl p-4">
      <div className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint">New service ticket</div>
      <div className="flex flex-wrap gap-2.5">
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer / GC"
          className="min-w-[160px] flex-1 rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description / issue"
          className="min-w-[220px] flex-[2] rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        <select value={type} onChange={(e) => setType(e.target.value as 'service' | 'leak')}
          className="rounded-lg border border-glass bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-accent">
          <option value="service">Service</option>
          <option value="leak">Leak Diagnostic</option>
        </select>
        <button onClick={submit} className="rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-105">
          + Log ticket
        </button>
      </div>
    </div>
  );
}

function TicketCard({ t, onAdvance, onRemove, onToggleLeak }: { t: ServiceTicket; onAdvance: () => void; onRemove: () => void; onToggleLeak: (s: string) => void }) {
  const last = t.stage === 'Visited';
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[0.8rem] font-semibold text-text">{t.customer}</span>
            {t.type === 'leak' && <span className="rounded-full bg-[#d47033]/20 px-1.5 py-px text-[0.5rem] font-bold uppercase text-[#d47033]">leak</span>}
          </div>
          <div className="mt-0.5 text-[0.66rem] text-muted">{t.description}</div>
        </div>
        <button onClick={onRemove} className="flex-shrink-0 text-faint hover:text-[#f4607a]">✕</button>
      </div>

      {t.type === 'leak' && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-white/5 pt-2.5">
          {LEAK_STEPS.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 text-[0.66rem] text-muted">
              <input type="checkbox" checked={(t.leakSteps || []).includes(s)} onChange={() => onToggleLeak(s)} className="h-3 w-3" style={{ accentColor: '#d47033' }} />
              <span className={(t.leakSteps || []).includes(s) ? 'text-text line-through opacity-70' : ''}>{s}</span>
            </label>
          ))}
        </div>
      )}

      {!last && (
        <button onClick={onAdvance} className="mt-3 w-full rounded-lg bg-white/5 px-3 py-1.5 text-[0.66rem] font-semibold text-accent transition hover:bg-white/10">
          Advance →
        </button>
      )}
    </div>
  );
}

export default function Service() {
  const { tickets, create, advance, remove, toggleLeak } = useServiceTickets();

  return (
    <>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">
          Module · Workflows 08 / 09 <span className="rounded-full bg-accent2/20 px-1.5 py-px text-[0.5rem] font-bold text-accent2">new</span>
        </div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">Service</h1>
        <p className="mt-1.5 text-sm text-muted">Log service requests and leak diagnostics, then move them through triage to the field visit.</p>
      </div>

      <NewTicket onCreate={create} />

      <div className="grid gap-3.5 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${SERVICE_STAGES.length}, minmax(210px, 1fr))` }}>
        {SERVICE_STAGES.map((stage) => {
          const list = tickets.filter((t) => t.stage === stage);
          const color = STAGE_COLOR[stage];
          return (
            <div key={stage} className="glass flex flex-col rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                  <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-text">{stage}</span>
                </div>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-muted">{list.length}</span>
              </div>
              <div className="flex min-h-[60px] flex-col gap-2.5 p-2.5">
                {list.length === 0 ? (
                  <div className="py-6 text-center text-[0.6rem] text-faint">—</div>
                ) : (
                  list.map((t) => (
                    <TicketCard key={t.id} t={t} onAdvance={() => advance(t.id)} onRemove={() => remove(t.id)} onToggleLeak={(s) => toggleLeak(t.id, s)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

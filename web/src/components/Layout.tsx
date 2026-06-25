import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MODULES, NAV_GROUPS, MODULE_BY_ID } from '../domain/modules';
import { useAuth } from '../auth/AuthContext';
import { useJobsCtx } from '../data/JobsContext';
import JobDrawer from './JobDrawer';

export default function Layout() {
  const { user, signOut } = useAuth();
  const { jobs, select } = useJobsCtx();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const results =
    q.trim().length >= 2
      ? jobs
          .filter((j) => {
            const s = q.toLowerCase();
            return (
              j.workOrder.toLowerCase().includes(s) ||
              j.name.toLowerCase().includes(s) ||
              j.customer.toLowerCase().includes(s) ||
              j.address.toLowerCase().includes(s)
            );
          })
          .slice(0, 8)
      : [];

  const currentModule = MODULES.find((m) => m.path === pathname) || MODULE_BY_ID['dashboard'];
  const activeGroup = NAV_GROUPS.find((g) => g.modules.includes(currentModule.id)) || NAV_GROUPS[0];
  const subModules = activeGroup.modules.map((id) => MODULE_BY_ID[id]).filter(Boolean);

  return (
    <div className="min-h-full">
      {/* Top bar */}
      <header className="glass sticky top-0 z-40 flex items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-lg bg-white px-2 py-1 shadow-sm">
            <img src="/logo.png" alt="Tailwind OS" className="h-7 w-auto" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Field Operations</div>
          </div>
        </div>

        {/* global search */}
        <div className="relative ml-4 w-full max-w-sm">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs — WO #, customer, address…"
            className="w-full rounded-lg border border-glass bg-white/[0.04] px-3 py-1.5 text-xs text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-glass bg-[#0b1322]/95 shadow-xl backdrop-blur-xl">
              {results.map((j) => (
                <button
                  key={j.id}
                  onMouseDown={() => { select(j.id); setQ(''); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-white/5"
                >
                  <span className="truncate">
                    <span className="font-semibold text-accent">{j.workOrder}</span>{' '}
                    <span className="text-muted">{j.name}</span>
                  </span>
                  <span className="shrink-0 text-[0.6rem] text-faint">{j.customer}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-xs font-medium text-text">{user?.username}</div>
            <div className="text-[10px] uppercase tracking-wide text-faint">{user?.role?.replace(/_/g, ' ')}</div>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg border border-glass bg-white/5 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Group bar */}
      <nav className="glass sticky top-[57px] z-30 flex gap-1.5 overflow-x-auto px-6 py-2.5">
        {NAV_GROUPS.map((g) => {
          const isActive = g.id === activeGroup.id;
          const firstPath = MODULE_BY_ID[g.modules[0]]?.path || '/';
          return (
            <button
              key={g.id}
              onClick={() => navigate(firstPath)}
              className={[
                'whitespace-nowrap rounded-full px-4 py-2 text-[0.74rem] font-semibold tracking-wide transition',
                isActive
                  ? 'bg-gradient-to-br from-[rgba(34,211,238,0.18)] to-[rgba(124,108,255,0.18)] text-white shadow-[0_5px_16px_-7px_rgba(41,195,236,0.55)] ring-1 ring-[rgba(41,195,236,0.35)]'
                  : 'text-muted hover:bg-white/5 hover:text-text',
              ].join(' ')}
            >
              {g.label}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab bar (only when the group has more than one screen) */}
      {subModules.length > 1 && (
        <div className="sticky top-[100px] z-20 flex gap-1.5 overflow-x-auto border-b border-glass bg-[#0a0f1c]/70 px-6 py-2 backdrop-blur-md">
          {subModules.map((m) => (
            <NavLink
              key={m.id}
              to={m.path}
              end={m.path === '/'}
              className={({ isActive }) =>
                [
                  'relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.68rem] font-semibold tracking-wide transition',
                  isActive ? 'bg-white/10 text-white ring-1 ring-[rgba(41,195,236,0.35)]' : 'text-muted hover:bg-white/5 hover:text-text',
                ].join(' ')
              }
            >
              {m.label}
              {m.isNew && <span className="ml-1.5 rounded-full bg-accent2/20 px-1.5 py-px text-[0.5rem] font-bold uppercase text-accent2">new</span>}
            </NavLink>
          ))}
        </div>
      )}

      <main className="px-6 py-7">
        <Outlet />
      </main>

      <JobDrawer />
    </div>
  );
}

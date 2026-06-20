import { NavLink, Outlet } from 'react-router-dom';
import { MODULES } from '../domain/modules';
import { useAuth } from '../auth/AuthContext';
import JobDrawer from './JobDrawer';

export default function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full">
      {/* Top bar */}
      <header className="glass sticky top-0 z-40 flex items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#6d6bff] text-sm font-bold text-[#04121a]">
            T
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Tailwind OS3</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Field Operations</div>
          </div>
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

      {/* Module nav */}
      <nav className="glass sticky top-[57px] z-30 flex gap-1.5 overflow-x-auto px-6 py-2.5">
        {MODULES.map((m) => (
          <NavLink
            key={m.id}
            to={m.path}
            end={m.path === '/'}
            className={({ isActive }) =>
              [
                'relative whitespace-nowrap rounded-full px-4 py-2 text-[0.72rem] font-semibold tracking-wide transition',
                isActive
                  ? 'bg-gradient-to-br from-[rgba(34,211,238,0.16)] to-[rgba(124,108,255,0.16)] text-white shadow-[0_5px_16px_-7px_rgba(41,195,236,0.55)] ring-1 ring-[rgba(41,195,236,0.35)]'
                  : 'text-muted hover:bg-white/5 hover:text-text',
              ].join(' ')
            }
          >
            {m.label}
            {m.isNew && (
              <span className="ml-1.5 rounded-full bg-accent2/20 px-1.5 py-px text-[0.5rem] font-bold uppercase text-accent2">
                new
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <main className="px-6 py-7">
        <Outlet />
      </main>

      <JobDrawer />
    </div>
  );
}

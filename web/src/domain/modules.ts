// ── Tailwind OS3 — Modules (navigation map) ─────────────────────────

export interface ModuleDef {
  id: string;
  label: string;
  path: string;
  /** false until the module screen is built out */
  ready: boolean;
  /** net-new module not present in the legacy app */
  isNew?: boolean;
}

export const MODULES: ModuleDef[] = [
  { id: 'dashboard', label: 'Dashboard Hub', path: '/', ready: true },
  { id: 'import', label: 'Intake', path: '/import', ready: true },
  { id: 'customers', label: 'Customer Database', path: '/customers', ready: true },
  { id: 'readiness', label: 'Readiness', path: '/readiness', ready: true },
  { id: 'schedule', label: 'Schedule', path: '/schedule', ready: true },
  { id: 'dispatch', label: 'Dispatch', path: '/dispatch', ready: true },
  { id: 'delivery', label: 'Delivery', path: '/delivery', ready: true, isNew: true },
  { id: 'installation', label: 'Installation', path: '/installation', ready: true },
  { id: 'postinstall', label: 'Post-Install', path: '/post-install', ready: true },
  { id: 'closeout', label: 'Closeout', path: '/closeout', ready: true },
  { id: 'service', label: 'Service', path: '/service', ready: true, isNew: true },
  { id: 'routing', label: 'Routing', path: '/routing', ready: true },
  { id: 'manager', label: 'Install Manager', path: '/manager', ready: true },
  { id: 'reporting', label: 'Reporting', path: '/reporting', ready: true },
  { id: 'users', label: 'Users', path: '/users', ready: true },
];

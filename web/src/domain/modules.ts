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
  { id: 'invoicing', label: 'Invoicing & AR', path: '/invoicing', ready: true, isNew: true },
  { id: 'users', label: 'Users', path: '/users', ready: true },
  { id: 'field', label: 'Field App', path: '/field', ready: true },
];

// Two-tier navigation: a row of groups, each revealing its modules.
export interface NavGroup {
  id: string;
  label: string;
  modules: string[]; // module ids, in order
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', label: 'Dashboard', modules: ['dashboard'] },
  { id: 'sales', label: 'Sales', modules: ['import', 'customers'] },
  { id: 'scheduling', label: 'Scheduling', modules: ['readiness', 'schedule', 'dispatch', 'routing'] },
  { id: 'field', label: 'Field', modules: ['delivery', 'installation', 'postinstall', 'closeout'] },
  { id: 'service', label: 'Service', modules: ['service'] },
  { id: 'fieldapp', label: 'Field App', modules: ['field'] },
  { id: 'admin', label: 'Admin', modules: ['manager', 'reporting', 'invoicing', 'users'] },
];

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));

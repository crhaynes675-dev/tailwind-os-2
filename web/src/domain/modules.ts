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
  { id: 'customers', label: 'Customer Database', path: '/customers', ready: true },
  { id: 'import', label: 'PDF Import', path: '/import', ready: true },
  { id: 'schedule', label: 'Schedule', path: '/schedule', ready: true },
  { id: 'dispatch', label: 'Dispatch', path: '/dispatch', ready: true },
  { id: 'delivery', label: 'Delivery', path: '/delivery', ready: true, isNew: true },
  { id: 'installation', label: 'Installation', path: '/installation', ready: true },
  { id: 'postinstall', label: 'Post-Install', path: '/post-install', ready: true },
  { id: 'service', label: 'Service', path: '/service', ready: true, isNew: true },
  { id: 'routing', label: 'Routing', path: '/routing', ready: true },
  { id: 'reporting', label: 'Reporting', path: '/reporting', ready: true },
];

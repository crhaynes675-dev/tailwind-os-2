// ── Tailwind OS3 — Workflows (process map) ──────────────────────────
// Each workflow is an ordered list of steps with owner / key input /
// key output (the stage gates). Source: uploaded Process Map REV 3.0.

export interface WorkflowStep {
  step: string;
  owner: string;
  input: string;
  output: string;
}

export interface Workflow {
  id: string;
  title: string;
  color: string;
  steps: WorkflowStep[];
}

const s = (step: string, owner: string, input: string, output: string): WorkflowStep => ({ step, owner, input, output });

export const WORKFLOWS: Workflow[] = [
  {
    id: '01', title: 'Sales to Operations Handoff', color: '#27ad72',
    steps: [
      s('Lead', 'Sales', 'Initial inquiry / CRM entry', 'Qualified opportunity'),
      s('Quote', 'Sales / Estimating', 'Scope, drawings, specs', 'Submitted bid'),
      s('Sale Awarded', 'Sales', 'Executed contract', 'Award notification'),
      s('Sales Handoff', 'Sales → Ops', 'Contract, job docs, scope', 'Ops briefed'),
      s('Operations Review', 'Ops Manager', 'Handoff package', 'Risk flags, open items'),
      s('Job Setup', 'Ops / Admin', 'Reviewed docs', 'Job created in system'),
    ],
  },
  {
    id: '02', title: 'Preconstruction / Job Readiness', color: '#3b82c4',
    steps: [
      s('Job Setup', 'Ops', 'Job record', 'Setup confirmed'),
      s('Rough Opening Walk', 'Field Lead', 'Site access, drawings', 'RO dimensions, field notes'),
      s('Pre-Walk', 'Install Mgr', 'RO report', 'Issues flagged pre-material'),
      s('Builder Coordination', 'Install Mgr', 'Schedule, access info', 'Builder confirmation'),
      s('Site Readiness Verification', 'Field Lead', 'Checklist', 'Site cleared for delivery'),
      s('Material Verification', 'Warehouse', 'PO, order docs', 'Material confirmed on hand'),
    ],
  },
  {
    id: '03', title: 'Scheduling Workflow', color: '#d4851f',
    steps: [
      s('Ready To Schedule', 'Ops', 'Readiness gate cleared', 'Job enters scheduling queue'),
      s('Scheduling Review', 'Install Mgr', 'Capacity, constraints', 'Draft schedule'),
      s('Crew Assignment', 'Install Mgr', 'Availability, skill', 'Crew confirmed'),
      s('Equipment Assignment', 'Install Mgr', 'Equipment availability', 'Equipment reserved'),
      s('Delivery Assignment', 'Warehouse Mgr', 'Delivery calendar', 'Delivery slot locked'),
      s('Schedule Published', 'Install Mgr', 'Final schedule', 'All parties notified'),
    ],
  },
  {
    id: '04', title: 'Delivery Workflow', color: '#9b4dca',
    steps: [
      s('Material Ready', 'Warehouse', 'PO, receiving docs', 'Material staged'),
      s('Warehouse Pick', 'Warehouse', 'Pick list', 'Items pulled & verified'),
      s('Quality Check', 'Warehouse Lead', 'Visual inspection checklist', 'QC pass / fail noted'),
      s('Load Truck', 'Warehouse / Driver', 'Load plan', 'Truck manifest signed'),
      s('Delivery', 'Driver', 'Delivery schedule, address', 'Delivered to site'),
      s('Site Verification', 'Driver / Field Lead', 'Manifest', 'Signed delivery receipt'),
    ],
  },
  {
    id: '05', title: 'Installation Workflow', color: '#27c4a0',
    steps: [
      s('Scheduled', 'Install Mgr', 'Published schedule', 'Crew aware, materials staged'),
      s('Crew Dispatched', 'Install Mgr', 'Dispatch order', 'Crew en route confirmed'),
      s('On Site', 'Lead Installer', 'Job docs, drawings', 'Site conditions verified'),
      s('Install In Progress', 'Crew', 'Materials, tools', 'Progress updates'),
      s('Punch Completion', 'Lead Installer', 'Punch list', 'All items resolved'),
      s('Install Complete', 'Lead Installer', 'Completion checklist', 'Status updated to complete'),
    ],
  },
  {
    id: '06', title: 'Post Installation Inspection', color: '#d44444',
    steps: [
      s('Install Complete', 'Field Lead', 'Completion status', 'Inspection triggered'),
      s('Post Install Walk', 'Install Mgr / QA', 'Inspection checklist', 'Deficiency list'),
      s('Deficiency Review', 'Install Mgr', 'Deficiency list', 'Corrective action plan'),
      s('Customer Signoff', 'PM / Sales', 'Walk report', 'Signed approval'),
      s('Final Walkthrough Ready', 'Ops', 'Signoff docs', 'Job advanced to closeout'),
    ],
  },
  {
    id: '07', title: 'Project Closeout', color: '#c4b827',
    steps: [
      s('Final Walkthrough Ready', 'Ops', 'Post-install approval', 'Closeout scheduled'),
      s('Final Walkthrough', 'PM / Customer', 'Punch resolved docs', 'Walk complete'),
      s('Customer Approval', 'Customer / PM', 'Walkthrough notes', 'Signed closeout doc'),
      s('Closed', 'Ops', 'All approvals', 'Job closed, billing triggered'),
    ],
  },
  {
    id: '08', title: 'Service Workflow', color: '#278bc4',
    steps: [
      s('Service Request', 'Customer / GC', 'Contact, description', 'Request logged'),
      s('Intake', 'Service Coordinator', 'Request details', 'Ticket created'),
      s('Triage', 'Service Mgr', 'Ticket, job history', 'Priority assigned'),
      s('Schedule', 'Service Mgr', 'Tech availability', 'Service date confirmed'),
      s('Dispatch', 'Service Mgr', 'Dispatch order', 'Tech notified'),
      s('Service Visit', 'Service Tech', 'Job docs, parts', 'Work performed'),
    ],
  },
  {
    id: '09', title: 'Leak Diagnostic Workflow', color: '#d47033',
    steps: [
      s('Leak Reported', 'Customer / GC', 'Description, photos', 'Ticket opened'),
      s('Visual Inspection', 'Service Tech', 'Physical access', 'Visible defects noted'),
      s('Environmental Conditions', 'Service Tech', 'Weather data, site notes', 'Conditions documented'),
      s('Hose Test', 'Service Tech', 'Hose test protocol', 'Test results recorded'),
      s('Diagnosis', 'Service Tech / Mgr', 'All inspection data', 'Root cause identified'),
      s('Corrective Action', 'Service Tech', 'Diagnosis report', 'Repair completed / scheduled'),
    ],
  },
  {
    id: '10', title: 'Install Manager — Daily Flow', color: '#7033d4',
    steps: [
      s('Review Schedule', 'Install Mgr', 'Published schedule', 'Issues flagged'),
      s('Verify Crews', 'Install Mgr', 'Attendance, capacity', 'Crew status confirmed'),
      s('Verify Deliveries', 'Install Mgr', 'Delivery manifest', 'Deliveries on track'),
      s('Verify Equipment', 'Install Mgr', 'Equipment log', 'Equipment cleared'),
      s('Builder Readiness Calls', 'Install Mgr', 'Contact list, schedule', 'Builder access confirmed'),
      s('Field Support / Site Visits', 'Install Mgr', 'Field reports', 'Issues resolved'),
    ],
  },
  {
    id: '11', title: 'Install Manager — Weekly Flow', color: '#a427c4',
    steps: [
      s('2 Week Forecast', 'Install Mgr', 'Schedule, open jobs', 'Capacity plan'),
      s('Sales Coordination', 'Install Mgr + Sales', 'Pipeline, awarded jobs', 'Aligned schedule'),
      s('Builder Coordination', 'Install Mgr', 'Builder contacts', 'Confirmed access windows'),
      s('Delivery Planning', 'Install Mgr + Warehouse', 'Material status', 'Delivery calendar updated'),
      s('Equipment Planning', 'Install Mgr', 'Equipment status', 'Equipment reserved'),
      s('Subcontractor Planning', 'Install Mgr', 'Sub availability', 'Sub schedule confirmed'),
    ],
  },
  {
    id: '13', title: 'Status Architecture', color: '#a427c4',
    steps: [
      s('Unscheduled', 'System / Ops', 'Job record created', 'Awaiting scheduling gate'),
      s('Scheduled', 'Install Mgr', 'Schedule published', 'Crew + resources assigned'),
      s('In Progress', 'Field', 'On-site confirmation', 'Active installation'),
      s('Ready For Post Install Walk', 'Field Lead', 'Install complete signal', 'QA walk triggered'),
      s('Final Walkthrough Ready', 'Ops / PM', 'Post-install approval', 'Closeout initiated'),
      s('Completed', 'System / Ops', 'Customer approval', 'Job closed'),
    ],
  },
];

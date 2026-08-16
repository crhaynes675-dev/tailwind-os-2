import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { enqueue } from '../lib/outbox';
import { normalizeStatus, WRITE_STATUS, type JobStatus } from '../domain/status';
import type { Job, ReadinessStep } from './jobs';

interface ApiJob {
  jobId: string;
  workOrderNumber?: string;
  jobName?: string;
  customerName?: string;
  customerCompany?: string;
  customerPhone?: string;
  address?: string;
  status?: string;
  assignedTo?: string;
  scheduledDate?: string;
  scheduledEndDate?: string;
  priority?: string;
  notes?: string;
  contractAmount?: number;
  materialCost?: number;
  laborCost?: number;
  invoiceStatus?: string;
  invoicedAt?: string;
  paidAt?: string;
  completedAt?: string;
  enrouteAt?: string;
  onSiteAt?: string;
  readiness?: ReadinessStep[];
  postInstallSignedBy?: string;
  postInstallSignedAt?: string;
  customerApprovedName?: string;
  customerApprovedAt?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function mapJob(j: ApiJob): Job {
  return {
    id: j.jobId,
    workOrder: j.workOrderNumber || '—',
    name: j.jobName || 'Unnamed Job',
    customer: j.customerCompany || j.customerName || '—',
    customerPhone: j.customerPhone || undefined,
    address: j.address || '',
    status: normalizeStatus(j.status),
    crew: j.assignedTo || undefined,
    scheduledDate: j.scheduledDate && j.scheduledDate !== '0001-01-01' ? j.scheduledDate : undefined,
    scheduledEndDate: j.scheduledEndDate && j.scheduledEndDate !== '0001-01-01' ? j.scheduledEndDate : undefined,
    priority: (j.priority as Job['priority']) || undefined,
    notes: j.notes || undefined,
    contractAmount: typeof j.contractAmount === 'number' ? j.contractAmount : undefined,
    materialCost: typeof j.materialCost === 'number' ? j.materialCost : undefined,
    laborCost: typeof j.laborCost === 'number' ? j.laborCost : undefined,
    invoiceStatus: (j.invoiceStatus as Job['invoiceStatus']) || undefined,
    invoicedAt: j.invoicedAt || undefined,
    paidAt: j.paidAt || undefined,
    completedAt: j.completedAt || undefined,
    enrouteAt: j.enrouteAt || undefined,
    onSiteAt: j.onSiteAt || undefined,
    readiness: Array.isArray(j.readiness) ? j.readiness : undefined,
    postInstallSignedBy: j.postInstallSignedBy || undefined,
    postInstallSignedAt: j.postInstallSignedAt || undefined,
    customerApprovedBy: j.customerApprovedName || undefined,
    customerApprovedAt: j.customerApprovedAt || undefined,
  };
}

/** Local edit patch → API body (maps canonical → persisted fields). */
function patchToBody(patch: Partial<Job>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.status) body.status = WRITE_STATUS[patch.status];
  if (patch.crew !== undefined) body.assignedTo = patch.crew;
  if (patch.scheduledDate !== undefined) body.scheduledDate = patch.scheduledDate;
  if (patch.scheduledEndDate !== undefined) body.scheduledEndDate = patch.scheduledEndDate;
  if (patch.name !== undefined) body.jobName = patch.name;
  if (patch.address !== undefined) body.address = patch.address;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.contractAmount !== undefined) body.contractAmount = patch.contractAmount;
  if (patch.materialCost !== undefined) body.materialCost = patch.materialCost;
  if (patch.laborCost !== undefined) body.laborCost = patch.laborCost;
  if (patch.invoiceStatus !== undefined) body.invoiceStatus = patch.invoiceStatus;
  if (patch.invoicedAt !== undefined) body.invoicedAt = patch.invoicedAt;
  if (patch.paidAt !== undefined) body.paidAt = patch.paidAt;
  if (patch.enrouteAt !== undefined) body.enrouteAt = patch.enrouteAt;
  if (patch.onSiteAt !== undefined) body.onSiteAt = patch.onSiteAt;
  if (patch.completedAt !== undefined) body.completedAt = patch.completedAt;
  if (patch.readiness !== undefined) body.readiness = patch.readiness;
  if (patch.postInstallSignedBy !== undefined) body.postInstallSignedBy = patch.postInstallSignedBy;
  if (patch.postInstallSignedAt !== undefined) body.postInstallSignedAt = patch.postInstallSignedAt;
  return body;
}

interface JobsState {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>;
  updateStatus: (id: string, status: JobStatus) => Promise<void>;
  createJob: (data: {
    jobName: string;
    address?: string;
    customerName?: string;
    customerCompany?: string;
    customerPhone?: string;
    quoteNum?: string;
    notes?: string;
    scheduledDate?: string;
    contractAmount?: number;
    quoteId?: string;
  }) => Promise<string | undefined>;
  selectedId: string | null;
  select: (id: string | null) => void;
}

const JobsContext = createContext<JobsState | undefined>(undefined);

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const from = ymd(new Date(now.getTime() - 120 * 86400000));
      const to = ymd(new Date(now.getTime() + 180 * 86400000));
      const items = await apiGet<ApiJob[]>(`/jobs?from=${from}&to=${to}`);
      setJobs((Array.isArray(items) ? items : []).map(mapJob));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateJob = useCallback(
    async (id: string, patch: Partial<Job>) => {
      setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
      try {
        // Goes through the outbox so a crew with no signal keeps their work:
        // the write is persisted and replayed rather than thrown away. When
        // online this still sends immediately.
        await enqueue({
          method: 'PUT',
          path: `/jobs/${id}`,
          body: patchToBody(patch),
          label: patch.status ? `Status → ${patch.status}` : 'Job update',
        });
      } catch (e) {
        // Only genuine rejections reach here; offline writes stay queued.
        await load();
        throw e;
      }
    },
    [load],
  );

  const updateStatus = useCallback((id: string, status: JobStatus) => updateJob(id, { status }), [updateJob]);

  const createJob = useCallback(
    async (data: {
      jobName: string;
      address?: string;
      customerName?: string;
      customerCompany?: string;
      customerPhone?: string;
      quoteNum?: string;
      notes?: string;
      scheduledDate?: string;
      contractAmount?: number;
      quoteId?: string;
    }) => {
      // New jobs enter the pipeline Unscheduled (the API otherwise defaults
      // to "scheduled"); they flow to Readiness / Needs Scheduling next.
      const res = await apiSend<{ jobId?: string }>('POST', '/jobs', { ...data, status: 'Unscheduled' });
      await load();
      return res?.jobId;
    },
    [load],
  );

  return (
    <JobsContext.Provider value={{ jobs, loading, error, reload: load, updateJob, updateStatus, createJob, selectedId, select: setSelectedId }}>
      {children}
    </JobsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useJobsCtx(): JobsState {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobsCtx must be used within JobsProvider');
  return ctx;
}

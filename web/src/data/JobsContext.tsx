import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { normalizeStatus, WRITE_STATUS, type JobStatus } from '../domain/status';
import type { Job } from './jobs';

interface ApiJob {
  jobId: string;
  workOrderNumber?: string;
  jobName?: string;
  customerName?: string;
  customerCompany?: string;
  address?: string;
  status?: string;
  assignedTo?: string;
  scheduledDate?: string;
  priority?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function mapJob(j: ApiJob): Job {
  return {
    id: j.jobId,
    workOrder: j.workOrderNumber || '—',
    name: j.jobName || 'Unnamed Job',
    customer: j.customerCompany || j.customerName || '—',
    address: j.address || '',
    status: normalizeStatus(j.status),
    crew: j.assignedTo || undefined,
    scheduledDate: j.scheduledDate && j.scheduledDate !== '0001-01-01' ? j.scheduledDate : undefined,
    priority: (j.priority as Job['priority']) || undefined,
  };
}

/** Local edit patch → API body (maps canonical → persisted fields). */
function patchToBody(patch: Partial<Job>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.status) body.status = WRITE_STATUS[patch.status];
  if (patch.crew !== undefined) body.assignedTo = patch.crew;
  if (patch.scheduledDate !== undefined) body.scheduledDate = patch.scheduledDate;
  if (patch.name !== undefined) body.jobName = patch.name;
  if (patch.address !== undefined) body.address = patch.address;
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
  }) => Promise<void>;
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
        await apiSend('PUT', `/jobs/${id}`, patchToBody(patch));
      } catch (e) {
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
    }) => {
      await apiSend('POST', '/jobs', data);
      await load();
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

import { useEffect, useState, useCallback } from 'react';
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

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mapJob(j: ApiJob): Job {
  const priority = (j.priority as Job['priority']) || undefined;
  return {
    id: j.jobId,
    workOrder: j.workOrderNumber || '—',
    name: j.jobName || 'Unnamed Job',
    customer: j.customerCompany || j.customerName || '—',
    address: j.address || '',
    status: normalizeStatus(j.status),
    crew: j.assignedTo || undefined,
    scheduledDate: j.scheduledDate && j.scheduledDate !== '0001-01-01' ? j.scheduledDate : undefined,
    priority,
  };
}

export interface UseJobs {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  updateStatus: (id: string, status: JobStatus) => Promise<void>;
}

export function useJobs(): UseJobs {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const updateStatus = useCallback(async (id: string, status: JobStatus) => {
    // optimistic
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status } : j)));
    try {
      await apiSend('PUT', `/jobs/${id}`, { status: WRITE_STATUS[status] });
    } catch (e) {
      await load(); // resync to authoritative server state on failure
      throw e;
    }
  }, [load]);

  return { jobs, loading, error, reload: load, updateStatus };
}

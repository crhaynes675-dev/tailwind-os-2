import { describe, it, expect } from 'vitest';
import {
  JOB_STATUSES, normalizeStatus, nextStatus, statusIndex, transitionKind,
  STATUS_GATE, WRITE_STATUS, SIGNATURE_GATE_KEY, type JobStatus,
} from './status';

/**
 * The six-state backbone is what every module reads and writes, and the legacy
 * map is what lets the old app and OS3 share records. A change here silently
 * moves jobs to the wrong stage across the whole system.
 */
describe('normalizeStatus', () => {
  it('maps legacy and free-form strings onto the canonical states', () => {
    expect(normalizeStatus('dispatched')).toBe('Scheduled');
    expect(normalizeStatus('en route')).toBe('In Progress');
    expect(normalizeStatus('on site')).toBe('In Progress');
    expect(normalizeStatus('ready for site review')).toBe('Ready for Post-Install Walk');
    expect(normalizeStatus('closed')).toBe('Completed');
    expect(normalizeStatus('imported')).toBe('Unscheduled');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeStatus('  ScHeDuLeD ')).toBe('Scheduled');
  });

  it('defaults an unknown or missing status to Unscheduled rather than throwing', () => {
    expect(normalizeStatus('nonsense')).toBe('Unscheduled');
    expect(normalizeStatus(null)).toBe('Unscheduled');
    expect(normalizeStatus(undefined)).toBe('Unscheduled');
    expect(normalizeStatus('')).toBe('Unscheduled');
  });

  it('round-trips every canonical status through its persisted form', () => {
    for (const s of JOB_STATUSES) {
      expect(normalizeStatus(WRITE_STATUS[s])).toBe(s);
    }
  });
});

describe('pipeline movement', () => {
  it('advances one stage at a time and stops at the end', () => {
    expect(nextStatus('Unscheduled')).toBe('Scheduled');
    expect(nextStatus('Final Walkthrough Ready')).toBe('Completed');
    expect(nextStatus('Completed')).toBeNull();
  });

  it('classifies transitions so skips and reversals can be flagged', () => {
    expect(transitionKind('Scheduled', 'Scheduled')).toBe('same');
    expect(transitionKind('Scheduled', 'In Progress')).toBe('forward');
    expect(transitionKind('Unscheduled', 'Completed')).toBe('skip');
    expect(transitionKind('Completed', 'Scheduled')).toBe('back');
  });

  it('orders the pipeline as declared', () => {
    JOB_STATUSES.forEach((s, i) => expect(statusIndex(s)).toBe(i));
  });
});

describe('stage gates', () => {
  it('requires a crew and a date before a job can be scheduled', () => {
    const keys = STATUS_GATE.Scheduled.filter((f) => f.required).map((f) => f.key);
    expect(keys).toContain('assignedTo');
    expect(keys).toContain('scheduledDate');
  });

  it('requires the field crew to name themselves and sign the post-install walk', () => {
    const gate = STATUS_GATE['Final Walkthrough Ready'];
    expect(gate.find((f) => f.key === 'postInstallSignedBy')?.required).toBe(true);
    expect(gate.find((f) => f.type === 'signature')?.required).toBe(true);
    expect(SIGNATURE_GATE_KEY['Final Walkthrough Ready']).toBe('_crewSignature');
  });

  it('captures a crew signature at exactly one gate — the post-install walk', () => {
    const withSignature = (Object.keys(STATUS_GATE) as JobStatus[])
      .filter((s) => STATUS_GATE[s].some((f) => f.type === 'signature'));
    expect(withSignature).toEqual(['Final Walkthrough Ready']);
  });

  it('keeps confirmation-only keys out of the persisted patch', () => {
    // Keys starting with "_" are confirmations; everything else is written.
    for (const s of JOB_STATUSES) {
      for (const f of STATUS_GATE[s]) {
        if (f.type === 'confirm' || f.type === 'signature') expect(f.key.startsWith('_')).toBe(true);
      }
    }
  });
});

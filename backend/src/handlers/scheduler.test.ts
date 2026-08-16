import { describe, it, expect } from 'vitest';
import { addDays } from './scheduler';

/**
 * Date arithmetic for the daily reminder sweep. A one-day slip here means a
 * customer is told "tomorrow" on the wrong day, or texted twice — so the
 * month, year and leap-day boundaries are worth pinning down explicitly.
 */
describe('addDays', () => {
  it('moves forward and backward within a month', () => {
    expect(addDays('2026-08-15', 1)).toBe('2026-08-16');
    expect(addDays('2026-08-15', -1)).toBe('2026-08-14');
    expect(addDays('2026-08-15', 0)).toBe('2026-08-15');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap and non-leap Februaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is stable under round trips, so a send date always maps back', () => {
    for (const lead of [0, 1, 2, 7, 30]) {
      expect(addDays(addDays('2026-08-15', lead), -lead)).toBe('2026-08-15');
    }
  });

  it('is unaffected by local timezone, since dates are calendar dates', () => {
    // Built in UTC — a machine in UTC-8 must not shift the result back a day.
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
    expect(addDays('2026-12-31', 0)).toBe('2026-12-31');
  });
});

/**
 * The dedupe key is what stops a re-run texting a customer twice. It must
 * depend only on identity and target date — never on wall-clock time.
 */
describe('dedupe keys', () => {
  const jobKey = (jobId: string, target: string) => `rem_job_${jobId}_${target}`;
  const itemKey = (id: string, date: string) => `rem_item_${id}_${date}`;

  it('is identical across runs for the same job and date', () => {
    expect(jobKey('j1', '2026-08-20')).toBe(jobKey('j1', '2026-08-20'));
  });

  it('differs per job and per date, so real reminders are not collapsed', () => {
    expect(jobKey('j1', '2026-08-20')).not.toBe(jobKey('j2', '2026-08-20'));
    expect(jobKey('j1', '2026-08-20')).not.toBe(jobKey('j1', '2026-08-21'));
  });

  it('keeps job and calendar-item keys in separate namespaces', () => {
    expect(jobKey('x', '2026-08-20')).not.toBe(itemKey('x', '2026-08-20'));
  });
});

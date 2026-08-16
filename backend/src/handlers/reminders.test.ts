import { describe, it, expect } from 'vitest';
import { validateReminder, buildReminder } from './reminders';

const valid = { title: 'Call builder about access', date: '2026-08-20' };

describe('validateReminder', () => {
  it('accepts a minimal reminder', () => {
    expect(validateReminder(valid)).toBeNull();
  });

  it('requires a title and a real date', () => {
    expect(validateReminder({ ...valid, title: '   ' })).toMatch(/title/i);
    expect(validateReminder({ ...valid, date: '20-08-2026' })).toMatch(/date/i);
    expect(validateReminder({ title: 'x' })).toMatch(/date/i);
  });

  it('rejects an end date before the start', () => {
    expect(validateReminder({ ...valid, endDate: '2026-08-19' })).toMatch(/before/i);
    expect(validateReminder({ ...valid, endDate: '2026-08-21' })).toBeNull();
  });

  it('rejects a malformed time', () => {
    expect(validateReminder({ ...valid, time: '9am' })).toMatch(/time/i);
    expect(validateReminder({ ...valid, time: '09:00' })).toBeNull();
  });

  it('rejects a phone number it could not text', () => {
    expect(validateReminder({ ...valid, smsTo: '12345' })).toMatch(/phone/i);
    expect(validateReminder({ ...valid, smsTo: '(555) 123-4567' })).toBeNull();
  });

  it('bounds the lead time', () => {
    expect(validateReminder({ ...valid, smsLeadDays: -1 })).toMatch(/lead/i);
    expect(validateReminder({ ...valid, smsLeadDays: 31 })).toMatch(/lead/i);
    expect(validateReminder({ ...valid, smsLeadDays: 1.5 })).toMatch(/lead/i);
    expect(validateReminder({ ...valid, smsLeadDays: 7 })).toBeNull();
  });
});

describe('buildReminder', () => {
  const now = '2026-08-15T10:00:00Z';

  it('keys the date index so a day range query finds it', () => {
    const r = buildReminder('demo', 'rem_abc', valid, now);
    expect(r.GSI1PK).toBe('TENANT#demo#REMINDERS');
    expect(r.GSI1SK).toBe('DATE#2026-08-20#rem_abc');
    expect(r.PK).toBe('TENANT#demo#REMINDER#rem_abc');
  });

  it('normalizes the phone number so the sender does not have to', () => {
    const r = buildReminder('demo', 'rem_abc', { ...valid, smsTo: '(555) 123-4567' }, now);
    expect(r.smsTo).toBe('+15551234567');
  });

  it('drops an end date that precedes the start rather than storing it', () => {
    const r = buildReminder('demo', 'rem_abc', { ...valid, endDate: '2026-08-01' }, now);
    expect(r.endDate).toBeUndefined();
  });

  it('preserves the original createdAt on edit', () => {
    const r = buildReminder('demo', 'rem_abc', valid, now, '2026-01-01T00:00:00Z');
    expect(r.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(r.updatedAt).toBe(now);
  });

  it('trims free text', () => {
    const r = buildReminder('demo', 'rem_abc', { ...valid, title: '  Order trim  ', owner: '  Dana  ' }, now);
    expect(r.title).toBe('Order trim');
    expect(r.owner).toBe('Dana');
  });
});

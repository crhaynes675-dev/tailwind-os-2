import { describe, it, expect } from 'vitest';
import { normalizePhone } from './notify';

/**
 * Phone numbers are typed by office staff in whatever shape they like. A
 * number that fails to normalize means a customer silently never hears from
 * us, so the parsing has to be generous about format and strict about result.
 */
describe('normalizePhone', () => {
  it('accepts the shapes people actually type', () => {
    for (const input of ['5551234567', '(555) 123-4567', '555-123-4567', '555.123.4567', '  555 123 4567  ']) {
      expect(normalizePhone(input)).toBe('+15551234567');
    }
  });

  it('handles a leading country code', () => {
    expect(normalizePhone('15551234567')).toBe('+15551234567');
    expect(normalizePhone('1 (555) 123-4567')).toBe('+15551234567');
  });

  it('passes through already-normalized international numbers', () => {
    expect(normalizePhone('+445551234567')).toBe('+445551234567');
  });

  it('rejects anything it cannot confidently dial', () => {
    for (const bad of ['', '   ', '123', '55512345', 'not a phone', '+', '+1']) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });

  it('rejects a missing value rather than throwing', () => {
    expect(normalizePhone(undefined)).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectivePlan, PLAN_MODULES, LEGACY_PLAN, FALLBACK_PLAN } from './plan';

/**
 * Plan resolution decides who gets paid features. It used to fail *open* —
 * unknown values and lookup errors both granted Enterprise — so these tests
 * exist to keep a bad plan string from ever becoming a free upgrade again.
 */
describe('effectivePlan', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('passes through the known tiers', () => {
    expect(effectivePlan('starter')).toBe('starter');
    expect(effectivePlan('pro')).toBe('pro');
    expect(effectivePlan('enterprise')).toBe('enterprise');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(effectivePlan('  PRO  ')).toBe('pro');
    expect(effectivePlan('Enterprise')).toBe('enterprise');
  });

  it('treats a trial as Pro', () => {
    expect(effectivePlan('trial')).toBe('pro');
  });

  it('treats a missing plan as a legacy tenant, not a fault', () => {
    expect(effectivePlan('')).toBe(LEGACY_PLAN);
    expect(effectivePlan(undefined)).toBe(LEGACY_PLAN);
    expect(effectivePlan('   ')).toBe(LEGACY_PLAN);
  });

  it('fails closed on an unrecognized plan rather than granting the top tier', () => {
    for (const bad of ['professional', 'premium', 'free', 'enterprise-plus', 'xyz']) {
      expect(effectivePlan(bad)).toBe(FALLBACK_PLAN);
    }
  });

  it('warns on bad data so it can be found and fixed', () => {
    effectivePlan('professional');
    expect(warn).toHaveBeenCalled();
  });
});

describe('PLAN_MODULES', () => {
  it('is cumulative — each tier includes everything below it', () => {
    for (const m of PLAN_MODULES.starter) expect(PLAN_MODULES.pro).toContain(m);
    for (const m of PLAN_MODULES.pro) expect(PLAN_MODULES.enterprise).toContain(m);
  });

  it('keeps paid modules out of the fallback tier', () => {
    for (const paid of ['service', 'timeoff', 'manager', 'invoicing', 'reporting']) {
      expect(PLAN_MODULES[FALLBACK_PLAN]).not.toContain(paid);
    }
  });

  it('leaves the plans screen reachable on every tier, so an upgrade is always possible', () => {
    for (const tier of ['starter', 'pro', 'enterprise'] as const) {
      expect(PLAN_MODULES[tier]).toContain('plans');
    }
  });
});

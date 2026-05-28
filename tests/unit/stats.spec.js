/* Unit tests for Wilson CI helper (T-3.3) */
import { describe, it, expect } from 'vitest';
import { wilsonInterval } from '../../src/data/stats.js';

describe('wilsonInterval', () => {
  it('returns p≈0.5 with CI [0.404, 0.596] for 50/100', () => {
    const { p, lo, hi, n } = wilsonInterval(50, 100);
    expect(n).toBe(100);
    expect(p).toBeCloseTo(0.5, 3);
    expect(lo).toBeCloseTo(0.404, 2);
    expect(hi).toBeCloseTo(0.596, 2);
  });

  it('returns nulls for total=0', () => {
    const { p, lo, hi, n } = wilsonInterval(0, 0);
    expect(n).toBe(0);
    expect(p).toBeNull();
    expect(lo).toBeNull();
    expect(hi).toBeNull();
  });

  it('returns nulls for negative total', () => {
    const { lo } = wilsonInterval(0, -5);
    expect(lo).toBeNull();
  });

  it('returns p=1 with narrow CI for 100/100', () => {
    const { p, lo, hi } = wilsonInterval(100, 100);
    expect(p).toBeCloseTo(1, 3);
    expect(lo).toBeGreaterThan(0.9);
    expect(hi).toBeCloseTo(1, 10);
  });

  it('returns p=0 with CI [0, ...] for 0/100', () => {
    const { p, lo, hi } = wilsonInterval(0, 100);
    expect(p).toBeCloseTo(0, 3);
    expect(lo).toBe(0);
    expect(hi).toBeLessThan(0.05);
  });

  it('handles small n=1 correctly', () => {
    const { p, lo, hi, n } = wilsonInterval(1, 1, 1.96);
    expect(n).toBe(1);
    expect(p).toBeCloseTo(1, 3);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeCloseTo(1, 10);
  });

  it('handles z=1.0 (narrower CI)', () => {
    const a = wilsonInterval(50, 100, 1.96);
    const b = wilsonInterval(50, 100, 1.0);
    // narrower z should produce tighter CI
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
  });
});
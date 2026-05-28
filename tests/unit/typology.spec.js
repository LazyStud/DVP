/* Unit tests for venue typology classifier (T-3.4) */
import { describe, it, expect, beforeEach } from 'vitest';
import { classifyVenue, loadTypologyContext, _resetContext } from '../../src/data/typology.js';

// Build a synthetic context with 10 venues per bucket, all metrics [1..10].
function makeCtx() {
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const bucket = { sr: [...vals], bp: [...vals], bavg: [...vals] };
  return { test: bucket, odi: bucket, t20: bucket, all: bucket };
}

describe('classifyVenue', () => {
  it('returns null when matches_count < 10', () => {
    const ctx = makeCtx();
    expect(classifyVenue({ batting_sr: 9, boundary_pct: 9, bowling_avg: 9, matches_count: 9 }, 'test', ctx)).toBeNull();
    expect(classifyVenue({ batting_sr: 9, boundary_pct: 9, bowling_avg: 9, matches_count: 0 }, 'odi', ctx)).toBeNull();
  });

  it('returns null when metrics is null/undefined', () => {
    const ctx = makeCtx();
    expect(classifyVenue(null, 'test', ctx)).toBeNull();
    expect(classifyVenue(undefined, 't20', ctx)).toBeNull();
  });

  it('classifies high-SR / high-boundary / high-avg venue as batting paradise', () => {
    // sr=10, bp=10, bavg=10 → pctRank each = 9/10 = 0.9 → score = 2.7
    const ctx = makeCtx();
    const t = classifyVenue({ batting_sr: 10, boundary_pct: 10, bowling_avg: 10, matches_count: 20 }, 'test', ctx);
    expect(t).not.toBeNull();
    expect(t.key).toBe('batting');
    expect(t.label).toBe('Batting paradise');
    expect(t.score).toBeGreaterThanOrEqual(2.0);
  });

  it('classifies low-SR / low-boundary / low-avg venue as bowler-friendly', () => {
    // sr=1, bp=1, bavg=1 → pctRank each = 0/10 = 0 → score = 0
    const ctx = makeCtx();
    const t = classifyVenue({ batting_sr: 1, boundary_pct: 1, bowling_avg: 1, matches_count: 15 }, 'odi', ctx);
    expect(t).not.toBeNull();
    expect(t.key).toBe('bowling');
    expect(t.label).toBe('Bowler-friendly');
    expect(t.score).toBeLessThanOrEqual(1.0);
  });

  it('classifies mid-range metrics as balanced', () => {
    // sr=5, bp=5, bavg=5 → pctRank each = 4/10 = 0.4 → score = 1.2
    const ctx = makeCtx();
    const t = classifyVenue({ batting_sr: 5, boundary_pct: 5, bowling_avg: 5, matches_count: 30 }, 't20', ctx);
    expect(t).not.toBeNull();
    expect(t.key).toBe('balanced');
    expect(t.label).toBe('Balanced');
    expect(t.score).toBeGreaterThan(1.0);
    expect(t.score).toBeLessThan(2.0);
  });

  it('falls back to ctx.all when format bucket is missing', () => {
    const allBucket = { sr: [1,2,3,4,5,6,7,8,9,10], bp: [1,2,3,4,5,6,7,8,9,10], bavg: [1,2,3,4,5,6,7,8,9,10] };
    const ctx = { all: allBucket }; // no format-specific buckets
    const t = classifyVenue({ batting_sr: 10, boundary_pct: 10, bowling_avg: 10, matches_count: 20 }, 'test', ctx);
    expect(t).not.toBeNull();
    expect(t.key).toBe('batting');
  });

  it('returns null when context bucket has fewer than 5 entries', () => {
    const tinyBucket = { sr: [1, 2, 3], bp: [1, 2, 3], bavg: [1, 2, 3] };
    const ctx = { test: tinyBucket, all: tinyBucket };
    expect(classifyVenue({ batting_sr: 3, boundary_pct: 3, bowling_avg: 3, matches_count: 20 }, 'test', ctx)).toBeNull();
  });
});

describe('loadTypologyContext', () => {
  beforeEach(() => { _resetContext(); });

  it('returns empty sorted arrays when DB.queryAll throws', async () => {
    const DB = { queryAll: () => { throw new Error('no table'); } };
    const ctx = await loadTypologyContext(DB);
    expect(ctx).toBeDefined();
    expect(ctx.all.sr).toEqual([]);
  });

  it('returns empty sorted arrays when DB.queryAll returns empty', async () => {
    const DB = { queryAll: () => [] };
    const ctx = await loadTypologyContext(DB);
    expect(ctx.all.sr).toEqual([]);
    expect(ctx.test.bavg).toEqual([]);
  });

  it('populates and sorts arrays from rows', async () => {
    const rows = [
      { v: 'a', f: 'test', m: 20, sr: 80, bp: 30, bavg: 25 },
      { v: 'b', f: 'test', m: 15, sr: 60, bp: 20, bavg: 30 },
      { v: 'c', f: 'odi',  m: 12, sr: 70, bp: 25, bavg: 28 },
    ];
    const DB = { queryAll: () => rows };
    const ctx = await loadTypologyContext(DB);
    expect(ctx.test.sr).toEqual([60, 80]);
    expect(ctx.test.sr).toEqual([...ctx.test.sr].sort((a, b) => a - b));
    expect(ctx.all.sr.length).toBe(3);
  });

  it('caches result on second call', async () => {
    let callCount = 0;
    const DB = { queryAll: () => { callCount++; return []; } };
    await loadTypologyContext(DB);
    await loadTypologyContext(DB);
    expect(callCount).toBe(1);
  });
});

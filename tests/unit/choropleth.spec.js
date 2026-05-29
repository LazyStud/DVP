import { describe, it, expect, beforeAll } from 'vitest';
import { aggregateChoropleth } from '../../src/data/choropleth.js';
import {
  canonicalMapName,
  canonicalTeamName,
  hostToHomeTeamCountry,
} from '../../src/data/names.js';

import { normalizeFormat } from '../../src/formats.js';

// Shared dependency bundle passed to aggregateChoropleth
const fns = { canonicalMapName, canonicalTeamName, hostToHomeTeamCountry, normalizeFormat };

// ── Fixture helpers ───────────────────────────────────────────────────────────

function row(overrides) {
  return {
    venue_country: 'Australia',
    winner:        'Australia',
    date:          '2015-01-15',
    neutral_venue: '0',
    result_type:   '',
    format:        'test',
    ...overrides,
  };
}

// ── Basic aggregation ─────────────────────────────────────────────────────────

describe('aggregateChoropleth — basic counting', () => {
  it('counts one match for a host country', () => {
    const agg = aggregateChoropleth([row()], 2000, 2025, fns);
    expect(agg.get('australia').matches).toBe(1);
  });

  it('counts a home win correctly', () => {
    const agg = aggregateChoropleth([row({ winner: 'Australia' })], 2000, 2025, fns);
    expect(agg.get('australia').homeWins).toBe(1);
  });

  it('does not count as home win when visitor wins', () => {
    const agg = aggregateChoropleth([row({ winner: 'India' })], 2000, 2025, fns);
    const rec = agg.get('australia');
    expect(rec.matches).toBe(1);
    expect(rec.homeWins).toBe(0);
  });

  it('computes winPct = 1 when all home wins', () => {
    const rows = [row(), row(), row()];
    const agg = aggregateChoropleth(rows, 2000, 2025, fns);
    expect(agg.get('australia').winPct).toBe(1);
  });

  it('computes winPct = 0.5 for equal wins and losses', () => {
    const rows = [
      row({ winner: 'Australia' }),
      row({ winner: 'India' }),
    ];
    const agg = aggregateChoropleth(rows, 2000, 2025, fns);
    expect(agg.get('australia').winPct).toBeCloseTo(0.5);
  });

  it('handles multiple countries independently', () => {
    const rows = [
      row({ venue_country: 'Australia', winner: 'Australia' }),
      row({ venue_country: 'India',     winner: 'India' }),
      row({ venue_country: 'India',     winner: 'Australia' }),
    ];
    const agg = aggregateChoropleth(rows, 2000, 2025, fns);
    expect(agg.get('australia').matches).toBe(1);
    expect(agg.get('india').matches).toBe(2);
    expect(agg.get('india').homeWins).toBe(1);
  });
});

// ── Filtering ─────────────────────────────────────────────────────────────────

describe('aggregateChoropleth — filtering', () => {
  it('excludes rows outside the year range', () => {
    const agg = aggregateChoropleth([row({ date: '1999-06-01' })], 2000, 2025, fns);
    expect(agg.size).toBe(0);
  });

  it('excludes rows with neutral_venue = 1', () => {
    const agg = aggregateChoropleth([row({ neutral_venue: '1' })], 2000, 2025, fns);
    expect(agg.size).toBe(0);
  });

  it('excludes "no result" matches', () => {
    const agg = aggregateChoropleth([row({ result_type: 'no_result' })], 2000, 2025, fns);
    expect(agg.size).toBe(0);
  });

  it('excludes tied matches', () => {
    const agg = aggregateChoropleth([row({ result_type: 'tied' })], 2000, 2025, fns);
    expect(agg.size).toBe(0);
  });

  it('excludes rows with no venue_country', () => {
    const agg = aggregateChoropleth([row({ venue_country: '' })], 2000, 2025, fns);
    expect(agg.size).toBe(0);
  });
});

// ── Name normalisation in aggregation ─────────────────────────────────────────

describe('aggregateChoropleth — name normalisation', () => {
  it('normalises host alias UK → united kingdom', () => {
    const agg = aggregateChoropleth(
      [row({ venue_country: 'UK', winner: 'England' })],
      2000, 2025, fns,
    );
    expect(agg.has('united kingdom')).toBe(true);
    expect(agg.get('united kingdom').homeWins).toBe(1);
  });
});

// ── Format bucketing ──────────────────────────────────────────────────────────

describe('aggregateChoropleth — format buckets', () => {
  it('increments test format bucket', () => {
    const agg = aggregateChoropleth([row({ format: 'Test' })], 2000, 2025, fns);
    expect(agg.get('australia').formats.test.matches).toBe(1);
  });

  it('increments odi format bucket', () => {
    const agg = aggregateChoropleth([row({ format: 'ODI' })], 2000, 2025, fns);
    expect(agg.get('australia').formats.odi.matches).toBe(1);
  });

  it('increments t20 format bucket', () => {
    const agg = aggregateChoropleth([row({ format: 'T20I' })], 2000, 2025, fns);
    expect(agg.get('australia').formats.t20.matches).toBe(1);
  });

  it('unknown format does not increment any named bucket', () => {
    const agg = aggregateChoropleth([row({ format: 'super-over' })], 2000, 2025, fns);
    const rec = agg.get('australia');
    expect(rec.matches).toBe(1);
    expect(rec.formats.test.matches).toBe(0);
    expect(rec.formats.odi.matches).toBe(0);
    expect(rec.formats.t20.matches).toBe(0);
  });
});

// ── byYear tracking (T-2.8) ───────────────────────────────────────────────────

describe('aggregateChoropleth — byYear tracking', () => {
  it('records per-year match counts', () => {
    const rows = [
      row({ date: '2015-01-10' }),
      row({ date: '2015-06-20' }),
      row({ date: '2016-03-05' }),
    ];
    const agg = aggregateChoropleth(rows, 2000, 2025, fns);
    const byYear = agg.get('australia').byYear;
    expect(byYear).toBeDefined();
    expect(byYear[2015]).toBe(2);
    expect(byYear[2016]).toBe(1);
  });

  it('byYear is always initialised as an object', () => {
    // With 0 rows the country is never created, so we test with 1 row
    const agg = aggregateChoropleth([row()], 2000, 2025, fns);
    const rec = agg.get('australia');
    expect(rec).toBeDefined();
    expect(rec.byYear).toBeDefined();
    expect(typeof rec.byYear).toBe('object');
  });

  it('tracks multiple countries in byYear independently', () => {
    const rows = [
      row({ venue_country: 'Australia', date: '2015-01-01' }),
      row({ venue_country: 'India',     date: '2015-02-01' }),
      row({ venue_country: 'India',     date: '2016-01-01' }),
    ];
    const agg = aggregateChoropleth(rows, 2000, 2025, fns);
    expect(agg.get('australia').byYear[2015]).toBe(1);
    expect(agg.get('australia').byYear[2016]).toBeUndefined();
    expect(agg.get('india').byYear[2015]).toBe(1);
    expect(agg.get('india').byYear[2016]).toBe(1);
  });
});

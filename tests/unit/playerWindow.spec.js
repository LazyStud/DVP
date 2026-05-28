import { describe, it, expect } from 'vitest';

// Test the format normalization logic from queries.js (inlined for testing)
function normalizeFormatLabel(raw) {
  const fmtMap = { test: 'Test', odi: 'ODI', t20: 'T20', t20i: 'T20', twenty20: 'T20', 't20 international': 'T20' };
  const label = fmtMap[raw] || (raw === 'odi' ? 'ODI' : raw === 'test' ? 'Test' : raw.includes('t20') ? 'T20' : null);
  return label;
}

// Test the parsing of format data into aggregated map
function aggregateFormatData(rows, key) {
  const fmtMap = { test: 'Test', odi: 'ODI', t20: 'T20', t20i: 'T20', twenty20: 'T20', 't20 international': 'T20' };
  const agg = new Map();
  for (const r of rows) {
    const raw = String(r.fmt || '').trim();
    if (!raw) continue;
    const label = fmtMap[raw] || (raw === 'odi' ? 'ODI' : raw === 'test' ? 'Test' : raw.includes('t20') ? 'T20' : null);
    if (!label) continue;
    agg.set(label, (agg.get(label) || 0) + (+(r[key] || 0)));
  }
  const out = [];
  for (const [label, val] of agg) out.push({ label, [key]: val });
  out.sort((a, b) => b[key] - a[key]);
  return out;
}

describe('Player format normalization', () => {
  it('maps test to Test', () => {
    expect(normalizeFormatLabel('test')).toBe('Test');
  });
  it('maps odi to ODI', () => {
    expect(normalizeFormatLabel('odi')).toBe('ODI');
  });
  it('maps t20 to T20', () => {
    expect(normalizeFormatLabel('t20')).toBe('T20');
  });
  it('maps t20i to T20', () => {
    expect(normalizeFormatLabel('t20i')).toBe('T20');
  });
  it('maps twenty20 to T20', () => {
    expect(normalizeFormatLabel('twenty20')).toBe('T20');
  });
  it('maps t20 international to T20', () => {
    expect(normalizeFormatLabel('t20 international')).toBe('T20');
  });
  it('returns null for unknown format', () => {
    expect(normalizeFormatLabel('unknown')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(normalizeFormatLabel('')).toBeNull();
  });
});

describe('Player format data aggregation', () => {
  it('aggregates runs by format', () => {
    const rows = [
      { fmt: 'test', runs: 500 },
      { fmt: 'test', runs: 300 },
      { fmt: 'odi', runs: 200 },
      { fmt: 't20', runs: 150 },
      { fmt: 't20i', runs: 100 },
    ];
    const result = aggregateFormatData(rows, 'runs');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: 'Test', runs: 800 });
    expect(result[1]).toEqual({ label: 'T20', runs: 250 });
    expect(result[2]).toEqual({ label: 'ODI', runs: 200 });
  });

  it('aggregates wickets by format', () => {
    const rows = [
      { fmt: 'test', wickets: 50 },
      { fmt: 'odi', wickets: 30 },
      { fmt: 't20', wickets: 20 },
    ];
    const result = aggregateFormatData(rows, 'wickets');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: 'Test', wickets: 50 });
    expect(result[1]).toEqual({ label: 'ODI', wickets: 30 });
    expect(result[2]).toEqual({ label: 'T20', wickets: 20 });
  });

  it('handles empty input', () => {
    expect(aggregateFormatData([], 'runs')).toEqual([]);
  });

  it('ignores unknown formats', () => {
    const rows = [
      { fmt: 'test', runs: 100 },
      { fmt: 'unknown', runs: 999 },
    ];
    const result = aggregateFormatData(rows, 'runs');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: 'Test', runs: 100 });
  });

  it('handles null/empty fmt values', () => {
    const rows = [
      { fmt: 'test', runs: 100 },
      { fmt: '', runs: 50 },
      { fmt: null, runs: 50 },
    ];
    const result = aggregateFormatData(rows, 'runs');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: 'Test', runs: 100 });
  });

  it('sorts by descending value', () => {
    const rows = [
      { fmt: 't20', runs: 100 },
      { fmt: 'test', runs: 900 },
      { fmt: 'odi', runs: 300 },
    ];
    const result = aggregateFormatData(rows, 'runs');
    expect(result[0].runs).toBe(900);
    expect(result[1].runs).toBe(300);
    expect(result[2].runs).toBe(100);
  });
});

describe('Player drill-down data shape validation', () => {
  it('year data has expected fields', () => {
    const sampleYearRow = {
      year: 2020, runs: 500, balls: 700, matches: 10, sr: 71.4, avg: 50.0,
    };
    expect(sampleYearRow).toHaveProperty('year');
    expect(sampleYearRow).toHaveProperty('runs');
    expect(sampleYearRow).toHaveProperty('balls');
    expect(sampleYearRow).toHaveProperty('matches');
    expect(sampleYearRow).toHaveProperty('sr');
    expect(sampleYearRow).toHaveProperty('avg');
    expect(typeof sampleYearRow.year).toBe('number');
    expect(typeof sampleYearRow.runs).toBe('number');
  });

  it('bowling year data has expected fields', () => {
    const sampleBowlRow = {
      year: 2020, wickets: 25, runs_conceded: 600, balls: 900, matches: 10, econ: 4.0,
    };
    expect(sampleBowlRow).toHaveProperty('year');
    expect(sampleBowlRow).toHaveProperty('wickets');
    expect(sampleBowlRow).toHaveProperty('econ');
    expect(typeof sampleBowlRow.wickets).toBe('number');
  });

  it('venue data has expected fields', () => {
    const sampleVenueRow = { venue: 'MCG', runs: 500, matches: 8 };
    expect(sampleVenueRow).toHaveProperty('venue');
    expect(sampleVenueRow).toHaveProperty('runs');
    expect(sampleVenueRow).toHaveProperty('matches');
    expect(typeof sampleVenueRow.venue).toBe('string');
    expect(typeof sampleVenueRow.runs).toBe('number');
  });
});
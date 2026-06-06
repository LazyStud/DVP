import { describe, it, expect, beforeAll, vi } from 'vitest';

// queries.js memoises matchView(), getVenueSchema() and getVenueCanonicalMap()
// at module scope. queriesExtended.spec.js primes those caches with the "happy
// path" column set, so the fallback arms (missing columns, iso codes, aliased
// venue names) never execute there. This file gets a *fresh* module instance and
// feeds a richer schema up front so those fallback branches are exercised.

vi.mock('../../src/debug.js', () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, DB_URL: 'mock://db' };
});
vi.mock('../../src/db.js', () => ({
  DB: {
    init: vi.fn().mockResolvedValue(undefined),
    queryAll: vi.fn(),
  },
}));

import {
  matchView, loadMatchTables, getVenueSchema,
  getPlayerTopVenues, getPlayerTopVenuesBowling,
  loadVenueCountries,
} from '../../src/data/queries.js';
import { DB } from '../../src/db.js';

vi.stubGlobal('reportError', () => {});

// 'matches' has every optional column; 'partial' has only the required minimum
// (winner/date/host + team1/team2) so matchView() takes the NULL / '' fallbacks;
// 'extras' lacks a winner column so loadMatchTables() skips it.
const FULL_COLS = [
  'winner', 'date', 'host_country', 'team1', 'team2', 'format',
  'result_type', 'neutral_venue', 'match_id', 'win_margin',
  'venue_name', 'city', 'player_of_match',
].map(name => ({ name }));
const PARTIAL_COLS = ['winner', 'date', 'host_country', 'team1', 'team2'].map(name => ({ name }));
const EXTRAS_COLS = ['foo', 'bar'].map(name => ({ name }));
const VENUE_COLS = [
  'venue', 'names', 'country', 'latitude', 'longitude', 'city', 'iso3', 'iso2',
].map(name => ({ name }));

// Venue/name rows that hit every arm of getVenueCanonicalMap's build loop.
const VENUE_NAME_ROWS = [
  { venue: 'MCG', names: 'Melbourne Cricket Ground;' }, // trailing ';' → an empty alias segment (40 false)
  { venue: 'SCG', names: null },                        // no names column (37 false)
  { venue: '', names: 'ignored' },                      // empty canonical → skipped (35 true)
];

function schemaMock(sql) {
  if (sql.includes('sqlite_master')) return [{ name: 'matches' }, { name: 'partial' }, { name: 'extras' }];
  if (sql.includes('table_info(venues)')) return VENUE_COLS;
  if (sql.includes('table_info(partial)')) return PARTIAL_COLS;
  if (sql.includes('table_info(extras)')) return EXTRAS_COLS;
  if (sql.includes('table_info')) return FULL_COLS;
  if (sql === 'SELECT venue, names FROM venues') return VENUE_NAME_ROWS;
  return [];
}

beforeAll(() => {
  DB.queryAll.mockImplementation(schemaMock);
});

describe('matchView column fallbacks', () => {
  it('emits NULL / empty-string placeholders for the partial table', () => {
    const mv = matchView();
    // Two SELECTs unioned (matches + partial); extras is dropped.
    expect(mv).toMatch(/UNION ALL/);
    expect(mv).toMatch(/NULL AS match_id/); // partial lacks match_id → NULL fallback
  });
});

describe('loadMatchTables', () => {
  it('keeps tables with winner/date/host and drops the rest', () => {
    const tables = loadMatchTables();
    const names = tables.map(t => t.name);
    expect(names).toContain('matches');
    expect(names).toContain('partial');
    expect(names).not.toContain('extras'); // no winner column → skipped
  });

  it('leaves optional column mappings undefined on the partial table', () => {
    const partial = loadMatchTables().find(t => t.name === 'partial');
    expect(partial.map.resultCol).toBeUndefined();
    expect(partial.map.formatCol).toBeUndefined();
  });
});

describe('getVenueSchema', () => {
  it('detects iso3 / iso2 columns when present', async () => {
    const schema = await getVenueSchema();
    expect(schema.iso3).toBe('iso3');
    expect(schema.iso2).toBe('iso2');
    expect(schema.countryCol).toBe('country');
  });
});

describe('getVenueCanonicalMap via player venue queries', () => {
  it('maps an aliased venue name onto its canonical venue', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('batting_innings')) {
        return [
          { venue: 'Melbourne Cricket Ground', runs: 300, matches: 3 }, // alias → MCG
          { venue: 'MCG', runs: 200, matches: 2 },
          { venue: 'Unknown Park', runs: 50, matches: 1 },               // not in map → kept raw
        ];
      }
      return schemaMock(sql);
    });
    const result = await getPlayerTopVenues('V Kohli', 2000, 2025);
    const venues = result.map(r => r.venue);
    expect(venues).toContain('MCG');
    expect(venues).toContain('Unknown Park');
    // The alias collapsed into MCG, so MCG aggregates both rows (500 runs).
    const mcg = result.find(r => r.venue === 'MCG');
    expect(mcg.runs).toBe(500);
  });

  it('maps aliased venues for the bowling variant too', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('bowling_innings')) {
        return [
          { venue: 'Melbourne Cricket Ground', wickets: 6, matches: 2 },
          { venue: 'MCG', wickets: 4, matches: 1 },
        ];
      }
      return schemaMock(sql);
    });
    const result = await getPlayerTopVenuesBowling('P Cummins', 2000, 2025);
    const mcg = result.find(r => r.venue === 'MCG');
    expect(mcg.wickets).toBe(10);
  });
});

describe('loadVenueCountries with a country column', () => {
  it('canonicalises distinct country rows into a Set', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SELECT DISTINCT')) {
        return [{ country: 'India' }, { country: 'Australia' }, { country: null }];
      }
      return schemaMock(sql);
    });
    const set = await loadVenueCountries();
    expect(set.size).toBe(2);
  });
});

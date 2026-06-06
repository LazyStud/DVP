import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// computeChoropleth / computeFlows are the two large data-shaping functions in
// queries.js that touch the d3 global, document.body and shared state. They were
// previously untested because they need those globals stubbed. This file stubs a
// minimal d3 + document so the full branch matrix can be exercised in Node.

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

import { computeChoropleth, computeFlows } from '../../src/data/queries.js';
import { DB } from '../../src/db.js';
import { state } from '../../src/state.js';

vi.stubGlobal('reportError', () => {});

// ── Minimal d3 stub ────────────────────────────────────────────────────────────
// Only the handful of helpers the two functions reach for.
const d3Stub = {
  max(arr, fn) {
    let m;
    for (const x of arr) {
      const v = fn ? fn(x) : x;
      if (v == null) continue;
      if (m === undefined || v > m) m = v;
    }
    return m;
  },
  // Features carry their centroid on __c so the stub stays deterministic.
  geoCentroid(feat) { return feat && feat.__c ? feat.__c : [0, 0]; },
  scaleSqrt() {
    const s = () => 0;
    s.domain = () => s;
    s.range = () => s;
    return s;
  },
  interpolateRainbow(t) { return `rgb-${t.toFixed(3)}`; },
};

// Chainable scale stub for state.spikeScale (computeChoropleth calls .domain().range()).
function chainScale() {
  const s = { domain() { return s; }, range() { return s; } };
  return s;
}

const MATCH_COLS = [
  'winner', 'date', 'host_country', 'team1', 'team2', 'format',
  'result_type', 'neutral_venue', 'match_id', 'win_margin',
  'venue_name', 'city', 'player_of_match',
].map(name => ({ name }));

// Base mock: schema queries resolved; data queries return whatever the test set.
let _rows = [];
function baseMock(sql) {
  if (sql.includes('sqlite_master')) return [{ name: 'matches' }];
  if (sql.includes('PRAGMA table_info')) return MATCH_COLS;
  if (sql === 'SELECT venue, names FROM venues') return [];
  // The union/select that fetches match rows for choropleth + flows.
  if (sql.includes('AS venue_country')) return _rows;
  return [];
}

beforeAll(() => {
  vi.stubGlobal('d3', d3Stub);
  vi.stubGlobal('document', { body: { classList: { toggle() {} } } });
});

beforeEach(() => {
  _rows = [];
  DB.queryAll.mockImplementation(baseMock);
  state.spikeScale = chainScale();
  state.mode = 'globe';
  state.selectedFormat = 'all';
  state.countries = [];
});

// ── computeChoropleth ──────────────────────────────────────────────────────────

describe('computeChoropleth', () => {
  it('does nothing meaningful when no match tables exist', async () => {
    DB.queryAll.mockImplementation(() => []); // sqlite_master → [] → no tables
    await computeChoropleth(2000, 2025);
    expect(state.choroActive).toBe(false);
    expect(state.choroByCountry.size).toBe(0);
  });

  it('aggregates home-win rows into choroByCountry and activates', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-01-02', neutral_venue: '0', result_type: 'runs', format: 'odi' },
      { winner: 'Australia', venue_country: 'India', date: '2016-03-10', neutral_venue: '0', result_type: 'wickets', format: 'test' },
    ];
    await computeChoropleth(2000, 2025);
    expect(state.choroActive).toBe(true);
    expect(state.choroByCountry.has('india')).toBe(true);
    expect(state.maxMatchesChoro).toBeGreaterThan(0);
  });

  it('uses the format-specific match count when a format is selected', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-01-02', neutral_venue: '0', result_type: 'runs', format: 'odi' },
    ];
    state.selectedFormat = 'odi';
    await computeChoropleth(2000, 2025);
    expect(state.maxMatchesChoro).toBeGreaterThanOrEqual(1);
  });

  it('falls back to 0 matches when selected format absent on a record', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-01-02', neutral_venue: '0', result_type: 'runs', format: 'odi' },
    ];
    state.selectedFormat = 't20'; // record has odi only → formats.t20.matches = 0
    await computeChoropleth(2000, 2025);
    expect(state.maxMatchesChoro).toBe(1); // d3.max(...,0) || 1
  });

  it('scales spike range to 40 in map mode', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-01-02', neutral_venue: '0', result_type: 'runs', format: 'odi' },
    ];
    state.mode = 'map';
    const spy = vi.spyOn(state.spikeScale, 'range');
    await computeChoropleth(2000, 2025);
    expect(spy).toHaveBeenCalledWith([0, 40]);
  });

  it('scales spike range to 56 in globe mode', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-01-02', neutral_venue: '0', result_type: 'runs', format: 'odi' },
    ];
    state.mode = 'globe';
    const spy = vi.spyOn(state.spikeScale, 'range');
    await computeChoropleth(2000, 2025);
    expect(spy).toHaveBeenCalledWith([0, 56]);
  });

  it('serves a second identical call from the LRU cache', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2011-01-02', neutral_venue: '0', result_type: 'runs', format: 'odi' },
    ];
    await computeChoropleth(2011, 2012); // populate cache
    const callsAfterFirst = DB.queryAll.mock.calls.length;
    _rows = []; // even if queried again it would be empty; cache should prevent it
    await computeChoropleth(2011, 2012); // cache hit
    // Cache hit means no new union query — only (possibly) schema discovery.
    const unionCalls = DB.queryAll.mock.calls
      .slice(callsAfterFirst)
      .filter(c => String(c[0]).includes('AS venue_country'));
    expect(unionCalls.length).toBe(0);
    expect(state.choroByCountry.has('india')).toBe(true);
  });

  it('recovers to an empty aggregate when the union query throws', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('sqlite_master')) return [{ name: 'matches' }];
      if (sql.includes('PRAGMA table_info')) return MATCH_COLS;
      if (sql.includes('AS venue_country')) throw new Error('boom');
      return [];
    });
    await computeChoropleth(2030, 2031); // fresh range → no cache
    expect(state.choroActive).toBe(false);
  });
});

// ── computeFlows ───────────────────────────────────────────────────────────────

const FEAT = (name, c) => ({ properties: { name }, __c: c });

describe('computeFlows', () => {
  beforeEach(() => {
    state.countries = [
      FEAT('India', [78, 22]),
      FEAT('Australia', [133, -27]),
    ];
  });

  it('builds flow + bubble data from home/visitor pairings', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2014, 2015);
    expect(state.flowData.length).toBe(1);
    expect(state.flowData[0]).toMatchObject({ originKey: 'australia', hostKey: 'india', matches: 1 });
    expect(state.bubbleData.length).toBe(1);
    expect(state.countryColors.get('australia')).toBeDefined();
  });

  it('treats team2 as home and team1 as visitor when swapped', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2017-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'Australia', team2: 'India' },
    ];
    await computeFlows(2016, 2017);
    expect(state.flowData[0].originKey).toBe('australia');
  });

  it('falls back to team1 as visitor when neither side is the home team', async () => {
    state.countries = [
      FEAT('India', [78, 22]),
      FEAT('Australia', [133, -27]),
      FEAT('England', [-1, 52]),
    ];
    _rows = [
      // hosted in India but England vs Australia — neither is the India home team
      { winner: 'England', venue_country: 'India', date: '2018-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'England', team2: 'Australia' },
    ];
    await computeFlows(2018, 2019);
    // originKey should be the visitor derived from team1 (england → united kingdom)
    expect(state.flowData.some(f => f.hostKey === 'india')).toBe(true);
  });

  it('derives a single visitor when only one team is present', async () => {
    _rows = [
      { winner: '', venue_country: 'India', date: '2019-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'Australia', team2: '' },
    ];
    await computeFlows(2019, 2020);
    expect(state.flowData.length + state.bubbleData.length).toBeGreaterThan(0);
  });

  it('skips neutral-venue, no-result and tie rows', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-06-01', neutral_venue: '1', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
      { winner: '', venue_country: 'India', date: '2015-06-02', neutral_venue: '0', result_type: 'no result', format: 'odi', team1: 'India', team2: 'Australia' },
      { winner: '', venue_country: 'India', date: '2015-06-03', neutral_venue: '0', result_type: 'tie', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2020, 2021);
    expect(state.flowData).toEqual([]);
    expect(state.bubbleData).toEqual([]);
  });

  it('skips rows outside the year window and rows without a host', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '1990-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
      { winner: 'India', venue_country: '', date: '2022-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2021, 2022);
    expect(state.flowData).toEqual([]);
  });

  it('skips a pairing when origin or host feature is missing from countries', async () => {
    state.countries = [FEAT('India', [78, 22])]; // no Australia feature
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2023, 2024);
    expect(state.flowData).toEqual([]); // origin (australia) feature absent
  });

  it('skips a pairing when the centroid is not finite', async () => {
    state.countries = [
      FEAT('India', [78, 22]),
      FEAT('Australia', [NaN, NaN]),
    ];
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2015-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2024, 2025);
    expect(state.flowData).toEqual([]);
  });

  it('serves a second identical call from the flows LRU cache', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2001-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2001, 2002);
    const after = DB.queryAll.mock.calls.length;
    _rows = [];
    await computeFlows(2001, 2002); // cache hit → reuses rows
    const unionCalls = DB.queryAll.mock.calls
      .slice(after)
      .filter(c => String(c[0]).includes('AS venue_country'));
    expect(unionCalls.length).toBe(0);
    expect(state.flowData.length).toBe(1);
  });

  it('derives the visitor from team2 when team1 is blank', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2010-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: '', team2: 'Australia' },
    ];
    await computeFlows(2010, 2011);
    expect(state.flowData.some(f => f.originKey === 'australia')).toBe(true);
  });

  it('skips a row where both teams are blank', async () => {
    _rows = [
      { winner: '', venue_country: 'India', date: '2012-06-01', neutral_venue: '0', result_type: 'runs', format: 'odi', team1: '', team2: '' },
    ];
    await computeFlows(2012, 2013);
    expect(state.flowData).toEqual([]);
  });

  it('treats a missing neutral_venue flag as non-neutral', async () => {
    _rows = [
      { winner: 'India', venue_country: 'India', date: '2008-06-01', result_type: 'runs', format: 'odi', team1: 'India', team2: 'Australia' },
    ];
    await computeFlows(2008, 2009);
    expect(state.flowData.length).toBe(1);
  });

  it('tolerates a DB error during the row query', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('sqlite_master')) return [{ name: 'matches' }];
      if (sql.includes('PRAGMA table_info')) return MATCH_COLS;
      if (sql.includes('AS venue_country')) throw new Error('db down');
      return [];
    });
    await computeFlows(2003, 2004);
    expect(state.flowData).toEqual([]);
    expect(state.bubbleData).toEqual([]);
  });
});

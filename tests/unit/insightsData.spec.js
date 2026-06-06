import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Exercises the real src/data/insights.js template functions via computeInsightPool.
// Previously only the inlined pickFive copy was tested, leaving every SQL/state
// template branch uncovered.

vi.mock('../../src/debug.js',  () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (io) => ({ ...(await io()), DB_URL: 'mock://db' }));
vi.mock('../../src/db.js', () => ({
  DB: { init: vi.fn().mockResolvedValue(undefined), queryAll: vi.fn() },
}));

import { computeInsightPool, pickFive } from '../../src/data/insights.js';
import { DB } from '../../src/db.js';
import { state } from '../../src/state.js';

// insights.js reads a `Formats` *global* (CDN build) inside topScorers/topWicketTakers.
vi.stubGlobal('Formats', {
  formatLikePatterns: fmt => (fmt === 'all' ? [] : [`%${fmt}%`]),
});

function routedMock(sql) {
  if (sql.includes('GROUP BY venue_name')) return [{ venue_name: 'Eden Gardens', total: 320 }];
  if (sql.includes('batting_innings'))     return [{ player: 'S Tendulkar', total_runs: 15000 }];
  if (sql.includes('bowling_innings'))      return [{ player: 'M Muralitharan', total_wkts: 800 }];
  if (sql.includes('GROUP BY fmt, decade')) {
    return [
      { fmt: 't20', decade: 2000, n: 40 },
      { fmt: 't20', decade: 2010, n: 200 },
      { fmt: 'odi', decade: 2010, n: 100 }, // non-t20 row → isT20 false branch
    ];
  }
  return [];
}

beforeEach(() => {
  DB.queryAll.mockReset();
  DB.queryAll.mockImplementation(routedMock);
  // A choropleth record with format breakdowns that clear the home/host thresholds.
  state.choroByCountry = new Map([
    ['india', {
      matches: 200, homeWins: 140,
      formats: {
        test: { matches: 40, homeWins: 30, winPct: 0.75 },
        odi:  { matches: 30, homeWins: 18, winPct: 0.60 },
        t20:  { matches: 15, homeWins: 8,  winPct: 0.53 }, // matches<20 → skipped by homeDominance
      },
    }],
    ['weaksauce', {
      matches: 50, homeWins: 10,
      formats: {
        test: { matches: 25, homeWins: 10, winPct: 0.40 }, // winPct<0.55 → no home factoid
        odi:  { matches: 5,  homeWins: 2,  winPct: 0.40 }, // matches<20 and <10 thresholds
        t20:  { matches: 12, homeWins: 6,  winPct: 0.50 },
      },
    }],
  ]);
});

afterAll(() => { state.choroByCountry = new Map(); });

describe('computeInsightPool', () => {
  it('produces factoids spanning every template category', async () => {
    const pool = await computeInsightPool();
    const cats = new Set(pool.map(p => p.category));
    expect(cats).toContain('home');    // homeDominance
    expect(cats).toContain('venue');   // mostHosted + busiestVenues
    expect(cats).toContain('batting'); // topScorers
    expect(cats).toContain('bowling'); // topWicketTakers
    expect(cats).toContain('format');  // formatGrowth
  });

  it('names the dominant home nation with a title-cased country', async () => {
    const pool = await computeInsightPool();
    const home = pool.find(p => p.category === 'home');
    expect(home.text).toContain('India');
    expect(home.text).toMatch(/\d+%/);
  });

  it('reports the busiest venue from the SQL rows', async () => {
    const pool = await computeInsightPool();
    expect(pool.some(p => p.text.includes('Eden Gardens'))).toBe(true);
  });

  it('reports the leading run-scorer and wicket-taker', async () => {
    const pool = await computeInsightPool();
    expect(pool.some(p => p.text.includes('S Tendulkar'))).toBe(true);
    expect(pool.some(p => p.text.includes('M Muralitharan'))).toBe(true);
  });

  it('reports T20 growth factor between decades', async () => {
    const pool = await computeInsightPool();
    const growth = pool.find(p => p.category === 'format');
    expect(growth.text).toContain('×'); // factor like "5.0×"
  });

  it('returns an empty home/host set when choroByCountry is empty', async () => {
    state.choroByCountry = new Map();
    DB.queryAll.mockImplementation(() => []); // no SQL rows either
    const pool = await computeInsightPool();
    expect(pool.every(p => p.category !== 'home')).toBe(true);
  });

  it('skips SQL templates gracefully when the DB throws', async () => {
    state.choroByCountry = new Map();
    DB.queryAll.mockImplementation(() => { throw new Error('db down'); });
    const pool = await computeInsightPool();
    expect(Array.isArray(pool)).toBe(true);
  });
});

describe('pickFive (real module export)', () => {
  it('caps the result at five items', () => {
    const pool = Array.from({ length: 9 }, (_, i) => ({ text: String(i), category: 'home' }));
    expect(pickFive(pool)).toHaveLength(5);
  });
});

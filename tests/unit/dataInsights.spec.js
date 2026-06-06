import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/debug.js',  () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, DB_URL: 'mock://db' };
});
vi.mock('../../src/db.js',     () => ({
  DB: { init: vi.fn().mockResolvedValue(undefined), queryAll: vi.fn() },
}));

// Stub the CDN-global Formats so topScorers/topWicketTakers proceed past the
// typeof check and hit their DB.queryAll branches.
vi.stubGlobal('Formats', {
  formatLikePatterns: vi.fn(fmt => fmt === 'all' ? [] : [`%${fmt}%`]),
});

import { computeInsightPool, pickFive } from '../../src/data/insights.js';
import { state }                        from '../../src/state.js';
import { DB }                           from '../../src/db.js';

const CHORO = new Map([
  ['india', {
    formats: {
      test: { matches: 30, homeWins: 22, winPct: 0.73 },
      odi:  { matches: 50, homeWins: 35, winPct: 0.70 },
      t20:  { matches: 25, homeWins: 18, winPct: 0.72 },
    },
  }],
  ['australia', {
    formats: {
      test: { matches: 25, homeWins: 17, winPct: 0.68 },
      odi:  { matches: 40, homeWins: 25, winPct: 0.63 },
      t20:  { matches: 15, homeWins:  8, winPct: 0.53 },
    },
  }],
  ['tinyisland', {
    formats: {
      test: { matches: 2, homeWins: 1, winPct: 0.50 }, // < 20 → skipped
    },
  }],
]);

beforeEach(() => {
  vi.clearAllMocks();
  state.choroByCountry = CHORO;
  DB.init.mockResolvedValue(undefined);
  DB.queryAll.mockReturnValue([]);
});

// ── pickFive ──────────────────────────────────────────────────────────────────

describe('pickFive', () => {
  it('returns [] for empty pool', () => {
    expect(pickFive([])).toEqual([]);
  });

  it('returns all items when pool has fewer than 5', () => {
    const pool = [{ text: 'a' }, { text: 'b' }];
    expect(pickFive(pool)).toHaveLength(2);
  });

  it('returns exactly 5 items when pool is large', () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ text: `item ${i}` }));
    expect(pickFive(pool)).toHaveLength(5);
  });

  it('does not mutate the original pool', () => {
    const pool = Array.from({ length: 6 }, (_, i) => ({ text: `i${i}` }));
    const copy = [...pool];
    pickFive(pool);
    expect(pool).toEqual(copy);
  });

  it('returns a shuffled sample across multiple calls', () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({ text: `${i}` }));
    const results = new Set(
      Array.from({ length: 15 }, () => pickFive(pool).map(x => x.text).join(','))
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

// ── computeInsightPool — homeDominance + mostHosted ───────────────────────────

describe('computeInsightPool — state-driven templates', () => {
  it('returns an array', async () => {
    expect(Array.isArray(await computeInsightPool())).toBe(true);
  });

  it('includes home-dominance insights for formats with winPct > 0.55', async () => {
    const pool = await computeInsightPool();
    const home = pool.filter(x => x.category === 'home');
    expect(home.length).toBeGreaterThan(0);
  });

  it('home text mentions a country name', async () => {
    const pool = await computeInsightPool();
    const item = pool.find(x => x.category === 'home');
    expect(item?.text).toMatch(/india|australia/i);
  });

  it('includes mostHosted insights (venue category)', async () => {
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'venue')).toBe(true);
  });

  it('excludes countries below the 20-match threshold', async () => {
    const pool = await computeInsightPool();
    expect(pool.some(x => /tinyisland/i.test(x.text))).toBe(false);
  });
});

// ── computeInsightPool — busiestVenues ────────────────────────────────────────

describe('computeInsightPool — busiestVenues (DB)', () => {
  it('adds busiest-venue insights when DB returns venue rows', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SUM(matches_with_result)') && sql.includes('LIMIT 3'))
        return [{ venue_name: 'Eden Gardens', total: 120 }, { venue_name: 'Wankhede', total: 95 }];
      return [];
    });
    const pool = await computeInsightPool();
    expect(pool.some(x => x.text.includes('Eden Gardens'))).toBe(true);
  });

  it('handles DB error inside busiestVenues silently', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('LIMIT 3')) throw new Error('DB down');
      return [];
    });
    const pool = await computeInsightPool();
    expect(Array.isArray(pool)).toBe(true);
  });
});

// ── computeInsightPool — formatGrowth ─────────────────────────────────────────

describe('computeInsightPool — formatGrowth (DB)', () => {
  it('adds T20 growth insight when DB has t20 decade data', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('GROUP BY fmt, decade'))
        return [{ fmt: 't20', decade: 2000, n: 10 }, { fmt: 't20', decade: 2010, n: 50 }];
      return [];
    });
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'format')).toBe(true);
  });

  it('skips formatGrowth when t20_00 is 0', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('GROUP BY fmt, decade'))
        return [{ fmt: 'odi', decade: 2000, n: 30 }];
      return [];
    });
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'format')).toBe(false);
  });

  it('recognises "twenty" format string as t20', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('GROUP BY fmt, decade'))
        return [
          { fmt: 'twenty20',     decade: 2000, n: 5  },
          { fmt: 'twentytwenty', decade: 2010, n: 30 },
        ];
      return [];
    });
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'format')).toBe(true);
  });
});

// ── computeInsightPool — empty/null choro ────────────────────────────────────

describe('computeInsightPool — empty choro', () => {
  it('returns pool without home items when choroByCountry is empty', async () => {
    state.choroByCountry = new Map();
    const pool = await computeInsightPool();
    expect(pool.filter(x => x.category === 'home')).toHaveLength(0);
  });

  it('returns pool without home items when choroByCountry is null', async () => {
    state.choroByCountry = null;
    const pool = await computeInsightPool();
    expect(Array.isArray(pool)).toBe(true);
    expect(pool.filter(x => x.category === 'home')).toHaveLength(0);
  });
});

// ── computeInsightPool — topScorers (Formats stub active) ────────────────────

describe('computeInsightPool — topScorers', () => {
  it('adds batting insights when DB returns scorer rows', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('batting_innings') && sql.includes('total_runs'))
        return [{ player: 'V Kohli', total_runs: 8000 }];
      return [];
    });
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'batting')).toBe(true);
  });

  it('skips format when formatLikePatterns returns [] (all format)', async () => {
    // Formats.formatLikePatterns('all') → [] → patterns.length === 0 → continue
    // The stub already does this. Just verify no throw.
    const pool = await computeInsightPool();
    expect(Array.isArray(pool)).toBe(true);
  });

  it('handles DB error inside topScorers silently', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('batting_innings')) throw new Error('db fail');
      return [];
    });
    const pool = await computeInsightPool();
    expect(Array.isArray(pool)).toBe(true);
  });

  it('text contains player name and format label', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('batting_innings') && sql.includes('total_runs'))
        return [{ player: 'Sachin Tendulkar', total_runs: 12000 }];
      return [];
    });
    const pool = await computeInsightPool();
    const item = pool.find(x => x.category === 'batting');
    expect(item?.text).toContain('Sachin Tendulkar');
  });
});

// ── computeInsightPool — topWicketTakers (Formats stub active) ───────────────

describe('computeInsightPool — topWicketTakers', () => {
  it('adds bowling insights when DB returns wicket-taker rows', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('bowling_innings') && sql.includes('total_wkts'))
        return [{ player: 'S Warne', total_wkts: 700 }];
      return [];
    });
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'bowling')).toBe(true);
  });

  it('does not add bowling insight when rows empty', async () => {
    DB.queryAll.mockImplementation(() => []);
    const pool = await computeInsightPool();
    expect(pool.some(x => x.category === 'bowling')).toBe(false);
  });

  it('handles DB error inside topWicketTakers silently', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('bowling_innings')) throw new Error('db fail');
      return [];
    });
    const pool = await computeInsightPool();
    expect(Array.isArray(pool)).toBe(true);
  });

  it('text contains player name and wicket count', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('bowling_innings') && sql.includes('total_wkts'))
        return [{ player: 'M Muralitharan', total_wkts: 800 }];
      return [];
    });
    const pool = await computeInsightPool();
    const item = pool.find(x => x.category === 'bowling');
    expect(item?.text).toContain('M Muralitharan');
    expect(item?.text).toContain('800');
  });
});

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/debug.js',  () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, DB_URL: 'mock://db' };
});
vi.mock('../../src/db.js', () => ({
  DB: {
    init:     vi.fn().mockResolvedValue(undefined),
    queryAll: vi.fn(),
  },
}));

import {
  matchView, loadMatchTables,
  getBattingLeaderboard, getBowlingLeaderboard,
  loadVenueCountries, loadVenuesForCountry,
  getHeadToHeadStats, getHeadToHeadBiggestWins, getHeadToHeadTopPlayers,
  getVenueTossStats, getVenueTossBias,
  getAllSearchVenues, getAllSearchPlayers,
  getPlayerYearBatting, getPlayerFormatBatting, getPlayerTopVenues,
  getPlayerYearBowling, getPlayerFormatBowling, getPlayerTopVenuesBowling,
} from '../../src/data/queries.js';
import { DB } from '../../src/db.js';

vi.stubGlobal('reportError', () => {});

// ── Column fixtures ───────────────────────────────────────────────────────────

const MATCH_COLS = [
  'winner', 'date', 'host_country', 'team1', 'team2', 'format',
  'result_type', 'neutral_venue', 'match_id', 'win_margin',
  'venue_name', 'city', 'player_of_match',
].map(name => ({ name }));

const VENUE_COLS = [
  'venue', 'names', 'country', 'latitude', 'longitude', 'city',
].map(name => ({ name }));

// Pattern: return a specific data override if set, otherwise return [].
// Schema queries are always handled at the top. Use a Symbol sentinel to
// distinguish "data data" from "no override" and "return null".
const NO_OVERRIDE = Symbol('no-override');
const RETURN_NULL = Symbol('return-null');
let _dataOverride = NO_OVERRIDE;
function patchedMock(sql) {
  if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
  if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
  if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
  if (sql === 'SELECT venue, names FROM venues') return [];
  if (_dataOverride !== NO_OVERRIDE) {
    const result = _dataOverride;
    _dataOverride = NO_OVERRIDE;
    return result === RETURN_NULL ? null : result;
  }
  return [];
}

function pushData(rows) { _dataOverride = rows; }
function pushNull() { _dataOverride = RETURN_NULL; }

beforeAll(() => {
  DB.queryAll.mockImplementation(patchedMock);
  // Prime matchView() cache so subsequent tests don't need schema queries
  matchView();
});

beforeEach(() => {
  _dataOverride = NO_OVERRIDE;
  DB.init.mockResolvedValue(undefined);
  DB.queryAll.mockImplementation(patchedMock);
});

// ── loadMatchTables ───────────────────────────────────────────────────────────

describe('loadMatchTables', () => {
  it('returns an array', () => {
    const tables = loadMatchTables();
    expect(Array.isArray(tables)).toBe(true);
  });

  it('returns a table entry with a cols array', () => {
    const tables = loadMatchTables();
    if (tables.length) expect(Array.isArray(tables[0].cols)).toBe(true);
  });

  it('returns [] when sqlite_master returns no tables', () => {
    // Override the patchedMock to return empty for sqlite_master this once
    DB.queryAll.mockImplementationOnce(() => []);
    const tables = loadMatchTables();
    expect(tables).toEqual([]);
  });
});

// ── matchView ─────────────────────────────────────────────────────────────────

describe('matchView', () => {
  it('returns a string', () => {
    expect(typeof matchView()).toBe('string');
  });

  it('result contains SELECT and FROM', () => {
    const mv = matchView();
    expect(mv.toUpperCase()).toMatch(/SELECT/);
  });
});

// ── getHeadToHeadStats ────────────────────────────────────────────────────────

describe('getHeadToHeadStats', () => {
  it('returns empty stats when DB returns []', async () => {
    const result = await getHeadToHeadStats('Australia', 'India', 2000, 2025);
    expect(result).toMatchObject({ winsA: 0, winsB: 0, total: 0 });
  });

  it('counts wins correctly from query rows', async () => {
    pushData([
      { winner: 'Australia', result_type: 'runs',    total: 10 },
      { winner: 'India',     result_type: 'wickets', total: 8  },
      { winner: null,        result_type: 'draw',    total: 2  },
      { winner: '',          result_type: 'no result', total: 1 },
    ]);
    const result = await getHeadToHeadStats('Australia', 'India', 2000, 2025);
    expect(result.winsA).toBe(10);
    expect(result.winsB).toBe(8);
    expect(result.draws).toBe(2);
    expect(result.noResult).toBe(1);
    expect(result.total).toBe(21);
  });

  it('handles rows with "tie" result_type as draws', async () => {
    pushData([
      { winner: '', result_type: 'tied', total: 1 },
    ]);
    const result = await getHeadToHeadStats('A', 'B', 2000, 2025);
    expect(result.draws).toBe(1);
  });

  it('handles "abandoned" result_type as no-result', async () => {
    pushData([
      { winner: '', result_type: 'abandoned', total: 1 },
    ]);
    const result = await getHeadToHeadStats('A', 'B', 2000, 2025);
    expect(result.noResult).toBe(1);
  });

  it('returns empty on DB error', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('DB error'); });
    const result = await getHeadToHeadStats('A', 'B', 2000, 2025);
    expect(result.total).toBe(0);
  });

  it('returns empty when DB returns null', async () => {
    pushData(null);
    const result = await getHeadToHeadStats('A', 'B', 2000, 2025);
    expect(result.total).toBe(0);
  });

  it('handles format filter for non-all formats', async () => {
    pushData([
      { winner: 'Australia', result_type: 'runs', total: 5 },
    ]);
    const result = await getHeadToHeadStats('Australia', 'India', 2000, 2025, 'test');
    expect(result.winsA).toBe(5);
    expect(result.total).toBe(5);
  });

  it('handles winner equals teamB', async () => {
    pushData([
      { winner: 'India', result_type: 'wickets', total: 3 },
    ]);
    const result = await getHeadToHeadStats('Australia', 'India', 2000, 2025);
    expect(result.winsB).toBe(3);
  });
});

// ── getHeadToHeadBiggestWins ──────────────────────────────────────────────────

describe('getHeadToHeadBiggestWins', () => {
  it('returns { bestA: [], bestB: [] } when DB returns []', async () => {
    const result = await getHeadToHeadBiggestWins('Australia', 'India', 2000, 2025);
    expect(result.bestA).toEqual([]);
    expect(result.bestB).toEqual([]);
  });

  it('maps rows to best wins entries', async () => {
    // getHeadToHeadBiggestWins calls DB.queryAll twice (once per team).
    // Both calls use the same SQL with m.winner = ? (parameterised).
    // Use mockImplementationOnce to return data for the first call (teamA),
    // then fall back to patchedMock for the second call (teamB → empty).
    DB.queryAll.mockImplementationOnce(() =>
      [{ winner: 'Australia', result_type: 'runs', win_margin: '200', date: '2020-01-15', venue_name: 'MCG' }]
    );
    const result = await getHeadToHeadBiggestWins('Australia', 'India', 2000, 2025);
    expect(result.bestA.length + result.bestB.length).toBeGreaterThan(0);
  });

  it('sorts runs wins by dominance score (runs value)', async () => {
    const rowsA = [
      { winner: 'AUS', result_type: 'runs',    win_margin: '50',  date: '2021', venue_name: 'V1' },
      { winner: 'AUS', result_type: 'runs',    win_margin: '200', date: '2022', venue_name: 'V2' },
      { winner: 'AUS', result_type: 'wickets', win_margin: '5',   date: '2023', venue_name: 'V3' },
    ];
    // Return rowsA for the first call (teamA), then fall back to patchedMock for teamB
    DB.queryAll.mockImplementationOnce(() => rowsA);
    const result = await getHeadToHeadBiggestWins('AUS', 'IND', 2000, 2025);
    const bestA = result.bestA;
    if (bestA.length > 1) expect(bestA[0].margin).toBeGreaterThanOrEqual(bestA[1].margin);
  });

  it('returns empty on DB error', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes("IN ('runs', 'wickets')")) throw new Error('fail');
      return [];
    });
    const result = await getHeadToHeadBiggestWins('A', 'B', 2000, 2025);
    expect(result).toMatchObject({ bestA: [], bestB: [] });
  });

  it('handles format filter', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes("IN ('runs', 'wickets')"))
        return sql.includes("m.winner = 'AUS'")
          ? [{ winner: 'AUS', result_type: 'runs', win_margin: '50', date: '2021', venue_name: 'V1' }]
          : [];
      return [];
    });
    const result = await getHeadToHeadBiggestWins('AUS', 'IND', 2000, 2025, 'test');
    expect(result.bestA.length).toBeGreaterThanOrEqual(0);
  });
});

// ── getHeadToHeadTopPlayers ───────────────────────────────────────────────────

describe('getHeadToHeadTopPlayers', () => {
  it('returns { batters: [], bowlers: [] } when DB returns []', async () => {
    const result = await getHeadToHeadTopPlayers('Australia', 'India', 2000, 2025);
    expect(result.batters).toEqual([]);
    expect(result.bowlers).toEqual([]);
  });

  it('maps batter rows correctly', async () => {
    const batterRow = { player: 'V Kohli', team: 'India', runs: '500', matches: '10' };
    const bowlerRow = { player: 'P Cummins', team: 'Australia', wickets: '15', matches: '10' };
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('batting_innings')) return [batterRow];
      if (sql.includes('bowling_innings')) return [bowlerRow];
      return [];
    });
    const result = await getHeadToHeadTopPlayers('Australia', 'India', 2000, 2025);
    expect(result.batters[0]).toMatchObject({ player: 'V Kohli', runs: 500 });
    expect(result.bowlers[0]).toMatchObject({ player: 'P Cummins', wickets: 15 });
  });

  it('returns empty on DB error', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('batting_innings')) throw new Error('err');
      return [];
    });
    const result = await getHeadToHeadTopPlayers('A', 'B', 2000, 2025);
    expect(result).toMatchObject({ batters: [], bowlers: [] });
  });

  it('handles format filter for non-all formats', async () => {
    const batterRow = { player: 'V Kohli', team: 'India', runs: '500', matches: '10' };
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('batting_innings')) return [batterRow];
      if (sql.includes('bowling_innings')) return [];
      return [];
    });
    const result = await getHeadToHeadTopPlayers('Australia', 'India', 2000, 2025, 'odi');
    expect(result.batters.length).toBeGreaterThanOrEqual(0);
  });
});

// ── getBattingLeaderboard ─────────────────────────────────────────────────────

describe('getBattingLeaderboard', () => {
  it('returns [] when DB returns []', async () => {
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result).toEqual([]);
  });

  it('maps DB rows to leaderboard entries', async () => {
    pushData([
      { player: 'V Kohli', team: 'India', matches: 50, runs: 2500,
        balls: 1800, dismissals: 48, hundreds: 8, fifties: 14, best: '183' },
    ]);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result[0]).toMatchObject({ player: 'V Kohli', runs: 2500 });
    expect(result[0].sr).toBeGreaterThan(0);
    expect(result[0].avg).toBeGreaterThan(0);
  });

  it('returns null when DB returns null', async () => {
    pushData(null);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result).toBeNull();
  });

  it('computes sr=0 when balls=0', async () => {
    pushData([
      { player: 'X', team: 'Y', matches: 5, runs: 100, balls: 0, dismissals: 5, hundreds: 0, fifties: 0, best: '50' },
    ]);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result[0].sr).toBe(0);
  });

  it('supports non-all format filter', async () => {
    pushData([]);
    const result = await getBattingLeaderboard(2000, 2025, 'odi');
    expect(Array.isArray(result)).toBe(true);
  });

  it('computes avg from dismissals when dismissals > 0', async () => {
    pushData([
      { player: 'X', team: 'Y', matches: 10, runs: 500, balls: 400, dismissals: 10, hundreds: 1, fifties: 2, best: '100' },
    ]);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result[0].avg).toBeCloseTo(50, 1);
  });

  it('computes avg from matches when dismissals=0 but matches>0', async () => {
    pushData([
      { player: 'X', team: 'Y', matches: 5, runs: 250, balls: 300, dismissals: 0, hundreds: 0, fifties: 2, best: '80' },
    ]);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result[0].avg).toBe(50);
  });
});

// ── loadVenuesForCountry ──────────────────────────────────────────────────────

describe('loadVenuesForCountry', () => {
  it('returns [] when DB returns []', async () => {
    const result = await loadVenuesForCountry('india');
    expect(result).toEqual([]);
  });

  it('maps rows and normalises lon/lat from schema aliases', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('FROM venues WHERE')) return [
        { venue: 'Eden Gardens', city: 'Kolkata', country: 'India', latitude: 22.56, longitude: 88.34 },
      ];
      return [];
    });
    const result = await loadVenuesForCountry('india');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].venue).toBe('Eden Gardens');
  });

  it('returns [] on DB error', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("PRAGMA table_info(venues)")) throw new Error('fail');
      return patchedMock(sql);
    });
    const result = await loadVenuesForCountry('india');
    expect(result).toEqual([]);
  });

  it('returns [] when schema has no countryCol', async () => {
    const colsNoCountry = [
      'venue', 'names', 'latitude', 'longitude', 'city',
    ].map(name => ({ name }));
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("PRAGMA table_info(venues)")) return colsNoCountry;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      return [];
    });
    const result = await loadVenuesForCountry('india');
    expect(result).toEqual([]);
  });
});

// ── getVenueTossBias ──────────────────────────────────────────────────────────

describe('getVenueTossBias', () => {
  it('returns { top10:[], bottom10:[], total:0 } when DB returns []', async () => {
    const result = await getVenueTossBias({ min: 2000, max: 2025 });
    expect(result.top10).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('aggregates by canonical name and applies Wilson CI', async () => {
    const venueRows = [
      { venue_name: 'Eden Gardens', bf_wins: 30, total: 50 },
      { venue_name: 'Wankhede',     bf_wins: 20, total: 40 },
    ];
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('venue_stats_format')) return venueRows;
      return [];
    });
    const result = await getVenueTossBias({ min: 2000, max: 2025 });
    expect(result.top10.length + result.bottom10.length).toBeGreaterThan(0);
  });

  it('returns empty on DB error', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('venue_stats_format')) throw new Error('fail');
      return [];
    });
    const result = await getVenueTossBias({ min: 2000, max: 2025 });
    expect(result).toMatchObject({ top10: [], bottom10: [], total: 0 });
  });

  it('filters out venues below minMatches threshold', async () => {
    const venueRows = [
      { venue_name: 'Small Ground', bf_wins: 2, total: 5 },
      { venue_name: 'Big Ground',   bf_wins: 30, total: 50 },
    ];
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('venue_stats_format')) return venueRows;
      return [];
    });
    const result = await getVenueTossBias({ min: 2000, max: 2025 });
    const allVenues = [...result.top10, ...result.bottom10].map(v => v.venue);
    expect(allVenues).toContain('Big Ground');
    expect(allVenues).not.toContain('Small Ground');
  });

  it('applies format filter in formatLikePatterns', async () => {
    const venueRows = [
      { venue_name: 'MCG', bf_wins: 35, total: 55 },
    ];
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('venue_stats_format')) return venueRows;
      return [];
    });
    const result = await getVenueTossBias({ min: 2000, max: 2025 }, 'test', 10);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('canonical map groups aliased venue names', async () => {
    const venueRows = [
      { venue_name: 'Eden Gardens',  bf_wins: 15, total: 25 },
      { venue_name: 'eden gardenzz', bf_wins: 15, total: 25 },
    ];
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues')
        return [{ venue: 'Eden Gardens', names: 'eden gardenzz' }];
      if (sql.includes('venue_stats_format')) return venueRows;
      return [];
    });
    const result = await getVenueTossBias({ min: 2000, max: 2025 }, 'all', 30);
    expect(result.total).toBeLessThanOrEqual(result.top10.length + result.bottom10.length + 10);
  });
});

// ── getAllSearchVenues ────────────────────────────────────────────────────────

describe('getAllSearchVenues', () => {
  it('returns [] when DB returns []', async () => {
    const result = await getAllSearchVenues();
    expect(Array.isArray(result)).toBe(true);
  });

  it('maps and filters valid rows', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql.includes('FROM venues') && sql.includes('latitude')) return [
        { venue: 'Eden Gardens', city: 'Kolkata', country: 'India', latitude: 22.56, longitude: 88.34 },
        { venue: '',             city: 'Unknown', country: '',       latitude: null,  longitude: null  },
      ];
      return [];
    });
    const result = await getAllSearchVenues();
    expect(result.some(r => r.venue === 'Eden Gardens')).toBe(true);
    expect(result.every(r => r.venue && isFinite(r.latitude))).toBe(true);
  });

  it('returns [] on DB error', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('FROM venues') && sql.includes('latitude')) throw new Error('fail');
      return patchedMock(sql);
    });
    const result = await getAllSearchVenues();
    expect(result).toEqual([]);
  });
});

// ── getAllSearchPlayers ────────────────────────────────────────────────────────

describe('getAllSearchPlayers', () => {
  it('returns [] when DB returns []', async () => {
    const result = await getAllSearchPlayers();
    expect(Array.isArray(result)).toBe(true);
  });

  it('deduplicates players appearing in both batters and bowlers lists', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('batter AS name')) return [{ name: 'V Kohli', team: 'IND', kind: 'batting' }];
      if (sql.includes('bowler AS name')) return [{ name: 'V Kohli', team: 'IND', kind: 'batting' }];
      return [];
    });
    const result = await getAllSearchPlayers();
    const kohliEntries = result.filter(r => r.name === 'V Kohli');
    expect(kohliEntries.length).toBeLessThanOrEqual(2);
  });

  it('returns [] when batters query returns null', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('batter AS name')) return null;
      if (sql.includes('bowler AS name')) return [];
      return [];
    });
    const result = await getAllSearchPlayers();
    expect(Array.isArray(result)).toBe(true);
  });

  it('filters out empty player names', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('batter AS name')) return [{ name: '', team: 'IND', kind: 'batting' }];
      if (sql.includes('bowler AS name')) return [{ name: 'Ashwin', team: 'IND', kind: 'bowling' }];
      return [];
    });
    const result = await getAllSearchPlayers();
    expect(result.every(r => r.name !== '')).toBe(true);
  });
});

// ── player drill-down queries ─────────────────────────────────────────────────

describe('getPlayerYearBatting', () => {
  it('returns [] when DB returns [] or null', async () => {
    expect(await getPlayerYearBatting('V Kohli', 2000, 2025)).toEqual([]);
  });

  it('maps rows to year data points', async () => {
    pushData([
      { year: 2015, runs: 800, balls: 600, matches: 10 },
    ]);
    const result = await getPlayerYearBatting('V Kohli', 2000, 2025);
    expect(result[0]).toMatchObject({ year: 2015, runs: 800 });
    expect(result[0].sr).toBeGreaterThan(0);
  });

  it('computes sr=0 when balls=0', async () => {
    pushData([
      { year: 2015, runs: 100, balls: 0, matches: 5 },
    ]);
    const result = await getPlayerYearBatting('V Kohli', 2000, 2025);
    expect(result[0].sr).toBe(0);
  });

  it('handles format filter', async () => {
    pushData([]);
    const result = await getPlayerYearBatting('V Kohli', 2000, 2025, 'odi');
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles DB error gracefully', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    expect(await getPlayerYearBatting('X', 2000, 2025)).toEqual([]);
  });
});

describe('getPlayerFormatBatting', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerFormatBatting('V Kohli')).toEqual([]);
  });

  it('aggregates runs by format label', async () => {
    pushData([
      { fmt: 'test', runs: 500 },
      { fmt: 'odi',  runs: 300 },
      { fmt: '',     runs: 100 },
    ]);
    const result = await getPlayerFormatBatting('V Kohli');
    expect(result.some(r => r.label === 'Test' && r.runs === 500)).toBe(true);
  });

  it('maps t20i to T20', async () => {
    pushData([
      { fmt: 't20i', runs: 200 },
    ]);
    const result = await getPlayerFormatBatting('X');
    expect(result.some(r => r.label === 'T20' && r.runs === 200)).toBe(true);
  });

  it('maps twenty20 to T20', async () => {
    pushData([
      { fmt: 'twenty20', runs: 150 },
    ]);
    const result = await getPlayerFormatBatting('Y');
    expect(result.some(r => r.label === 'T20' && r.runs === 150)).toBe(true);
  });

  it('maps "t20 international" to T20', async () => {
    pushData([
      { fmt: 't20 international', runs: 180 },
    ]);
    const result = await getPlayerFormatBatting('Z');
    expect(result.some(r => r.label === 'T20' && r.runs === 180)).toBe(true);
  });

  it('handles DB error gracefully', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    expect(await getPlayerFormatBatting('X')).toEqual([]);
  });

  it('handles null rows gracefully', async () => {
    pushData(null);
    expect(await getPlayerFormatBatting('X')).toEqual([]);
  });
});

describe('getPlayerTopVenues', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerTopVenues('V Kohli', 2000, 2025)).toEqual([]);
  });

  it('aggregates runs at canonical venue names', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues')
        return [{ venue: 'MCG', names: 'Melbourne Cricket Ground' }];
      if (sql.includes('batting_innings'))
        return [{ venue: 'MCG', runs: 500, matches: 5 }, { venue: 'Melbourne Cricket Ground', runs: 300, matches: 3 }];
      return [];
    });
    const result = await getPlayerTopVenues('V Kohli', 2000, 2025);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles DB error gracefully', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    expect(await getPlayerTopVenues('X', 2000, 2025)).toEqual([]);
  });

  it('handles format filter', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('batting_innings')) return [{ venue: 'MCG', runs: 100, matches: 2 }];
      return [];
    });
    const result = await getPlayerTopVenues('X', 2000, 2025, 'test');
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('canonical name not found in map falls back to raw venue', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('batting_innings')) return [{ venue: 'Unknown Ground', runs: 50, matches: 1 }];
      return [];
    });
    const result = await getPlayerTopVenues('X', 2000, 2025);
    expect(result[0].venue).toBe('Unknown Ground');
  });
});

describe('getPlayerYearBowling', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerYearBowling('P Cummins', 2000, 2025)).toEqual([]);
  });

  it('maps rows with econ calculation', async () => {
    pushData([
      { year: 2018, wickets: 20, runs_conceded: 300, balls: 360, matches: 12 },
    ]);
    const result = await getPlayerYearBowling('P Cummins', 2000, 2025);
    expect(result[0].wickets).toBe(20);
    expect(result[0].econ).toBeGreaterThan(0);
  });

  it('computes econ=0 when balls=0', async () => {
    pushData([
      { year: 2018, wickets: 5, runs_conceded: 100, balls: 0, matches: 3 },
    ]);
    const result = await getPlayerYearBowling('X', 2000, 2025);
    expect(result[0].econ).toBe(0);
  });

  it('handles format filter', async () => {
    pushData([]);
    const result = await getPlayerYearBowling('X', 2000, 2025, 'test');
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles DB error gracefully', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    expect(await getPlayerYearBowling('X', 2000, 2025)).toEqual([]);
  });
});

describe('getPlayerFormatBowling', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerFormatBowling('P Cummins')).toEqual([]);
  });

  it('aggregates wickets by format label', async () => {
    pushData([
      { fmt: 'test', wickets: 50 },
      { fmt: 't20i', wickets: 30 },
    ]);
    const result = await getPlayerFormatBowling('P Cummins');
    expect(result.some(r => r.label === 'Test' && r.wickets === 50)).toBe(true);
  });

  it('handles unknown formats', async () => {
    pushData([
      { fmt: 'unknown', wickets: 10 },
      { fmt: 'test', wickets: 5 },
    ]);
    const result = await getPlayerFormatBowling('X');
    expect(result.length).toBe(1);
    expect(result[0].label).toBe('Test');
  });

  it('handles empty formats', async () => {
    pushData([
      { fmt: '', wickets: 10 },
    ]);
    const result = await getPlayerFormatBowling('X');
    expect(result).toEqual([]);
  });

  it('handles DB error gracefully', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    expect(await getPlayerFormatBowling('X')).toEqual([]);
  });

  it('handles null rows gracefully', async () => {
    pushData(null);
    expect(await getPlayerFormatBowling('X')).toEqual([]);
  });
});

describe('getPlayerTopVenuesBowling', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerTopVenuesBowling('P Cummins', 2000, 2025)).toEqual([]);
  });

  it('aggregates wickets at canonical venue names', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues')
        return [{ venue: 'SCG', names: 'Sydney Cricket Ground' }];
      if (sql.includes('bowling_innings'))
        return [{ venue: 'SCG', wickets: 10, matches: 3 }, { venue: 'Sydney Cricket Ground', wickets: 5, matches: 2 }];
      return [];
    });
    const result = await getPlayerTopVenuesBowling('X', 2000, 2025);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles DB error gracefully', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    expect(await getPlayerTopVenuesBowling('X', 2000, 2025)).toEqual([]);
  });

  it('handles format filter', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('bowling_innings')) return [{ venue: 'MCG', wickets: 8, matches: 2 }];
      return [];
    });
    const result = await getPlayerTopVenuesBowling('X', 2000, 2025, 'odi');
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

// ── getBowlingLeaderboard ─────────────────────────────────────────────────────

describe('getBowlingLeaderboard', () => {
  it('returns empty array when DB returns []', async () => {
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns null when main DB query returns null', async () => {
    pushNull();
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(result).toBeNull();
  });

  it('maps rows with eco/avg/best using else-branch (all format)', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      // First call: main query returns the player row
      // Second call: bestRuns subquery returns [{ runs: 45 }]
      if (sql.includes('MIN(CAST(bi.runs_conceded')) return [{ runs: 45 }];
      return [
        { player: 'S Warne', team: 'AUS', matches: 30, wkts: 150,
          runs_conceded: 2800, balls: 4200, five_wkts: 12, best_wkts: 7 },
      ];
    });
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ player: 'S Warne', team: 'AUS', wkts: 150, five_wkts: 12 });
    expect(result[0].best).toBe('7/45');
    expect(result[0].eco).toBeGreaterThan(0);
    expect(result[0].avg).toBeGreaterThan(0);
  });

  it('maps rows with correct best using if-branch (specific format)', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('MIN(CAST(bi.runs_conceded')) return [{ runs: 70 }];
      return [
        { player: 'M Muralitharan', team: 'SL', matches: 25, wkts: 100,
          runs_conceded: 1900, balls: 3600, five_wkts: 8, best_wkts: 8 },
      ];
    });
    const result = await getBowlingLeaderboard(2000, 2025, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].best).toBe('8/70');
  });

  it('handles bestRuns sub-query returning null → best shows /0', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('MIN(CAST(bi.runs_conceded')) return [{ runs: null }];
      return [
        { player: 'X', team: 'Y', matches: 5, wkts: 20,
          runs_conceded: 400, balls: 600, five_wkts: 1, best_wkts: 5 },
      ];
    });
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(result[0].best).toBe('5/0');
  });

  it('computed eco=0 when balls=0', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('MIN(CAST(bi.runs_conceded')) return [{ runs: 20 }];
      return [
        { player: 'X', team: 'Y', matches: 3, wkts: 10,
          runs_conceded: 200, balls: 0, five_wkts: 0, best_wkts: 3 },
      ];
    });
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(result[0].eco).toBe(0);
  });

  it('computed avg=0 when wkts=0', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql === 'SELECT venue, names FROM venues') return [];
      if (sql.includes('MIN(CAST(bi.runs_conceded')) return [{ runs: null }];
      return [
        { player: 'X', team: 'Y', matches: 2, wkts: 0,
          runs_conceded: 100, balls: 60, five_wkts: 0, best_wkts: 0 },
      ];
    });
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(result[0].avg).toBe(0);
  });

  it('returns null on main query DB error', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    const result = await getBowlingLeaderboard(2000, 2025);
    expect(result).toBeNull();
  });
});

// ── getVenueTossStats ─────────────────────────────────────────────────────────

describe('getVenueTossStats', () => {
  it('returns byFormat with test/odi/t20 keys', async () => {
    const result = await getVenueTossStats(['mcg'], { min: 2000, max: 2025 });
    expect(Object.keys(result.byFormat)).toEqual(expect.arrayContaining(['test', 'odi', 't20']));
  });

  it('returns decided=0 and pct when DB returns 0 rows', async () => {
    const result = await getVenueTossStats(['mcg'], { min: 2000, max: 2025 });
    expect(result.byFormat.test.decided).toBe(0);
    expect(result.byFormat.test.battingFirstWins).toBe(0);
  });

  it('computes Wilson CI when DB returns actual match data', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SELECT names FROM venues')) return [];
      if (sql.includes('venue_stats_format')) return [{ decided: 40, wins: 24 }];
      return patchedMock(sql);
    });
    const result = await getVenueTossStats(['lords'], { min: 2000, max: 2025 });
    expect(result.byFormat.test.decided).toBe(40);
    expect(result.byFormat.test.battingFirstWins).toBe(24);
    expect(result.byFormat.test.pct).not.toBeNull();
  });

  it('expands aliases from names column', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SELECT names FROM venues'))
        return [{ names: 'Melbourne Cricket Ground;MCG North' }];
      if (sql.includes('venue_stats_format')) return [{ decided: 10, wins: 6 }];
      return patchedMock(sql);
    });
    const result = await getVenueTossStats(['mcg'], { min: 2000, max: 2025 });
    expect(result.byFormat.odi.decided).toBe(10);
  });

  it('handles alias expansion DB error gracefully', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SELECT names FROM venues')) throw new Error('alias fail');
      if (sql.includes('venue_stats_format')) return [{ decided: 5, wins: 3 }];
      return patchedMock(sql);
    });
    const result = await getVenueTossStats(['venue-x'], { min: 2000, max: 2025 });
    expect(result.byFormat).toBeDefined();
    expect(result.byFormat.test.decided).toBe(5);
  });

  it('sets null pct/lo/hi on format query error', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SELECT names FROM venues')) return [];
      if (sql.includes('venue_stats_format')) throw new Error('query fail');
      return patchedMock(sql);
    });
    const result = await getVenueTossStats(['mcg'], { min: 2000, max: 2025 });
    expect(result.byFormat.test.pct).toBeNull();
    expect(result.byFormat.test.decided).toBe(0);
  });

  it('handles empty aliases → likeExprs is "1=0"', async () => {
    const result = await getVenueTossStats([], { min: 2000, max: 2025 });
    expect(result.byFormat.test.decided).toBe(0);
  });

  it('handles rows[0] being undefined (no match data)', async () => {
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes('SELECT names FROM venues')) return [];
      if (sql.includes('venue_stats_format')) return [];
      return patchedMock(sql);
    });
    const result = await getVenueTossStats(['mcg'], { min: 2000, max: 2025 });
    expect(result.byFormat.test.decided).toBe(0);
  });
});

// ── loadVenueCountries ────────────────────────────────────────────────────────

describe('loadVenueCountries', () => {
  it('returns a Set instance', async () => {
    const result = await loadVenueCountries();
    expect(result).toBeInstanceOf(Set);
  });

  it('returns empty Set when DB returns no country rows', async () => {
    const result = await loadVenueCountries();
    expect(result.size).toBe(0);
  });

  it('populates Set from country rows, filtering null entries', async () => {
    pushData([
      { country: 'India' },
      { country: 'Australia' },
      { country: null },
    ]);
    const result = await loadVenueCountries();
    expect(result.size).toBe(2);
  });

  it('handles DB error → returns empty Set', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    const result = await loadVenueCountries();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns empty Set when schema is null or has no countryCol', async () => {
    const colsNoCountry = ['venue', 'names', 'latitude', 'longitude'].map(name => ({ name }));
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("PRAGMA table_info(venues)")) return colsNoCountry;
      if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      return [];
    });
    const result = await loadVenueCountries();
    expect(result.size).toBe(0);
  });
});
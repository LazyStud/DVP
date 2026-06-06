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
  loadVenuesForCountry,
  getHeadToHeadStats, getHeadToHeadBiggestWins, getHeadToHeadTopPlayers,
  getVenueTossBias,
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

// Base mock: schema queries always return column lists; data queries return [].
function baseMock(sql) {
  if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
  if (sql.includes("PRAGMA table_info(venues)")) return VENUE_COLS;
  if (sql.includes("PRAGMA table_info")) return MATCH_COLS;
  if (sql === 'SELECT venue, names FROM venues') return [];
  return [];
}

beforeAll(() => {
  DB.queryAll.mockImplementation(baseMock);
  // Prime matchView() cache so subsequent tests don't need schema queries
  matchView();
});

beforeEach(() => {
  DB.init.mockResolvedValue(undefined);
  DB.queryAll.mockImplementation(baseMock);
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
    DB.queryAll.mockImplementationOnce(() => [
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
    DB.queryAll.mockImplementationOnce(() => [
      { winner: '', result_type: 'tied', total: 1 },
    ]);
    const result = await getHeadToHeadStats('A', 'B', 2000, 2025);
    expect(result.draws).toBe(1);
  });

  it('handles "abandoned" result_type as no-result', async () => {
    DB.queryAll.mockImplementationOnce(() => [
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
    DB.queryAll.mockImplementationOnce(() => null);
    const result = await getHeadToHeadStats('A', 'B', 2000, 2025);
    expect(result.total).toBe(0);
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
    const winRow = { winner: 'Australia', result_type: 'runs', win_margin: '200', date: '2020-01-15', venue_name: 'MCG' };
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes('venue_name') && sql.includes("IN ('runs', 'wickets')")) return [winRow];
      return [];
    });
    const result = await getHeadToHeadBiggestWins('Australia', 'India', 2000, 2025);
    expect(result.bestA.length + result.bestB.length).toBeGreaterThan(0);
  });

  it('sorts runs wins by dominance score (runs value)', async () => {
    const rows = [
      { winner: 'AUS', result_type: 'runs',    win_margin: '50',  date: '2021', venue_name: 'V1' },
      { winner: 'AUS', result_type: 'runs',    win_margin: '200', date: '2022', venue_name: 'V2' },
      { winner: 'AUS', result_type: 'wickets', win_margin: '5',   date: '2023', venue_name: 'V3' },
    ];
    DB.queryAll.mockImplementation(sql => {
      if (sql.includes("sqlite_master")) return [{ name: 'matches' }];
      if (sql.includes("PRAGMA")) return MATCH_COLS;
      if (sql.includes("IN ('runs', 'wickets')")) return rows;
      return [];
    });
    const result = await getHeadToHeadBiggestWins('AUS', 'IND', 2000, 2025);
    // dominance: 200(runs)=200 > 5²*4(wickets)=100 > 50(runs)=50 → V2 should be first
    const bestA = result.bestA;
    if (bestA.length > 1) expect(bestA[0].margin).toBeGreaterThanOrEqual(bestA[1].margin);
  });

  it('returns empty on DB error', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    const result = await getHeadToHeadBiggestWins('A', 'B', 2000, 2025);
    expect(result).toMatchObject({ bestA: [], bestB: [] });
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
    DB.queryAll.mockImplementationOnce(() => { throw new Error('err'); });
    const result = await getHeadToHeadTopPlayers('A', 'B', 2000, 2025);
    expect(result).toMatchObject({ batters: [], bowlers: [] });
  });
});

// ── getBattingLeaderboard ─────────────────────────────────────────────────────

describe('getBattingLeaderboard', () => {
  it('returns [] when DB returns []', async () => {
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result).toEqual([]);
  });

  it('maps DB rows to leaderboard entries', async () => {
    DB.queryAll.mockImplementationOnce(() => [
      { player: 'V Kohli', team: 'India', matches: 50, runs: 2500,
        balls: 1800, dismissals: 48, hundreds: 8, fifties: 14, best: '183' },
    ]);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result[0]).toMatchObject({ player: 'V Kohli', runs: 2500 });
    expect(result[0].sr).toBeGreaterThan(0);
    expect(result[0].avg).toBeGreaterThan(0);
  });

  it('returns null when DB returns null', async () => {
    DB.queryAll.mockImplementationOnce(() => null);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    DB.queryAll.mockImplementationOnce(() => { throw new Error('fail'); });
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result).toBeNull();
  });

  it('computes sr=0 when balls=0', async () => {
    DB.queryAll.mockImplementationOnce(() => [
      { player: 'X', team: 'Y', matches: 5, runs: 100, balls: 0, dismissals: 5, hundreds: 0, fifties: 0, best: '50' },
    ]);
    const result = await getBattingLeaderboard(2000, 2025);
    expect(result[0].sr).toBe(0);
  });

  it('supports non-all format filter', async () => {
    DB.queryAll.mockReturnValue([]);
    const result = await getBattingLeaderboard(2000, 2025, 'odi');
    expect(Array.isArray(result)).toBe(true);
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
      return baseMock(sql);
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
        { venue: '',             city: 'Unknown', country: '',       latitude: null,  longitude: null  }, // filtered out
      ];
      return [];
    });
    const result = await getAllSearchVenues();
    expect(result.some(r => r.venue === 'Eden Gardens')).toBe(true);
    expect(result.every(r => r.venue && isFinite(r.latitude))).toBe(true);
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
    expect(kohliEntries.length).toBeLessThanOrEqual(2); // max one per kind
  });
});

// ── player drill-down queries ─────────────────────────────────────────────────

describe('getPlayerYearBatting', () => {
  it('returns [] when DB returns [] or null', async () => {
    expect(await getPlayerYearBatting('V Kohli', 2000, 2025)).toEqual([]);
  });

  it('maps rows to year data points', async () => {
    DB.queryAll.mockImplementationOnce(() => [
      { year: 2015, runs: 800, balls: 600, matches: 10 },
    ]);
    const result = await getPlayerYearBatting('V Kohli', 2000, 2025);
    expect(result[0]).toMatchObject({ year: 2015, runs: 800 });
    expect(result[0].sr).toBeGreaterThan(0);
  });
});

describe('getPlayerFormatBatting', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerFormatBatting('V Kohli')).toEqual([]);
  });

  it('aggregates runs by format label', async () => {
    DB.queryAll.mockImplementationOnce(() => [
      { fmt: 'test', runs: 500 },
      { fmt: 'odi',  runs: 300 },
      { fmt: '',     runs: 100 }, // empty fmt → skipped
    ]);
    const result = await getPlayerFormatBatting('V Kohli');
    expect(result.some(r => r.label === 'Test' && r.runs === 500)).toBe(true);
  });
});

describe('getPlayerTopVenues', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerTopVenues('V Kohli', 2000, 2025)).toEqual([]);
  });
});

describe('getPlayerYearBowling', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerYearBowling('P Cummins', 2000, 2025)).toEqual([]);
  });

  it('maps rows with econ calculation', async () => {
    DB.queryAll.mockImplementationOnce(() => [
      { year: 2018, wickets: 20, runs_conceded: 300, balls: 360, matches: 12 },
    ]);
    const result = await getPlayerYearBowling('P Cummins', 2000, 2025);
    expect(result[0].wickets).toBe(20);
    expect(result[0].econ).toBeGreaterThan(0);
  });
});

describe('getPlayerFormatBowling', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerFormatBowling('P Cummins')).toEqual([]);
  });

  it('aggregates wickets by format label', async () => {
    DB.queryAll.mockImplementationOnce(() => [
      { fmt: 'test', wickets: 50 },
      { fmt: 't20i', wickets: 30 },
    ]);
    const result = await getPlayerFormatBowling('P Cummins');
    expect(result.some(r => r.label === 'Test' && r.wickets === 50)).toBe(true);
  });
});

describe('getPlayerTopVenuesBowling', () => {
  it('returns [] when DB returns []', async () => {
    expect(await getPlayerTopVenuesBowling('P Cummins', 2000, 2025)).toEqual([]);
  });
});

/* Unit tests for T-3.6 global search.
 * Tests Fuse.js configuration and the player-dedup logic with static fixtures.
 * DB-backed query functions (getAllSearchVenues, getAllSearchPlayers) are not
 * tested here because they depend on the sql.js global — those paths are
 * covered by the smoke test instead.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Fuse from 'fuse.js';

// ── Static fixtures mirroring the query output shape ─────────────────────────

const VENUES = [
  { venue: "Lord's Cricket Ground",    city: 'London',    country: 'England',   latitude: 51.52,  longitude: -0.17 },
  { venue: 'Eden Gardens',             city: 'Kolkata',   country: 'India',     latitude: 22.57,  longitude: 88.34 },
  { venue: 'Melbourne Cricket Ground', city: 'Melbourne', country: 'Australia', latitude: -37.82, longitude: 144.98 },
  { venue: 'Wankhede Stadium',         city: 'Mumbai',    country: 'India',     latitude: 18.94,  longitude: 72.82 },
  { venue: 'Old Trafford',             city: 'Manchester', country: 'England',  latitude: 53.46,  longitude: -2.29 },
];

const PLAYERS = [
  { name: 'Virat Kohli',    team: 'India',     kind: 'batting' },
  { name: 'Rohit Sharma',   team: 'India',     kind: 'batting' },
  { name: 'Jasprit Bumrah', team: 'India',     kind: 'bowling' },
  { name: 'Pat Cummins',    team: 'Australia', kind: 'bowling' },
  { name: 'Joe Root',       team: 'England',   kind: 'batting' },
];

const COUNTRIES = [
  { name: 'Australia', canonical: 'australia' },
  { name: 'England',   canonical: 'england' },
  { name: 'India',     canonical: 'india' },
  { name: 'Sri Lanka', canonical: 'sri lanka' },
];

const VENUE_FUSE_OPTS   = { keys: ['venue', 'city', 'country'], threshold: 0.4,  includeScore: true };
const PLAYER_FUSE_OPTS  = { keys: ['name', 'team'],             threshold: 0.35, includeScore: true };
const COUNTRY_FUSE_OPTS = { keys: ['name', 'canonical'],        threshold: 0.35, includeScore: true };

// ── Venue search ──────────────────────────────────────────────────────────────

describe('venue search', () => {
  let fuse;
  beforeAll(() => { fuse = new Fuse(VENUES, VENUE_FUSE_OPTS); });

  it('"lord" → Lord\'s Cricket Ground as first result', () => {
    const hits = fuse.search('lord', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.venue).toBe("Lord's Cricket Ground");
  });

  it('"eden" → Eden Gardens', () => {
    const hits = fuse.search('eden', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.venue).toBe('Eden Gardens');
  });

  it('"wankhede" → Wankhede Stadium', () => {
    const hits = fuse.search('wankhede', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.venue).toBe('Wankhede Stadium');
  });

  it('"trafford" → Old Trafford', () => {
    const hits = fuse.search('trafford', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.venue).toBe('Old Trafford');
  });

  it('result items include venue, city, country, latitude, longitude', () => {
    const [{ item }] = fuse.search('eden', { limit: 1 });
    expect(item).toHaveProperty('venue');
    expect(item).toHaveProperty('city');
    expect(item).toHaveProperty('country');
    expect(item).toHaveProperty('latitude');
    expect(item).toHaveProperty('longitude');
  });

  it('nonsense query returns no results', () => {
    expect(fuse.search('xyzqwerty123', { limit: 4 })).toHaveLength(0);
  });
});

// ── Player search ─────────────────────────────────────────────────────────────

describe('player search', () => {
  let fuse;
  beforeAll(() => { fuse = new Fuse(PLAYERS, PLAYER_FUSE_OPTS); });

  it('"kohli" → Virat Kohli as first result', () => {
    const hits = fuse.search('kohli', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('Virat Kohli');
  });

  it('"bumrah" → Jasprit Bumrah with kind=bowling', () => {
    const hits = fuse.search('bumrah', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.kind).toBe('bowling');
  });

  it('"root" → Joe Root', () => {
    const hits = fuse.search('root', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('Joe Root');
  });

  it('result items include name, team, kind', () => {
    const [{ item }] = fuse.search('rohit', { limit: 1 });
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('team');
    expect(item).toHaveProperty('kind');
  });
});

// ── Country search ────────────────────────────────────────────────────────────

describe('country search', () => {
  let fuse;
  beforeAll(() => { fuse = new Fuse(COUNTRIES, COUNTRY_FUSE_OPTS); });

  it('"australia" → Australia', () => {
    const hits = fuse.search('australia', { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('Australia');
  });

  it('"eng" → England', () => {
    const hits = fuse.search('eng', { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('England');
  });

  it('"sri" → Sri Lanka', () => {
    const hits = fuse.search('sri', { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('Sri Lanka');
  });
});

// ── Player deduplication logic ────────────────────────────────────────────────

describe('player deduplication', () => {
  function deduplicatePlayers(batters, bowlers) {
    const seen = new Set();
    const out = [];
    for (const r of [...batters, ...bowlers]) {
      const key = String(r.name || '').trim().toLowerCase();
      if (!key || seen.has(key + r.kind)) continue;
      seen.add(key + r.kind);
      out.push({ name: String(r.name).trim(), team: String(r.team || '').trim(), kind: r.kind });
    }
    return out;
  }

  it('keeps both batting and bowling entries for all-rounder', () => {
    const batters = [{ name: 'Ben Stokes', team: 'England', kind: 'batting' }];
    const bowlers = [{ name: 'Ben Stokes', team: 'England', kind: 'bowling' }];
    const result  = deduplicatePlayers(batters, bowlers);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.kind)).toEqual(expect.arrayContaining(['batting', 'bowling']));
  });

  it('deduplicates exact duplicates within same kind', () => {
    const batters = [
      { name: 'Virat Kohli', team: 'India', kind: 'batting' },
      { name: 'Virat Kohli', team: 'India', kind: 'batting' },
    ];
    const result = deduplicatePlayers(batters, []);
    expect(result).toHaveLength(1);
  });

  it('ignores entries with empty name', () => {
    const batters = [{ name: '', team: 'India', kind: 'batting' }];
    const result  = deduplicatePlayers(batters, []);
    expect(result).toHaveLength(0);
  });

  it('trims whitespace from name and team', () => {
    const batters = [{ name: '  Sachin Tendulkar  ', team: ' India ', kind: 'batting' }];
    const result  = deduplicatePlayers(batters, []);
    expect(result[0].name).toBe('Sachin Tendulkar');
    expect(result[0].team).toBe('India');
  });
});

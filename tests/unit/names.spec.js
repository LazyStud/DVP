import { describe, it, expect } from 'vitest';
import {
  canonicalMapName,
  canonicalTeamName,
  hostToHomeTeamCountry,
  WINNER_SYNS,
  DATE_SYNS,
  HOST_SYNS,
  NEUTRAL_SYNS,
  RESULT_SYNS,
  FORMAT_SYNS,
} from '../../src/data/names.js';

// ── canonicalMapName ──────────────────────────────────────────────────────────

describe('canonicalMapName', () => {
  it('maps UK → united kingdom', () => {
    expect(canonicalMapName('UK')).toBe('united kingdom');
  });

  it('maps England → united kingdom', () => {
    expect(canonicalMapName('England')).toBe('united kingdom');
  });

  it('maps USA → united states', () => {
    expect(canonicalMapName('USA')).toBe('united states');
  });

  it('maps "United States of America" → united states', () => {
    expect(canonicalMapName('United States of America')).toBe('united states');
  });

  it('maps UAE → united arab emirates', () => {
    expect(canonicalMapName('UAE')).toBe('united arab emirates');
  });

  it('lowercases a plain country name', () => {
    expect(canonicalMapName('Australia')).toBe('australia');
  });

  it('replaces & with and', () => {
    expect(canonicalMapName('Trinidad & Tobago')).toBe('trinidad and tobago');
  });

  it('strips non-ASCII chars and punctuation (ô removed, apostrophe removed)', () => {
    // norm() removes [^a-z0-9\s], so accented letters are dropped entirely
    expect(canonicalMapName("Côte d'Ivoire")).toBe('cte divoire');
  });

  it('collapses multiple spaces', () => {
    expect(canonicalMapName('New   Zealand')).toBe('new zealand');
  });

  it('handles empty string → empty string', () => {
    expect(canonicalMapName('')).toBe('');
  });

  it('handles null → empty string', () => {
    expect(canonicalMapName(null)).toBe('');
  });

  it('handles undefined → empty string', () => {
    expect(canonicalMapName(undefined)).toBe('');
  });

  it('trims leading/trailing whitespace', () => {
    expect(canonicalMapName('  India  ')).toBe('india');
  });

  it('case-insensitive alias resolution', () => {
    expect(canonicalMapName('uk')).toBe('united kingdom');
    expect(canonicalMapName('Uk')).toBe('united kingdom');
  });
});

// ── canonicalTeamName ─────────────────────────────────────────────────────────

describe('canonicalTeamName', () => {
  it('maps UAE team abbreviation', () => {
    expect(canonicalTeamName('UAE')).toBe('united arab emirates');
  });

  it('maps ENG → england', () => {
    expect(canonicalTeamName('Eng')).toBe('england');
  });

  it('maps UK (team) → england', () => {
    expect(canonicalTeamName('UK')).toBe('england');
  });

  it('maps United Kingdom (team) → england', () => {
    expect(canonicalTeamName('United Kingdom')).toBe('england');
  });

  it('maps USA team → united states', () => {
    expect(canonicalTeamName('USA')).toBe('united states');
  });

  it('maps West Indies variants', () => {
    expect(canonicalTeamName('WestIndies')).toBe('west indies');
    expect(canonicalTeamName('West Indies')).toBe('west indies');
  });

  it('passes through known team name unchanged', () => {
    expect(canonicalTeamName('Australia')).toBe('australia');
    expect(canonicalTeamName('India')).toBe('india');
  });

  it('handles null gracefully', () => {
    expect(canonicalTeamName(null)).toBe('');
  });
});

// ── hostToHomeTeamCountry ─────────────────────────────────────────────────────

describe('hostToHomeTeamCountry', () => {
  it('maps UK host → england', () => {
    expect(hostToHomeTeamCountry('united kingdom')).toBe('england');
  });

  it('maps Barbados host → west indies', () => {
    expect(hostToHomeTeamCountry('barbados')).toBe('west indies');
  });

  it('maps Jamaica host → west indies', () => {
    expect(hostToHomeTeamCountry('jamaica')).toBe('west indies');
  });

  it('maps Trinidad and Tobago host → west indies', () => {
    expect(hostToHomeTeamCountry('trinidad and tobago')).toBe('west indies');
  });

  it('passes through non-special hosts', () => {
    expect(hostToHomeTeamCountry('australia')).toBe('australia');
    expect(hostToHomeTeamCountry('india')).toBe('india');
  });

  it('handles mixed-case host via norm()', () => {
    expect(hostToHomeTeamCountry('Barbados')).toBe('west indies');
  });
});

// ── Synonym arrays ────────────────────────────────────────────────────────────

describe('column synonym arrays', () => {
  it('WINNER_SYNS includes "winner"', () => {
    expect(WINNER_SYNS).toContain('winner');
  });

  it('DATE_SYNS includes "date"', () => {
    expect(DATE_SYNS).toContain('date');
  });

  it('HOST_SYNS includes "venue_country" and "host_country"', () => {
    expect(HOST_SYNS).toContain('venue_country');
    expect(HOST_SYNS).toContain('host_country');
  });

  it('NEUTRAL_SYNS includes "neutral_venue"', () => {
    expect(NEUTRAL_SYNS).toContain('neutral_venue');
  });

  it('RESULT_SYNS includes "result"', () => {
    expect(RESULT_SYNS).toContain('result');
  });

  it('FORMAT_SYNS includes "format" and "match_type"', () => {
    expect(FORMAT_SYNS).toContain('format');
    expect(FORMAT_SYNS).toContain('match_type');
  });

  it('all synonym arrays are non-empty', () => {
    for (const arr of [WINNER_SYNS, DATE_SYNS, HOST_SYNS, NEUTRAL_SYNS, RESULT_SYNS, FORMAT_SYNS]) {
      expect(arr.length).toBeGreaterThan(0);
    }
  });

  it('synonym arrays contain only lowercase strings', () => {
    for (const arr of [WINNER_SYNS, DATE_SYNS, HOST_SYNS, NEUTRAL_SYNS, RESULT_SYNS, FORMAT_SYNS]) {
      for (const s of arr) {
        expect(s).toBe(s.toLowerCase());
      }
    }
  });
});

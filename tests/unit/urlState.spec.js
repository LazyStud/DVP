import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock shared state so tests don't need the full browser module graph
vi.mock('../../src/state.js', () => ({
  state: { mode: 'globe', yearRange: { min: 2000, max: 2025 }, selectedFormat: 'all' },
}));
vi.mock('../../src/config.js', () => ({
  YEAR_MIN: 2000, YEAR_MAX: 2025, PALETTES: {},
}));

import { readHash, pushHash } from '../../src/ui/urlState.js';
import { state }              from '../../src/state.js';

// ── readHash ─────────────────────────────────────────────────────────────────

describe('readHash', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setHash(hash) {
    vi.stubGlobal('location', { hash, pathname: '/', search: '' });
  }

  it('returns all defaults when hash is empty', () => {
    setHash('');
    expect(readHash()).toEqual({ view: 'globe', yearMin: 2000, yearMax: 2025, format: 'all', country: '' });
  });

  it('parses view=map', () => {
    setHash('#view=map');
    expect(readHash().view).toBe('map');
  });

  it('treats any view other than map as globe', () => {
    setHash('#view=invalid');
    expect(readHash().view).toBe('globe');
  });

  it('parses year range', () => {
    setHash('#yearMin=2010&yearMax=2020');
    const r = readHash();
    expect(r.yearMin).toBe(2010);
    expect(r.yearMax).toBe(2020);
  });

  it('clamps yearMin below YEAR_MIN to YEAR_MIN', () => {
    setHash('#yearMin=1990');
    expect(readHash().yearMin).toBe(2000);
  });

  it('clamps yearMax above YEAR_MAX to YEAR_MAX', () => {
    setHash('#yearMax=2099');
    expect(readHash().yearMax).toBe(2025);
  });

  it('swaps min/max when yearMin > yearMax', () => {
    setHash('#yearMin=2020&yearMax=2010');
    const r = readHash();
    expect(r.yearMin).toBe(2010);
    expect(r.yearMax).toBe(2020);
  });

  it('falls back to defaults for non-numeric years', () => {
    setHash('#yearMin=abc&yearMax=xyz');
    const r = readHash();
    expect(r.yearMin).toBe(2000);
    expect(r.yearMax).toBe(2025);
  });

  it.each(['odi', 't20', 'test', 'all'])('parses valid format %s', fmt => {
    setHash(`#format=${fmt}`);
    expect(readHash().format).toBe(fmt);
  });

  it('defaults format to all for unknown value', () => {
    setHash('#format=wombat');
    expect(readHash().format).toBe('all');
  });

  it('parses country', () => {
    setHash('#country=australia');
    expect(readHash().country).toBe('australia');
  });

  it('returns empty string when country absent', () => {
    setHash('#view=map');
    expect(readHash().country).toBe('');
  });

  it('parses a full hash with all fields', () => {
    setHash('#view=map&yearMin=2005&yearMax=2015&format=test&country=india');
    expect(readHash()).toEqual({
      view: 'map', yearMin: 2005, yearMax: 2015, format: 'test', country: 'india',
    });
  });
});

// ── pushHash ─────────────────────────────────────────────────────────────────

describe('pushHash', () => {
  let replaceState;

  beforeEach(() => {
    replaceState = vi.fn();
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('location', { hash: '', pathname: '/', search: '' });
    // Reset state to defaults before each test
    state.mode            = 'globe';
    state.yearRange       = { min: 2000, max: 2025 };
    state.selectedFormat  = 'all';
    // Clear any tracked country from prior tests
    pushHash({ country: '' });
    replaceState.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('calls history.replaceState', () => {
    pushHash();
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it('produces clean URL (no hash) for all-default state', () => {
    pushHash();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('encodes non-default view', () => {
    state.mode = 'map';
    pushHash();
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('view=map');
  });

  it('omits view when globe (default)', () => {
    state.mode = 'globe';
    pushHash();
    const [,, url] = replaceState.mock.calls[0];
    expect(url).not.toContain('view=');
  });

  it('encodes non-default yearMin', () => {
    state.yearRange = { min: 2010, max: 2025 };
    pushHash();
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('yearMin=2010');
    expect(url).not.toContain('yearMax=');
  });

  it('encodes non-default yearMax', () => {
    state.yearRange = { min: 2000, max: 2018 };
    pushHash();
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('yearMax=2018');
    expect(url).not.toContain('yearMin=');
  });

  it('encodes non-default format', () => {
    state.selectedFormat = 'odi';
    pushHash();
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('format=odi');
  });

  it('omits format when all (default)', () => {
    state.selectedFormat = 'all';
    pushHash();
    const [,, url] = replaceState.mock.calls[0];
    expect(url).not.toContain('format=');
  });

  it('stores country from patch and encodes it', () => {
    pushHash({ country: 'india' });
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('country=india');
  });

  it('clears country when patch passes empty string', () => {
    pushHash({ country: 'india' });
    replaceState.mockClear();
    pushHash({ country: '' });
    const [,, url] = replaceState.mock.calls[0];
    expect(url).not.toContain('country=');
  });

  it('country persists across pushHash calls without patch', () => {
    pushHash({ country: 'australia' });
    replaceState.mockClear();
    state.selectedFormat = 'odi';
    pushHash(); // no patch — country should still be there
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('country=australia');
    expect(url).toContain('format=odi');
  });

  it('encodes all non-default fields together', () => {
    state.mode           = 'map';
    state.yearRange      = { min: 2005, max: 2015 };
    state.selectedFormat = 'test';
    pushHash({ country: 'pakistan' });
    const [,, url] = replaceState.mock.calls[0];
    expect(url).toContain('view=map');
    expect(url).toContain('yearMin=2005');
    expect(url).toContain('yearMax=2015');
    expect(url).toContain('format=test');
    expect(url).toContain('country=pakistan');
  });
});

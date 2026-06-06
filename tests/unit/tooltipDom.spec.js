// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/debug.js',          () => ({ DEBUG: false }));
vi.mock('../../src/db.js',             () => ({ DB: { queryAll: vi.fn() } }));
vi.mock('../../src/venue.js',          () => ({ VenueWindow: { open: vi.fn() } }));
vi.mock('../../src/data/queries.js',   () => ({
  loadVenuesForCountry: vi.fn(),
  getAllSearchVenues:   vi.fn(),
  getAllSearchPlayers:  vi.fn(),
}));

import {
  showTooltipAt,
  moveTooltipToEvent,
  hideTooltip,
  showVenueTooltip,
  showCountryTooltip,
} from '../../src/ui/tooltip.js';
import { state }             from '../../src/state.js';
import { DB }                from '../../src/db.js';
import { VenueWindow }       from '../../src/venue.js';
import { loadVenuesForCountry } from '../../src/data/queries.js';

beforeEach(() => {
  // Clear any tooltip element left from a previous test
  state.tooltipEl = null;
  document.querySelectorAll('#map-tooltip').forEach(el => el.remove());
  vi.clearAllMocks();
  vi.stubGlobal('reportError', () => {});
});

// ── showTooltipAt ────────────────────────────────────────────────────────────

describe('showTooltipAt', () => {
  it('creates a #map-tooltip element and appends it to body', () => {
    showTooltipAt(100, 200, '<b>hello</b>');
    expect(document.getElementById('map-tooltip')).not.toBeNull();
  });

  it('shows the tooltip with the supplied HTML and positions it', () => {
    showTooltipAt(100, 200, '<b>hello</b>');
    const el = document.getElementById('map-tooltip');
    expect(el.innerHTML).toBe('<b>hello</b>');
    expect(el.style.left).toBe('112px');
    expect(el.style.top).toBe('212px');
    expect(el.style.display).toBe('block');
  });

  it('reuses the same element on subsequent calls', () => {
    showTooltipAt(10, 10, 'first');
    showTooltipAt(20, 20, 'second');
    expect(document.querySelectorAll('#map-tooltip')).toHaveLength(1);
    expect(document.getElementById('map-tooltip').innerHTML).toBe('second');
  });
});

// ── moveTooltipToEvent ───────────────────────────────────────────────────────

describe('moveTooltipToEvent', () => {
  it('does nothing when tooltip element is absent', () => {
    state.tooltipEl = null;
    expect(() => moveTooltipToEvent({ clientX: 50, clientY: 50 })).not.toThrow();
  });

  it('does nothing when tooltip is hidden', () => {
    showTooltipAt(0, 0, 'x');
    hideTooltip();
    const before = state.tooltipEl.style.left;
    moveTooltipToEvent({ clientX: 999, clientY: 999 });
    expect(state.tooltipEl.style.left).toBe(before);
  });

  it('updates position when tooltip is visible', () => {
    showTooltipAt(0, 0, 'x');
    moveTooltipToEvent({ clientX: 50, clientY: 80 });
    expect(state.tooltipEl.style.left).toBe('62px');
    expect(state.tooltipEl.style.top).toBe('92px');
  });

  it('uses touch coordinates when clientX is 0', () => {
    showTooltipAt(0, 0, 'x');
    moveTooltipToEvent({ clientX: 0, clientY: 0, touches: [{ clientX: 30, clientY: 40 }] });
    expect(state.tooltipEl.style.left).toBe('42px');
    expect(state.tooltipEl.style.top).toBe('52px');
  });
});

// ── hideTooltip ──────────────────────────────────────────────────────────────

describe('hideTooltip', () => {
  it('sets display to none', () => {
    showTooltipAt(0, 0, 'x');
    hideTooltip();
    expect(state.tooltipEl.style.display).toBe('none');
  });

  it('is a no-op when no tooltip exists', () => {
    state.tooltipEl = null;
    expect(() => hideTooltip()).not.toThrow();
  });
});

// ── showVenueTooltip ─────────────────────────────────────────────────────────

describe('showVenueTooltip', () => {
  it('shows basic venue info immediately', async () => {
    DB.queryAll.mockReturnValue([{ matches: 20, t20_matches: 10, odi_matches: 5, test_matches: 5 }]);
    await showVenueTooltip(
      { clientX: 100, clientY: 100 },
      { venue: 'Eden Gardens', city: 'Kolkata', country: 'India' },
    );
    const el = document.getElementById('map-tooltip');
    expect(el.innerHTML).toContain('Eden Gardens');
    expect(el.innerHTML).toContain('Kolkata');
  });

  it('includes match counts from DB in the final tooltip', async () => {
    DB.queryAll.mockReturnValue([{ matches: 42, t20_matches: 15, odi_matches: 17, test_matches: 10 }]);
    await showVenueTooltip(
      { clientX: 50, clientY: 50 },
      { venue: 'Wankhede', city: 'Mumbai', names: '' },
    );
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toContain('42');
  });

  it('wires an Open venue details button', async () => {
    DB.queryAll.mockReturnValue([{ matches: 5, t20_matches: 2, odi_matches: 2, test_matches: 1 }]);
    await showVenueTooltip({ clientX: 0, clientY: 0 }, { venue: 'Test', city: '' });
    const btn = state.tooltipEl.querySelector('.map-tooltip-open');
    expect(btn).not.toBeNull();
    btn.click();
    expect(VenueWindow.open).toHaveBeenCalled();
  });
});

// ── showCountryTooltip ───────────────────────────────────────────────────────

describe('showCountryTooltip', () => {
  it('shows "no data" when country not in choroByCountry', async () => {
    state.choroByCountry = new Map();
    await showCountryTooltip(
      { clientX: 50, clientY: 50 },
      { properties: { name: 'Antarctica' } },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('No match data');
  });

  it('shows win percentage for a known country', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 100, homeWins: 65, formats: {}, byYear: { 2020: 8 } }],
    ]);
    loadVenuesForCountry.mockResolvedValue([{ venue: 'Eden Gardens' }, { venue: 'Wankhede' }]);
    await showCountryTooltip(
      { clientX: 50, clientY: 50 },
      { properties: { name: 'India' } },
    );
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toContain('65%');
  });

  it('renders format grid with TEST/ODI/T20 labels', async () => {
    state.choroByCountry = new Map([
      ['australia', {
        matches: 50, homeWins: 30,
        formats: {
          test: { matches: 20, homeWins: 14 },
          odi:  { matches: 18, homeWins: 10 },
          t20:  { matches: 12, homeWins: 6  },
        },
        byYear: {},
      }],
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'Australia' } },
    );
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toContain('TEST');
    expect(html).toContain('ODI');
    expect(html).toContain('T20');
  });

  it('renders sparkline when byYear data is present', async () => {
    // canonicalMapName('England') → 'united kingdom' (alias in names.js)
    state.choroByCountry = new Map([
      ['united kingdom', {
        matches: 30, homeWins: 18,
        formats: {},
        byYear: { 2018: 5, 2019: 7, 2020: 4 },
      }],
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'England' } },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('<svg');
  });

  it('shows "Dominant" badge for pct >= 62', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 100, homeWins: 70, formats: {}, byYear: {} }],
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'India' } },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('Dominant');
  });

  it('shows "Strong home" badge for pct >= 54 and < 62', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 100, homeWins: 58, formats: {}, byYear: {} }],
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'India' } },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('Strong home');
  });

  it('shows "Away-friendly" badge for pct <= 40', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 100, homeWins: 30, formats: {}, byYear: {} }],
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'India' } },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('Away-friendly');
  });

  it('highlights best format with ctt-best class', async () => {
    state.choroByCountry = new Map([
      ['australia', {
        matches: 50, homeWins: 30,
        formats: {
          test: { matches: 20, homeWins: 15 },
          odi:  { matches: 18, homeWins: 5  },
          t20:  { matches: 12, homeWins: 3  },
        },
        byYear: {},
      }],
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'Australia' } },
    );
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toContain('ctt-best');
    expect(html).toContain('75%'); // 15/20 = 75%
  });

  it('shows "No match data" when canonicalMapName returns unknown country', async () => {
    state.choroByCountry = new Map();
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'Atlantis' } },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('No match data');
  });

  it('handles showCountryTooltip error gracefully', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 100, homeWins: 50, formats: {}, byYear: {} }],
    ]);
    // Make loadVenuesForCountry throw to exercise the inner catch
    loadVenuesForCountry.mockRejectedValueOnce(new Error('fail'));
    await showCountryTooltip(
      { clientX: 0, clientY: 0 },
      { properties: { name: 'India' } },
    );
    // Should still render basic HTML
    expect(document.getElementById('map-tooltip').innerHTML).toContain('India');
  });

  it('renders a singular "venue" label when exactly one venue is returned', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 10, homeWins: 5, formats: {}, byYear: {} }],
    ]);
    loadVenuesForCountry.mockResolvedValue([{ name: 'Solo Ground' }]); // length 1, uses v.name fallback
    await showCountryTooltip({ clientX: 0, clientY: 0 }, { properties: { name: 'India' } });
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toMatch(/1 venue[^s]/); // "1 venue ·" — no plural 's'
    expect(html).toContain('Solo Ground');
  });

  it('handles a record with zero matches (pct = 0) and no byYear', async () => {
    state.choroByCountry = new Map([
      ['india', { matches: 0, homeWins: 0, formats: {} }], // no byYear → sparkline skipped
    ]);
    loadVenuesForCountry.mockResolvedValue([]);
    await showCountryTooltip({ clientX: 0, clientY: 0 }, { properties: { name: 'India' } });
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toContain('0%');
    expect(html).not.toContain('<svg');
  });

  it('falls back to the canonical name when the feature has no properties', async () => {
    state.choroByCountry = new Map();
    await showCountryTooltip({ clientX: 0, clientY: 0 }, {}); // no .properties
    expect(document.getElementById('map-tooltip').innerHTML).toContain('No match data');
  });
});

// ── moveTooltipToEvent: coordinate fallbacks ─────────────────────────────────

describe('moveTooltipToEvent fallbacks', () => {
  it('falls back to 0,0 when neither clientX nor touches are present', () => {
    showTooltipAt(0, 0, 'x');
    moveTooltipToEvent({}); // no clientX / clientY / touches → both default to 0
    expect(state.tooltipEl.style.left).toBe('12px');
    expect(state.tooltipEl.style.top).toBe('12px');
  });
});

// ── showVenueTooltip: name fallbacks, alias names, empty DB result ────────────

describe('showVenueTooltip branch coverage', () => {
  it('uses d.name when d.venue is absent and splits d.names aliases', async () => {
    DB.queryAll.mockReturnValue([{ matches: 7, t20_matches: 3, odi_matches: 2, test_matches: 2 }]);
    await showVenueTooltip(
      { clientX: 10, clientY: 10 },
      { name: 'Aliased Oval', names: 'Old Oval;The Oval', city: 'London' },
    );
    expect(document.getElementById('map-tooltip').innerHTML).toContain('Aliased Oval');
  });

  it('renders zeroed counts when the DB returns no rows', async () => {
    DB.queryAll.mockReturnValue([]); // rows[0] undefined → agg stays default
    await showVenueTooltip({ clientX: 0, clientY: 0 }, { venue: 'Empty Ground' });
    const html = document.getElementById('map-tooltip').innerHTML;
    expect(html).toContain('Total matches:');
    expect(html).toContain('Empty Ground');
  });

  it('handles a venue object with neither venue nor name', async () => {
    DB.queryAll.mockReturnValue([{ matches: 1 }]); // agg with only matches → other counts || 0
    await showVenueTooltip({ clientX: 0, clientY: 0 }, { city: 'Nowhere' });
    expect(document.getElementById('map-tooltip')).not.toBeNull();
  });
});

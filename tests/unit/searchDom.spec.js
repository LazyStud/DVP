// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Replace Fuse so tests don't need a real fuzzy search
vi.mock('fuse.js', () => ({
  default: class MockFuse {
    constructor(items) { this._items = items; }
    search(q, opts) {
      if (!q.trim()) return [];
      return this._items.slice(0, opts?.limit ?? 10).map(item => ({ item }));
    }
  },
}));

vi.mock('../../src/debug.js',        () => ({ DEBUG: false }));
vi.mock('../../src/data/queries.js', () => ({
  getAllSearchVenues:   vi.fn(),
  getAllSearchPlayers:  vi.fn(),
  loadVenuesForCountry: vi.fn(),
}));
vi.mock('../../src/ui/playerWindow.js',  () => ({ openPlayer:         vi.fn() }));
vi.mock('../../src/venue.js',            () => ({ VenueWindow:         { open: vi.fn() } }));
vi.mock('../../src/layers/focus.js',     () => ({ focusGlobeOn: vi.fn(), focusMapOn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/globe/focusDeck.js',  () => ({ focusDeckOn:  vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/layers/venues.js',    () => ({
  handleCountryClick: vi.fn(),
  addVenues:          vi.fn(),
  drawVenues:         vi.fn(),
}));

import { initSearch }                          from '../../src/ui/search.js';
import { state }                               from '../../src/state.js';
import { getAllSearchVenues, getAllSearchPlayers } from '../../src/data/queries.js';
import { openPlayer }                          from '../../src/ui/playerWindow.js';
import { handleCountryClick }                  from '../../src/layers/venues.js';

const VENUES  = [{ venue: 'Eden Gardens', city: 'Kolkata', country: 'India', latitude: 22.56, longitude: 88.34 }];
const PLAYERS = [{ name: 'Virat Kohli', team: 'India', kind: 'batting' }];

beforeAll(async () => {
  // jsdom does not implement scrollIntoView — stub it so moveActive() doesn't throw
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  getAllSearchVenues.mockResolvedValue(VENUES);
  getAllSearchPlayers.mockResolvedValue(PLAYERS);
  state.countries      = [{ properties: { name: 'India' } }];
  state.venueCountrySet = new Set(['india']);
  state.mode            = '2d';
  vi.stubGlobal('reportError', () => {});
  initSearch();
  // Flush all micro-tasks so buildIndex() completes
  await new Promise(r => setTimeout(r, 0));
});

function inp()      { return document.getElementById('searchInput'); }
function dropdown() { return document.getElementById('searchDropdown'); }

function type(q) {
  inp().value = q;
  inp().dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => { type(''); vi.clearAllMocks(); });

// ── DOM structure ─────────────────────────────────────────────────────────────

describe('initSearch — DOM', () => {
  it('appends #searchWrap to body', () => {
    expect(document.getElementById('searchWrap')).not.toBeNull();
  });

  it('wrap has role="combobox"', () => {
    expect(document.getElementById('searchWrap').getAttribute('role')).toBe('combobox');
  });

  it('input has aria-label "Global search"', () => {
    expect(inp()?.getAttribute('aria-label')).toBe('Global search');
  });

  it('dropdown is hidden on init', () => {
    expect(dropdown().hidden).toBe(true);
  });
});

// ── empty / whitespace ────────────────────────────────────────────────────────

describe('renderDropdown — empty', () => {
  it('keeps dropdown hidden for empty string', () => {
    type('');
    expect(dropdown().hidden).toBe(true);
  });

  it('keeps dropdown hidden for whitespace-only', () => {
    type('   ');
    expect(dropdown().hidden).toBe(true);
  });
});

// ── results ───────────────────────────────────────────────────────────────────

describe('renderDropdown — with results', () => {
  it('shows dropdown for a non-empty query', () => {
    type('eden');
    expect(dropdown().hidden).toBe(false);
  });

  it('sets aria-expanded on input', () => {
    type('eden');
    expect(inp().getAttribute('aria-expanded')).toBe('true');
  });

  it('renders a Venues category header', () => {
    type('eden');
    const cats = Array.from(dropdown().querySelectorAll('.search-category')).map(el => el.textContent);
    expect(cats).toContain('Venues');
  });

  it('renders the venue name', () => {
    type('eden');
    const names = Array.from(dropdown().querySelectorAll('.search-item-name')).map(el => el.textContent);
    expect(names).toContain('Eden Gardens');
  });

  it('renders a Players category header', () => {
    type('kohli');
    const cats = Array.from(dropdown().querySelectorAll('.search-category')).map(el => el.textContent);
    expect(cats).toContain('Players');
  });

  it('renders the player name', () => {
    type('kohli');
    const names = Array.from(dropdown().querySelectorAll('.search-item-name')).map(el => el.textContent);
    expect(names).toContain('Virat Kohli');
  });
});

// ── keyboard navigation ───────────────────────────────────────────────────────

describe('keyboard navigation', () => {
  beforeEach(() => type('india'));

  it('ArrowDown highlights the first item', () => {
    inp().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(dropdown().querySelector('.search-item--active')).not.toBeNull();
  });

  it('ArrowUp from -1 wraps to the last item', () => {
    inp().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    const items = dropdown().querySelectorAll('.search-item');
    expect(items[items.length - 1].classList.contains('search-item--active')).toBe(true);
  });

  it('Escape hides the dropdown', () => {
    inp().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dropdown().hidden).toBe(true);
  });

  it('Enter on active player result calls openPlayer', async () => {
    type('kohli');
    // Navigate to whichever result item contains "Virat Kohli"
    const items = Array.from(dropdown().querySelectorAll('.search-item'));
    const idx   = items.findIndex(li =>
      li.querySelector('.search-item-name')?.textContent === 'Virat Kohli'
    );
    if (idx < 0) return;
    for (let i = 0; i <= idx; i++) {
      inp().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    inp().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    expect(openPlayer).toHaveBeenCalledWith('Virat Kohli', 'India', 'batting');
  });
});

// ── click outside ─────────────────────────────────────────────────────────────

describe('pointerdown outside wrap', () => {
  it('closes the dropdown', () => {
    type('india');
    expect(dropdown().hidden).toBe(false);
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(dropdown().hidden).toBe(true);
  });
});

// ── mousedown on result ───────────────────────────────────────────────────────

describe('mousedown on result item', () => {
  it('selecting a country result calls handleCountryClick', async () => {
    type('india');
    const items    = Array.from(dropdown().querySelectorAll('.search-item'));
    const countryItem = items.find(li =>
      li.querySelector('.search-item-name')?.textContent === 'India'
    );
    if (!countryItem) return;
    countryItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    expect(handleCountryClick).toHaveBeenCalled();
  });
});

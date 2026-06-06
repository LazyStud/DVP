// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/debug.js',        () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (importOriginal) => ({ ...(await importOriginal()) }));
vi.mock('../../src/ui/exportPng.js', () => ({ exportSvgAsPng: vi.fn() }));
vi.mock('../../src/data/queries.js', () => ({
  getPlayerYearBatting:      vi.fn().mockResolvedValue([]),
  getPlayerFormatBatting:    vi.fn().mockResolvedValue([]),
  getPlayerTopVenues:        vi.fn().mockResolvedValue([]),
  getPlayerYearBowling:      vi.fn().mockResolvedValue([]),
  getPlayerFormatBowling:    vi.fn().mockResolvedValue([]),
  getPlayerTopVenuesBowling: vi.fn().mockResolvedValue([]),
}));

import { openPlayer, close, togglePlayer } from '../../src/ui/playerWindow.js';
import { exportSvgAsPng }                  from '../../src/ui/exportPng.js';
import {
  getPlayerYearBatting, getPlayerFormatBatting, getPlayerTopVenues,
  getPlayerYearBowling, getPlayerFormatBowling, getPlayerTopVenuesBowling,
} from '../../src/data/queries.js';

// DOM set up once — never replaced — to avoid detaching module refs.
// innerHTML is safe: hardcoded literal fixture, not user-supplied.
beforeAll(() => {
  document.body.innerHTML = '<div id="backdrop" hidden></div>';
});

beforeEach(() => {
  vi.clearAllMocks();
  // All query mocks return [] → no D3 rendering, no CDN global needed
  getPlayerYearBatting.mockResolvedValue([]);
  getPlayerFormatBatting.mockResolvedValue([]);
  getPlayerTopVenues.mockResolvedValue([]);
  getPlayerYearBowling.mockResolvedValue([]);
  getPlayerFormatBowling.mockResolvedValue([]);
  getPlayerTopVenuesBowling.mockResolvedValue([]);
  try { close(); } catch (_) { /* ignore if panel not yet created */ }
});

afterEach(() => { vi.useRealTimers(); });

const flush = () => Promise.resolve().then(() => Promise.resolve());

// ── openPlayer() ──────────────────────────────────────────────────────────────

describe('openPlayer()', () => {
  it('creates #player-window panel', () => {
    openPlayer('Virat Kohli', 'IND', 'batting');
    expect(document.getElementById('player-window')).not.toBeNull();
  });

  it('sets the player name in the title', () => {
    openPlayer('Steve Smith', 'AUS', 'batting');
    expect(document.querySelector('.player-title')?.textContent).toBe('Steve Smith');
  });

  it('sets the team badge text', () => {
    openPlayer('Rohit Sharma', 'IND', 'batting');
    expect(document.querySelector('.player-badge')?.textContent).toBe('IND');
  });

  it('hides badge when team is empty string', () => {
    openPlayer('Unknown', '', 'batting');
    expect(document.querySelector('.player-badge')?.style.display).toBe('none');
  });

  it('adds "open" class to the panel', () => {
    openPlayer('Player A', 'ENG', 'batting');
    expect(document.getElementById('player-window').classList.contains('open')).toBe(true);
  });

  it('dispatches playerwindow:open custom event', () => {
    let fired = false;
    window.addEventListener('playerwindow:open', () => { fired = true; }, { once: true });
    openPlayer('Player B', 'AUS', 'batting');
    expect(fired).toBe(true);
  });

  it('resets format filter to "All" on each open', async () => {
    openPlayer('Player C', 'IND', 'batting');
    const t20Btn = Array.from(document.querySelectorAll('.player-fmt-btn'))
      .find(b => b.dataset.fmt === 't20');
    t20Btn?.click();
    await flush();
    openPlayer('Player C', 'IND', 'batting');
    const allBtn = Array.from(document.querySelectorAll('.player-fmt-btn'))
      .find(b => b.dataset.fmt === 'all');
    expect(allBtn?.classList.contains('active')).toBe(true);
  });

  it('activates the bowling kind button when kind="bowling"', () => {
    openPlayer('Pat Cummins', 'AUS', 'bowling');
    const bowlBtn = Array.from(document.querySelectorAll('.player-kind-btn'))
      .find(b => b.dataset.kind === 'bowling');
    expect(bowlBtn?.classList.contains('active')).toBe(true);
  });

  it('renders "No batting data" in SVG when query returns empty', async () => {
    openPlayer('Ghost Player', 'IND', 'batting');
    await flush();
    const svgHtml = document.querySelector('svg[data-role="player-chart"]')?.innerHTML || '';
    expect(svgHtml).toContain('No batting data');
  });
});

// ── close() ───────────────────────────────────────────────────────────────────

describe('close()', () => {
  it('removes "open" class', () => {
    vi.useFakeTimers();
    openPlayer('Test Player', 'IND', 'batting');
    close();
    expect(document.getElementById('player-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });

  it('dispatches playerwindow:close event', () => {
    let fired = false;
    window.addEventListener('playerwindow:close', () => { fired = true; }, { once: true });
    openPlayer('P', 'IND', 'batting');
    close();
    expect(fired).toBe(true);
  });

  it('is a no-op when already closed', () => {
    expect(() => close()).not.toThrow();
  });
});

// ── togglePlayer() ────────────────────────────────────────────────────────────

describe('togglePlayer()', () => {
  it('opens when not currently open', () => {
    togglePlayer('Virat Kohli', 'IND', 'batting');
    expect(document.getElementById('player-window').classList.contains('open')).toBe(true);
  });

  it('closes when the same player is already open', () => {
    vi.useFakeTimers();
    openPlayer('Virat Kohli', 'IND', 'batting');
    togglePlayer('Virat Kohli', 'IND', 'batting');
    expect(document.getElementById('player-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });

  it('switches to a different player when panel is open', () => {
    openPlayer('Virat Kohli', 'IND', 'batting');
    togglePlayer('Steve Smith', 'AUS', 'batting');
    expect(document.querySelector('.player-title')?.textContent).toBe('Steve Smith');
  });
});

// ── tab navigation ────────────────────────────────────────────────────────────

describe('tab navigation', () => {
  it('Donut tab renders "No format data" for batting', async () => {
    openPlayer('Virat Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    expect(document.querySelector('svg[data-role="player-chart"]')?.innerHTML)
      .toContain('No format data');
  });

  it('Venues tab renders "No venue data" for batting', async () => {
    openPlayer('Virat Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="venues"]')?.click();
    await flush();
    expect(document.querySelector('svg[data-role="player-chart"]')?.innerHTML)
      .toContain('No venue data');
  });

  it('Line tab is active by default', () => {
    openPlayer('Virat Kohli', 'IND', 'batting');
    expect(document.querySelector('.player-tab[data-view="line"]')?.classList.contains('active')).toBe(true);
  });
});

// ── kind toggle ───────────────────────────────────────────────────────────────

describe('kind toggle (Batting / Bowling)', () => {
  it('switching to bowling renders "No bowling data"', async () => {
    openPlayer('Pat Cummins', 'AUS', 'batting');
    Array.from(document.querySelectorAll('.player-kind-btn'))
      .find(b => b.dataset.kind === 'bowling')?.click();
    await flush();
    expect(document.querySelector('svg[data-role="player-chart"]')?.innerHTML)
      .toContain('No bowling data');
  });

  it('bowling donut tab shows "No format data"', async () => {
    openPlayer('P Cummins', 'AUS', 'bowling');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    expect(document.querySelector('svg[data-role="player-chart"]')?.innerHTML)
      .toContain('No format data');
  });

  it('bowling venues tab shows "No venue data"', async () => {
    openPlayer('P Cummins', 'AUS', 'bowling');
    document.querySelector('.player-tab[data-view="venues"]')?.click();
    await flush();
    expect(document.querySelector('svg[data-role="player-chart"]')?.innerHTML)
      .toContain('No venue data');
  });
});

// ── format filter ─────────────────────────────────────────────────────────────

describe('format filter chips', () => {
  it('clicking a format filter marks it active', async () => {
    openPlayer('V Kohli', 'IND', 'batting');
    const odiBtn = Array.from(document.querySelectorAll('.player-fmt-btn'))
      .find(b => b.dataset.fmt === 'odi');
    odiBtn?.click();
    await flush();
    expect(odiBtn?.classList.contains('active')).toBe(true);
  });

  it('format filter bar is hidden on Donut tab', async () => {
    openPlayer('V Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    expect(document.querySelector('.player-fmtbar')?.style.display).toBe('none');
  });
});

// ── keyboard / dismissal ──────────────────────────────────────────────────────

describe('keyboard / dismissal', () => {
  it('Escape closes the panel', () => {
    vi.useFakeTimers();
    openPlayer('V Kohli', 'IND', 'batting');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('player-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });

  it('pointerdown outside panel closes it', () => {
    vi.useFakeTimers();
    openPlayer('V Kohli', 'IND', 'batting');
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.getElementById('player-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });
});

// ── export button ─────────────────────────────────────────────────────────────

describe('export PNG button', () => {
  it('calls exportSvgAsPng when export button is clicked', () => {
    openPlayer('V Kohli', 'IND', 'batting');
    document.querySelector('.player-export-btn')?.click();
    expect(exportSvgAsPng).toHaveBeenCalled();
  });

  it('appends a format suffix to the export title when a non-"all" format is active', async () => {
    openPlayer('V Kohli', 'IND', 'batting');
    Array.from(document.querySelectorAll('.player-fmt-btn'))
      .find(b => b.dataset.fmt === 'test')?.click();
    await flush();
    exportSvgAsPng.mockClear();
    document.querySelector('.player-export-btn')?.click();
    expect(exportSvgAsPng).toHaveBeenCalled();
    const title = exportSvgAsPng.mock.calls[0][2].title;
    expect(title).toContain('TEST');
  });

  it('does not export when the chart SVG is missing', () => {
    openPlayer('V Kohli', 'IND', 'batting');
    const svg = document.querySelector('svg[data-role="player-chart"]');
    const parent = svg?.parentNode;
    svg?.remove();
    exportSvgAsPng.mockClear();
    document.querySelector('.player-export-btn')?.click();
    expect(exportSvgAsPng).not.toHaveBeenCalled();
    // Panel is shared across tests — restore the chart SVG so later tests still see it.
    if (svg && parent) parent.appendChild(svg);
  });
});

// ── Event-delegation guards & misc fallbacks ─────────────────────────────────

describe('player window guards', () => {
  it('ignores tab-bar clicks that miss a tab button', () => {
    openPlayer('V Kohli', 'IND', 'batting');
    const tabBar = document.querySelector('.player-tabbar');
    expect(() => tabBar?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('ignores kind-bar clicks that miss a kind button', () => {
    openPlayer('V Kohli', 'IND', 'batting');
    const kindBar = document.querySelector('.player-kindbar');
    expect(() => kindBar?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('ignores format-bar clicks that miss a format button', () => {
    openPlayer('V Kohli', 'IND', 'batting');
    const fmtBar = document.querySelector('.player-fmtbar');
    expect(() => fmtBar?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('falls back to the default year range when state.yearRange is null', async () => {
    const { state } = await import('../../src/state.js');
    const prev = state.yearRange;
    state.yearRange = null;
    openPlayer('V Kohli', 'IND', 'batting');
    expect(document.querySelector('.player-yearrange')?.textContent).toContain('–');
    state.yearRange = prev;
  });

  it('uses the "Player" placeholder name in the export filename when the player name is empty', () => {
    openPlayer('', 'IND', 'batting'); // currentPlayer falsy → 'Player'
    exportSvgAsPng.mockClear();
    document.querySelector('.player-export-btn')?.click();
    expect(exportSvgAsPng).toHaveBeenCalled();
    expect(exportSvgAsPng.mock.calls[0][1]).toContain('player');
  });
});

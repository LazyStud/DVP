// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/debug.js',        () => ({ DEBUG: false }));
vi.mock('../../src/data/queries.js', () => ({
  getBattingLeaderboard: vi.fn(),
  getBowlingLeaderboard: vi.fn(),
}));
vi.mock('../../src/ui/playerWindow.js', () => ({ openPlayer: vi.fn() }));

// d3.ascending / descending used by makeComparator
vi.stubGlobal('d3', {
  ascending:  (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  descending: (a, b) => (b < a ? -1 : b > a ? 1 : 0),
});

let openOverlay, closeOverlay, toggleOverlay, setActiveTab, wireLeaderboardEvents, renderLeaderboard;

// innerHTML is safe: hardcoded literal fixture, not user-supplied.
beforeAll(async () => {
  document.body.innerHTML = `
    <div id="leaderboardOverlay" hidden aria-hidden="true"></div>
    <div id="backdrop" hidden></div>
    <button id="menuBtn"></button>
    <button id="closeOverlay"></button>
    <div id="tabpanel" tabindex="-1"></div>
    <button id="tab-batting" data-kind="batting"></button>
    <button id="tab-bowling" data-kind="bowling"></button>
  `;
  ({ openOverlay, closeOverlay, toggleOverlay, setActiveTab, wireLeaderboardEvents, renderLeaderboard } =
    await import('../../src/ui/leaderboard.js'));
});

const { getBattingLeaderboard, getBowlingLeaderboard } = await import('../../src/data/queries.js');

beforeEach(() => {
  vi.clearAllMocks();
  // Default: queries throw → fallback demo data is used
  getBattingLeaderboard.mockRejectedValue(new Error('no db'));
  getBowlingLeaderboard.mockRejectedValue(new Error('no db'));
  // Reset overlay state
  document.getElementById('leaderboardOverlay').hidden = true;
  document.getElementById('backdrop').hidden = true;
  document.getElementById('leaderboardOverlay').classList.remove('open');
  document.getElementById('backdrop').classList.remove('open');
});

afterEach(() => { vi.useRealTimers(); });

// ── openOverlay / closeOverlay / toggleOverlay ────────────────────────────────

describe('openOverlay', () => {
  it('makes overlay visible', async () => {
    openOverlay();
    expect(document.getElementById('leaderboardOverlay').hidden).toBe(false);
  });

  it('adds "open" class to overlay and backdrop', async () => {
    openOverlay();
    expect(document.getElementById('leaderboardOverlay').classList.contains('open')).toBe(true);
    expect(document.getElementById('backdrop').classList.contains('open')).toBe(true);
  });

  it('sets aria-expanded on menuBtn', () => {
    openOverlay();
    expect(document.getElementById('menuBtn').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('closeOverlay', () => {
  it('removes open class immediately', () => {
    vi.useFakeTimers();
    openOverlay();
    closeOverlay();
    expect(document.getElementById('leaderboardOverlay').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });

  it('hides overlay and backdrop after 180 ms', () => {
    vi.useFakeTimers();
    openOverlay();
    closeOverlay();
    vi.advanceTimersByTime(180);
    expect(document.getElementById('leaderboardOverlay').hidden).toBe(true);
    expect(document.getElementById('backdrop').hidden).toBe(true);
  });
});

describe('toggleOverlay', () => {
  it('opens when currently hidden', () => {
    document.getElementById('leaderboardOverlay').hidden = true;
    toggleOverlay();
    expect(document.getElementById('leaderboardOverlay').hidden).toBe(false);
  });

  it('closes when currently visible', () => {
    vi.useFakeTimers();
    document.getElementById('leaderboardOverlay').hidden = false;
    toggleOverlay();
    expect(document.getElementById('leaderboardOverlay').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });
});

// ── setActiveTab ─────────────────────────────────────────────────────────────

describe('setActiveTab', () => {
  it('adds "active" class to the matching tab button', async () => {
    await setActiveTab('batting');
    expect(document.getElementById('tab-batting').classList.contains('active')).toBe(true);
  });

  it('removes "active" from the other tab', async () => {
    await setActiveTab('batting');
    await setActiveTab('bowling');
    expect(document.getElementById('tab-batting').classList.contains('active')).toBe(false);
    expect(document.getElementById('tab-bowling').classList.contains('active')).toBe(true);
  });
});

// ── wireLeaderboardEvents ─────────────────────────────────────────────────────

describe('wireLeaderboardEvents', () => {
  it('menuBtn click toggles overlay', () => {
    wireLeaderboardEvents();
    document.getElementById('leaderboardOverlay').hidden = true;
    document.getElementById('menuBtn').click();
    expect(document.getElementById('leaderboardOverlay').hidden).toBe(false);
  });
});

// ── renderLeaderboard ─────────────────────────────────────────────────────────

describe('renderLeaderboard (batting fallback)', () => {
  it('renders a table with at most 10 rows', async () => {
    await renderLeaderboard('batting');
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(10);
  });

  it('renders format filter buttons', async () => {
    await renderLeaderboard('batting');
    const btns = document.querySelectorAll('#tabpanel .lb-fmt-btn');
    expect(btns.length).toBe(4); // all, odi, t20, test
  });

  it('renders a meta line mentioning batting', async () => {
    await renderLeaderboard('batting');
    expect(document.querySelector('#tabpanel .lb-meta')?.textContent).toContain('batting');
  });
});

describe('renderLeaderboard (bowling fallback)', () => {
  it('renders bowling fallback rows', async () => {
    await renderLeaderboard('bowling');
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('meta line mentions bowling', async () => {
    await renderLeaderboard('bowling');
    expect(document.querySelector('#tabpanel .lb-meta')?.textContent).toContain('bowling');
  });
});

describe('renderLeaderboard (live data)', () => {
  it('uses query results when available', async () => {
    getBattingLeaderboard.mockResolvedValue([
      { player: 'Rohit Sharma', team: 'IND', runs: 1200, sr: 145, avg: 52,
        matches: 30, balls: 0, hundreds: 4, fifties: 8, best: '118' },
    ]);
    await renderLeaderboard('batting');
    expect(document.querySelector('#tabpanel tbody')?.textContent).toContain('Rohit Sharma');
  });
});

describe('column sort', () => {
  it('clicking a sortable column header re-renders the table', async () => {
    await renderLeaderboard('batting');
    const srTh = document.querySelector('#tabpanel th[data-col="sr"]');
    const rowsBefore = document.querySelectorAll('#tabpanel tbody tr').length;
    srTh?.click();
    expect(document.querySelectorAll('#tabpanel tbody tr').length).toBe(rowsBefore);
  });
});

describe('format filter inside leaderboard', () => {
  it('clicking a format filter button re-fetches and re-renders rows', async () => {
    await renderLeaderboard('batting');
    const odiBtn = Array.from(document.querySelectorAll('#tabpanel .lb-fmt-btn'))
      .find(b => b.dataset.format === 'odi');
    // Click ODI filter — triggers the async click handler (fetchRows + buildTable)
    odiBtn?.click();
    await Promise.resolve(); await Promise.resolve(); // flush async fetch
    expect(document.querySelector('#tabpanel .lb-meta')?.textContent).toContain('ODI');
  });

  it('clicking a format filter updates aria-pressed', async () => {
    await renderLeaderboard('batting');
    const t20Btn = Array.from(document.querySelectorAll('#tabpanel .lb-fmt-btn'))
      .find(b => b.dataset.format === 't20');
    t20Btn?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(t20Btn?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('tbody player row click', () => {
  it('clicking a live-data player row calls openPlayer', async () => {
    getBattingLeaderboard.mockResolvedValue([
      { player: 'Rohit Sharma', team: 'IND', runs: 1100, sr: 142, avg: 50,
        matches: 25, balls: 0, hundreds: 3, fifties: 7, best: '114' },
    ]);
    await renderLeaderboard('batting');
    const tbody = document.querySelector('#tabpanel tbody');
    const firstRow = tbody?.querySelector('tr');
    // Simulate click on the first td inside the row (which fires on the row)
    firstRow?.querySelector('td')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const { openPlayer } = await import('../../src/ui/playerWindow.js');
    expect(openPlayer).toHaveBeenCalledWith('Rohit Sharma', 'IND', 'batting');
  });

  it('clicking a demo fallback row (Player A) does NOT call openPlayer', async () => {
    getBattingLeaderboard.mockRejectedValue(new Error('no db')); // forces fallback
    await renderLeaderboard('batting');
    const { openPlayer } = await import('../../src/ui/playerWindow.js');
    openPlayer.mockClear();
    const firstRow = document.querySelector('#tabpanel tbody tr');
    firstRow?.querySelector('td')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openPlayer).not.toHaveBeenCalled();
  });
});

// ── parseBestField / makeComparator (sort by "best" column) ──────────────────
// These private helpers are exercised via the table's th[data-col="best"] click.

describe('sort by best column', () => {
  it('clicking "best" header sorts bowling rows by wicket count', async () => {
    getBowlingLeaderboard.mockResolvedValue([
      { player: 'Bowler X', team: 'IND', wkts: 20, eco: 6.0, avg: 25, matches: 10,
        five_wkts: 1, best: '5/23' },
      { player: 'Bowler Y', team: 'AUS', wkts: 15, eco: 5.5, avg: 28, matches: 9,
        five_wkts: 0, best: 4 },
      { player: 'Bowler Z', team: 'ENG', wkts: 10, eco: 7.0, avg: 30, matches: 8,
        five_wkts: 0, best: 'N/A' },
    ]);
    await renderLeaderboard('bowling');
    const bestTh = document.querySelector('#tabpanel th[data-col="best"]');
    bestTh?.click();
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].textContent).toContain('Bowler X');
  });

  it('clicking "best" header twice reverses sort direction', async () => {
    getBowlingLeaderboard.mockResolvedValue([
      { player: 'Alpha', team: 'IND', wkts: 20, eco: 5.5, avg: 22, matches: 10,
        five_wkts: 2, best: '6/30' },
      { player: 'Beta',  team: 'AUS', wkts: 12, eco: 6.2, avg: 28, matches: 8,
        five_wkts: 0, best: '3/18' },
    ]);
    await renderLeaderboard('bowling');
    const bestTh = document.querySelector('#tabpanel th[data-col="best"]');
    bestTh?.click();
    bestTh?.click();
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows[0].textContent).toContain('Beta');
  });
});

// ── Sort other columns ───────────────────────────────────────────────────────

describe('sort by other columns', () => {
  // The initial sortState defaults to {col:'runs', dir:'desc'} for batting.
  // So clicking "runs" the first time flips to asc (Low first).
  // Clicking "runs" again flips back to desc (High first).
  it('clicking "runs" header first time flips from initial desc to asc', async () => {
    getBattingLeaderboard.mockResolvedValue([
      { player: 'Low',  team: 'A', runs: 100, sr: 50, avg: 10, matches: 5, balls: 0, hundreds: 0, fifties: 0, best: '10' },
      { player: 'High', team: 'B', runs: 500, sr: 80, avg: 50, matches: 10, balls: 0, hundreds: 2, fifties: 1, best: '100' },
    ]);
    await renderLeaderboard('batting');
    const runsTh = document.querySelector('#tabpanel th[data-col="runs"]');
    runsTh?.click(); // flips desc→asc
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows[0].textContent).toContain('Low');
  });

  it('clicking "runs" header twice flips back to desc', async () => {
    getBattingLeaderboard.mockResolvedValue([
      { player: 'Low',  team: 'A', runs: 100, sr: 50, avg: 10, matches: 5, balls: 0, hundreds: 0, fifties: 0, best: '10' },
      { player: 'High', team: 'B', runs: 500, sr: 80, avg: 50, matches: 10, balls: 0, hundreds: 2, fifties: 1, best: '100' },
    ]);
    await renderLeaderboard('batting');
    const runsTh = document.querySelector('#tabpanel th[data-col="runs"]');
    runsTh?.click(); // asc
    runsTh?.click(); // desc
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows[0].textContent).toContain('High');
  });

  it('clicking "matches" header sorts correctly', async () => {
    getBattingLeaderboard.mockResolvedValue([
      { player: 'A', team: 'X', runs: 300, matches: 20, sr: 60, avg: 30, balls: 0, hundreds: 0, fifties: 0, best: '50' },
      { player: 'B', team: 'Y', runs: 200, matches: 10, sr: 50, avg: 20, balls: 0, hundreds: 0, fifties: 0, best: '30' },
    ]);
    await renderLeaderboard('batting');
    const mTh = document.querySelector('#tabpanel th[data-col="matches"]');
    mTh?.click();
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows[0].textContent).toContain('A'); // 20 matches first
  });
});

// ── leaderboard row click for bowler ─────────────────────────────────────────

describe('tbody player row click — bowler', () => {
  it('clicking a live-data bowler row calls openPlayer', async () => {
    getBowlingLeaderboard.mockResolvedValue([
      { player: 'P Cummins', team: 'AUS', wkts: 30, eco: 5.5, avg: 22,
        matches: 15, five_wkts: 2, best: '5/23' },
    ]);
    await renderLeaderboard('bowling');
    const tbody = document.querySelector('#tabpanel tbody');
    const firstRow = tbody?.querySelector('tr');
    firstRow?.querySelector('td')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const { openPlayer } = await import('../../src/ui/playerWindow.js');
    expect(openPlayer).toHaveBeenCalledWith('P Cummins', 'AUS', 'bowling');
  });

  it('clicking demo fallback bowler row (Bowler A) does NOT call openPlayer', async () => {
    getBowlingLeaderboard.mockRejectedValue(new Error('no db'));
    await renderLeaderboard('bowling');
    const { openPlayer } = await import('../../src/ui/playerWindow.js');
    openPlayer.mockClear();
    const firstRow = document.querySelector('#tabpanel tbody tr');
    firstRow?.querySelector('td')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openPlayer).not.toHaveBeenCalled();
  });
});

// ── Branch coverage: guards, fallbacks and edge formatting ───────────────────

describe('leaderboard branch coverage', () => {
  it('stops/starts the globe spin around open/close in globe mode', async () => {
    vi.useFakeTimers();
    const { state } = await import('../../src/state.js');
    state.mode = 'globe';
    state.countryFocused = false;
    state.stopSpin = vi.fn();
    state.startSpin = vi.fn();
    openOverlay();
    expect(state.stopSpin).toHaveBeenCalled();
    closeOverlay();
    expect(state.startSpin).toHaveBeenCalled();
    vi.runAllTimers();
    state.mode = 'map';
    state.stopSpin = null;
    state.startSpin = null;
  });

  it('falls back to demo data when the query resolves null (batting)', async () => {
    getBattingLeaderboard.mockResolvedValue(null);
    await renderLeaderboard('batting');
    expect(document.querySelectorAll('#tabpanel tbody tr').length).toBeGreaterThan(0);
  });

  it('falls back to demo data when the query resolves null (bowling)', async () => {
    getBowlingLeaderboard.mockResolvedValue(null);
    await renderLeaderboard('bowling');
    expect(document.querySelectorAll('#tabpanel tbody tr').length).toBeGreaterThan(0);
  });

  it('uses the default year range when state.yearRange is missing', async () => {
    const { state } = await import('../../src/state.js');
    const prev = state.yearRange;
    state.yearRange = null;
    getBattingLeaderboard.mockResolvedValue([
      { player: 'X', team: 'IND', runs: 100, matches: 5 },
    ]);
    await renderLeaderboard('batting');
    expect(document.querySelector('#tabpanel tbody')?.textContent).toContain('X');
    state.yearRange = prev;
  });

  it('coerces a non-string selectedFormat to "all"', async () => {
    const { state } = await import('../../src/state.js');
    const prev = state.selectedFormat;
    state.selectedFormat = 123; // not a string → fmtDefault = 'all'
    getBattingLeaderboard.mockResolvedValue([{ player: 'Y', team: 'AUS', runs: 50 }]);
    await renderLeaderboard('batting');
    expect(document.querySelector('#tabpanel .lb-meta')?.textContent).toContain('ALL');
    state.selectedFormat = prev;
  });

  it('treats an empty-string selectedFormat as "all"', async () => {
    const { state } = await import('../../src/state.js');
    const prev = state.selectedFormat;
    state.selectedFormat = ''; // string but falsy → 'all'
    getBattingLeaderboard.mockResolvedValue([{ player: 'Z', team: 'ENG', runs: 70 }]);
    await renderLeaderboard('batting');
    expect(document.querySelector('#tabpanel .lb-meta')?.textContent).toContain('ALL');
    state.selectedFormat = prev;
  });

  it('renders a row whose optional fields are all missing', async () => {
    getBattingLeaderboard.mockResolvedValue([{ player: 'Sparse' }]); // no team/runs/best/etc
    await renderLeaderboard('batting');
    const row = document.querySelector('#tabpanel tbody tr');
    expect(row.textContent).toContain('Sparse');
    expect(row.textContent).toContain('0'); // missing numeric fields default to 0
  });

  it('handles an unknown kind (no default sort column)', async () => {
    getBowlingLeaderboard.mockResolvedValue([{ player: 'Keeper', team: 'SA', wkts: 3 }]);
    await renderLeaderboard('fielding'); // not batting/bowling → sortState.col = null
    expect(document.querySelector('#tabpanel tbody')?.textContent).toContain('Keeper');
  });

  it('returns 0 from the comparator when a sorted value is null', async () => {
    getBattingLeaderboard.mockResolvedValue([
      { player: 'NullSR', team: 'A', runs: 100, sr: null, avg: 10, matches: 5, balls: 0, hundreds: 0, fifties: 0, best: '10' },
      { player: 'HasSR',  team: 'B', runs: 200, sr: 90,   avg: 20, matches: 6, balls: 0, hundreds: 0, fifties: 0, best: '20' },
    ]);
    await renderLeaderboard('batting');
    const srTh = document.querySelector('#tabpanel th[data-col="sr"]');
    srTh?.click(); // comparator hits the av==null short-circuit on the null row
    expect(document.querySelectorAll('#tabpanel tbody tr').length).toBe(2);
  });

  it('sorts by "best" across null, empty and slash-less values', async () => {
    getBowlingLeaderboard.mockResolvedValue([
      { player: 'NullBest', team: 'A', wkts: 5,  eco: 6, avg: 25, matches: 4, five_wkts: 0, best: null },
      { player: 'EmptyBest', team: 'B', wkts: 6, eco: 5, avg: 24, matches: 5, five_wkts: 0, best: '   ' },
      { player: 'NoSlash',  team: 'C', wkts: 7,  eco: 4, avg: 23, matches: 6, five_wkts: 0, best: '5' },
    ]);
    await renderLeaderboard('bowling');
    const bestTh = document.querySelector('#tabpanel th[data-col="best"]');
    bestTh?.click();
    expect(document.querySelectorAll('#tabpanel tbody tr').length).toBe(3);
  });

  it('ignores a click that is not on a row (tbody guard)', async () => {
    getBattingLeaderboard.mockResolvedValue([{ player: 'Real Player', team: 'IND', runs: 100, matches: 5 }]);
    await renderLeaderboard('batting');
    const { openPlayer } = await import('../../src/ui/playerWindow.js');
    openPlayer.mockClear();
    const tbody = document.querySelector('#tabpanel tbody');
    tbody?.dispatchEvent(new MouseEvent('click', { bubbles: true })); // target = tbody, no closest('tr')
    expect(openPlayer).not.toHaveBeenCalled();
  });

  it('ignores a click on a non-sortable header (no data-col)', async () => {
    getBattingLeaderboard.mockResolvedValue([{ player: 'P', team: 'IND', runs: 100, matches: 5 }]);
    await renderLeaderboard('batting');
    const rankTh = document.querySelector('#tabpanel thead th'); // first th is '#', no data-col
    expect(() => rankTh?.click()).not.toThrow();
  });

  it('ignores a header click that lands outside any th (thead guard)', async () => {
    getBattingLeaderboard.mockResolvedValue([{ player: 'P', team: 'IND', runs: 100, matches: 5 }]);
    await renderLeaderboard('batting');
    const thead = document.querySelector('#tabpanel thead');
    expect(() => thead?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});

// ── Escape key closes leaderboard ────────────────────────────────────────────

describe('Escape key closes leaderboard', () => {
  it('pressing Escape hides the overlay', () => {
    wireLeaderboardEvents();
    openOverlay();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('leaderboardOverlay').classList.contains('open')).toBe(false);
  });

  it('pressing Escape when overlay is already hidden does not throw', () => {
    wireLeaderboardEvents();
    document.getElementById('leaderboardOverlay').hidden = true;
    expect(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    ).not.toThrow();
  });
});

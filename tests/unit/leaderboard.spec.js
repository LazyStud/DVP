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
        five_wkts: 1, best: '5/23' },   // numeric best: 5/23
      { player: 'Bowler Y', team: 'AUS', wkts: 15, eco: 5.5, avg: 28, matches: 9,
        five_wkts: 0, best: 4 },         // numeric best (typeof === 'number')
      { player: 'Bowler Z', team: 'ENG', wkts: 10, eco: 7.0, avg: 30, matches: 8,
        five_wkts: 0, best: 'N/A' },     // won't match digit regex → {wk:0,runs:0}
    ]);
    await renderLeaderboard('bowling');
    const bestTh = document.querySelector('#tabpanel th[data-col="best"]');
    bestTh?.click(); // sort desc by best
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    // After sort, first row should be the one with highest wk in "best"
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
    bestTh?.click(); // desc
    bestTh?.click(); // asc
    const rows = document.querySelectorAll('#tabpanel tbody tr');
    // asc → lowest wk first → Beta (3) before Alpha (6)
    expect(rows[0].textContent).toContain('Beta');
  });
});

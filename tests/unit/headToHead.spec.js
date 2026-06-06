// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/debug.js',        () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (importOriginal) => ({ ...(await importOriginal()) }));
vi.mock('../../src/data/queries.js', () => ({
  getHeadToHeadStats:      vi.fn(),
  getHeadToHeadBiggestWins: vi.fn(),
  getHeadToHeadTopPlayers:  vi.fn(),
}));

import { open, close, toggle }                                       from '../../src/ui/headToHead.js';
import { getHeadToHeadStats, getHeadToHeadBiggestWins, getHeadToHeadTopPlayers } from '../../src/data/queries.js';

const STATS       = { winsA: 10, winsB: 8, draws: 2, noResult: 1, total: 21 };
const BIG_WINS    = {
  bestA: [{ winner: 'Australia', result: 'runs',    margin: 200, date: '2020-01-15', venue: 'MCG' }],
  bestB: [{ winner: 'India',     result: 'wickets', margin: 9,   date: '2021-03-10', venue: "Lord's" }],
};
const TOP_PLAYERS = {
  batters: [{ player: 'V Kohli', team: 'India',     runs: 500, matches: 10 }],
  bowlers: [{ player: 'P Cummins', team: 'Australia', wickets: 15, matches: 10 }],
};

// DOM set up once — replacing it would detach refs held by ensurePanel()
// innerHTML is safe: hardcoded literal fixture
beforeAll(() => {
  document.body.innerHTML = '<div id="backdrop" hidden></div>';
});

beforeEach(() => {
  vi.clearAllMocks();
  getHeadToHeadStats.mockResolvedValue(STATS);
  getHeadToHeadBiggestWins.mockResolvedValue(BIG_WINS);
  getHeadToHeadTopPlayers.mockResolvedValue(TOP_PLAYERS);
  // ensure closed between tests
  try { close(); } catch (_) { /* ignore if not yet open */ }
  // reset selects to two different teams — the same-team-guard test mutates them
  const selects = document.querySelectorAll('.h2h-select');
  if (selects[0]) selects[0].value = 'Australia';
  if (selects[1]) selects[1].value = 'India';
});

afterEach(() => { vi.useRealTimers(); });

// ── open() ────────────────────────────────────────────────────────────────────

describe('open()', () => {
  it('creates #h2h-window panel', () => {
    open();
    expect(document.getElementById('h2h-window')).not.toBeNull();
  });

  it('shows the backdrop', () => {
    open();
    expect(document.getElementById('backdrop').hidden).toBe(false);
  });

  it('adds "open" class to panel and backdrop', () => {
    open();
    expect(document.getElementById('h2h-window').classList.contains('open')).toBe(true);
    expect(document.getElementById('backdrop').classList.contains('open')).toBe(true);
  });

  it('renders "Head-to-Head" title', () => {
    open();
    expect(document.querySelector('.h2h-title')?.textContent).toBe('Head-to-Head');
  });

  it('populates team select options (MAJOR_TEAMS)', () => {
    open();
    const opts = document.querySelectorAll('.h2h-select option');
    expect(opts.length).toBeGreaterThanOrEqual(12); // MAJOR_TEAMS has 12 entries, two selects
  });

  it('renders four format filter buttons (All/Test/ODI/T20)', () => {
    open();
    expect(document.querySelectorAll('.h2h-fmt-btn').length).toBe(4);
  });

  it('shows placeholder prompt text', () => {
    open();
    expect(document.querySelector('.h2h-content')?.textContent).toContain('Select two teams');
  });

  it('does not re-populate selects on second open (options already present)', () => {
    open();
    const countFirst = document.querySelectorAll('.h2h-select:first-of-type option').length;
    close();
    open();
    expect(document.querySelectorAll('.h2h-select:first-of-type option').length).toBe(countFirst);
  });
});

// ── close() ───────────────────────────────────────────────────────────────────

describe('close()', () => {
  it('removes "open" class immediately', () => {
    vi.useFakeTimers();
    open();
    close();
    expect(document.getElementById('h2h-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });

  it('hides the panel and backdrop after 180 ms', () => {
    vi.useFakeTimers();
    open();
    close();
    vi.advanceTimersByTime(180);
    expect(document.getElementById('h2h-window').style.display).toBe('none');
    expect(document.getElementById('backdrop').hidden).toBe(true);
  });

  it('is a no-op when already closed', () => {
    expect(() => close()).not.toThrow();
  });
});

// ── toggle() ──────────────────────────────────────────────────────────────────

describe('toggle()', () => {
  it('opens when panel is closed', () => {
    toggle();
    expect(document.getElementById('h2h-window').classList.contains('open')).toBe(true);
  });

  it('closes when panel is open', () => {
    vi.useFakeTimers();
    open();
    toggle();
    expect(document.getElementById('h2h-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });
});

// ── format buttons ────────────────────────────────────────────────────────────

describe('format filter buttons', () => {
  it('clicking a non-active format button sets it as active', () => {
    open();
    const btns = document.querySelectorAll('.h2h-fmt-btn');
    const testBtn = Array.from(btns).find(b => b.dataset.format === 'test');
    testBtn?.click();
    expect(testBtn?.classList.contains('active')).toBe(true);
  });

  it('clicking the same button twice does not re-trigger loadComparison (no lastResults guard)', () => {
    open();
    const allBtn = Array.from(document.querySelectorAll('.h2h-fmt-btn')).find(b => b.dataset.format === 'all');
    allBtn?.click(); // already active — onFormatClick guard: same key → return
    expect(getHeadToHeadStats).not.toHaveBeenCalled();
  });

  it('clicking a different format button triggers loadComparison when lastResults is set', async () => {
    open();
    // Trigger a successful comparison first to set lastResults
    const goBtn = document.querySelector('.h2h-go-btn');
    goBtn?.click();
    await Promise.resolve(); await Promise.resolve();
    const callsBefore = getHeadToHeadStats.mock.calls.length;

    // Now switch format — should re-trigger
    const testBtn = Array.from(document.querySelectorAll('.h2h-fmt-btn')).find(b => b.dataset.format === 'test');
    testBtn?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(getHeadToHeadStats.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ── loadComparison — same-team validation ────────────────────────────────────

describe('loadComparison — same-team guard', () => {
  it('shows error placeholder when both selects have the same team', async () => {
    open();
    // Force both selects to the same value
    const selects = document.querySelectorAll('.h2h-select');
    if (selects[1]) selects[1].value = selects[0].value;
    const goBtn = document.querySelector('.h2h-go-btn');
    goBtn?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.h2h-content')?.textContent)
      .toContain('Please select two different teams');
  });
});

// ── loadComparison — success path ────────────────────────────────────────────

describe('loadComparison — success path', () => {
  it('calls all three query functions', async () => {
    open();
    const goBtn = document.querySelector('.h2h-go-btn');
    goBtn?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(getHeadToHeadStats).toHaveBeenCalled();
    expect(getHeadToHeadBiggestWins).toHaveBeenCalled();
    expect(getHeadToHeadTopPlayers).toHaveBeenCalled();
  });

  it('renders win totals in the content area', async () => {
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    const content = document.querySelector('.h2h-content')?.textContent || '';
    expect(content).toContain('10');   // winsA
    expect(content).toContain('21');   // total matches
  });

  it('renders "Biggest wins" section', async () => {
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.h2h-content')?.innerHTML).toContain('Biggest wins');
  });

  it('renders top run-scorers section', async () => {
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.h2h-content')?.innerHTML).toContain('V Kohli');
  });

  it('renders "No wins" when bestA is empty', async () => {
    getHeadToHeadBiggestWins.mockResolvedValue({ bestA: [], bestB: [] });
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.h2h-content')?.textContent).toContain('No wins');
  });

  it('renders "No data" in player grid when bowlers list is empty', async () => {
    getHeadToHeadTopPlayers.mockResolvedValue({ batters: [], bowlers: [] });
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.h2h-content')?.textContent).toContain('No data');
  });

  it('shows error placeholder when query throws', async () => {
    getHeadToHeadStats.mockRejectedValue(new Error('DB error'));
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.h2h-content')?.textContent).toContain('Could not load data');
  });
});

// ── keyboard / dismissal ──────────────────────────────────────────────────────

describe('keyboard / dismissal', () => {
  it('Escape key closes the panel', () => {
    vi.useFakeTimers();
    open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('h2h-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });

  it('pointerdown outside panel closes it', () => {
    vi.useFakeTimers();
    open();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.getElementById('h2h-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
  });
});

// ── bigWinRow null-date branch ────────────────────────────────────────────────

describe('bigWinRow — null date', () => {
  it('renders empty date string when win.date is null', async () => {
    getHeadToHeadBiggestWins.mockResolvedValue({
      bestA: [{ winner: 'Australia', result: 'runs', margin: 100, date: null, venue: 'MCG' }],
      bestB: [],
    });
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    const content = document.querySelector('.h2h-content')?.innerHTML || '';
    expect(content).toContain('MCG');
    expect(content).toContain('by 100 runs');
  });
});

// ── esc() helper (XSS escape via renderResults) ──────────────────────────────

describe('esc() HTML escaping', () => {
  it('escapes < > & in venue names so rendered HTML is safe', async () => {
    getHeadToHeadBiggestWins.mockResolvedValue({
      bestA: [{ winner: 'A', result: 'runs', margin: 100, date: '2020-01-01', venue: '<script>alert(1)</script>' }],
      bestB: [],
    });
    open();
    document.querySelector('.h2h-go-btn')?.click();
    await Promise.resolve(); await Promise.resolve();
    const inner = document.querySelector('.h2h-content')?.innerHTML || '';
    expect(inner).toContain('&lt;script&gt;');
    expect(inner).not.toContain('<script>alert');
  });
});

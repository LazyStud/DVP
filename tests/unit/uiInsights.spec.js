// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/debug.js',        () => ({ DEBUG: false }));
vi.mock('../../src/data/queries.js', () => ({ getVenueTossBias: vi.fn() }));

import { open, close } from '../../src/ui/insights.js';
import { getVenueTossBias } from '../../src/data/queries.js';

const SAMPLE_ROWS = [
  { venue: 'Eden Gardens', pct: 0.72, wins: 36, n: 50 },
  { venue: 'SCG',          pct: 0.35, wins: 12, n: 34 },
];
const EMPTY_BIAS = { top10: SAMPLE_ROWS, bottom10: SAMPLE_ROWS };

// Set up DOM once — replacing it between tests would detach references held by the module.
// innerHTML is safe: hardcoded literal fixture, not user-supplied.
beforeAll(() => {
  document.body.innerHTML = '<div id="backdrop" hidden></div>';
  getVenueTossBias.mockResolvedValue(EMPTY_BIAS);
});

beforeEach(() => {
  vi.clearAllMocks();
  getVenueTossBias.mockResolvedValue(EMPTY_BIAS);
  // Ensure we start closed; close() is a no-op when isOpen===false
  try { close(); } catch (_) { /* ignore if panel not yet created */ }
});

// ── open() ────────────────────────────────────────────────────────────────────

describe('open()', () => {
  it('creates the #insights-window panel', async () => {
    await open();
    expect(document.getElementById('insights-window')).not.toBeNull();
  });

  it('shows the backdrop', async () => {
    await open();
    expect(document.getElementById('backdrop').hidden).toBe(false);
  });

  it('adds "open" class to the panel', async () => {
    await open();
    expect(document.getElementById('insights-window').classList.contains('open')).toBe(true);
  });

  it('renders "Toss Impact Insights" title', async () => {
    await open();
    expect(document.querySelector('.insights-title')?.textContent).toBe('Toss Impact Insights');
  });

  it('renders format filter buttons (all / test / odi / t20)', async () => {
    await open();
    expect(document.querySelectorAll('.insights-fmt-btn').length).toBe(4);
  });

  it('calls getVenueTossBias', async () => {
    await open();
    expect(getVenueTossBias).toHaveBeenCalled();
  });
});

// ── close() ───────────────────────────────────────────────────────────────────

describe('close()', () => {
  it('removes "open" class from the panel', async () => {
    vi.useFakeTimers();
    await open();
    close();
    expect(document.getElementById('insights-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('is a no-op when panel has never been opened', () => {
    // beforeEach calls close() which sets isOpen=false; calling again is safe
    expect(() => close()).not.toThrow();
  });
});

// ── format buttons ────────────────────────────────────────────────────────────

describe('format buttons', () => {
  it('clicking a non-active format button makes it active', async () => {
    await open();
    const btns = document.querySelectorAll('.insights-fmt-btn');
    // find the inactive 'odi' button and click it
    const odiBtn = Array.from(btns).find(b => b.dataset.format === 'odi');
    odiBtn?.click();
    expect(odiBtn?.classList.contains('active')).toBe(true);
  });

  it('clicking already-active format does not trigger a re-query', async () => {
    await open();
    // Set active format to 't20'
    const t20Btn = Array.from(document.querySelectorAll('.insights-fmt-btn'))
      .find(b => b.dataset.format === 't20');
    t20Btn?.click();
    await Promise.resolve(); // let the refresh settle
    const callsBefore = getVenueTossBias.mock.calls.length;
    t20Btn?.click(); // click same button again
    expect(getVenueTossBias.mock.calls.length).toBe(callsBefore);
  });
});

// ── keyboard / dismissal ──────────────────────────────────────────────────────

describe('keyboard / dismissal', () => {
  it('Escape key closes the panel', async () => {
    vi.useFakeTimers();
    await open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('insights-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('yearrange:change triggers a refresh when panel is open', async () => {
    await open();
    const before = getVenueTossBias.mock.calls.length;
    window.dispatchEvent(new CustomEvent('yearrange:change'));
    await Promise.resolve();
    expect(getVenueTossBias.mock.calls.length).toBeGreaterThan(before);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('shows error placeholder when getVenueTossBias throws', async () => {
    getVenueTossBias.mockRejectedValue(new Error('db error'));
    await open();
    expect(document.querySelector('.insights-placeholder')?.textContent)
      .toContain('Could not load data');
  });

  it('shows error placeholder in topList and empties bottomList on query failure', async () => {
    getVenueTossBias.mockRejectedValue(new Error('db error'));
    await open();
    const topPlaceholder = document.querySelector('.insights-placeholder');
    const bottomList = document.querySelector('.insights-bottom .insights-list');
    expect(topPlaceholder).not.toBeNull();
    if (bottomList) expect(bottomList.innerHTML).toBe('');
  });
});

// ── panel dismissal ───────────────────────────────────────────────────────────

describe('panel dismissal', () => {
  it('closes when clicking outside the panel', async () => {
    vi.useFakeTimers();
    await open();
    // Simulate pointerdown on body (outside panel)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.getElementById('insights-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('closes when clicking backdrop', async () => {
    vi.useFakeTimers();
    await open();
    const backdrop = document.getElementById('backdrop');
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('insights-window').classList.contains('open')).toBe(false);
    vi.runAllTimers();
    vi.useRealTimers();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/debug.js',         () => ({ DEBUG: false }));
vi.mock('../../src/data/insights.js', () => ({
  computeInsightPool: vi.fn(),
  pickFive:           vi.fn(),
}));

import { initInsightsFeed, showInsightsFeed } from '../../src/ui/insightsFeed.js';
import { computeInsightPool, pickFive }       from '../../src/data/insights.js';

const SAMPLE_POOL = [
  { text: 'India win 72% at home', category: 'home' },
  { text: 'Eden Gardens hosts most Tests', category: 'venue' },
  { text: 'Kohli averages 54 in ODIs', category: 'batting' },
  { text: 'Bumrah eco < 5 in T20s', category: 'bowling' },
  { text: 'T20 matches tripled since 2010', category: 'format' },
];

beforeAll(async () => {
  computeInsightPool.mockResolvedValue(SAMPLE_POOL);
  pickFive.mockImplementation(pool => pool.slice(0, 5));
  // Remove landing class so initInsightsFeed fires tryShow immediately
  document.body.classList.remove('landing');
  vi.useFakeTimers();
  initInsightsFeed();
  // Let 1500 ms SHOW_DELAY pass so loadAndShow runs
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

beforeEach(() => localStorage.clear());

describe('panel construction', () => {
  it('creates the #insightsFeed aside element', () => {
    expect(document.getElementById('insightsFeed')).not.toBeNull();
  });

  it('panel has a "Did you know?" title', () => {
    const title = document.querySelector('.insights-feed-title');
    expect(title?.textContent).toBe('Did you know?');
  });

  it('creates the edge re-open tab', () => {
    expect(document.getElementById('insightsFeedTab')).not.toBeNull();
  });
});

describe('cards render', () => {
  it('renders a card for each insight in the pool (up to 5)', () => {
    const cards = document.querySelectorAll('.insights-feed-card');
    expect(cards.length).toBe(5);
  });

  it('card text matches the insight text', () => {
    const texts = Array.from(document.querySelectorAll('.insights-feed-card-text')).map(el => el.textContent);
    expect(texts).toContain('India win 72% at home');
  });
});

describe('close button', () => {
  it('clicking close adds is-collapsed to the panel', () => {
    const panel = document.getElementById('insightsFeed');
    document.querySelector('.insights-feed-btn[aria-label="Close insights"]').click();
    expect(panel.classList.contains('is-collapsed')).toBe(true);
    expect(localStorage.getItem('gci-insights-closed')).toBe('1');
  });
});

describe('tab re-open', () => {
  beforeEach(() => localStorage.setItem('gci-insights-closed', '1'));

  it('clicking the tab clears the closed flag', () => {
    document.getElementById('insightsFeedTab').click();
    expect(localStorage.getItem('gci-insights-closed')).toBe('0');
  });
});

describe('refresh button', () => {
  it('calls pickFive and re-renders cards', () => {
    const before = pickFive.mock.calls.length;
    document.querySelector('.insights-feed-btn[aria-label="Refresh insights"]').click();
    expect(pickFive.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('showInsightsFeed', () => {
  it('adds insights-feed--visible class when pool is already loaded', () => {
    const panel = document.getElementById('insightsFeed');
    panel.classList.remove('insights-feed--visible');
    showInsightsFeed();
    expect(panel.classList.contains('insights-feed--visible')).toBe(true);
  });
});

describe('landing observer', () => {
  it('does not throw when body has landing class at init time', async () => {
    document.body.classList.add('landing');
    computeInsightPool.mockResolvedValue(SAMPLE_POOL);
    vi.useFakeTimers();
    expect(() => initInsightsFeed()).not.toThrow();
    document.body.classList.remove('landing');
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });
});

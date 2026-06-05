// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startNarrative, finishNarrative } from '../../src/ui/loadingNarrative.js';

describe('loadingNarrative', () => {
  let el;

  beforeEach(() => {
    // innerHTML is safe: hardcoded literal fixture, not user-supplied.
    document.body.innerHTML = '<div id="loadingToast"></div>';
    el = document.getElementById('loadingToast');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('shows the first step immediately', () => {
    startNarrative();
    expect(el.textContent).toBe('Loading 25 years of cricket…');
    expect(el.classList.contains('show')).toBe(true);
  });

  it('updates to step 2 after 800 ms', () => {
    startNarrative();
    vi.advanceTimersByTime(800);
    expect(el.textContent).toBe('Counting 150,000+ deliveries…');
  });

  it('updates to step 3 after 1600 ms', () => {
    startNarrative();
    vi.advanceTimersByTime(1600);
    expect(el.textContent).toBe('Plotting 220 venues across 30 nations…');
  });

  it('finishNarrative resolves and hides the toast when called after full duration', async () => {
    startNarrative();
    vi.advanceTimersByTime(2100); // past MIN_MS so remaining = 0
    const p = finishNarrative();
    vi.runAllTimers();
    await p;
    expect(el.classList.contains('show')).toBe(false);
  });

  it('finishNarrative waits out the remaining time when called early', async () => {
    startNarrative();
    vi.advanceTimersByTime(500); // less than MIN_MS (2100)
    const p = finishNarrative();
    // 1600 ms still remaining — toast should still be showing
    expect(el.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1600);
    await p;
    expect(el.classList.contains('show')).toBe(false);
  });

  it('does not throw when #loadingToast is absent', () => {
    document.body.innerHTML = '';
    expect(() => startNarrative()).not.toThrow();
    expect(() => finishNarrative()).not.toThrow();
    vi.runAllTimers();
  });
});

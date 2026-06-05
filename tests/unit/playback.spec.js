// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/ui/yearSlider.js', () => ({ syncSlider: vi.fn() }));
vi.mock('../../src/debug.js', () => ({ DEBUG: false }));

import { initPlayback, stopPlayback } from '../../src/ui/playback.js';
import { state } from '../../src/state.js';
import { syncSlider } from '../../src/ui/yearSlider.js';

// innerHTML is safe: hardcoded literal fixture, not user-supplied.
function setup() {
  document.body.innerHTML = '<button id="playBtn">▶</button>';
  state.yearRange = { min: 2000, max: 2005 };
  initPlayback();
}

describe('playback', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { stopPlayback(); vi.useRealTimers(); });

  it('does not throw when play button is absent', () => {
    document.body.innerHTML = '';
    expect(() => initPlayback()).not.toThrow();
  });

  it('clicking play sets button to pause icon', () => {
    setup();
    document.getElementById('playBtn').click();
    expect(document.getElementById('playBtn').textContent).toBe('⏸');
  });

  it('clicking pause returns button to play icon', () => {
    setup();
    const btn = document.getElementById('playBtn');
    btn.click(); // play
    btn.click(); // pause
    expect(btn.textContent).toBe('▶');
  });

  it('does not start when min >= max', () => {
    state.yearRange = { min: 2005, max: 2005 };
    document.body.innerHTML = '<button id="playBtn">▶</button>';
    initPlayback();
    document.getElementById('playBtn').click();
    expect(syncSlider).not.toHaveBeenCalled();
  });

  it('advances yearRange.max by 1 per tick', () => {
    setup();
    document.getElementById('playBtn').click();
    // After click max is reset to min (2000); first tick → 2001
    vi.advanceTimersByTime(800);
    expect(state.yearRange.max).toBe(2001);
  });

  it('calls syncSlider on each tick', () => {
    setup();
    document.getElementById('playBtn').click();
    vi.advanceTimersByTime(800);
    expect(syncSlider).toHaveBeenCalled();
  });

  it('stops automatically when targetMax is reached', () => {
    state.yearRange = { min: 2000, max: 2001 };
    document.body.innerHTML = '<button id="playBtn">▶</button>';
    initPlayback();
    document.getElementById('playBtn').click();
    vi.advanceTimersByTime(800);
    expect(document.getElementById('playBtn').textContent).toBe('▶');
  });

  it('stopPlayback pauses active playback', () => {
    setup();
    document.getElementById('playBtn').click();
    stopPlayback();
    expect(document.getElementById('playBtn').textContent).toBe('▶');
  });

  it('stopPlayback is a no-op when not playing', () => {
    setup();
    expect(() => stopPlayback()).not.toThrow();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/layers/countries.js', () => ({ applyChoropleth: vi.fn() }));
vi.mock('../../src/debug.js', () => ({ DEBUG: false }));

import { applyLandingPalette, initBeatHover } from '../../src/ui/beatHover.js';
import { state } from '../../src/state.js';

// innerHTML is safe: hardcoded literal fixture, not user-supplied.
function setup() {
  document.body.innerHTML = `
    <svg id="globe">
      <g class="country" id="c1" data-name="India"></g>
      <g class="country" id="c2" data-name="Australia"></g>
    </svg>
    <div id="globePreviewLabel"></div>
    <ul class="hero-beats">
      <li>T20 Matches</li>
      <li>Host Nations</li>
      <li>Win Rate</li>
    </ul>
  `;
}

describe('applyLandingPalette', () => {
  beforeEach(setup);

  it('sets a fill colour on each #globe .country element', () => {
    applyLandingPalette();
    // jsdom normalises hex to rgb(...) — just assert a non-empty colour is set
    document.querySelectorAll('#globe .country').forEach(el => {
      expect(el.style.fill).toBeTruthy();
    });
  });

  it('produces different colours for different country names', () => {
    applyLandingPalette();
    const fills = Array.from(document.querySelectorAll('#globe .country')).map(el => el.style.fill);
    // India and Australia should hash to different palette entries
    expect(fills[0]).not.toBe(fills[1]);
  });
});

describe('initBeatHover', () => {
  beforeEach(setup);

  it('does not throw when no beats exist', () => {
    document.body.innerHTML = '';
    expect(() => initBeatHover()).not.toThrow();
  });

  it('shows label on mouseenter for a beat with globeClass', () => {
    initBeatHover();
    document.querySelectorAll('.hero-beats li')[1]
      .dispatchEvent(new MouseEvent('mouseenter'));
    const label = document.getElementById('globePreviewLabel');
    expect(label.classList.contains('visible')).toBe(true);
    expect(label.textContent).toBe('Cricket host nations');
  });

  it('adds globeClass to #globe on mouseenter', () => {
    initBeatHover();
    document.querySelectorAll('.hero-beats li')[1]
      .dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('globe').classList.contains('venues-peek')).toBe(true);
  });

  it('removes globeClass from #globe on mouseleave', () => {
    initBeatHover();
    const li = document.querySelectorAll('.hero-beats li')[1];
    li.dispatchEvent(new MouseEvent('mouseenter'));
    li.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.getElementById('globe').classList.contains('venues-peek')).toBe(false);
  });

  it('hides label on mouseleave', () => {
    initBeatHover();
    const li = document.querySelectorAll('.hero-beats li')[1];
    li.dispatchEvent(new MouseEvent('mouseenter'));
    li.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.getElementById('globePreviewLabel').classList.contains('visible')).toBe(false);
  });

  it('sets state.selectedFormat on mouseenter for a beat with format', () => {
    initBeatHover();
    document.querySelectorAll('.hero-beats li')[0]
      .dispatchEvent(new MouseEvent('mouseenter'));
    expect(state.selectedFormat).toBe('t20');
  });

  it('restores landing palette on mouseleave for a format beat', () => {
    initBeatHover();
    const li = document.querySelectorAll('.hero-beats li')[0];
    li.dispatchEvent(new MouseEvent('mouseenter'));
    li.dispatchEvent(new MouseEvent('mouseleave'));
    // palette is re-applied — jsdom normalises hex to rgb() so just assert truthy
    document.querySelectorAll('#globe .country').forEach(el => {
      expect(el.style.fill).toBeTruthy();
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// d3 stub must be in place before yearSlider.js is imported.
// yearSlider.js uses d3.scaleLinear, d3.drag, d3.select, d3.pointer as globals.
const makeScale = () => {
  const fn = x => x; // identity — positions equal year values in test env
  fn.domain = () => fn;
  fn.range  = () => fn;
  return fn;
};
vi.stubGlobal('d3', {
  scaleLinear: () => makeScale(),
  drag: () => { const d = { on: () => d }; return d; },
  select: () => ({ call: () => {}, classed: () => ({}), raise: () => {}, on: () => {} }),
  pointer: () => [0],
});

import { YEAR_MIN, YEAR_MAX } from '../../src/config.js';
let syncSlider, setRange, initYearBox;

// innerHTML is safe: hardcoded literal fixture, not user-supplied.
beforeAll(async () => {
  document.body.innerHTML = `
    <div id="yearBox">
      <div class="yr-slider">
        <div class="yr-track">
          <div class="yr-fill"></div>
          <button class="yr-thumb left"  aria-valuenow="${YEAR_MIN}" aria-valuemin="${YEAR_MIN}" aria-valuemax="${YEAR_MAX}"></button>
          <button class="yr-thumb right" aria-valuenow="${YEAR_MAX}" aria-valuemin="${YEAR_MIN}" aria-valuemax="${YEAR_MAX}"></button>
        </div>
      </div>
      <span id="yrBubbleLeft">${YEAR_MIN}</span>
      <span id="yrBubbleRight">${YEAR_MAX}</span>
      <span id="yearBoxValue">Years ${YEAR_MIN}–${YEAR_MAX}</span>
      <button id="yrCollapseBtn" aria-expanded="true"></button>
    </div>
  `;
  ({ syncSlider, setRange, initYearBox } = await import('../../src/ui/yearSlider.js'));
  initYearBox(false); // wire keyboard handlers once
});

beforeEach(() => {
  syncSlider(YEAR_MIN, YEAR_MAX); // reset module vL/vR between tests
});

const bubbleL    = () => document.getElementById('yrBubbleLeft');
const bubbleR    = () => document.getElementById('yrBubbleRight');
const valueLabel = () => document.getElementById('yearBoxValue');
const thumbL     = () => document.querySelector('.yr-thumb.left');
const thumbR     = () => document.querySelector('.yr-thumb.right');

function keydown(el, key, shiftKey = false) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
}

// ── syncSlider ────────────────────────────────────────────────────────────────

describe('syncSlider', () => {
  it('updates bubble text content', () => {
    syncSlider(2010, 2020);
    expect(bubbleL().textContent).toBe('2010');
    expect(bubbleR().textContent).toBe('2020');
  });

  it('updates the year-box label', () => {
    syncSlider(2010, 2020);
    expect(valueLabel().textContent).toContain('2010');
    expect(valueLabel().textContent).toContain('2020');
  });

  it('does NOT fire yearrange:change event', () => {
    let fired = false;
    window.addEventListener('yearrange:change', () => { fired = true; }, { once: true });
    syncSlider(2005, 2015);
    expect(fired).toBe(false);
  });

  it('ignores NaN values (leaves current position)', () => {
    syncSlider(2010, 2020);
    syncSlider(NaN, NaN);
    expect(bubbleL().textContent).toBe('2010');
    expect(bubbleR().textContent).toBe('2020');
  });

  it('swaps vL/vR when min > max after clamp', () => {
    syncSlider(2020, 2010); // vL=2020 > vR=2010 → render swaps
    const l = +bubbleL().textContent;
    const r = +bubbleR().textContent;
    expect(l).toBeLessThanOrEqual(r);
  });
});

// ── setRange ──────────────────────────────────────────────────────────────────

describe('setRange', () => {
  it('updates bubble text and fires yearrange:change', () => {
    let detail;
    window.addEventListener('yearrange:change', e => { detail = e.detail; }, { once: true });
    setRange(2008, 2018);
    expect(bubbleL().textContent).toBe('2008');
    expect(bubbleR().textContent).toBe('2018');
    expect(detail).toEqual({ min: 2008, max: 2018 });
  });

  it('clamps values to YEAR_MIN / YEAR_MAX', () => {
    setRange(YEAR_MIN - 100, YEAR_MAX + 100);
    expect(+bubbleL().textContent).toBe(YEAR_MIN);
    expect(+bubbleR().textContent).toBe(YEAR_MAX);
  });
});

// ── initYearBox(recomputeOnly=true) ──────────────────────────────────────────

describe('initYearBox(true)', () => {
  it('re-renders without throwing', () => {
    syncSlider(2005, 2015);
    expect(() => initYearBox(true)).not.toThrow();
    // bubbles unchanged (render(false) keeps vL/vR)
    expect(bubbleL().textContent).toBe('2005');
  });
});

// ── handleThumbKey — left thumb ───────────────────────────────────────────────

describe('left thumb keyboard', () => {
  it('ArrowRight increases min by 1', () => {
    syncSlider(2005, 2020);
    keydown(thumbL(), 'ArrowRight');
    expect(+bubbleL().textContent).toBe(2006);
  });

  it('ArrowLeft decreases min by 1', () => {
    syncSlider(2005, 2020);
    keydown(thumbL(), 'ArrowLeft');
    expect(+bubbleL().textContent).toBe(2004);
  });

  it('Shift+ArrowRight moves by 5', () => {
    syncSlider(2005, 2020);
    keydown(thumbL(), 'ArrowRight', true);
    expect(+bubbleL().textContent).toBe(2010);
  });

  it('ArrowDown decreases min by 1', () => {
    syncSlider(2005, 2020);
    keydown(thumbL(), 'ArrowDown');
    expect(+bubbleL().textContent).toBe(2004);
  });

  it('ArrowUp increases min by 1', () => {
    syncSlider(2005, 2020);
    keydown(thumbL(), 'ArrowUp');
    expect(+bubbleL().textContent).toBe(2006);
  });

  it('Home sets min to YEAR_MIN', () => {
    syncSlider(2010, 2020);
    keydown(thumbL(), 'Home');
    expect(+bubbleL().textContent).toBe(YEAR_MIN);
  });

  it('End sets min to current max (vR)', () => {
    syncSlider(2010, 2020);
    keydown(thumbL(), 'End');
    expect(+bubbleL().textContent).toBe(2020);
  });
});

// ── handleThumbKey — right thumb ──────────────────────────────────────────────

describe('right thumb keyboard', () => {
  it('ArrowRight increases max by 1', () => {
    syncSlider(2000, 2020);
    keydown(thumbR(), 'ArrowRight');
    expect(+bubbleR().textContent).toBe(2021);
  });

  it('ArrowLeft decreases max by 1', () => {
    syncSlider(2000, 2020);
    keydown(thumbR(), 'ArrowLeft');
    expect(+bubbleR().textContent).toBe(2019);
  });

  it('Home sets max to current min (vL)', () => {
    syncSlider(2010, 2020);
    keydown(thumbR(), 'Home');
    expect(+bubbleR().textContent).toBe(2010);
  });

  it('End sets max to YEAR_MAX', () => {
    syncSlider(2000, 2010);
    keydown(thumbR(), 'End');
    expect(+bubbleR().textContent).toBe(YEAR_MAX);
  });
});

// ── collapse button ───────────────────────────────────────────────────────────

describe('collapse button', () => {
  it('clicking yrCollapseBtn toggles "collapsed" class on #yearBox', () => {
    const btn = document.getElementById('yrCollapseBtn');
    const box = document.getElementById('yearBox');
    btn.click();
    expect(box.classList.contains('collapsed')).toBe(true);
    btn.click();
    expect(box.classList.contains('collapsed')).toBe(false);
  });

  it('updates aria-expanded on yrCollapseBtn', () => {
    const btn = document.getElementById('yrCollapseBtn');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});

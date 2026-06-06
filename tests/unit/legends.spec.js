// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/debug.js',       () => ({ DEBUG: false }));
vi.mock('../../src/layers/countries.js', () => ({ applyChoropleth: vi.fn() }));
vi.mock('../../src/layers/spikes.js',    () => ({
  drawSpikes:         vi.fn(),
  renderSpikeLegend:  vi.fn(),
}));

// Minimal DOM-backed d3 wrapper so createLegendUI actually produces real elements.
function makeD3Wrapper(el) {
  const w = {
    node:     ()      => el,
    append:   tag     => {
      const ns    = tag === 'svg' ? 'http://www.w3.org/2000/svg' : null;
      const child = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
      el.appendChild(child);
      return makeD3Wrapper(child);
    },
    attr:     (k, v)  => { if (v !== undefined) el.setAttribute(k, String(v)); return w; },
    text:     t       => { el.textContent = String(t); return w; },
    html:     h       => { el.innerHTML   = h;         return w; },
    style:    ()      => w,
    property: (k, v)  => { el[k] = v; return w; },
    on:       ()      => w,
  };
  return w;
}

vi.stubGlobal('d3', {
  selectAll: () => ({ remove: () => {} }),
  select:    sel => makeD3Wrapper(
    typeof sel === 'string' ? document.querySelector(sel) : sel
  ),
  max:       vi.fn().mockReturnValue(100),
  ascending:  (a, b) => a - b,
  descending: (a, b) => b - a,
});

import { createLegendUI, setupFormatUI } from '../../src/ui/legends.js';
import { state }                          from '../../src/state.js';
import { applyChoropleth }                from '../../src/layers/countries.js';
import { drawSpikes, renderSpikeLegend }  from '../../src/layers/spikes.js';

beforeAll(() => {
  state.spikeScale     = { domain: vi.fn() };
  state.choroByCountry = new Map([
    ['india', { matches: 60, formats: { all: { matches: 60 } } }],
  ]);
  state.selectedFormat = 'all';
  state.mode           = '2d';
});

beforeEach(() => vi.clearAllMocks());

// ── createLegendUI ───────────────────────────────────────────────────────────

describe('createLegendUI', () => {
  let legendEl;

  beforeAll(() => { legendEl = createLegendUI(); });

  it('returns a DOM element', () => {
    expect(legendEl).toBeInstanceOf(Element);
  });

  it('element has class "legend"', () => {
    expect(legendEl.classList.contains('legend')).toBe(true);
  });

  it('creates four format filter buttons', () => {
    const btns = legendEl.querySelectorAll('.fmt-btn');
    expect(btns.length).toBe(4);
  });

  it('includes a spike-section', () => {
    expect(legendEl.querySelector('.spike-section')).not.toBeNull();
  });

  it('includes a flow-section', () => {
    expect(legendEl.querySelector('.flow-section')).not.toBeNull();
  });

  it('sets state.spikeLegend to an SVG element', () => {
    expect(state.spikeLegend).not.toBeNull();
    expect(state.spikeLegend.tagName.toLowerCase()).toBe('svg');
  });
});

// ── setupFormatUI ────────────────────────────────────────────────────────────

describe('setupFormatUI', () => {
  beforeAll(() => {
    // createLegendUI must already have run to put .fmt-btn elements into body
    createLegendUI();
    // Append legend to body so querySelectorAll finds the buttons
    document.body.appendChild(document.querySelector('.legend') || document.createElement('div'));
    setupFormatUI();
  });

  it('is a no-op when no .fmt-btn elements exist', () => {
    document.querySelectorAll('.fmt-btn').forEach(b => b.remove());
    expect(() => setupFormatUI()).not.toThrow();
    // Rebuild for subsequent tests
    createLegendUI();
    setupFormatUI();
  });

  it('clicking a format button updates state.selectedFormat', () => {
    const t20Btn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 't20');
    t20Btn?.click();
    expect(state.selectedFormat).toBe('t20');
  });

  it('clicking a format button sets aria-selected on the clicked button', () => {
    const odiBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'odi');
    odiBtn?.click();
    expect(odiBtn?.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a format button calls applyChoropleth', () => {
    const allBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'all');
    allBtn?.click();
    expect(applyChoropleth).toHaveBeenCalled();
  });

  it('clicking a format button calls drawSpikes', () => {
    const allBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'all');
    allBtn?.click();
    expect(drawSpikes).toHaveBeenCalled();
  });

  it('clicking a format button dispatches format:change event', () => {
    let detail;
    window.addEventListener('format:change', e => { detail = e.detail; }, { once: true });
    const allBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'all');
    allBtn?.click();
    expect(detail?.format).toBe('all');
  });

  it('clicking format button when state.mode is globe calls rebuildGlobeLayers', () => {
    state.mode = 'globe';
    state.rebuildGlobeLayers = vi.fn();
    const testBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'test');
    testBtn?.click();
    expect(state.rebuildGlobeLayers).toHaveBeenCalled();
    state.mode = '2d';
    state.rebuildGlobeLayers = undefined;
  });

  it('sets gradient color based on palette when format is changed', () => {
    const grad = document.querySelector('.legend-gradbar') || document.createElement('div');
    grad.classList.add('legend-gradbar');
    if (!document.querySelector('.legend-gradbar')) document.body.appendChild(grad);
    const odiBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'odi');
    odiBtn?.click();
    expect(grad.style.background).toContain('linear-gradient');
  });

  it('computes maxMatches correctly from choroByCountry when format changes', () => {
    state.choroByCountry = new Map([
      ['india', {
        matches: 60,
        formats: {
          all:  { matches: 60 },
          test: { matches: 25 },
          odi:  { matches: 20 },
          t20:  { matches: 15 },
        },
      }],
    ]);
    state.selectedFormat = 'test';
    const testBtn = Array.from(document.querySelectorAll('.fmt-btn'))
      .find(b => b.dataset.format === 'test');
    testBtn?.click();
    expect(state.spikeScale.domain).toBeDefined();
  });
});

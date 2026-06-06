// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// d3 stub — must be in place before decadeChart.js is imported.
// decadeChart.js uses d3 as a CDN global.
function makeSelector() {
  const sel = {};
  const noop = () => makeSelector();
  for (const m of ['append','attr','style','text','html','property','on','call',
                   'select','selectAll','data','join','remove','classed','raise']) {
    sel[m] = noop;
  }
  sel.node = () => document.createElement('div');
  return sel;
}
vi.stubGlobal('d3', {
  select:      () => makeSelector(),
  selectAll:   () => makeSelector(),
  scaleBand:   () => {
    const fn = () => 0;
    fn.domain = () => fn; fn.range = () => fn; fn.padding = () => fn; fn.bandwidth = () => 60;
    return fn;
  },
  scaleLinear: () => {
    const fn = () => 0;
    fn.domain = () => fn; fn.range = () => fn; fn.nice = () => fn;
    return fn;
  },
  max:         () => 100,
  axisLeft:    () => { const a = {}; ['ticks','tickFormat','tickSize'].forEach(k => { a[k] = () => a; }); return a; },
  axisBottom:  () => { const a = {}; ['ticks','tickFormat','tickSize'].forEach(k => { a[k] = () => a; }); return a; },
  stack:       () => ({ keys: () => () => [] }),
});

vi.mock('../../src/debug.js',         () => ({ DEBUG: false }));
vi.mock('../../src/db.js',            () => ({ DB: { queryAll: vi.fn() } }));
vi.mock('../../src/data/queries.js',  () => ({ loadMatchTables: vi.fn() }));
vi.mock('../../src/ui/yearSlider.js', () => ({ setRange: vi.fn() }));

import { initDecadeChart }  from '../../src/ui/decadeChart.js';
import { DB }               from '../../src/db.js';
import { loadMatchTables }  from '../../src/data/queries.js';

const TABLE = { name: 'matches', cols: ['date', 'format'], map: { dateCol: 'date', formatCol: 'format' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('reportError', () => {});
  loadMatchTables.mockReturnValue([TABLE]);
  DB.queryAll.mockReturnValue([]);
});

// ── no container ──────────────────────────────────────────────────────────────

describe('initDecadeChart — no #decadeChart container', () => {
  it('returns without throwing when container is absent', () => {
    expect(() => initDecadeChart()).not.toThrow();
  });
});

// ── with container ────────────────────────────────────────────────────────────

describe('initDecadeChart — with container', () => {
  let container;
  beforeAll(() => {
    container = document.createElement('div');
    container.id = 'decadeChart';
    document.body.appendChild(container);
  });

  it('shows "No data" when DB returns no rows', () => {
    initDecadeChart();
    expect(container.textContent).toContain('No data');
  });

  it('shows "No data" when loadMatchTables returns []', () => {
    loadMatchTables.mockReturnValue([]);
    initDecadeChart();
    expect(container.textContent).toContain('No data');
  });

  it('shows "No data" when table map has no dateCol', () => {
    loadMatchTables.mockReturnValue([{ name: 'matches', cols: [], map: { dateCol: null } }]);
    initDecadeChart();
    expect(container.textContent).toContain('No data');
  });

  it('silently recovers from DB error inside queryDecadeData', () => {
    DB.queryAll.mockImplementation(() => { throw new Error('DB offline'); });
    expect(() => initDecadeChart()).not.toThrow();
    expect(container.textContent).toContain('No data');
  });

  // ── normaliseFormat coverage via DB rows ────────────────────────────────────

  it('renders chart without throwing for all format variants', () => {
    DB.queryAll.mockReturnValue([
      { yr: 2002, fmt: 'Test',         cnt: 10 }, // → 'test'
      { yr: 2002, fmt: 'Tests',        cnt:  2 }, // → 'test'
      { yr: 2012, fmt: 'ODI',          cnt:  8 }, // → 'odi'
      { yr: 2012, fmt: 'One Day',      cnt:  3 }, // → 'odi'  (oneday)
      { yr: 2022, fmt: 't20i',         cnt: 15 }, // → 't20'
      { yr: 2022, fmt: 'TwentyTwenty', cnt:  4 }, // → 't20'
      { yr: 2005, fmt: null,           cnt:  2 }, // → 'other' (null)
      { yr: 2015, fmt: 'custom-game',  cnt:  1 }, // → 'other'
    ]);
    expect(() => initDecadeChart()).not.toThrow();
    expect(container.textContent).not.toContain('No data');
    expect(container.textContent).not.toContain('Data unavailable');
  });

  it('handles rows outside all decade ranges (yr not matching any DECADE)', () => {
    DB.queryAll.mockReturnValue([
      { yr: 1999, fmt: 'Test', cnt: 5 },  // < 2000 → no decade match
      { yr: 2026, fmt: 'ODI',  cnt: 3 },  // > 2025 → no decade match
      { yr: 2010, fmt: 'T20',  cnt: 8 },  // in 2010s range → counted
    ]);
    expect(() => initDecadeChart()).not.toThrow();
  });

  it('uses "One Day International" → odi normalisation', () => {
    DB.queryAll.mockReturnValue([
      { yr: 2010, fmt: 'One Day International', cnt: 20 },
    ]);
    expect(() => initDecadeChart()).not.toThrow();
  });

  it('handles table with no formatCol (uses empty string fallback)', () => {
    loadMatchTables.mockReturnValue([
      { name: 'matches', cols: ['date'], map: { dateCol: 'date', formatCol: null } },
    ]);
    DB.queryAll.mockReturnValue([{ yr: 2010, fmt: '', cnt: 5 }]);
    expect(() => initDecadeChart()).not.toThrow();
  });
});

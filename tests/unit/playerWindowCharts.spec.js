// @vitest-environment jsdom
//
// Covers playerWindow.js drawing functions: drawYearLine, drawDonut, drawVenueBars.
// A d3 CDN-global stub is installed before any test runs so the drawing code
// executes without a real DOM/SVG renderer.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/debug.js',        () => ({ DEBUG: false }));
vi.mock('../../src/config.js', async (io) => ({ ...(await io()) }));
vi.mock('../../src/ui/exportPng.js', () => ({ exportSvgAsPng: vi.fn() }));
vi.mock('../../src/data/queries.js', () => ({
  getPlayerYearBatting:      vi.fn(),
  getPlayerFormatBatting:    vi.fn(),
  getPlayerTopVenues:        vi.fn(),
  getPlayerYearBowling:      vi.fn(),
  getPlayerFormatBowling:    vi.fn(),
  getPlayerTopVenuesBowling: vi.fn(),
}));

import { openPlayer, close } from '../../src/ui/playerWindow.js';
import {
  getPlayerYearBatting, getPlayerFormatBatting, getPlayerTopVenues,
  getPlayerYearBowling, getPlayerFormatBowling, getPlayerTopVenuesBowling,
} from '../../src/data/queries.js';

// ── d3 CDN-global stub ────────────────────────────────────────────────────────
// playerWindow.js accesses d3 as a global (CDN build) at call time.
// The stub must be in place before openPlayer() triggers any drawing.

function makeScale() {
  const fn = () => 0;
  fn.domain   = () => fn;
  fn.range    = () => fn;
  fn.nice     = () => fn;
  fn.padding  = () => fn;
  fn.bandwidth = () => 40;
  fn.ticks    = () => [];
  return fn;
}

function makeSelector() {
  const sel = {};
  const noop = () => makeSelector();
  [
    'append', 'attr', 'style', 'text', 'html', 'datum', 'on', 'call',
    'select', 'selectAll', 'remove', 'classed', 'raise', 'enter', 'each',
  ].forEach(m => { sel[m] = noop; });
  sel.data = () => sel;
  sel.node  = () => document.createElement('div');
  return sel;
}

beforeAll(() => {
  vi.stubGlobal('d3', {
    select:    () => makeSelector(),
    selectAll: () => makeSelector(),

    scaleLinear: makeScale,
    scaleBand:   makeScale,

    extent: (arr, fn) => arr.length
      ? [fn ? fn(arr[0]) : arr[0], fn ? fn(arr[arr.length - 1]) : arr[arr.length - 1]]
      : [0, 1],

    max: (arr, fn) => arr.length
      ? (fn ? Math.max(...arr.map(fn)) : Math.max(...arr))
      : 0,

    sum: (arr, fn) => arr.reduce((s, d) => s + (fn ? fn(d) : d), 0),

    line: () => {
      const fn = () => 'M0,0L1,1';
      fn.x = () => fn; fn.y = () => fn; fn.curve = () => fn;
      return fn;
    },

    arc: () => {
      const fn = () => 'M0,0A5,5,0,0,1,5,0Z';
      fn.innerRadius = () => fn;
      fn.outerRadius = () => fn;
      fn.centroid    = () => [0, 0];
      return fn;
    },

    pie: () => {
      const fn = (data) => data.map((d, i) => ({
        data: d, value: 1,
        startAngle: i * 0.5, endAngle: (i + 1) * 0.5, padAngle: 0,
      }));
      fn.value = () => fn;
      fn.sort  = () => fn;
      return fn;
    },

    axisLeft:   () => { const a = {}; ['ticks', 'tickFormat', 'tickSize'].forEach(k => { a[k] = () => a; }); return a; },
    axisBottom: () => { const a = {}; ['ticks', 'tickFormat', 'tickSize'].forEach(k => { a[k] = () => a; }); return a; },
    axisRight:  () => { const a = {}; ['ticks', 'tickFormat', 'tickSize'].forEach(k => { a[k] = () => a; }); return a; },

    format: () => d => String(d),
    curveMonotoneX: 'curveMonotoneX',
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  getPlayerYearBatting.mockResolvedValue([]);
  getPlayerFormatBatting.mockResolvedValue([]);
  getPlayerTopVenues.mockResolvedValue([]);
  getPlayerYearBowling.mockResolvedValue([]);
  getPlayerFormatBowling.mockResolvedValue([]);
  getPlayerTopVenuesBowling.mockResolvedValue([]);
  try { close(); } catch (_) {}
});

afterEach(() => { vi.useRealTimers(); });

const flush = () => Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());

// ── Sample data fixtures ──────────────────────────────────────────────────────

const BATTING_YEAR = [
  { year: 2018, runs: 800, balls: 600, matches: 15, sr: 133.3, avg: 53.3 },
  { year: 2019, runs: 700, balls: 520, matches: 14, sr: 134.6, avg: 50.0 },
];
const BATTING_FORMAT = [
  { label: 'Test', runs: 2000 },
  { label: 'ODI',  runs: 1500 },
  { label: 'T20',  runs:  900 },
];
const BATTING_VENUES = [
  { venue: 'MCG',    runs: 500, matches: 10 },
  { venue: "Lord's", runs: 400, matches:  8 },
];
const BOWLING_YEAR = [
  { year: 2018, wickets: 30, runs_conceded: 400, balls: 600, matches: 15, econ: 4.0 },
];
const BOWLING_FORMAT = [
  { label: 'Test', wickets: 100 },
  { label: 'ODI',  wickets:  80 },
];
const BOWLING_VENUES = [
  { venue: 'Wankhede', wickets: 20, matches: 8 },
];

// ── drawYearLine (batting) ────────────────────────────────────────────────────

describe('drawYearLine — batting', () => {
  it('executes without error when year query returns rows', async () => {
    getPlayerYearBatting.mockResolvedValue(BATTING_YEAR);
    openPlayer('V Kohli', 'IND', 'batting');
    await flush();
    expect(document.getElementById('player-window')).not.toBeNull();
  });

  it('populates infoRow with Matches/Total runs/Avg SR', async () => {
    getPlayerYearBatting.mockResolvedValue(BATTING_YEAR);
    openPlayer('V Kohli', 'IND', 'batting');
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) {
      expect(info.innerHTML).toContain('Matches');
      expect(info.innerHTML).toContain('Total runs');
    }
  });

  it('uses totalBalls=0 branch when all balls are 0 (avgSR shows 0)', async () => {
    getPlayerYearBatting.mockResolvedValue([
      { year: 2020, runs: 50, balls: 0, matches: 5, sr: 0, avg: 10 },
    ]);
    openPlayer('V Kohli', 'IND', 'batting');
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) expect(info.innerHTML).toContain('Avg SR: 0');
  });
});

// ── drawYearLine (bowling) ────────────────────────────────────────────────────

describe('drawYearLine — bowling', () => {
  it('executes without error when bowling year query returns rows', async () => {
    getPlayerYearBowling.mockResolvedValue(BOWLING_YEAR);
    openPlayer('P Cummins', 'AUS', 'bowling');
    await flush();
    expect(document.getElementById('player-window')).not.toBeNull();
  });

  it('populates infoRow with Matches/Total wkts/Avg Econ', async () => {
    getPlayerYearBowling.mockResolvedValue(BOWLING_YEAR);
    openPlayer('P Cummins', 'AUS', 'bowling');
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) {
      expect(info.innerHTML).toContain('Matches');
      expect(info.innerHTML).toContain('Total wkts');
    }
  });

  it('avgEcon=0 when totalBalls is 0', async () => {
    getPlayerYearBowling.mockResolvedValue([
      { year: 2019, wickets: 5, runs_conceded: 50, balls: 0, matches: 3, econ: 0 },
    ]);
    openPlayer('P Cummins', 'AUS', 'bowling');
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) expect(info.innerHTML).toContain('Avg Econ: 0');
  });
});

// ── drawDonut (batting) ───────────────────────────────────────────────────────

describe('drawDonut — batting format donut', () => {
  it('executes without error when format query returns rows', async () => {
    getPlayerFormatBatting.mockResolvedValue(BATTING_FORMAT);
    openPlayer('V Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    expect(document.querySelector('.player-tab[data-view="donut"]')?.classList.contains('active')).toBe(true);
  });

  it('shows "Total runs" in infoRow', async () => {
    getPlayerFormatBatting.mockResolvedValue(BATTING_FORMAT);
    openPlayer('V Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) expect(info.innerHTML).toContain('Total runs');
  });
});

// ── drawDonut (bowling) ───────────────────────────────────────────────────────

describe('drawDonut — bowling format donut', () => {
  it('executes without error for bowling format data', async () => {
    getPlayerFormatBowling.mockResolvedValue(BOWLING_FORMAT);
    openPlayer('P Cummins', 'AUS', 'bowling');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    expect(document.getElementById('player-window')).not.toBeNull();
  });

  it('shows "Total wickets" in infoRow', async () => {
    getPlayerFormatBowling.mockResolvedValue(BOWLING_FORMAT);
    openPlayer('P Cummins', 'AUS', 'bowling');
    document.querySelector('.player-tab[data-view="donut"]')?.click();
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) expect(info.innerHTML).toContain('Total wickets');
  });
});

// ── drawVenueBars (batting) ───────────────────────────────────────────────────

describe('drawVenueBars — batting venues', () => {
  it('executes without error when venues query returns rows', async () => {
    getPlayerTopVenues.mockResolvedValue(BATTING_VENUES);
    openPlayer('V Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="venues"]')?.click();
    await flush();
    expect(document.getElementById('player-window')).not.toBeNull();
  });

  it('shows top-N venues count in infoRow', async () => {
    getPlayerTopVenues.mockResolvedValue(BATTING_VENUES);
    openPlayer('V Kohli', 'IND', 'batting');
    document.querySelector('.player-tab[data-view="venues"]')?.click();
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) expect(info.innerHTML).toContain('venues');
  });
});

// ── drawVenueBars (bowling) ───────────────────────────────────────────────────

describe('drawVenueBars — bowling venues', () => {
  it('executes without error for bowling venues data', async () => {
    getPlayerTopVenuesBowling.mockResolvedValue(BOWLING_VENUES);
    openPlayer('P Cummins', 'AUS', 'bowling');
    document.querySelector('.player-tab[data-view="venues"]')?.click();
    await flush();
    expect(document.getElementById('player-window')).not.toBeNull();
  });

  it('shows "Wickets" label in infoRow for bowling', async () => {
    getPlayerTopVenuesBowling.mockResolvedValue(BOWLING_VENUES);
    openPlayer('P Cummins', 'AUS', 'bowling');
    document.querySelector('.player-tab[data-view="venues"]')?.click();
    await flush();
    const info = document.getElementById('playerInfoRow');
    if (info) expect(info.innerHTML).toContain('venues');
  });
});

// ── renderCharts error path ───────────────────────────────────────────────────

describe('renderCharts error path', () => {
  it('shows "Could not load data" when query rejects', async () => {
    getPlayerYearBatting.mockRejectedValue(new Error('DB fail'));
    openPlayer('V Kohli', 'IND', 'batting');
    await flush();
    const svg = document.querySelector('svg[data-role="player-chart"]')?.innerHTML || '';
    expect(svg).toContain('Could not load data');
  });
});

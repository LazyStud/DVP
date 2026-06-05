/* Decade overview stacked bar — T-3.5
 * Renders on the landing hero right panel.
 * Clicking a bar jumps the year slider to that decade.
 */
import { loadMatchTables } from '../data/queries.js';
import { setRange }        from './yearSlider.js';
import { state }           from '../state.js';
import { DB }              from '../db.js';

const DECADES = [
  { label: '2000s', min: 2000, max: 2009 },
  { label: '2010s', min: 2010, max: 2019 },
  { label: '2020s', min: 2020, max: 2025 },
];

// Format keys after normalization
const FORMATS = ['test', 'odi', 't20'];
const FORMAT_LABELS = { test: 'Test', odi: 'ODI', t20: 'T20' };
const FORMAT_COLORS = { test: '#4ec9b0', odi: '#e5c15a', t20: '#b48aed' };

function normaliseFormat(raw) {
  if (!raw) return 'other';
  const s = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'test' || s === 'tests') return 'test';
  if (s === 'odi' || s === 'oneday' || s === 'onedayinternational') return 'odi';
  if (s === 't20' || s === 't20i' || s === 'twentytwenty' || s === 'twentitwenty') return 't20';
  return 'other';
}

function queryDecadeData() {
  const tables = loadMatchTables();
  const counts = {};
  DECADES.forEach(d => {
    counts[d.label] = { test: 0, odi: 0, t20: 0, other: 0 };
  });

  for (const t of tables) {
    const { dateCol, formatCol } = t.map;
    if (!dateCol) continue;
    const fSel = formatCol ? `COALESCE(${formatCol}, '')` : "''";
    try {
      const rows = DB.queryAll(
        `SELECT CAST(substr(${dateCol},1,4) AS INT) AS yr, ${fSel} AS fmt, COUNT(*) AS cnt
         FROM ${t.name}
         WHERE CAST(substr(${dateCol},1,4) AS INT) BETWEEN 2000 AND 2025
         GROUP BY yr, ${fSel}`
      );
      for (const row of rows) {
        const yr  = +row.yr;
        const fmt = normaliseFormat(row.fmt);
        const cnt = +row.cnt || 0;
        const dec = DECADES.find(d => yr >= d.min && yr <= d.max);
        if (dec) counts[dec.label][fmt] = (counts[dec.label][fmt] || 0) + cnt;
      }
    } catch (e) { reportError('nonfatal', e); }
  }
  return counts;
}

export function initDecadeChart() {
  const container = document.getElementById('decadeChart');
  if (!container) return;

  // Show spinner while DB might still be cold
  container.innerHTML = '<div class="dc-loading">Loading…</div>';

  let counts;
  try {
    counts = queryDecadeData();
  } catch (_) {
    container.innerHTML = '<div class="dc-loading dc-error">Data unavailable</div>';
    return;
  }

  const totalAny = DECADES.some(d => FORMATS.some(f => counts[d.label][f] > 0));
  if (!totalAny) {
    container.innerHTML = '<div class="dc-loading dc-error">No data</div>';
    return;
  }

  container.innerHTML = '';

  // ── Layout ────────────────────────────────────────────────────────────────
  const W = container.clientWidth  || 340;
  const H = container.clientHeight || 280;
  const margin = { top: 24, right: 14, bottom: 38, left: 42 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top  - margin.bottom;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('class', 'dc-svg');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // ── Scales ────────────────────────────────────────────────────────────────
  const decadeLabels = DECADES.map(d => d.label);

  const xScale = d3.scaleBand()
    .domain(decadeLabels)
    .range([0, innerW])
    .padding(0.28);

  const maxTotal = d3.max(DECADES, d => FORMATS.reduce((s, f) => s + (counts[d.label][f] || 0), 0));

  const yScale = d3.scaleLinear()
    .domain([0, maxTotal * 1.12])
    .range([innerH, 0])
    .nice();

  // ── Stack data ────────────────────────────────────────────────────────────
  const stackData = DECADES.map(d => {
    const obj = { decade: d.label, min: d.min, max: d.max };
    FORMATS.forEach(f => { obj[f] = counts[d.label][f] || 0; });
    return obj;
  });

  const stack = d3.stack().keys(FORMATS)(stackData);

  // ── Axes ──────────────────────────────────────────────────────────────────
  const yAxis = d3.axisLeft(yScale)
    .ticks(5)
    .tickFormat(d => d >= 1000 ? `${d / 1000}k` : d)
    .tickSize(-innerW);

  const yAxisG = g.append('g').attr('class', 'dc-axis dc-axis-y').call(yAxis);
  yAxisG.select('.domain').remove();
  yAxisG.selectAll('.tick line').attr('stroke', 'var(--panel-border)').attr('stroke-dasharray', '3,3');
  yAxisG.selectAll('.tick text').attr('fill', 'var(--muted)').attr('font-size', 11);

  const xAxis = d3.axisBottom(xScale).tickSize(0);
  const xAxisG = g.append('g')
    .attr('class', 'dc-axis dc-axis-x')
    .attr('transform', `translate(0,${innerH})`)
    .call(xAxis);
  xAxisG.select('.domain').attr('stroke', 'var(--panel-border)');
  xAxisG.selectAll('.tick text')
    .attr('fill', 'var(--text)')
    .attr('font-size', 13)
    .attr('font-weight', '600')
    .attr('dy', '1.2em');

  // ── Title ────────────────────────────────────────────────────────────────
  svg.append('text')
    .attr('class', 'dc-title')
    .attr('x', W / 2)
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text)')
    .attr('font-size', 12)
    .attr('font-weight', '600')
    .attr('letter-spacing', '0.04em')
    .text('MATCHES BY FORMAT & DECADE  •  click a bar to explore');

  // ── Bars ─────────────────────────────────────────────────────────────────
  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'dc-tooltip')
    .style('opacity', 0);

  // Clickable background for each decade (hit area + highlight)
  g.selectAll('.dc-decade-hit')
    .data(stackData)
    .join('rect')
    .attr('class', 'dc-decade-hit')
    .attr('x', d => xScale(d.decade) - xScale.padding() * xScale.bandwidth() * 0.5)
    .attr('y', 0)
    .attr('width', xScale.bandwidth() + xScale.padding() * xScale.bandwidth())
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .attr('rx', 4)
    .style('cursor', 'pointer')
    .on('mouseenter', function (event, d) {
      d3.select(this).attr('fill', 'rgba(255,255,255,0.04)');
      const total = FORMATS.reduce((s, f) => s + (d[f] || 0), 0);
      const lines = FORMATS.map(f => `<span style="color:${FORMAT_COLORS[f]}">${FORMAT_LABELS[f]}</span>: ${(d[f] || 0).toLocaleString()}`).join('<br>');
      tooltip
        .style('opacity', 1)
        .html(`<strong>${d.decade}</strong><br>${lines}<br><span style="color:var(--muted)">Total: ${total.toLocaleString()}</span>`);
    })
    .on('mousemove', function (event) {
      const rect = container.getBoundingClientRect();
      tooltip
        .style('left',  `${event.clientX - rect.left + 8}px`)
        .style('top',   `${event.clientY - rect.top  - 8}px`);
    })
    .on('mouseleave', function () {
      d3.select(this).attr('fill', 'transparent');
      tooltip.style('opacity', 0);
    })
    .on('click', (event, d) => {
      // If still on landing, store intended range and enter explore mode
      if (document.body.classList.contains('landing')) {
        state.yearRange = { min: d.min, max: d.max };
        document.getElementById('enterBtn')?.click();
      }
      // setRange syncs the slider UI + fires yearrange:change → data recomputes
      setRange(d.min, d.max);
    });

  // Stacked bars
  const layer = g.selectAll('.dc-layer')
    .data(stack)
    .join('g')
    .attr('class', 'dc-layer')
    .attr('fill', d => FORMAT_COLORS[d.key]);

  layer.selectAll('rect')
    .data(d => d)
    .join('rect')
    .attr('class', 'dc-bar')
    .attr('x', d => xScale(d.data.decade))
    .attr('y', d => yScale(d[1]))
    .attr('height', d => Math.max(0, yScale(d[0]) - yScale(d[1])))
    .attr('width', xScale.bandwidth())
    .attr('rx', 3)
    .style('pointer-events', 'none');

  // ── Legend ───────────────────────────────────────────────────────────────
  const legendY = H - 8;
  const legendSpacing = innerW / FORMATS.length;
  const legendG = svg.append('g')
    .attr('transform', `translate(${margin.left},${legendY})`);

  FORMATS.forEach((f, i) => {
    const lx = i * legendSpacing + legendSpacing * 0.1;
    legendG.append('rect')
      .attr('x', lx).attr('y', -8)
      .attr('width', 10).attr('height', 10)
      .attr('rx', 2)
      .attr('fill', FORMAT_COLORS[f]);
    legendG.append('text')
      .attr('x', lx + 13).attr('y', 0)
      .attr('fill', 'var(--muted)')
      .attr('font-size', 11)
      .text(FORMAT_LABELS[f]);
  });

}

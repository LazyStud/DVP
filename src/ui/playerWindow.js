/* PlayerWindow — modal showing player drill-down charts:
 *  - Year-by-year line chart (runs for batters, wickets for bowlers)
 *  - Format split donut chart
 *  - Top 5 venues bar chart
 */
import { DEBUG }                                      from '../debug.js';
import { YEAR_MIN, YEAR_MAX }                         from '../config.js';
import {
  getPlayerYearBatting, getPlayerFormatBatting, getPlayerTopVenues,
  getPlayerYearBowling, getPlayerFormatBowling, getPlayerTopVenuesBowling,
} from '../data/queries.js';

let panel, titleEl, badgeEl, contentEl, exportBtn, yearRangeEl;
let isOpen = false;
let currentPlayer = null;
let currentKind = 'batting'; // 'batting' | 'bowling'
let _prevFocus = null;

// Donut colors matching venue radar legend
const DONUT_COLORS = { Test: '#e6cf9a', ODI: '#2dd4bf', T20: '#a78bfa' };
const LINE_COLOR   = '#2dd4bf';
const LINE_COLOR2  = '#ff8a00';
const BAR_COLOR    = '#ff8a00';

function ensurePanel() {
  if (panel) return;

  panel = document.createElement('div');
  panel.id = 'player-window';

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'player-header';

  const left = document.createElement('div');
  left.className = 'player-header-left';

  titleEl = document.createElement('h3');
  titleEl.className = 'player-title';
  titleEl.textContent = 'Player';

  badgeEl = document.createElement('span');
  badgeEl.className = 'player-badge';
  badgeEl.textContent = '';

  yearRangeEl = document.createElement('span');
  yearRangeEl.className = 'player-yearrange';
  yearRangeEl.textContent = '2000–2025';

  left.appendChild(titleEl);
  left.appendChild(badgeEl);
  left.appendChild(yearRangeEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'player-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', close);

  // Export PNG button
  exportBtn = document.createElement('button');
  exportBtn.className = 'icon-btn player-export-btn';
  exportBtn.setAttribute('aria-label', 'Save chart as PNG');
  exportBtn.title = 'Save PNG';
  exportBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 11.5 L3.5 7 H6.5 V2 H9.5 V7 H12.5 Z" fill="currentColor"/><rect x="2" y="13" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg>';

  header.appendChild(left);
  header.appendChild(exportBtn);
  header.appendChild(closeBtn);

  // ── Tab bar ─────────────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'player-tabbar';

  const tabLine = document.createElement('button');
  tabLine.className = 'player-tab active';
  tabLine.textContent = 'Year Line';
  tabLine.setAttribute('aria-pressed', 'true');
  tabLine.dataset.view = 'line';

  const tabDonut = document.createElement('button');
  tabDonut.className = 'player-tab';
  tabDonut.textContent = 'Format';
  tabDonut.setAttribute('aria-pressed', 'false');
  tabDonut.dataset.view = 'donut';

  const tabVenues = document.createElement('button');
  tabVenues.className = 'player-tab';
  tabVenues.textContent = 'Venues';
  tabVenues.setAttribute('aria-pressed', 'false');
  tabVenues.dataset.view = 'venues';

  tabBar.appendChild(tabLine);
  tabBar.appendChild(tabDonut);
  tabBar.appendChild(tabVenues);

  // ── Kind toggle (Batting / Bowling) ─────────────────────────────────────
  const kindBar = document.createElement('div');
  kindBar.className = 'player-kindbar';

  const btnBat = document.createElement('button');
  btnBat.className = 'player-kind-btn active';
  btnBat.textContent = 'Batting';
  btnBat.dataset.kind = 'batting';

  const btnBowl = document.createElement('button');
  btnBowl.className = 'player-kind-btn';
  btnBowl.textContent = 'Bowling';
  btnBowl.dataset.kind = 'bowling';

  kindBar.appendChild(btnBat);
  kindBar.appendChild(btnBowl);

  // ── Content area ────────────────────────────────────────────────────────
  contentEl = document.createElement('div');
  contentEl.className = 'player-content';

  // ── Info row ────────────────────────────────────────────────────────────
  const infoRow = document.createElement('div');
  infoRow.className = 'player-info-row';
  infoRow.id = 'playerInfoRow';
  contentEl.appendChild(infoRow);

  // SVG chart container
  const chartWrap = document.createElement('div');
  chartWrap.className = 'player-chart-wrap';
  chartWrap.id = 'playerChartWrap';
  const chartSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chartSvg.setAttribute('data-role', 'player-chart');
  chartSvg.setAttribute('width', '380');
  chartSvg.setAttribute('height', '220');
  chartWrap.appendChild(chartSvg);
  contentEl.appendChild(chartWrap);

  // ── Assemble ────────────────────────────────────────────────────────────
  panel.appendChild(header);
  panel.appendChild(kindBar);
  panel.appendChild(tabBar);
  panel.appendChild(contentEl);
  document.body.appendChild(panel);

  // ── Tab wiring ──────────────────────────────────────────────────────────
  tabBar.addEventListener('click', ev => {
    const btn = ev.target.closest('.player-tab');
    if (!btn) return;
    tabBar.querySelectorAll('.player-tab').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    renderCharts();
  });

  // ── Kind toggle wiring ──────────────────────────────────────────────────
  kindBar.addEventListener('click', ev => {
    const btn = ev.target.closest('.player-kind-btn');
    if (!btn) return;
    currentKind = btn.dataset.kind;
    kindBar.querySelectorAll('.player-kind-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderCharts();
  });

  // Keep open on its own clicks
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  // Outside click closes
  document.addEventListener('pointerdown', ev => {
    if (isOpen && !panel.contains(ev.target)) close();
  });
  // Escape closes
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && isOpen) { close(); ev.stopPropagation(); }
  });

  // Export PNG
  exportBtn.addEventListener('click', () => {
    const svgEl = panel.querySelector('svg[data-role="player-chart"]');
    if (!svgEl || !window.exportSvgAsPng) return;
    const playerName = currentPlayer || 'Player';
    const safeName = playerName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const activeTab = panel.querySelector('.player-tab.active')?.dataset?.view || 'line';
    window.exportSvgAsPng(svgEl, `cricket-${safeName}-${activeTab}.png`, {
      title: `${playerName} \u2022 ${currentKind} \u2022 ${activeTab}`,
      filters: yearRangeEl?.textContent || '',
    });
  });
}

// ── Public open/close ───────────────────────────────────────────────────────

export function openPlayer(playerName, team, kind = 'batting') {
  ensurePanel();
  currentPlayer = playerName;
  currentKind = kind;
  titleEl.textContent = playerName;
  badgeEl.textContent = team || '';
  badgeEl.style.display = team ? '' : 'none';

  // Update kind buttons
  const kindBtns = panel.querySelectorAll('.player-kind-btn');
  kindBtns.forEach(b => b.classList.toggle('active', b.dataset.kind === kind));

  // Reset tab to first
  const tabs = panel.querySelectorAll('.player-tab');
  tabs.forEach(b => { b.classList.toggle('active', b === tabs[0]); b.setAttribute('aria-pressed', b === tabs[0] ? 'true' : 'false'); });

  // Update year range
  const yr = window.__getYearRange?.() || { min: YEAR_MIN, max: YEAR_MAX };
  yearRangeEl.textContent = `${yr.min}\u2013${yr.max}`;

  // Position the panel
  panel.style.display = 'block';
  positionPanel();

  _prevFocus = document.activeElement;
  isOpen = true;
  panel.classList.add('open');

  renderCharts();
  window.dispatchEvent(new CustomEvent('playerwindow:open'));
}

export function close() {
  if (!isOpen) return;
  isOpen = false;
  panel.classList.remove('open');
  setTimeout(() => { panel.style.display = 'none'; }, 180);
  if (_prevFocus && typeof _prevFocus.focus === 'function') {
    try { _prevFocus.focus(); } catch (_) { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent('playerwindow:close'));
}

export function togglePlayer(playerName, team, kind) {
  if (isOpen && currentPlayer === playerName) close();
  else openPlayer(playerName, team, kind);
}

// ── Positioning ─────────────────────────────────────────────────────────────

function positionPanel() {
  const pw = 420; // panel width
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(10, (vw - pw) / 2);
  const top  = Math.max(10, (vh - 440) / 2);
  panel.style.left = `${left}px`;
  panel.style.top  = `${top}px`;
}

// ── Render helpers ──────────────────────────────────────────────────────────

async function renderCharts() {
  if (!isOpen || !currentPlayer) return;
  const activeTab = panel.querySelector('.player-tab.active')?.dataset?.view || 'line';
  const yr = window.__getYearRange?.() || { min: YEAR_MIN, max: YEAR_MAX };
  const svgEl = panel.querySelector('svg[data-role="player-chart"]');
  const infoRow = document.getElementById('playerInfoRow');
  if (!svgEl) return;

  // Show loading
  svgEl.innerHTML = '';
  if (infoRow) infoRow.innerHTML = '';

  try {
    if (currentKind === 'batting') {
      await renderBattingView(activeTab, svgEl, yr.min, yr.max, infoRow);
    } else {
      await renderBowlingView(activeTab, svgEl, yr.min, yr.max, infoRow);
    }
  } catch (e) {
    if (DEBUG) console.warn('player chart render failed', e);
    svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">Could not load data</text>`;
  }
}

// ── Batting views ───────────────────────────────────────────────────────────

async function renderBattingView(view, svgEl, minYear, maxYear, infoRow) {
  if (view === 'line') {
    const data = await getPlayerYearBatting(currentPlayer, minYear, maxYear);
    if (!data.length) { svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">No batting data</text>`; return; }
    drawYearLine(svgEl, data, 'runs', 'sr', 'Runs', 'Strike Rate');
    if (infoRow) {
      const total = data.reduce((s, d) => s + d.runs, 0);
      const totalBalls = data.reduce((s, d) => s + d.balls, 0);
      const avgSR = totalBalls ? (100 * total / totalBalls).toFixed(1) : '0';
      infoRow.innerHTML = `<span>Matches: ${data.reduce((s,d)=>s+d.matches,0)}</span><span>Total runs: ${total}</span><span>Avg SR: ${avgSR}</span>`;
    }
  } else if (view === 'donut') {
    const data = await getPlayerFormatBatting(currentPlayer);
    if (!data.length) { svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">No format data</text>`; return; }
    drawDonut(svgEl, data, 'runs');
    if (infoRow) {
      const total = data.reduce((s, d) => s + d.runs, 0);
      infoRow.innerHTML = `<span>Total runs: ${total}</span>`;
    }
  } else if (view === 'venues') {
    const data = await getPlayerTopVenues(currentPlayer, minYear, maxYear);
    if (!data.length) { svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">No venue data</text>`; return; }
    drawVenueBars(svgEl, data, 'runs', 'Runs');
    if (infoRow) {
      infoRow.innerHTML = `<span>Top ${data.length} venues by runs</span>`;
    }
  }
}

// ── Bowling views ───────────────────────────────────────────────────────────

async function renderBowlingView(view, svgEl, minYear, maxYear, infoRow) {
  if (view === 'line') {
    const data = await getPlayerYearBowling(currentPlayer, minYear, maxYear);
    if (!data.length) { svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">No bowling data</text>`; return; }
    drawYearLine(svgEl, data, 'wickets', 'econ', 'Wickets', 'Economy');
    if (infoRow) {
      const total = data.reduce((s, d) => s + d.wickets, 0);
      const totalRuns = data.reduce((s, d) => s + d.runs_conceded, 0);
      const totalBalls = data.reduce((s, d) => s + d.balls, 0);
      const avgEcon = totalBalls ? ((totalRuns / (totalBalls / 6)).toFixed(2)) : '0';
      infoRow.innerHTML = `<span>Matches: ${data.reduce((s,d)=>s+d.matches,0)}</span><span>Total wkts: ${total}</span><span>Avg Econ: ${avgEcon}</span>`;
    }
  } else if (view === 'donut') {
    const data = await getPlayerFormatBowling(currentPlayer);
    if (!data.length) { svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">No format data</text>`; return; }
    drawDonut(svgEl, data, 'wickets');
    if (infoRow) {
      const total = data.reduce((s, d) => s + d.wickets, 0);
      infoRow.innerHTML = `<span>Total wickets: ${total}</span>`;
    }
  } else if (view === 'venues') {
    const data = await getPlayerTopVenuesBowling(currentPlayer, minYear, maxYear);
    if (!data.length) { svgEl.innerHTML = `<text x="190" y="110" text-anchor="middle" fill="var(--muted)" font-size="13">No venue data</text>`; return; }
    drawVenueBars(svgEl, data, 'wickets', 'Wickets');
    if (infoRow) {
      infoRow.innerHTML = `<span>Top ${data.length} venues by wickets</span>`;
    }
  }
}

// ── D3 chart: year-by-year line chart ──────────────────────────────────────

function drawYearLine(svgEl, data, key1, key2, label1, label2) {
  const W = 380, H = 220;
  const margin = { top: 20, right: 50, bottom: 30, left: 50 };
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.year))
    .range([0, iW]);

  const y1 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[key1]) || 1])
    .nice()
    .range([iH, 0]);

  const y2 = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[key2]) || 1])
    .nice()
    .range([iH, 0]);

  const line1 = d3.line().x(d => x(d.year)).y(d => y1(d[key1])).curve(d3.curveMonotoneX);
  const line2 = d3.line().x(d => x(d.year)).y(d => y2(d[key2])).curve(d3.curveMonotoneX);

  const root = d3.select(svgEl);
  root.selectAll('*').remove();

  const g = root.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Axes
  g.append('g').call(d3.axisLeft(y1).ticks(5)).selectAll('text').attr('fill', 'var(--muted)').style('font-size', '10px');
  g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(data.length > 10 ? 5 : data.length))
    .selectAll('text').attr('fill', 'var(--muted)').style('font-size', '10px');
  g.append('g').attr('transform', `translate(${iW},0)`).call(d3.axisRight(y2).ticks(5))
    .selectAll('text').attr('fill', 'var(--muted)').style('font-size', '10px');

  // Lines
  g.append('path').datum(data).attr('fill', 'none').attr('stroke', LINE_COLOR).attr('stroke-width', 2).attr('d', line1);
  g.append('path').datum(data).attr('fill', 'none').attr('stroke', LINE_COLOR2).attr('stroke-width', 1.5).attr('stroke-dasharray', '4,3').attr('d', line2);

  // Dots
  g.selectAll('.dot1').data(data).enter().append('circle').attr('cx', d => x(d.year)).attr('cy', d => y1(d[key1])).attr('r', 3).attr('fill', LINE_COLOR);
  g.selectAll('.dot2').data(data).enter().append('circle').attr('cx', d => x(d.year)).attr('cy', d => y2(d[key2])).attr('r', 2.5).attr('fill', LINE_COLOR2);

  // Legend
  const legend = g.append('g').attr('transform', `translate(5,-12)`);
  legend.append('rect').attr('width', 10).attr('height', 10).attr('fill', LINE_COLOR).attr('rx', 2);
  legend.append('text').attr('x', 14).attr('y', 9).text(label1).style('font-size', '10px').attr('fill', 'var(--text)');
  legend.append('rect').attr('x', 70).attr('width', 10).attr('height', 10).attr('fill', LINE_COLOR2).attr('rx', 2);
  legend.append('text').attr('x', 84).attr('y', 9).text(label2).style('font-size', '10px').attr('fill', 'var(--text)');

  root.attr('viewBox', `0 0 ${W} ${H}`);
}

// ── D3 chart: format split donut ───────────────────────────────────────────

function drawDonut(svgEl, data, key) {
  const W = 380, H = 220;
  const radius = Math.min(W, H) / 2 - 30;
  const innerR = radius * 0.55;
  const root = d3.select(svgEl);
  root.selectAll('*').remove();

  const g = root.append('g').attr('transform', `translate(${W/2},${H/2 - 5})`);

  const pie = d3.pie().value(d => d[key]).sort(null);
  const arc = d3.arc().innerRadius(innerR).outerRadius(radius);
  const arcs = pie(data);

  g.selectAll('path').data(arcs).enter().append('path')
    .attr('d', arc)
    .attr('fill', d => DONUT_COLORS[d.data.label] || '#666')
    .attr('stroke', 'var(--panel-border)')
    .attr('stroke-width', 1);

  // Labels
  g.selectAll('.donut-label').data(arcs).enter().append('text')
    .attr('transform', d => `translate(${arc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('font-size', '10px')
    .attr('fill', '#000')
    .text(d => {
      const total = d3.sum(data, x => x[key]);
      const pct = total ? Math.round((d.data[key] / total) * 100) : 0;
      return pct > 8 ? `${d.data.label} ${pct}%` : '';
    });

  // Center text
  const total = d3.sum(data, x => x[key]);
  g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.3em').style('font-size', '18px').attr('fill', 'var(--text)').text(total);
  g.append('text').attr('text-anchor', 'middle').attr('dy', '1.1em').style('font-size', '10px').attr('fill', 'var(--muted)').text(key === 'runs' ? 'Total runs' : 'Total wkts');

  root.attr('viewBox', `0 0 ${W} ${H}`);
}

// ── D3 chart: top venues horizontal bars ───────────────────────────────────

function drawVenueBars(svgEl, data, key, label) {
  const W = 380, H = 220;
  const margin = { top: 10, right: 60, bottom: 10, left: 90 };
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;
  const root = d3.select(svgEl);
  root.selectAll('*').remove();

  const y = d3.scaleBand().domain(data.map(d => d.venue)).range([0, iH]).padding(0.3);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d[key]) || 1]).nice().range([0, iW]);

  const g = root.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g').call(d3.axisLeft(y)).selectAll('text').attr('fill', 'var(--muted)').style('font-size', '10px').each(function(d) {
    if (d.length > 12) this.textContent = d.slice(0, 11) + '\u2026';
  });
  g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x).ticks(4)).selectAll('text').attr('fill', 'var(--muted)').style('font-size', '10px');

  g.selectAll('.bar').data(data).enter().append('rect')
    .attr('y', d => y(d.venue))
    .attr('width', d => x(d[key]))
    .attr('height', y.bandwidth())
    .attr('fill', BAR_COLOR)
    .attr('rx', 3);

  // Value labels
  g.selectAll('.val-label').data(data).enter().append('text')
    .attr('x', d => x(d[key]) + 4)
    .attr('y', d => y(d.venue) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .style('font-size', '10px')
    .attr('fill', 'var(--text)')
    .text(d => d[key]);

  root.attr('viewBox', `0 0 ${W} ${H}`);
}
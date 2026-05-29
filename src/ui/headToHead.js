/* Head-to-head comparison overlay (T-3.2)
 * Pick two countries + format -> show matches, W/L/D record, biggest wins, top players.
 */
import { DEBUG } from '../debug.js';
import { YEAR_MIN, YEAR_MAX } from '../config.js';
import { getHeadToHeadStats, getHeadToHeadBiggestWins, getHeadToHeadTopPlayers } from '../data/queries.js';
import { state } from '../state.js';

let panel, backdrop, selectA, selectB, contentEl, fmtBtnsEl;
let isOpen = false;
let currentFormat = 'all';
let lastResults = null;
let _prevFocus = null;

const FMT_LABELS = { all: 'All', test: 'Test', odi: 'ODI', t20: 'T20' };

const MAJOR_TEAMS = [
  'Australia', 'India', 'England', 'South Africa', 'Pakistan', 'New Zealand',
  'Sri Lanka', 'West Indies', 'Bangladesh', 'Zimbabwe', 'Afghanistan', 'Ireland',
];

// ── Panel construction ──────────────────────────────────────────────────────

function ensurePanel() {
  if (panel) return;
  backdrop = document.getElementById('backdrop');

  panel = document.createElement('div');
  panel.id = 'h2h-window';

  panel.appendChild(buildHeader());
  panel.appendChild(buildSelectRow());
  panel.appendChild(buildFormatRow());

  contentEl = document.createElement('div');
  contentEl.className = 'h2h-content';
  panel.appendChild(contentEl);

  document.body.appendChild(panel);
  wireDismissals();
}

function buildHeader() {
  const header = document.createElement('div');
  header.className = 'h2h-header';

  const title = document.createElement('h3');
  title.className = 'h2h-title';
  title.textContent = 'Head-to-Head';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'h2h-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);

  header.appendChild(title);
  header.appendChild(closeBtn);
  return header;
}

function buildSelectRow() {
  const row = document.createElement('div');
  row.className = 'h2h-select-row';

  selectA = makeTeamSelect('Team A');
  selectB = makeTeamSelect('Team B');

  const vsLabel = document.createElement('span');
  vsLabel.className = 'h2h-vs';
  vsLabel.textContent = 'vs';

  const goBtn = document.createElement('button');
  goBtn.className = 'h2h-go-btn';
  goBtn.textContent = 'Compare';
  goBtn.addEventListener('click', () => loadComparison());

  row.appendChild(selectA);
  row.appendChild(vsLabel);
  row.appendChild(selectB);
  row.appendChild(goBtn);
  return row;
}

function makeTeamSelect(ariaLabel) {
  const sel = document.createElement('select');
  sel.className = 'h2h-select';
  sel.setAttribute('aria-label', ariaLabel);
  return sel;
}

function buildFormatRow() {
  fmtBtnsEl = document.createElement('div');
  fmtBtnsEl.className = 'h2h-fmt-row';
  for (const [key, label] of Object.entries(FMT_LABELS)) {
    const b = document.createElement('button');
    b.className = 'h2h-fmt-btn';
    b.textContent = label;
    b.dataset.format = key;
    if (key === currentFormat) b.classList.add('active');
    b.addEventListener('click', () => onFormatClick(key, b));
    fmtBtnsEl.appendChild(b);
  }
  return fmtBtnsEl;
}

function onFormatClick(key, btn) {
  if (currentFormat === key) return;
  currentFormat = key;
  fmtBtnsEl.querySelectorAll('.h2h-fmt-btn').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  if (lastResults) loadComparison();
}

function wireDismissals() {
  document.addEventListener('pointerdown', ev => {
    if (isOpen && !panel.contains(ev.target) && ev.target !== backdrop) close();
  });
  backdrop?.addEventListener('click', close);
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && isOpen) { close(); ev.stopPropagation(); }
  });
  panel.addEventListener('pointerdown', e => e.stopPropagation());
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function open() {
  ensurePanel();
  populateSelects();
  panel.style.display = 'block';
  backdrop.hidden = false;
  positionPanel();
  _prevFocus = document.activeElement;
  isOpen = true;
  lastResults = null;
  panel.classList.add('open');
  backdrop.classList.add('open');
  contentEl.innerHTML = '<div class="h2h-placeholder">Select two teams and format, then click Compare</div>';
}

export function close() {
  if (!isOpen) return;
  isOpen = false;
  panel.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => { panel.style.display = 'none'; backdrop.hidden = true; }, 180);
  if (_prevFocus && typeof _prevFocus.focus === 'function') {
    try { _prevFocus.focus(); } catch (_) { /* ignore */ }
  }
}

export function toggle() { if (isOpen) close(); else open(); }

function populateSelects() {
  for (const sel of [selectA, selectB]) {
    if (sel.options.length) continue;
    for (const name of MAJOR_TEAMS) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
  }
  if (!selectA.value) selectA.value = 'Australia';
  if (!selectB.value) selectB.value = 'India';
}

function positionPanel() {
  const pw = 460;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  panel.style.left = `${Math.max(10, (vw - pw) / 2)}px`;
  panel.style.top  = `${Math.max(10, (vh - 520) / 2)}px`;
}

// ── Data fetch ──────────────────────────────────────────────────────────────

async function loadComparison() {
  const teamA = selectA.value;
  const teamB = selectB.value;
  if (!teamA || !teamB || teamA === teamB) {
    contentEl.innerHTML = '<div class="h2h-placeholder">Please select two different teams</div>';
    lastResults = null;
    return;
  }
  contentEl.innerHTML = '<div class="h2h-loading">Loading...</div>';
  const yr = state.yearRange || { min: YEAR_MIN, max: YEAR_MAX };

  try {
    const [stats, bigWins, topPlayers] = await Promise.all([
      getHeadToHeadStats(teamA, teamB, yr.min, yr.max, currentFormat),
      getHeadToHeadBiggestWins(teamA, teamB, yr.min, yr.max, currentFormat),
      getHeadToHeadTopPlayers(teamA, teamB, yr.min, yr.max, currentFormat),
    ]);
    lastResults = { teamA, teamB, stats, bigWins, topPlayers, yr };
    renderResults(teamA, teamB, stats, bigWins, topPlayers, yr);
  } catch (e) {
    if (DEBUG) console.warn('head-to-head query failed', e);
    contentEl.innerHTML = '<div class="h2h-placeholder">Could not load data</div>';
    lastResults = null;
  }
}

// ── Render helpers ──────────────────────────────────────────────────────────

// Minimal HTML-escape for values that come from the DB (names, venues).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

function statCard(team, wins, total) {
  const pct = total ? Math.round((wins / total) * 100) : 0;
  return `
    <div class="h2h-stat-card">
      <div class="h2h-stat-team">${esc(team)}</div>
      <div class="h2h-stat-big">${wins}</div>
      <div class="h2h-stat-label">Wins (${pct}%)</div>
    </div>`;
}

function centreCard(stats, fmtLabel, yr) {
  return `
    <div class="h2h-stat-card h2h-stat-center">
      <div class="h2h-stat-big">${stats.total}</div>
      <div class="h2h-stat-label">Matches · ${esc(fmtLabel)} · ${yr.min}–${yr.max}</div>
      <div class="h2h-stat-sub">${stats.draws} Draws / ${stats.noResult} NR</div>
    </div>`;
}

function bigWinRow(win) {
  const margin = win.result === 'runs'
    ? `by ${win.margin} runs`
    : `by ${win.margin} wickets`;
  const date = win.date ? esc(win.date.slice(0, 10)) : '';
  return `<div class="h2h-bw-row">${margin} — ${date} at ${esc(win.venue || 'Unknown')}</div>`;
}

function bigWinsCol(team, wins) {
  const body = wins.length
    ? wins.map(bigWinRow).join('')
    : '<div class="h2h-bw-row">No wins</div>';
  return `
    <div class="h2h-bw-col">
      <div class="h2h-bw-team">${esc(team)}</div>
      ${body}
    </div>`;
}

function playerRow(p, valueKey, valueSuffix) {
  return `
    <div class="h2h-player-row">
      <span class="h2h-player-name">${esc(p.player)}</span>
      <span class="h2h-player-team">${esc(p.team)}</span>
      <span class="h2h-player-val">${p[valueKey]} ${valueSuffix}</span>
    </div>`;
}

function playerGrid(players, valueKey, valueSuffix) {
  if (!players.length) return '<div class="h2h-placeholder">No data</div>';
  return `<div class="h2h-player-grid">${
    players.slice(0, 5).map(p => playerRow(p, valueKey, valueSuffix)).join('')
  }</div>`;
}

function renderResults(teamA, teamB, stats, bigWins, topPlayers, yr) {
  const fmtLabel = FMT_LABELS[currentFormat] || 'All';
  contentEl.innerHTML = `
    <div class="h2h-stat-grid">
      ${statCard(teamA, stats.winsA, stats.total)}
      ${centreCard(stats, fmtLabel, yr)}
      ${statCard(teamB, stats.winsB, stats.total)}
    </div>

    <div class="h2h-section-title">Biggest wins</div>
    <div class="h2h-big-wins">
      ${bigWinsCol(teamA, bigWins.bestA)}
      ${bigWinsCol(teamB, bigWins.bestB)}
    </div>

    <div class="h2h-section-title">Top Run-scorers</div>
    ${playerGrid(topPlayers.batters, 'runs', 'runs')}

    <div class="h2h-section-title">Top Wicket-takers</div>
    ${playerGrid(topPlayers.bowlers, 'wickets', 'wkts')}
  `;
}
